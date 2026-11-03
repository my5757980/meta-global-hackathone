import { Router } from "express";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { EnvelopeSchema, SEEDED_RUN, WORKER_KEYS, type WorkerKey } from "@autofte/shared";
import { z } from "zod";
import { db } from "../db/client";
import * as s from "../db/schema";
import { conflict, h, HttpError, notFound, parse, forbidden } from "../lib/http";
import { requirePerm } from "../auth/session";
import { envelope, fteName, getSetting, now, putSetting } from "../services/settings";
import { audit } from "../services/audit";
import { emit, processDue } from "../services/events";
import { settleAuctions } from "../services/auction";
import { loadSkills } from "../fte/skills";
import { TOOLS } from "../fte/tools";
import { primaryModelName, modelConfigured } from "../fte/model";
import { CASES, CATEGORIES, evalProgress, startEvals } from "../fte/evals";
import { currentSale, saleTimeline, startSale } from "../fte/demoSale";
import { tooMany } from "../services/publicDemo";
import { ToolError } from "../fte/errors";
import { carryOut } from "../fte/workerTools";
import { chiefHeartbeat, writeReport } from "../fte/workerHandlers";
import { reflexOn, sayInRoom, workforceOn } from "../fte/workerRun";
import { workerDef } from "../fte/workforce";
import { recordDecision, verifyLedger } from "../services/ledger";
import { env } from "../env";

export const fteRouter = Router();

/**
 * Demo clock: jump time forward so a judge sees tomorrow's work happen now — quote follow-ups, follow-ups Sora
 * scheduled itself, auction days ending (results, won / lost messages). Everything due on the new time runs at once.
 */
async function clockState() {
  const [t, off] = await Promise.all([now(), getSetting("demo.clockOffsetMs", 0)]);
  const pending = await db().select().from(s.events).where(and(eq(s.events.status, "pending"), inArray(s.events.type, ["quote.followup", "sora.followup", "ops.signal"]))).orderBy(asc(s.events.dueAt)).limit(12);
  const carIds = pending.filter((e) => e.type === "ops.signal").map((e) => String((e.payload as { invoiceVehicleId?: string }).invoiceVehicleId ?? ""));
  const cars = carIds.length ? new Map((await db().select({ id: s.invoiceVehicles.id, label: s.invoiceVehicles.unitLabel }).from(s.invoiceVehicles).where(inArray(s.invoiceVehicles.id, carIds))).map((c) => [c.id, c.label])) : new Map<string, string>();
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
      const p = e.payload as { conversationId?: string; quoteId?: string; reason?: string; invoiceVehicleId?: string; stage?: string };
      const who = names.get(String(p.conversationId)) ?? "a buyer";
      return { id: e.id, dueAt: e.dueAt, what: e.type === "ops.signal" ? `Demo yard and shipping line: ${cars.get(String(p.invoiceVehicleId)) ?? "a car"} reaches "${p.stage}"` : e.type === "quote.followup" ? `Follow up ${who} about the quote for ${quotes.get(String(p.quoteId)) ?? "a car"}` : `${who}: ${p.reason ?? "follow-up"}` };
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
    void chiefHeartbeat().catch((e) => console.error("[heartbeat]", e));
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
    const [seeded] = await db().select({ n: sql<number>`count(*)::int` }).from(s.fteRuns).where(and(eq(s.fteRuns.provider, SEEDED_RUN), gt(s.fteRuns.startedAt, since)));
    return {
      model: { name: primaryModelName(), configured: modelConfigured(), family: "Muse Spark Open (Meta, open weights)" },
      week: { seededRuns: seeded?.n ?? 0, runs: runs?.n ?? 0, ok: runs?.ok ?? 0, conversations: conv?.n ?? 0, leadsCreated: leads?.n ?? 0, invoicesRequested: invs?.n ?? 0, handovers: handovers?.n ?? 0, p50FirstReplyMs: Math.round(runs?.p50 ?? 0), p90FirstReplyMs: Math.round(runs?.p90 ?? 0), tokens: runs?.tokens ?? 0, hoursSaved },
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
    const names = await seatNames();
    return rows.map((x) => ({ ...x.r, customer: x.customer, workerName: names.get(x.r.workerKey) ?? null }));
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
    const [before] = await db().select().from(s.approvals).where(eq(s.approvals.id, id)).limit(1);
    if (!before) throw notFound();
    if (before.status !== "pending") throw conflict(`Already ${before.status}`);
    // an invoice or a payment is done first: if it cannot be done, the item stays waiting
    const why = b.note?.trim() || `Decided by ${u.name}`;
    const carries = before.kind === "invoice" || before.kind === "payment" || before.kind.startsWith("task:");
    try {
      if (carries) await carryOut(before, b.decision === "approved", { userId: u.id, kind: "human", name: u.name }, "owner", why);
    } catch (e) {
      if (e instanceof ToolError) throw conflict(e.message);
      throw e;
    }
    await db().transaction(async (tx) => {
      const [ap] = await tx.select().from(s.approvals).where(eq(s.approvals.id, id)).limit(1);
      if (!ap) throw notFound();
      if (ap.status !== "pending") throw conflict(`Already ${ap.status}`);
      await tx.update(s.approvals).set({ status: b.decision, decidedBy: u.id, decidedAt: new Date(), decisionNote: b.note ?? null }).where(eq(s.approvals.id, id));
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: `approval.${b.decision}`, entity: "approval", entityId: id, summary: `${u.name} ${b.decision} ${fte}'s request (${ap.kind})`, conversationId: ap.conversationId });
      await emit("approval.decided", { approvalId: id }, { tx });
      if (!carries) await recordDecision({ workerKey: "owner", task: "chief.approvals", entity: ap.kind, entityId: id, decision: b.decision, reason: why }, tx);
    });
    return { ok: true };
  }),
);

