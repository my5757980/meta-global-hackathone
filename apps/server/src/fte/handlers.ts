/**
 * Sora's reactions to platform events (the nervous system). Deterministic parts (cards, links) are
 * posted directly; Sora writes the human words.
 */
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "../db/client";
import * as s from "../db/schema";
import { on, emit } from "../services/events";
import { postMessage } from "../services/chat";
import { envelope, siteSettings } from "../services/settings";
import { getInvoiceFull } from "../services/crm";
import { triggerSora } from "./agent";

async function conversationForLead(leadId: string) {
  const [lead] = await db().select().from(s.leads).where(eq(s.leads.id, leadId)).limit(1);
  if (!lead) return null;
  let userId = lead.customerUserId;
  if (!userId && lead.email) {
    const [u] = await db().select({ id: s.users.id }).from(s.users).where(sql`lower(${s.users.email}) = lower(${lead.email})`).limit(1);
    userId = u?.id ?? null;
  }
  if (!userId) return null;
  const [conv] = await db().select().from(s.chatConversations).where(and(eq(s.chatConversations.kind, "customer"), eq(s.chatConversations.customerUserId, userId))).limit(1);
  return conv ?? null;
}

async function soraId() {
  const [u] = await db().select({ id: s.users.id }).from(s.users).where(eq(s.users.kind, "fte")).limit(1);
  return u!.id;
}

/** Cap proactive messages per buyer per day (the envelope). */
async function underDailyCap(conversationId: string): Promise<boolean> {
  const env0 = await envelope();
  const sora = await soraId();
  const since = new Date(Date.now() - 86400_000);
  const [{ n }] = (await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(s.fteRuns)
    .where(and(eq(s.fteRuns.conversationId, conversationId), eq(s.fteRuns.trigger, "event"), gt(s.fteRuns.startedAt, since)))) as [{ n: number }];
  void sora;
  return n < env0.proactivePerBuyerPerDay + 2; // decisions on the buyer's own invoice always get through
}

