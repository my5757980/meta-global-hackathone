import { and, eq, gte, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { WorkerKey } from "@autofte/shared";
import { db } from "../db/client";
import * as s from "../db/schema";
import { attachFinalPdf, getInvoiceFull, markInvoiceSent, rejectInvoice, type Actor } from "../services/crm";
import { emit, on } from "../services/events";
import { saveFile } from "../services/files";
import { invoicePdf } from "../services/invoiceDocs";
import { recordDecision } from "../services/ledger";
import { notify, usersWithPerm } from "../services/notify";
import { addProgress, balanceOf, ensureUnit, feedOn, fillCosting, markSold, paperworkFor, scheduleSignal, stagesDone } from "../services/ops";
import { audit } from "../services/audit";
import { envelope, now } from "../services/settings";
import { chat, modelConfigured } from "./model";
import { assign, reflexOn, sayInRoom, workforceOn } from "./workerRun";
import { recordPaymentRow } from "./workerTools";
import { levelOf, WORKERS, workerUser } from "./workforce";

async function actorFor(key: WorkerKey): Promise<Actor | null> {
  const u = await workerUser(key);
  return u ? { userId: u.id, kind: "fte", name: u.name } : null;
}
const on_ = async (key: WorkerKey, task: string) => reflexOn() && (await levelOf(key, task)) > 0;

/** The desks' nervous system: what wakes which FTE. Steps that need no judgement are reflexes and use no model. */
export function registerWorkforce() {
  // ---------- invoices ----------
  on("invoice.requested", async ({ invoiceId }) => {
    if (!workforceOn()) return;
    void assign("invoices", { task: "invoice.review", title: "Check an invoice request", note: `A new invoice request is waiting: invoice_id ${invoiceId}. Read it with review_invoice and decide.` });
  });

  // once approved: the final PDF and sending are a reflex
  on("invoice.approved", async ({ invoiceId }) => {
    if (!(await on_("invoices", "invoice.review"))) return;
    const a = await actorFor("invoices");
    const full = await getInvoiceFull(String(invoiceId));
    if (!a || !full || full.invoice.status !== "approved") return;
    const f = await saveFile(await invoicePdf(full), { kind: "invoices", mime: "application/pdf", originalName: `${full.invoice.number}.pdf`, ownerUserId: a.userId });
    await attachFinalPdf(full.invoice.id, f.id, "Generated", a);
    await markInvoiceSent(full.invoice.id, a);
    await sayInRoom("invoices", `Invoice ${full.invoice.number} is out: final PDF added and marked as sent.`);
    // a website order already paid online: the provider has confirmed the money, so it goes straight on the invoice
    const [paidOrder] = await db().select().from(s.webOrders).where(and(eq(s.webOrders.invoiceId, full.invoice.id), isNotNull(s.webOrders.paidAt))).limit(1);
    const ren = await actorFor("accounts");
    if (paidOrder?.paymentRef && ren && !full.payments.some((p) => p.slipReference === paidOrder.paymentRef) && (await levelOf("accounts", "payment.record")) > 0) {
      await recordPaymentRow({ invoiceId: full.invoice.id, amountUsd: Math.min(Number(paidOrder.totalUsd), full.totals.balance), receivedDate: paidOrder.paidAt!.toISOString().slice(0, 10), reference: paidOrder.paymentRef, fileId: null }, ren, "accounts", "payment.record", `Paid online for order ${paidOrder.orderNo}: the payment provider confirmed it.`);
    }
  });

  // ---------- payments ----------
  on("payment.slip", async ({ fileId, buyerUserId, invoiceId }) => {
    if (!workforceOn()) return;
    void assign("accounts", { task: "payment.record", title: "Read a payment slip", note: `A buyer sent a payment slip. file_id ${fileId}, buyer_user_id ${buyerUserId}${invoiceId ? `, on invoice_id ${invoiceId}` : ", no invoice named"}. Read it, find the invoice, and record it or pass it up.` });
  });

  // ---------- after a payment: units, costing, stages, all reflexes ----------
  on("payment.recorded", async ({ invoiceId }) => {
    if (!(await on_("operations", "ops.units"))) return;
    const id = String(invoiceId);
    const aoi = await actorFor("operations");
    const ren = await actorFor("accounts");
    if (!aoi || !ren) return;
    const cars = await db().select().from(s.invoiceVehicles).where(eq(s.invoiceVehicles.invoiceId, id));
    const balance = await balanceOf(id);
    for (const iv of cars) {
      const done = await stagesDone(iv.id);
      const first = !done.includes("First Payment Received");
      const unit = await ensureUnit(iv.id, aoi);
      if (unit && first) await fillCosting(unit.id, ren);
      if (first) {
        await addProgress(iv.id, "First Payment Received", null, aoi);
        if (feedOn()) await scheduleSignal(iv.id, "Car Booked", 1);
      }
      if (balance <= 0.01) {
        await addProgress(iv.id, "Final Payment", null, aoi);
        if (feedOn() && done.includes("In Yard") && !done.includes("Shipped")) await scheduleSignal(iv.id, "Shipped", 1);
      }
    }
    await markSold(cars.map((c) => c.vehicleId).filter(Boolean) as string[]);
    await sayInRoom("operations", `Payment on invoice ${cars[0] ? cars[0].unitLabel : id}: units and stages are up to date.`);
  });

  // a signal from the yard or the shipping line (in demo mode, played on the demo clock)
  on("ops.signal", async ({ invoiceVehicleId, stage }) => {
    if (!(await on_("operations", "ops.units"))) return;
    const ivId = String(invoiceVehicleId);
    const aoi = await actorFor("operations");
    if (!aoi) return;
    const [iv] = await db().select().from(s.invoiceVehicles).where(eq(s.invoiceVehicles.id, ivId)).limit(1);
    if (!iv) return;
    const name = String(stage);
    const added = await addProgress(ivId, name, null, aoi);
    if (!added) return;
    const [unit] = await db().select().from(s.units).where(eq(s.units.invoiceVehicleId, ivId)).limit(1);
    if (unit && (await levelOf("operations", "ops.documents")) > 0) {
      const papers = await paperworkFor(name, unit, aoi.userId);
      for (const p of papers) void assign("operations", { task: "ops.documents", title: `File "${p.title}"`, note: `A document arrived from the yard or shipping line for unit_id ${unit.id} (chassis ${unit.chassis}): file_id ${p.fileId}. Read it, check the chassis, and file it in the right folder.` });
    }
    const balance = await balanceOf(iv.invoiceId);
    const days: Record<string, [string, number] | undefined> = { "Car Booked": ["Inspection/Yard", 1], "Inspection/Yard": ["In Yard", 1] };
    const next = days[name];
    if (next) await scheduleSignal(ivId, next[0], next[1]);
    if (name === "In Yard") {
      if (balance <= 0.01) await scheduleSignal(ivId, "Shipped", 1);
      else {
        const full = await getInvoiceFull(iv.invoiceId);
        const conv = full?.lead?.customerUserId ? (await db().select({ id: s.chatConversations.id }).from(s.chatConversations).where(and(eq(s.chatConversations.kind, "customer"), eq(s.chatConversations.customerUserId, full.lead.customerUserId))).limit(1))[0] : null;
        if (conv) {
          const { triggerSora } = await import("./agent");
          triggerSora(conv.id, { kind: "event", note: `${iv.unitLabel} on invoice ${full!.invoice.number} is in the yard. The balance of $${balance.toLocaleString("en-US")} is due before it ships. Remind the buyer in one short polite message, and say to send the slip here when paid.` });
        }
      }
    }
    if (name === "Shipped") {
      const [inv] = await db().select({ portId: s.invoices.consigneePortId }).from(s.invoices).where(eq(s.invoices.id, iv.invoiceId)).limit(1);
      const [port] = inv?.portId ? await db().select({ days: s.ports.transitDays }).from(s.ports).where(eq(s.ports.id, inv.portId)).limit(1) : [];
      await scheduleSignal(ivId, "Delivered to port", port?.days ?? 21);
    }
  });

  // ---------- auction desk ----------
  on("enquiry.created", async ({ enquiryId }) => {
    if (!workforceOn()) return;
    void assign("auction", { task: "auction.enquiry", title: "Answer an enquiry", note: `A buyer asked about a lot: enquiry_id ${enquiryId}. Read it, look at the lot, and answer.` });
  });
  on("auction.order.created", async ({ orderId }) => {
    if (!workforceOn()) return;
    void assign("auction", { task: "auction.order", title: "Check a new order", note: `A new order on an auction lot: order_id ${orderId}. Check the lot with review_auction_order: approve it if the lot is still upcoming, cancel it with the reason if not.` });
  });
  // after a sale: the buyer's own order follows their bid, with no judgement needed
  on("bids.settled", async ({ bidIds }) => {
    if (!(await on_("auction", "auction.order"))) return;
    const a = await actorFor("auction");
    const ids = (bidIds as string[]) ?? [];
    if (!a || !ids.length) return;
    const bids = await db().select().from(s.auctionBids).where(inArray(s.auctionBids.id, ids));
    let moved = 0;
    for (const b of bids) {
      const [o] = await db().select().from(s.auctionOrders).where(and(eq(s.auctionOrders.lotId, b.lotId), eq(s.auctionOrders.userId, b.userId), inArray(s.auctionOrders.status, ["pending", "approved"]))).limit(1);
      if (!o) continue;
      const status = b.status === "won" ? "confirmed" : "cancelled";
      await db().update(s.auctionOrders).set({ status, updatedAt: new Date() }).where(eq(s.auctionOrders.id, o.id));
      await audit(db(), { actorUserId: a.userId, actorKind: "fte", action: "order.status", entity: "order", entityId: o.id, summary: `${a.name} moved ${o.orderNo} to ${status} after the sale` });
      await notify([b.userId], { type: "order", title: `Order ${o.orderNo} is ${status}`, body: b.status === "won" ? "You won this lot." : "This lot was not won.", link: "/auction/me" });
      moved++;
    }
    if (moved) await sayInRoom("auction", `Sale day settled: ${moved} order(s) moved.`);
  });

  // ---------- CRM desk ----------
  on("leads.imported", async ({ leadIds, importedBy }) => {
    if (!(await on_("crm", "crm.leads"))) return;
    const yuki = await actorFor("crm");
    const sora = await workerUser("sales");
    const ids = (leadIds as string[]) ?? [];
    if (!yuki || !sora || !ids.length) return;
    const moved = await db().update(s.leads).set({ ownerUserId: sora.id, updatedAt: new Date() }).where(and(inArray(s.leads.id, ids), eq(s.leads.status, "new"))).returning({ id: s.leads.id });
    await audit(db(), { actorUserId: yuki.userId, actorKind: "fte", action: "lead.assign_imported", summary: `${yuki.name} gave ${moved.length} imported lead(s) to ${sora.name}` });
    await sayInRoom("crm", `${moved.length} imported lead(s) checked for duplicates and given to ${sora.name}. Imported by ${String(importedBy ?? "someone")}.`);
  });
  on("contact.message", async ({ messageId }) => {
    if (!workforceOn()) return;
    void assign("crm", { task: "crm.contact", title: "Answer a contact message", note: `A message came through the website's contact form: message_id ${messageId}. Read it. If it comes from a possible buyer with a phone number, make a lead and note what they want. Answer it, with no price: for a price invite them to the chat on the website. A complaint or a legal matter goes up with escalate_to_chief, unanswered.` });
  });

  // ---------- website desk ----------
  on("web_order.created", async ({ orderId, portId }) => {
    if (!workforceOn()) return;
    void assign("website", { task: "website.order", title: "Handle a website order", note: `${portId ? `The buyer has now given the port, port_id ${portId}: use it. ` : ""}A website order: order_id ${orderId}. Read it with review_web_order. If the buyer's port is known, turn it into an invoice request with order_to_invoice. If not, ask through tell_buyer_through_sales for their country and port and stop. If no car is free, cancel it and tell the buyer through sales.` });
  });
  on("vehicle.created", async ({ vehicleId }) => {
    if (!workforceOn()) return;
    const [v] = await db().select().from(s.vehicles).where(eq(s.vehicles.id, String(vehicleId))).limit(1);
    if (!v || (v.description && v.description.length >= 40)) return;
    void assign("website", { task: "website.listing", title: `Write the listing for ${v.stockNo}`, note: `A new car needs its listing text. Use only these facts and invent nothing: vehicle_id ${v.id}, stock ${v.stockNo}, ${v.title}, ${v.mileageKm} km, ${v.color}, ${v.transmission}, ${v.fuel}, ${v.drive}, ${v.bodyType}, ${v.seats ?? "?"} seats, in the ${v.location} yard. Do not state a price. Call write_listing.` });
  });

  // ---------- chief of staff ----------
  on("approval.requested", async ({ approvalId }) => {
    if (!workforceOn()) return;
    void assign("chief", { task: "chief.approvals", title: "Decide a waiting item", note: `An item is waiting: approval_id ${approvalId}. Read it with get_approval, then decide it or send it to the owner.` });
  });
}

const looked = new Set<string>();

/** The chief of staff's heartbeat: nothing waits forever, and the day gets its report. */
export async function chiefHeartbeat() {
  if (!reflexOn()) return;
  const env0 = await envelope();
  const t = await now();
  const waiting = await db().select().from(s.approvals).where(eq(s.approvals.status, "pending"));
  const tomo = await actorFor("chief");
  // anything no desk has looked at: from before the desks were switched on, or from a restart. Once each, a few at a time.
  let picked = 0;
  for (const ap of waiting) {
    const p = ap.payload as { owner?: boolean };
    if (p.owner || ap.kind.startsWith("task:") || looked.has(ap.id) || picked >= 3) continue;
    looked.add(ap.id);
    picked++;
    void assign("chief", { task: "chief.approvals", title: "Decide a waiting item", note: `An item has been waiting: approval_id ${ap.id}. Read it with get_approval, then decide it or send it to the owner.` });
  }
  const invoices = await db().select({ id: s.invoices.id }).from(s.invoices).where(eq(s.invoices.status, "pending")).orderBy(s.invoices.createdAt).limit(10);
  picked = 0;
  for (const i of invoices) {
    if (looked.has(i.id) || picked >= 3) continue;
    const [same] = await db().select({ id: s.approvals.id }).from(s.approvals).where(and(eq(s.approvals.status, "pending"), sql`${s.approvals.payload}->>'entityId' = ${i.id}`)).limit(1);
    looked.add(i.id);
    if (same) continue;
    picked++;
    void assign("invoices", { task: "invoice.review", title: "Check an invoice request", note: `An invoice request has been waiting: invoice_id ${i.id}. Read it with review_invoice and decide.` });
  }
  for (const ap of waiting) {
    const p = ap.payload as { owner?: boolean; ownerSince?: string; entityId?: string };
    if (!p.owner || !p.ownerSince || !tomo) continue;
    if (t.getTime() - new Date(p.ownerSince).getTime() < env0.ownerAnswerHours * 3600_000) continue;
    // nobody answered: the safe default, on the record
    const note = `No answer from the owner in ${env0.ownerAnswerHours} hours, so the safe default applied: not approved.`;
    if (ap.kind === "invoice" && p.entityId) await rejectInvoice(p.entityId, note, tomo).catch(() => {});
    await db().update(s.approvals).set({ status: "rejected", decidedBy: tomo.userId, decidedAt: new Date(), decisionNote: note }).where(eq(s.approvals.id, ap.id));
    await recordDecision({ workerKey: "chief", task: "chief.approvals", entity: ap.kind, entityId: ap.id, decision: "timed out: rejected", reason: note });
    await emit("approval.decided", { approvalId: ap.id });
    await sayInRoom("chief", `Owner did not answer in time on: ${ap.reason}. Safe default applied: not approved.`);
  }
  await writeReport(false);
}

/** The day's report. Numbers from the database; the words from the model when it is there. */
export async function writeReport(force: boolean) {
  const t = await now();
  // by itself it reports on the day that has just ended; asked for by hand, on today so far
  const day = new Date(t.getTime() - (force ? 0 : 86400_000)).toISOString().slice(0, 10);
  const [have] = await db().select().from(s.fteReports).where(eq(s.fteReports.day, day)).limit(1);
  if (have && !force) return have;
  const since = new Date(Date.now() - 86400_000); // runs carry real time, whatever the demo clock says
  const rows = await db()
    .select({ worker: s.fteRuns.workerKey, runs: sql<number>`count(*)::int`, failed: sql<number>`count(*) filter (where ${s.fteRuns.status} = 'error')::int`, tokens: sql<number>`coalesce(sum(${s.fteRuns.promptTokens} + ${s.fteRuns.completionTokens}),0)::int` })
    .from(s.fteRuns)
    .where(and(gte(s.fteRuns.startedAt, since), or(isNull(s.fteRuns.provider), sql`${s.fteRuns.provider} <> 'demo seed'`)))
    .groupBy(s.fteRuns.workerKey);
  if (!rows.length && !force) return null;
  const actions = await db().select({ action: s.auditLog.action, who: s.users.name, n: sql<number>`count(*)::int` }).from(s.auditLog).leftJoin(s.users, eq(s.users.id, s.auditLog.actorUserId)).where(and(eq(s.auditLog.actorKind, "fte"), gte(s.auditLog.createdAt, since))).groupBy(s.auditLog.action, s.users.name);
  const open = await db().select({ reason: s.approvals.reason, payload: s.approvals.payload }).from(s.approvals).where(eq(s.approvals.status, "pending")).limit(20);
  const humanActions = await db().select({ n: sql<number>`count(*)::int` }).from(s.auditLog).where(and(eq(s.auditLog.actorKind, "human"), gte(s.auditLog.createdAt, since)));
  const data = { day, workers: rows, actions, waiting: open.length, withOwner: open.filter((o) => (o.payload as { owner?: boolean }).owner).length, humanActions: humanActions[0]?.n ?? 0 };
  let body = `Report for ${day}: ${rows.reduce((a, r) => a + r.runs, 0)} runs, ${open.length} item(s) waiting.`;
  if (modelConfigured()) {
    try {
      const names = Object.fromEntries(await Promise.all(WORKERS.map(async (w) => [w.key, (await workerUser(w.key))?.name ?? w.key])));
      const r = await chat({
        messages: [
          { role: "system", content: "You are the chief of staff of a small car exporter, writing the owner's daily report. Plain English, under 150 words. Three short parts with these labels: Done. Missed or failed. Needs you. Use only the numbers given. If nothing failed, say so. Never invent an event." },
          { role: "user", content: JSON.stringify({ ...data, names }) },
        ],
        effort: "low",
        maxTokens: 700,
      });
      body = (r.message.content ?? "").trim() || body;
    } catch (e) {
      console.error("[report]", (e as Error).message);
    }
  }
  const [row] = await db().insert(s.fteReports).values({ day, body, data }).onConflictDoUpdate({ target: s.fteReports.day, set: { body, data, createdAt: new Date() } }).returning();
  await sayInRoom("chief", `Today's report is written.\n${body}`);
  await notify(await usersWithPerm("fte.envelope.manage"), { type: "report", title: `Daily report, ${day}`, body: body.slice(0, 160), link: "/fte" });
  return row;
}
