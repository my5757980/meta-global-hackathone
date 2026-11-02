import { Router } from "express";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { EnvelopeSchema } from "@autofte/shared";
import { z } from "zod";
import { db } from "../db/client";
import * as s from "../db/schema";
import { conflict, h, notFound, parse, forbidden } from "../lib/http";
import { requirePerm } from "../auth/session";
import { envelope, fteName, getSetting, now, putSetting } from "../services/settings";
import { audit } from "../services/audit";
import { emit, processDue } from "../services/events";
import { settleAuctions } from "../services/auction";
import { loadSkills } from "../fte/skills";
import { TOOLS } from "../fte/tools";
import { primaryModelName, modelConfigured } from "../fte/model";
import { CASES, CATEGORIES, evalProgress, startEvals } from "../fte/evals";
import { env } from "../env";

export const fteRouter = Router();

/**
 * Demo clock: jump time forward so a judge sees tomorrow's work happen now — quote follow-ups, follow-ups Sora
 * scheduled itself, auction days ending (results, won / lost messages). Everything due on the new time runs at once.
 */
async function clockState() {
  const [t, off] = await Promise.all([now(), getSetting("demo.clockOffsetMs", 0)]);
  const pending = await db().select().from(s.events).where(and(eq(s.events.status, "pending"), inArray(s.events.type, ["quote.followup", "sora.followup"]))).orderBy(asc(s.events.dueAt)).limit(12);
  const convIds = [...new Set(pending.map((e) => String((e.payload as { conversationId?: string }).conversationId ?? "")).filter(Boolean))];
  const names = convIds.length
    ? new Map((await db().select({ id: s.chatConversations.id, name: s.users.name }).from(s.chatConversations).leftJoin(s.users, eq(s.users.id, s.chatConversations.customerUserId)).where(inArray(s.chatConversations.id, convIds))).map((r) => [r.id, r.name ?? "buyer"]))
    : new Map<string, string>();
  const quoteIds = pending.filter((e) => e.type === "quote.followup").map((e) => String((e.payload as { quoteId?: string }).quoteId ?? ""));
  const quotes = quoteIds.length ? new Map((await db().select({ id: s.quotes.id, title: s.quotes.title }).from(s.quotes).where(inArray(s.quotes.id, quoteIds))).map((q) => [q.id, q.title])) : new Map<string, string>();
  const [upcoming] = (await db().select({ next: sql<string | null>`min(${s.auctionLots.saleDate})::text` }).from(s.auctionLots).where(eq(s.auctionLots.status, "upcoming"))) as [{ next: string | null }];
  return {
    now: t.toISOString(),
    offsetHours: Math.round((Number(off) || 0) / 3600_000),
    nextSaleDay: upcoming?.next ?? null,
    pending: pending.map((e) => {
      const p = e.payload as { conversationId?: string; quoteId?: string; reason?: string };
      const who = names.get(String(p.conversationId)) ?? "a buyer";
      return { id: e.id, dueAt: e.dueAt, what: e.type === "quote.followup" ? `Follow up ${who} about the quote for ${quotes.get(String(p.quoteId)) ?? "a car"}` : `${who}: ${p.reason ?? "follow-up"}` };
    }),
  };
}

fteRouter.get(
  "/clock",
  h(async (req) => {
    requirePerm(req, "fte.console");
    return clockState();
  }),
);

fteRouter.post(
  "/clock",
  h(async (req) => {
    const u = requirePerm(req, "fte.envelope.manage");
    const b = parse(z.object({ advanceHours: z.number().min(1).max(720).optional(), reset: z.boolean().optional() }), req.body ?? {});
    const cur = Number(await getSetting("demo.clockOffsetMs", 0)) || 0;
    const next = b.reset ? 0 : cur + (b.advanceHours ?? 0) * 3600_000;
    await putSetting("demo.clockOffsetMs", next);
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "demo.clock", summary: b.reset ? `${u.name} reset the demo clock` : `${u.name} moved the demo clock forward ${b.advanceHours} h` });
    const settled = await settleAuctions();
    let ran = 0;
    for (let i = 0; i < 5; i++) {
      const n = await processDue(50);
      ran += n;
      if (n < 50) break;
    }
    return { ...(await clockState()), settledLots: settled, eventsRun: ran };
  }),
);