export function registerSoraHandlers() {
  on("invoice.approved", async ({ invoiceId }) => {
    const full = await getInvoiceFull(String(invoiceId));
    if (!full?.lead) return;
    const conv = await conversationForLead(full.lead.id);
    if (!conv) return;
    const site = await siteSettings();
    await postMessage({
      conversationId: conv.id,
      senderUserId: await soraId(),
      kind: "card",
      body: "",
      meta: { cards: [{ type: "invoice", invoiceId: full.invoice.id, number: full.invoice.number, status: "approved", totalUsd: full.totals.total, advanceUsd: full.totals.advance, link: `/account/invoices/${full.invoice.id}` }] },
    });
    triggerSora(conv.id, {
      kind: "event",
      note: `Invoice ${full.invoice.number} was APPROVED by Supervisor ${full.approvedBy?.name ?? ""}. Total C&F $${full.totals.total.toLocaleString("en-US")}, advance ${full.invoice.advancePercent}% = $${full.totals.advance.toLocaleString("en-US")}. The invoice card is already shown above. Tell the buyer warmly in one short message: the invoice is approved, the advance amount, pay by bank transfer to ${site.bank.bankName} (SWIFT ${site.bank.swift}, account "${site.bank.accountName}" ${site.bank.accountNo}) with the invoice number as reference, and that they can open it in their account.`,
    });
  });

  on("invoice.rejected", async ({ invoiceId }) => {
    const full = await getInvoiceFull(String(invoiceId));
    if (!full?.lead) return;
    const conv = await conversationForLead(full.lead.id);
    if (!conv) return;
    triggerSora(conv.id, { kind: "event", note: `The Supervisor did not approve invoice request ${full.invoice.number} as it stands (internal note, do NOT quote it to the buyer: "${full.invoice.rejectionNote ?? "none"}"). Tell the buyer politely that the team needs to adjust the offer, and propose a next step (another car, another quote, or a colleague will call).` });
  });

  on("payment.recorded", async ({ invoiceId, amountUsd }) => {
    const full = await getInvoiceFull(String(invoiceId));
    if (!full?.lead) return;
    const conv = await conversationForLead(full.lead.id);
    if (!conv || !(await underDailyCap(conv.id))) return;
    triggerSora(conv.id, { kind: "event", note: `A payment of $${Number(amountUsd).toLocaleString("en-US")} was received for invoice ${full.invoice.number}. Paid so far $${full.totals.paid.toLocaleString("en-US")}, balance $${full.totals.balance.toLocaleString("en-US")}. Thank the buyer and state the balance (or that it is fully paid and shipping is next).` });
  });

  on("progress.updated", async ({ invoiceVehicleId, stage, note }) => {
    const [iv] = await db().select().from(s.invoiceVehicles).where(eq(s.invoiceVehicles.id, String(invoiceVehicleId))).limit(1);
    if (!iv) return;
    const [inv] = await db().select().from(s.invoices).where(eq(s.invoices.id, iv.invoiceId)).limit(1);
    if (!inv) return;
    const conv = await conversationForLead(inv.leadId);
    if (!conv || !(await underDailyCap(conv.id))) return;
    triggerSora(conv.id, { kind: "event", note: `Shipping progress for ${iv.year ?? ""} ${iv.unitLabel} (invoice ${inv.number}) is now "${stage}"${note ? ` — ${note}` : ""}. Tell the buyer in one short message and mention they can see documents in their account.` });
  });

  on("document.uploaded", async ({ unitId, folder }) => {
    const [u] = await db().select().from(s.units).where(eq(s.units.id, String(unitId))).limit(1);
    if (!u) return;
    const [inv] = await db().select().from(s.invoices).where(eq(s.invoices.id, u.invoiceId)).limit(1);
    if (!inv) return;
    const conv = await conversationForLead(inv.leadId);
    if (!conv || !(await underDailyCap(conv.id))) return;
    triggerSora(conv.id, { kind: "event", note: `A new document was uploaded for ${u.year ?? ""} ${u.make} ${u.model} (chassis ${u.chassis}): folder "${folder}". Tell the buyer it is available in their account under My Invoices.` });
  });

  on("approval.decided", async ({ approvalId }) => {
    const [ap] = await db().select().from(s.approvals).where(eq(s.approvals.id, String(approvalId))).limit(1);
    if (!ap?.conversationId) return;
    const pct = (ap.payload as { discountPct?: number })?.discountPct;
    triggerSora(ap.conversationId, {
      kind: "approval",
      note:
        ap.status === "approved"
          ? `The Supervisor APPROVED your request (${ap.kind}${pct ? ` ${pct}%` : ""}${(ap.payload as { amountJpy?: number })?.amountJpy ? ` ¥${(ap.payload as { amountJpy: number }).amountJpy.toLocaleString("en-US")}` : ""})${ap.decisionNote ? ` with note: ${ap.decisionNote}` : ""}. ${ap.kind === "discount" && pct ? `Re-quote with quote_cnf using discount_pct ${pct} — it is now allowed for this buyer.` : ap.kind === "bid" && ap.lotId ? `Place the bid now with place_bid (lot_id ${ap.lotId}, amount_jpy ${(ap.payload as { amountJpy?: number })?.amountJpy}, buyer_confirmed true) and tell the buyer.` : "Continue with the buyer."}`
          : `The Supervisor did NOT approve your request (${ap.kind}${pct ? ` ${pct}%` : ""})${ap.decisionNote ? ` — note: ${ap.decisionNote}` : ""}. Tell the buyer politely and offer the best price within policy.`,
    });
  });

  on("quote.followup", async ({ conversationId, quoteId }) => {
    const [q] = await db().select().from(s.quotes).where(eq(s.quotes.id, String(quoteId))).limit(1);
    if (!q) return;
    const [conv] = await db().select().from(s.chatConversations).where(eq(s.chatConversations.id, String(conversationId))).limit(1);
    if (!conv || conv.holder !== "fte") return;
    // only if the buyer has been silent since the quote and no invoice was requested from it
    const [lastBuyer] = await db().select().from(s.chatMessages).where(and(eq(s.chatMessages.conversationId, conv.id), eq(s.chatMessages.senderUserId, conv.customerUserId ?? ""))).orderBy(desc(s.chatMessages.createdAt)).limit(1);
    if (lastBuyer && lastBuyer.createdAt > q.createdAt) return;
    const [inv] = await db().select({ id: s.invoices.id }).from(s.invoices).where(eq(s.invoices.quoteId, q.id)).limit(1);
    if (inv || !(await underDailyCap(conv.id))) return;
    triggerSora(conv.id, { kind: "event", note: `Follow-up: the buyer has not replied since your quote for ${q.title} (C&F $${Number(q.totalCnfUsd).toLocaleString("en-US")}). Send ONE short, friendly follow-up: ask if they have questions or want to reserve it; mention the quote is valid for 7 days. Do not be pushy.` });
  });
}

/** Called after a quote: schedule one follow-up on the (demo) clock. */
export async function scheduleQuoteFollowUp(conversationId: string, quoteId: string) {
  const env0 = await envelope();
  await emit("quote.followup", { conversationId, quoteId }, { dueAt: new Date(Date.now() + env0.followUpAfterHours * 3600_000) });
}