// ---------- the digital workforce: who holds which seat, how far each may go, and what they decided ----------
async function seatNames() {
  const rows = await db().select({ key: s.fteWorkers.key, name: s.users.name }).from(s.fteWorkers).innerJoin(s.users, eq(s.users.id, s.fteWorkers.userId));
  return new Map(rows.map((r) => [r.key, r.name]));
}

fteRouter.get(
  "/workforce",
  h(async (req) => {
    requirePerm(req, "fte.console");
    const seats = await db().select({ w: s.fteWorkers, name: s.users.name, title: s.users.title }).from(s.fteWorkers).innerJoin(s.users, eq(s.users.id, s.fteWorkers.userId));
    const since = new Date(new Date().setUTCHours(0, 0, 0, 0));
    const stats = await db()
      .select({ key: s.fteRuns.workerKey, runs: sql<number>`count(*)::int`, failed: sql<number>`count(*) filter (where status = 'error')::int`, tokens: sql<number>`coalesce(sum(prompt_tokens + completion_tokens),0)::int`, last: sql<string | null>`max(started_at)::text` })
      .from(s.fteRuns)
      .where(and(gt(s.fteRuns.startedAt, since), sql`coalesce(provider,'') <> ${SEEDED_RUN}`))
      .groupBy(s.fteRuns.workerKey);
    const byKey = new Map(stats.map((x) => [x.key, x]));
    const order = new Map(WORKER_KEYS.map((k, i) => [k as string, i]));
    const names = new Map(seats.map((r) => [r.w.key, r.name]));
    const waiting = await db().select().from(s.approvals).where(eq(s.approvals.status, "pending")).orderBy(desc(s.approvals.createdAt)).limit(50);
    const ledger = await db().select({ d: s.fteDecisions, by: s.users.name }).from(s.fteDecisions).leftJoin(s.users, eq(s.users.id, s.fteDecisions.overruledBy)).orderBy(desc(s.fteDecisions.seq)).limit(40);
    const reports = await db().select().from(s.fteReports).orderBy(desc(s.fteReports.day)).limit(7);
    return {
      on: workforceOn(),
      reflexesOn: reflexOn(),
      feedsSimulated: env.DEMO_MODE,
      room: await getSetting<string | null>("workforce.room", null),
      seats: seats
        .sort((a, b) => (order.get(a.w.key) ?? 9) - (order.get(b.w.key) ?? 9))
        .map(({ w, name, title }) => {
          const def = workerDef(w.key as WorkerKey);
          const set = (w.levels ?? {}) as Record<string, number>;
          const st = byKey.get(w.key);
          return { key: w.key, name, title, enabled: w.enabled, dailyTokens: w.dailyTokens, owns: def.owns, doesNotOwn: def.doesNotOwn, checkedBy: def.checkedBy, stopsWhen: def.stopsWhen, tools: def.tools, tasks: def.tasks.map((t) => ({ key: t.key, label: t.label, levels: t.levels, level: set[t.key] ?? t.level })), today: { runs: st?.runs ?? 0, failed: st?.failed ?? 0, tokens: st?.tokens ?? 0, last: st?.last ?? null } };
        }),
      needsYou: waiting
        .filter((a) => (a.payload as { owner?: boolean }).owner || a.kind.startsWith("task:"))
        .map((a) => {
          const p = a.payload as { opinion?: string; number?: string; amountUsd?: number; from?: string; why?: string };
          return { id: a.id, kind: a.kind, reason: a.reason, createdAt: a.createdAt, opinion: p.opinion ?? p.why ?? null, number: p.number ?? null, amountUsd: p.amountUsd ?? null, from: p.from ? (names.get(p.from) ?? p.from) : null, proposal: a.kind.startsWith("task:") };
        }),
      withChief: waiting.filter((a) => !(a.payload as { owner?: boolean }).owner && !a.kind.startsWith("task:")).length,
      ledger: ledger.map(({ d, by }) => ({ id: d.id, seq: d.seq, who: d.workerKey === "owner" ? "A person" : (names.get(d.workerKey) ?? d.workerKey), task: d.task, entity: d.entity, entityId: d.entityId, decision: d.decision, reason: d.reason, createdAt: d.createdAt, overruledAt: d.overruledAt, overruleNote: d.overruleNote, overruledBy: by, byFte: d.workerKey !== "owner" })),
      ledgerCheck: await verifyLedger(),
      reports: reports.map((r) => ({ day: r.day, body: r.body, createdAt: r.createdAt })),
    };
  }),
);