fteRouter.get(
  "/overview",
  h(async (req) => {
    requirePerm(req, "fte.console");
    const since = new Date(Date.now() - 7 * 86400_000);
    const [[runs], [conv], [leads], [invs], [handovers], pendingApprovals, [lastEval]] = await Promise.all([
      db().select({ n: sql<number>`count(*)::int`, ok: sql<number>`count(*) filter (where status in ('ok','handover'))::int`, p50: sql<number>`coalesce(percentile_cont(0.5) within group (order by first_reply_ms),0)::float`, p90: sql<number>`coalesce(percentile_cont(0.9) within group (order by first_reply_ms),0)::float`, tokens: sql<number>`coalesce(sum(prompt_tokens + completion_tokens),0)::int` }).from(s.fteRuns).where(gt(s.fteRuns.startedAt, since)),
      db().select({ n: sql<number>`count(distinct conversation_id)::int` }).from(s.fteRuns).where(gt(s.fteRuns.startedAt, since)),
      db().select({ n: sql<number>`count(*)::int` }).from(s.auditLog).where(and(eq(s.auditLog.actorKind, "fte"), eq(s.auditLog.action, "lead.created"), gt(s.auditLog.createdAt, since))),
      db().select({ n: sql<number>`count(*)::int` }).from(s.auditLog).where(and(eq(s.auditLog.actorKind, "fte"), eq(s.auditLog.action, "invoice.requested"), gt(s.auditLog.createdAt, since))),
      db().select({ n: sql<number>`count(*)::int` }).from(s.auditLog).where(and(eq(s.auditLog.actorKind, "fte"), eq(s.auditLog.action, "chat.handover"), gt(s.auditLog.createdAt, since))),
      db().select().from(s.approvals).where(eq(s.approvals.status, "pending")).orderBy(desc(s.approvals.createdAt)),
      // the last COMPLETE run: one still going (or stopped early) would read as failures
      db()
        .select({ id: s.evalRuns.id, total: s.evalRuns.total, passed: s.evalRuns.passed, startedAt: s.evalRuns.startedAt, finishedAt: s.evalRuns.finishedAt })
        .from(s.evalRuns)
        .where(sql`${s.evalRuns.finishedAt} is not null and jsonb_array_length(${s.evalRuns.results}) = ${s.evalRuns.total}`)
        .orderBy(desc(s.evalRuns.startedAt))
        .limit(1),
    ]);
    const pendingInvoices = await db()
      .select({ id: s.invoices.id, number: s.invoices.number, consignee: s.invoices.consigneeName, total: s.invoices.totalCnfUsd, createdAt: s.invoices.createdAt })
      .from(s.invoices)
      .innerJoin(s.users, eq(s.users.id, s.invoices.requestedBy))
      .where(and(eq(s.invoices.status, "pending"), eq(s.users.kind, "fte")))
      .orderBy(desc(s.invoices.createdAt));
    // ~8 minutes of an agent's time per handled chat turn is the planning assumption shown in the console
    const hoursSaved = Math.round(((runs?.n ?? 0) * 8) / 6) / 10;
    return {
      model: { name: primaryModelName(), configured: modelConfigured(), family: "Muse Spark Open (Meta, open weights)" },
      week: { runs: runs?.n ?? 0, ok: runs?.ok ?? 0, conversations: conv?.n ?? 0, leadsCreated: leads?.n ?? 0, invoicesRequested: invs?.n ?? 0, handovers: handovers?.n ?? 0, p50FirstReplyMs: Math.round(runs?.p50 ?? 0), p90FirstReplyMs: Math.round(runs?.p90 ?? 0), tokens: runs?.tokens ?? 0, hoursSaved },
      pendingApprovals,
      pendingInvoices,
      envelope: await envelope(),
      lastEval: lastEval ?? null,
      skills: loadSkills().map((x) => ({ name: x.name, description: x.description })),
      tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
    };
  }),
);

fteRouter.get(
  "/runs",
  h(async (req) => {
    requirePerm(req, "fte.console");
    const rows = await db()
      .select({ r: s.fteRuns, customer: s.users.name })
      .from(s.fteRuns)
      .leftJoin(s.chatConversations, eq(s.chatConversations.id, s.fteRuns.conversationId))
      .leftJoin(s.users, eq(s.users.id, s.chatConversations.customerUserId))
      .orderBy(desc(s.fteRuns.startedAt))
      .limit(60);
    return rows.map((x) => ({ ...x.r, customer: x.customer }));
  }),
);

