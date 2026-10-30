/**
 * Sora's reactions to platform events (the nervous system). Deterministic parts (cards, links) are
 * posted directly; Sora writes the human words.
 */
import { and, desc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import * as s from "../db/schema";
import { on, emit } from "../services/events";
import { postMessage } from "../services/chat";
import { envelope, now, siteSettings } from "../services/settings";
import { notify } from "../services/notify";
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
    // a lot whose sale is over: follow up only if we won it (then the buyer still has to confirm); the result message covers the rest
    if (q.auctionLotId) {
      const [lot] = await db().select({ status: s.auctionLots.status }).from(s.auctionLots).where(eq(s.auctionLots.id, q.auctionLotId)).limit(1);
      if (lot && lot.status !== "upcoming") {
        const [won] = await db().select({ id: s.auctionBids.id }).from(s.auctionBids).where(and(eq(s.auctionBids.lotId, q.auctionLotId), eq(s.auctionBids.status, "won"))).limit(1);
        if (!won) return;
      }
    }
    // a newer quote in the same chat replaces this one
    const [newer] = await db().select({ id: s.quotes.id }).from(s.quotes).where(and(eq(s.quotes.conversationId, conv.id), gt(s.quotes.createdAt, q.createdAt))).limit(1);
    if (newer) return;
    // only if the buyer has been silent since the quote and no invoice was requested from it
    const [lastBuyer] = await db().select().from(s.chatMessages).where(and(eq(s.chatMessages.conversationId, conv.id), eq(s.chatMessages.senderUserId, conv.customerUserId ?? ""))).orderBy(desc(s.chatMessages.createdAt)).limit(1);
    if (lastBuyer && lastBuyer.createdAt > q.createdAt) return;
    const [inv] = await db().select({ id: s.invoices.id }).from(s.invoices).where(eq(s.invoices.quoteId, q.id)).limit(1);
    if (inv || !(await underDailyCap(conv.id))) return;
    triggerSora(conv.id, { kind: "event", note: `Follow-up: the buyer has not replied since your quote for ${q.title} (C&F $${Number(q.totalCnfUsd).toLocaleString("en-US")}). Send ONE short, friendly follow-up: ask if they have questions or want to reserve it; mention the quote is valid for 7 days. Do not be pushy.` });
  });

  // a follow-up Sora scheduled for itself (schedule_follow_up)
  on("sora.followup", async ({ conversationId, reason }) => {
    const [conv] = await db().select().from(s.chatConversations).where(eq(s.chatConversations.id, String(conversationId))).limit(1);
    if (!conv || conv.holder !== "fte" || !(await underDailyCap(conv.id))) return;
    triggerSora(conv.id, { kind: "event", note: `Scheduled follow-up you set earlier: ${String(reason)}. Send the buyer ONE short, friendly message about it now.` });
  });

  // a car arrived that fits a wish Sora saved (save_buyer_request)
  on("stock.match", async ({ requestId, vehicleId }) => {
    const [r] = await db().select().from(s.buyerRequests).where(eq(s.buyerRequests.id, String(requestId))).limit(1);
    if (!r?.active || (r.lastNotifiedAt && Date.now() - r.lastNotifiedAt.getTime() < 6 * 3600_000)) return;
    const [v] = await db().select().from(s.vehicles).where(eq(s.vehicles.id, String(vehicleId))).limit(1);
    if (!v || v.status !== "available") return;
    const [conv] = r.conversationId
      ? await db().select().from(s.chatConversations).where(eq(s.chatConversations.id, r.conversationId)).limit(1)
      : await db().select().from(s.chatConversations).where(and(eq(s.chatConversations.kind, "customer"), eq(s.chatConversations.customerUserId, r.customerUserId))).limit(1);
    if (!conv || conv.holder !== "fte") return;
    await db().update(s.buyerRequests).set({ lastNotifiedAt: new Date() }).where(eq(s.buyerRequests.id, r.id));
    triggerSora(conv.id, { kind: "event", note: `A car matching the buyer's saved wish just arrived in stock: ${v.stockNo} — ${v.title}, $${Number(v.discountPriceUsd ?? v.priceUsd).toLocaleString("en-US")} FOB. Tell them first (get_vehicle ${v.stockNo} for the details) and offer the landed price to their port.` });
  });

  // auction days are over: each buyer hears all their results in ONE message
  on("bids.settled", async ({ bidIds }) => {
    const ids = (bidIds as string[]) ?? [];
    if (!ids.length) return;
    const rows = await db().select({ b: s.auctionBids, lot: s.auctionLots }).from(s.auctionBids).innerJoin(s.auctionLots, eq(s.auctionLots.id, s.auctionBids.lotId)).where(inArray(s.auctionBids.id, ids));
    const sora = await soraId();
    const yen = (n: number | null) => (n == null ? "—" : `¥${n.toLocaleString("en-US")}`);
    // Sora's bids: the bid.placed audit row knows which chat each was for
    const soraLots = rows.filter((r) => r.b.userId === sora).map((r) => r.lot.id);
    const placed = soraLots.length
      ? await db()
          .select({ lot: s.auditLog.entityId, conv: s.auditLog.conversationId })
          .from(s.auditLog)
          .where(and(eq(s.auditLog.action, "bid.placed"), eq(s.auditLog.actorUserId, sora), inArray(s.auditLog.entityId, soraLots), isNotNull(s.auditLog.conversationId)))
          .orderBy(desc(s.auditLog.createdAt))
      : [];
    const convOfLot = new Map<string, string>();
    for (const p of placed) if (p.lot && p.conv && !convOfLot.has(p.lot)) convOfLot.set(p.lot, p.conv);
    const lines = new Map<string, string[]>();
    for (const { b, lot } of rows) {
      const won = b.status === "won";
      const what = `lot ${lot.lotNo} (${lot.year} ${lot.make} ${lot.model}, sale day ${lot.saleDate})`;
      let convId: string | null = null;
      if (b.userId === sora) convId = convOfLot.get(lot.id) ?? null;
      else {
        await notify([b.userId], { type: won ? "bid_won" : "bid_lost", title: won ? `You won ${what}` : `Not won: ${what}`, body: won ? `Hammer price ${yen(lot.resultPriceJpy)} (your max ${yen(b.amountJpy)})` : `${lot.status === "unsold" ? "Not sold" : `Sold for ${yen(lot.resultPriceJpy)}`} — your max was ${yen(b.amountJpy)}`, link: `/auction/lots/${lot.id}` });
        const [c] = await db().select({ id: s.chatConversations.id }).from(s.chatConversations).where(and(eq(s.chatConversations.kind, "customer"), eq(s.chatConversations.customerUserId, b.userId))).limit(1);
        convId = c?.id ?? null;
      }
      if (!convId) continue;
      const line = won ? `WON ${what} at ${yen(lot.resultPriceJpy)} (max bid ${yen(b.amountJpy)}) — landed price: quote_cnf with lot_id ${lot.id}, bid_jpy ${lot.resultPriceJpy}` : `NOT WON ${what}: ${lot.status === "unsold" ? "not sold" : `sold for ${yen(lot.resultPriceJpy)}`}, max bid ${yen(b.amountJpy)}`;
      lines.set(convId, [...(lines.get(convId) ?? []), line]);
    }
    for (const [convId, ls] of lines) {
      const [conv] = await db().select({ holder: s.chatConversations.holder }).from(s.chatConversations).where(eq(s.chatConversations.id, convId)).limit(1);
      if (conv?.holder !== "fte") continue;
      triggerSora(convId, {
        kind: "event",
        note: [
          "AUCTION RESULTS for this buyer (these sale days are over):",
          ...ls,
          "Send ONE message covering every lot: for each win congratulate them and give the landed price to their port with quote_cnf, then ask them to confirm so you can request the invoice; for lots not won say so kindly and offer similar lots this week.",
        ].join(" | "),
      });
    }
  });
}

/** Called after a quote: schedule one follow-up on the (demo) clock. */
export async function scheduleQuoteFollowUp(conversationId: string, quoteId: string) {
  const env0 = await envelope();
  await emit("quote.followup", { conversationId, quoteId }, { dueAt: new Date((await now()).getTime() + env0.followUpAfterHours * 3600_000) });
}