fteRouter.put(
  "/workforce/:key",
  h(async (req) => {
    const u = requirePerm(req, "fte.envelope.manage");
    const key = String(req.params.key) as WorkerKey;
    if (!(WORKER_KEYS as readonly string[]).includes(key)) throw notFound();
    const b = parse(z.object({ enabled: z.boolean().optional(), levels: z.record(z.string(), z.number().int().min(0).max(4)).optional(), dailyTokens: z.number().int().min(0).max(100_000_000).nullable().optional() }), req.body);
    const def = workerDef(key);
    for (const [task, level] of Object.entries(b.levels ?? {})) {
      const t = def.tasks.find((x) => x.key === task);
      if (!t) throw notFound(`No task ${task}`);
      if (!t.levels.includes(level)) throw conflict(`${t.label} cannot be set to level ${level}`);
    }
    const [row] = await db().select().from(s.fteWorkers).where(eq(s.fteWorkers.key, key)).limit(1);
    if (!row) throw notFound();
    const levels = { ...((row.levels ?? {}) as Record<string, number>), ...(b.levels ?? {}) };
    await db()
      .update(s.fteWorkers)
      .set({ levels, enabled: b.enabled ?? row.enabled, dailyTokens: b.dailyTokens === undefined ? row.dailyTokens : b.dailyTokens, updatedAt: new Date() })
      .where(eq(s.fteWorkers.key, key));
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "workforce.changed", entity: "worker", entityId: key, summary: `${u.name} changed the ${key} desk: ${JSON.stringify(b)}` });
    return { ok: true };
  }),
);