fteRouter.get(
  "/runs/:id",
  h(async (req) => {
    requirePerm(req, "fte.console");
    const [r] = await db().select().from(s.fteRuns).where(eq(s.fteRuns.id, String(req.params.id))).limit(1);
    if (!r) throw notFound();
    const auditRows = await db().select().from(s.auditLog).where(eq(s.auditLog.fteRunId, r.id)).orderBy(s.auditLog.createdAt);
    return { run: r, audit: auditRows };
  }),
);

fteRouter.get(
  "/audit",
  h(async (req) => {
    requirePerm(req, "fte.console");
    const rows = await db().select().from(s.auditLog).where(eq(s.auditLog.actorKind, "fte")).orderBy(desc(s.auditLog.createdAt)).limit(100);
    return rows;
  }),
);

fteRouter.put(
  "/envelope",
  h(async (req) => {
    const u = requirePerm(req, "fte.envelope.manage");
    const next = parse(EnvelopeSchema, req.body);
    await putSetting("envelope", next);
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "fte.envelope", summary: `${u.name} changed ${await fteName()}'s envelope: max discount ${next.maxDiscountPct}%, max bid ¥${next.maxBidJpy.toLocaleString("en-US")}`, data: next });
    return next;
  }),
);

fteRouter.post(
  "/approvals/:id/decide",
  h(async (req) => {
    const u = requirePerm(req, "fte.approvals.decide");
    const b = parse(z.object({ decision: z.enum(["approved", "rejected"]), note: z.string().max(600).optional() }), req.body);
    const id = String(req.params.id);
    const fte = await fteName(); // not inside the transaction: one connection
    await db().transaction(async (tx) => {
      const [ap] = await tx.select().from(s.approvals).where(eq(s.approvals.id, id)).limit(1);
      if (!ap) throw notFound();
      if (ap.status !== "pending") throw conflict(`Already ${ap.status}`);
      await tx.update(s.approvals).set({ status: b.decision, decidedBy: u.id, decidedAt: new Date(), decisionNote: b.note ?? null }).where(eq(s.approvals.id, id));
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: `approval.${b.decision}`, entity: "approval", entityId: id, summary: `${u.name} ${b.decision} ${fte}'s request (${ap.kind})`, conversationId: ap.conversationId });
      await emit("approval.decided", { approvalId: id }, { tx });
    });
    return { ok: true };
  }),
);

/** Sora's eval suite: the cases, the recent runs and the one in progress. */
fteRouter.get(
  "/evals",
  h(async (req) => {
    requirePerm(req, "fte.console");
    const runs = await db()
      .select({ id: s.evalRuns.id, startedAt: s.evalRuns.startedAt, finishedAt: s.evalRuns.finishedAt, total: s.evalRuns.total, passed: s.evalRuns.passed, done: sql<number>`jsonb_array_length(${s.evalRuns.results})::int`, provider: s.evalRuns.provider, model: s.evalRuns.model })
      .from(s.evalRuns)
      .orderBy(desc(s.evalRuns.startedAt))
      .limit(20);
    return { runs, running: evalProgress(), categories: CATEGORIES, cases: CASES.map((c) => ({ id: c.id, category: c.category, title: c.title, safety: !!c.safety })) };
  }),
);

fteRouter.get(
  "/evals/:id",
  h(async (req) => {
    requirePerm(req, "fte.console");
    const [r] = await db().select().from(s.evalRuns).where(eq(s.evalRuns.id, String(req.params.id))).limit(1);
    if (!r) throw notFound();
    return r;
  }),
);

fteRouter.post(
  "/evals/run",
  h(async (req) => {
    const u = requirePerm(req, "fte.evals.run");
    const b = parse(z.object({ ids: z.array(z.string().max(60)).max(100).optional(), concurrency: z.number().int().min(1).max(4).optional() }), req.body ?? {});
    if (env.PUBLIC_DEMO) throw forbidden("On this public demo the suite does not run: the result below is the last real run. Run your own copy from the repository to run it.");
    if (evalProgress()) throw conflict("An eval run is already in progress");
    const r = await startEvals(b);
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "fte.evals", summary: `${u.name} ran ${await fteName()}'s eval suite (${r.total} cases)` });
    return r;
  }),
);