fteRouter.post(
  "/workforce/report",
  h(async (req) => {
    requirePerm(req, "fte.envelope.manage");
    return (await writeReport(true)) ?? { ok: false };
  }),
);

/** Watch one whole sale: a scripted buyer and outside world, and the real FTEs. Only in demo mode. */
fteRouter.get(
  "/demo-sale",
  h(async (req) => {
    requirePerm(req, "fte.console");
    const sl = currentSale();
    return { available: env.DEMO_MODE && workforceOn(), sale: sl, ...(sl ? await saleTimeline(sl) : { timeline: [], fteSteps: 0, personSteps: 0 }) };
  }),
);

fteRouter.post(
  "/demo-sale",
  h(async (req) => {
    const u = requirePerm(req, "fte.console");
    if (!env.DEMO_MODE) throw notFound();
    if (!workforceOn()) throw conflict("The FTEs need a model key to run this.");
    if (currentSale()?.status === "running") return currentSale();
    if (env.PUBLIC_DEMO && tooMany("demo-sale", 4, 3_600_000)) throw new HttpError(429, "This is a shared public demo: several sales have just been run. Please try again in a while.");
    const sl = startSale();
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "demo.sale", summary: `${u.name} started a demo sale` });
    return sl;
  }),
);

/** Every step of one sale, in order, with who did it: the proof that nobody had to touch it. */
fteRouter.get(
  "/flow/:invoiceId",
  h(async (req) => {
    requirePerm(req, "fte.console");
    const id = String(req.params.invoiceId);
    const [inv] = await db().select({ id: s.invoices.id, number: s.invoices.number, leadId: s.invoices.leadId }).from(s.invoices).where(eq(s.invoices.id, id)).limit(1);
    if (!inv) throw notFound();
    const units = await db().select({ id: s.units.id }).from(s.units).where(eq(s.units.invoiceId, id));
    const ids = [id, inv.leadId, ...units.map((u) => u.id)];
    const rows = await db()
      .select({ at: s.auditLog.createdAt, action: s.auditLog.action, summary: s.auditLog.summary, kind: s.auditLog.actorKind, who: s.users.name, whoKind: s.users.kind })
      .from(s.auditLog)
      .leftJoin(s.users, eq(s.users.id, s.auditLog.actorUserId))
      .where(inArray(s.auditLog.entityId, ids))
      .orderBy(asc(s.auditLog.createdAt));
    const steps = rows.map((r) => ({ at: r.at, action: r.action, summary: r.summary, who: r.who ?? "System", by: r.whoKind === "fte" ? "fte" : r.whoKind === "customer" ? "buyer" : r.whoKind === "staff" ? "person" : "system" }));
    return { number: inv.number, steps, counts: { fte: steps.filter((x) => x.by === "fte").length, person: steps.filter((x) => x.by === "person").length, buyer: steps.filter((x) => x.by === "buyer").length, system: steps.filter((x) => x.by === "system").length } };
  }),
);

/** The owner disagrees with a decision. The action stands (a person undoes it on its own screen); the chief reads this before deciding again. */
fteRouter.post(
  "/decisions/:id/overrule",
  h(async (req) => {
    const u = requirePerm(req, "fte.approvals.decide");
    const b = parse(z.object({ note: z.string().trim().min(3).max(500) }), req.body);
    const [d] = await db().select().from(s.fteDecisions).where(eq(s.fteDecisions.id, String(req.params.id))).limit(1);
    if (!d) throw notFound();
    if (d.overruledAt) throw conflict("Already overruled");
    await db().update(s.fteDecisions).set({ overruledBy: u.id, overruleNote: b.note, overruledAt: new Date() }).where(eq(s.fteDecisions.id, d.id));
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "decision.overruled", entity: "decision", entityId: d.id, summary: `${u.name} overruled decision ${d.seq} (${d.decision}): ${b.note}` });
    await sayInRoom("chief", `Noted: ${u.name} overruled decision ${d.seq}. "${b.note}" I will follow this from now on.`);
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
