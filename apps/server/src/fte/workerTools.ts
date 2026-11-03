/**
 * The tools of the back-office FTEs. Same rule as Sora's: typed input, limits checked here on the server, an audit row
 * with every change. Each FTE sees only the tools on its role card (fte/workforce.ts), and runTool refuses any other.
 */
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { PROGRESS_STAGES, UNIT_FOLDERS } from "@autofte/shared";
import { db } from "../db/client";
import * as s from "../db/schema";
import { audit } from "../services/audit";
import { addLeadNote, approveInvoice, correctConsignee, editInvoice, findOrCreateLead, getInvoiceFull, reassignLead, rejectInvoice, requestInvoice, type Actor } from "../services/crm";
import { emit, eventsMuted } from "../services/events";
import { getFile, saveFile } from "../services/files";
import { invoicePdf } from "../services/invoiceDocs";
import { invoiceRubric, policyPrice } from "../services/invoiceCheck";
import { recordDecision } from "../services/ledger";
import { sendMail } from "../services/mail";
import { notify, usersWithPerm } from "../services/notify";
import { addProgress, setWebOrderStatus, stagesDone } from "../services/ops";
import { priceHistory } from "../services/auction";
import { chassisLookup, chassisParts, fobEstimate, ourStock } from "../services/auctionExtras";
import { envelope, now, pricingPolicy, siteSettings } from "../services/settings";
import { ToolError } from "./errors";
import { docReadingOf, readDocument, readSlip, slipReadingOf } from "./pictureReader";
import type { ToolCtx, ToolDef } from "./tools";
import { levelOf, workerUser } from "./workforce";

const actorOf = (ctx: ToolCtx): Actor => ({ userId: ctx.principalUserId, kind: "fte", name: ctx.principalName, conversationId: ctx.conversationId ?? null, fteRunId: ctx.runId ?? null });
const idArg = z.string().min(8).max(60);
const digits = (x?: string | null) => (x ?? "").replace(/\D/g, "");
const clean = (x?: string | null) => (x ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** At L1 the action waits for a person: the proposal is queued and nothing changes yet. */
async function proposal(ctx: ToolCtx, kind: string, reason: string, payload: Record<string, unknown>) {
  const [ap] = await db().insert(s.approvals).values({ kind, requestedBy: ctx.principalUserId, conversationId: ctx.conversationId ?? null, payload: { ...payload, from: ctx.workerKey }, reason }).returning();
  await notify(await usersWithPerm("fte.approvals.decide"), { type: "approval", title: `${ctx.principalName} proposes: ${reason}`.slice(0, 120), body: "Waiting for your yes or no", link: "/fte" });
  return { queued_for_review: true, approval_id: ap!.id, message: "At this autonomy level a person approves each action. It has been queued. Stop here." };
}

async function queueForChief(ctx: ToolCtx, kind: "invoice" | "payment" | "other", reason: string, payload: Record<string, unknown>, leadId?: string | null) {
  const entityId = String(payload.entityId ?? "");
  if (entityId) {
    const [same] = await db().select({ id: s.approvals.id }).from(s.approvals).where(and(eq(s.approvals.kind, kind), eq(s.approvals.status, "pending"), sql`${s.approvals.payload}->>'entityId' = ${entityId}`)).limit(1);
    if (same) return { already_waiting: true, approval_id: same.id };
  }
  const [ap] = await db().insert(s.approvals).values({ kind, requestedBy: ctx.principalUserId, conversationId: ctx.conversationId ?? null, leadId: leadId ?? null, payload: { ...payload, from: ctx.workerKey }, reason }).returning();
  await audit(db(), { actorUserId: ctx.principalUserId, actorKind: "fte", action: "approval.requested", entity: "approval", entityId: ap!.id, fteRunId: ctx.runId, summary: `${ctx.principalName} passed this up: ${reason}` });
  await emit("approval.requested", { approvalId: ap!.id });
  return { passed_to_chief: true, approval_id: ap!.id, message: "The chief of staff has it now. Stop here." };
}

// ---------- the actions a decision can carry out, shared by the FTEs, the chief of staff and a person ----------
export async function approveAndSign(invoiceId: string, actor: Actor, workerKey: string, task: string, reason: string) {
  await approveInvoice(invoiceId, actor);
  await recordDecision({ workerKey, task, entity: "invoice", entityId: invoiceId, decision: "approved", reason });
}

export interface PaymentArgs {
  invoiceId: string;
  amountUsd: number;
  receivedDate: string;
  reference: string;
  fileId: string | null;
}
export async function recordPaymentRow(p: PaymentArgs, actor: Actor, workerKey: string, task: string, reason: string) {
  const full = await getInvoiceFull(p.invoiceId);
  if (!full) throw new ToolError("Invoice not found");
  const policy = await pricingPolicy();
  await db().transaction(async (tx) => {
    await tx.insert(s.payments).values({ invoiceId: p.invoiceId, amountUsd: p.amountUsd, receivedDate: p.receivedDate, fxRate: policy.fxJpyPerUsd, yenAmount: Math.round(p.amountUsd * policy.fxJpyPerUsd), receiptFileId: p.fileId, slipReference: p.reference, sellingPriceUsd: Number(full.invoice.totalCnfUsd), recordedBy: actor.userId });
    await audit(tx, { actorUserId: actor.userId, actorKind: actor.kind, action: "payment.recorded", entity: "invoice", entityId: p.invoiceId, fteRunId: actor.fteRunId, summary: `${actor.name} recorded $${p.amountUsd.toLocaleString("en-US")} on invoice ${full.invoice.number} (reference ${p.reference})` });
    await emit("payment.recorded", { invoiceId: p.invoiceId, amountUsd: p.amountUsd }, { tx });
    await recordDecision({ workerKey, task, entity: "invoice", entityId: p.invoiceId, decision: `payment $${p.amountUsd}`, reason }, tx);
  });
}

/** What happens when a queued item is approved or rejected, whoever decides. */
export async function carryOut(ap: typeof s.approvals.$inferSelect, approved: boolean, actor: Actor, workerKey: string, note: string) {
  const p = ap.payload as Record<string, unknown>;
  const entityId = String(p.entityId ?? "");
  if ((ap.kind === "invoice" || ap.kind === "task:invoice.review") && entityId) {
    if (approved) await approveAndSign(entityId, actor, workerKey, "chief.approvals", note);
    else {
      await rejectInvoice(entityId, note, actor);
      await recordDecision({ workerKey, task: "chief.approvals", entity: "invoice", entityId, decision: "rejected", reason: note });
    }
  }
  if ((ap.kind === "payment" || ap.kind === "task:payment.record") && entityId) {
    const complete = Number(p.amountUsd) > 0 && p.receivedDate && p.reference;
    if (approved && complete) await recordPaymentRow({ invoiceId: entityId, amountUsd: Number(p.amountUsd), receivedDate: String(p.receivedDate), reference: String(p.reference), fileId: (p.fileId as string) ?? null }, actor, workerKey, "chief.approvals", note);
    else if (!approved) await recordDecision({ workerKey, task: "chief.approvals", entity: "invoice", entityId, decision: "payment refused", reason: note });
  }
}

/** Everything a slip must pass before money is recorded from it. Nothing here trusts what the model says. */
async function slipProblems(fileId: string, invoiceId: string, amount: number, reference: string): Promise<{ problems: string[]; full: NonNullable<Awaited<ReturnType<typeof getInvoiceFull>>> }> {
  const full = await getInvoiceFull(invoiceId);
  if (!full) throw new ToolError("No such invoice");
  const out: string[] = [];
  const reading = slipReadingOf(fileId);
  if (!reading) return { problems: ["The slip has not been read yet: call read_payment_slip first."], full };
  if (reading.is_payment_slip === false) out.push("This picture is not a bank slip.");
  if (Math.abs(Number(reading.amount) - amount) > 0.01) out.push(`The slip says ${reading.amount}, not ${amount}.`);
  if ((reading.currency ?? "USD").toUpperCase() !== "USD") out.push(`The slip is in ${reading.currency}.`);
  const site = await siteSettings();
  if (digits(reading.beneficiary_account) !== digits(site.bank.accountNo) || !clean(reading.beneficiary_name).includes(clean(site.bank.accountName).slice(0, 10))) out.push(`The slip does not show the company's account: it says "${reading.beneficiary_name}", account "${reading.beneficiary_account}".`);
  if (!reference.trim() || clean(reading.reference) !== clean(reference)) out.push(`The slip's transaction reference is "${reading.reference ?? ""}".`);
  const [used] = await db().select({ id: s.payments.id }).from(s.payments).where(eq(s.payments.slipReference, reference.trim())).limit(1);
  if (used) out.push(`Reference ${reference} was recorded before: this slip has already been used.`);
  if (!["approved", "sent"].includes(full.invoice.status)) out.push(`Invoice ${full.invoice.number} is ${full.invoice.status}, so it cannot take a payment.`);
  const f = await getFile(fileId);
  if (f?.ownerUserId && full.lead?.customerUserId && f.ownerUserId !== full.lead.customerUserId) out.push(`This slip was sent by a different buyer than the one on invoice ${full.invoice.number}.`);
  if (amount > full.totals.balance + 0.01) out.push(`$${amount} is more than the balance of $${full.totals.balance}.`);
  return { problems: out, full };
}

async function buyerConversation(userId: string | null | undefined) {
  if (!userId) return null;
  const [c] = await db().select({ id: s.chatConversations.id }).from(s.chatConversations).where(and(eq(s.chatConversations.kind, "customer"), eq(s.chatConversations.customerUserId, userId))).limit(1);
  return c?.id ?? null;
}

// ---------- Mei: the invoice desk ----------
const INVOICE_TOOLS: ToolDef[] = [
  {
    name: "correct_invoice",
    description: "Put right a name, phone, e-mail or address on an invoice, when the buyer asks. A new PDF follows if it already had one. It cannot change a price or a car.",
    input: { invoice_id: idArg, consignee_name: z.string().min(2).max(120).optional(), consignee_phone: z.string().min(6).max(30).optional(), consignee_email: z.string().email().max(120).optional(), consignee_address: z.string().min(3).max(200).optional(), why: z.string().min(3).max(300) },
    async run(a, ctx) {
      const id = String(a.invoice_id);
      const inv = await correctConsignee(id, { consigneeName: a.consignee_name as string, consigneePhone: a.consignee_phone as string, consigneeEmail: a.consignee_email as string, consigneeAddress: a.consignee_address as string }, String(a.why), actorOf(ctx));
      let newPdf = false;
      if (inv.finalPdfFileId) {
        const full = await getInvoiceFull(id);
        const f = await saveFile(await invoicePdf(full!), { kind: "invoices", mime: "application/pdf", originalName: `${inv.number}.pdf`, ownerUserId: ctx.principalUserId });
        await db().update(s.invoices).set({ finalPdfFileId: f.id }).where(eq(s.invoices.id, id));
        newPdf = true;
      }
      await recordDecision({ workerKey: "invoices", task: "invoice.review", entity: "invoice", entityId: id, decision: "corrected", reason: String(a.why) });
      return { corrected: true, number: inv.number, new_pdf: newPdf };
    },
  },
  {
    name: "review_invoice",
    description: "Read an invoice request and run the rubric on it: consignee, prices, stock, the accepted quote, your limit. Read this first, always.",
    input: { invoice_id: idArg },
    async run(a) {
      const r = await invoiceRubric(String(a.invoice_id));
      if (!r) throw new ToolError("No such invoice");
      return r;
    },
  },
  {
    name: "price_invoice",
    description: "Fill an unpriced invoice's lines from the company's price engine, for cars from stock. Use it when the rubric says a car has no price.",
    input: { invoice_id: idArg },
    async run(a, ctx) {
      const id = String(a.invoice_id);
      const full = await getInvoiceFull(id);
      if (!full) throw new ToolError("No such invoice");
      const inv = full.invoice;
      if (!inv.consigneePortId || !inv.consigneeCountryCode) throw new ToolError("The invoice has no port, so the price engine cannot price it. Reject it with that note.");
      const vehicles = [];
      for (const v of full.vehicles) {
        let pushUsd = Number(v.pushUsd);
        let cnfUsd = Number(v.cnfUsd);
        if (!(cnfUsd > 0)) {
          if (!v.vehicleId) throw new ToolError(`${v.unitLabel} is not a stock car, so the price engine cannot price it. Pass this up with escalate_to_chief.`);
          const p = await policyPrice(v.vehicleId, inv.consigneePortId, inv.consigneeCountryCode);
          if (!p) throw new ToolError(`No price could be worked out for ${v.unitLabel}. Pass this up with escalate_to_chief.`);
          pushUsd = p.pushUsd;
          cnfUsd = p.cnfUsd;
        }
        vehicles.push({ id: v.id, vehicleId: v.vehicleId, unitLabel: v.unitLabel, year: v.year, color: v.color, chassisNo: v.chassisNo, engine: v.engine, transmission: v.transmission, fuel: v.fuel, pushUsd, cnfUsd });
      }
      const r = await editInvoice(id, { consigneeName: inv.consigneeName, consigneePhone: inv.consigneePhone, consigneeEmail: inv.consigneeEmail, consigneeAddress: inv.consigneeAddress, consigneeCountryCode: inv.consigneeCountryCode, consigneePortId: inv.consigneePortId, m3Rate: inv.m3Rate, exchangeRate: inv.exchangeRate, advancePercent: inv.advancePercent, vehicles }, actorOf(ctx));
      return { priced: true, total_cnf_usd: r.totalCnf, message: "Now run review_invoice again." };
    },
  },
  {
    name: "approve_invoice",
    description: "Approve an invoice. The rubric runs again here: a failed check or an amount above your limit is refused. The final PDF and sending then happen by themselves.",
    input: { invoice_id: idArg, reason: z.string().min(5).max(400).describe("One line: why this is right") },
    async run(a, ctx) {
      const id = String(a.invoice_id);
      const r = await invoiceRubric(id);
      if (!r) throw new ToolError("No such invoice");
      if (!r.allPass) throw new ToolError(`Cannot approve. Failing: ${r.failing.join(" | ")}`);
      if (!r.withinLimit) throw new ToolError(`$${r.totalCnfUsd.toLocaleString("en-US")} is above your limit of $${r.limitUsd.toLocaleString("en-US")}. Call escalate_to_chief.`);
      if ((await levelOf("invoices", "invoice.review")) === 1) return proposal(ctx, "task:invoice.review", `approve invoice ${r.number} ($${r.totalCnfUsd.toLocaleString("en-US")})`, { entityId: id, number: r.number, amountUsd: r.totalCnfUsd, why: a.reason });
      await approveAndSign(id, actorOf(ctx), "invoices", "invoice.review", String(a.reason));
      return { approved: true, number: r.number };
    },
  },
  {
    name: "reject_invoice",
    description: "Reject an invoice request. The note is internal: the sales FTE tells the buyer politely.",
    input: { invoice_id: idArg, note: z.string().min(5).max(400) },
    async run(a, ctx) {
      const id = String(a.invoice_id);
      await rejectInvoice(id, String(a.note), actorOf(ctx));
      await recordDecision({ workerKey: "invoices", task: "invoice.review", entity: "invoice", entityId: id, decision: "rejected", reason: String(a.note) });
      return { rejected: true };
    },
  },
];

// ---------- Ren: accounts ----------
const ACCOUNTS_TOOLS: ToolDef[] = [
  {
    name: "read_payment_slip",
    description: "Read a bank slip picture with vision. Returns what is written on it, and the company's own account to compare it with.",
    input: { file_id: idArg },
    async run(a) {
      const reading = await readSlip(String(a.file_id));
      const site = await siteSettings();
      return { reading, company_account: { name: site.bank.accountName, number: site.bank.accountNo, bank: site.bank.bankName } };
    },
  },
  {
    name: "find_invoice",
    description: "Find invoices that can take a payment: by the number on the slip, or by the buyer. Returns total, paid and balance.",
    input: { number: z.string().max(30).optional(), buyer_user_id: idArg.optional() },
    async run(a) {
      const w = [inArray(s.invoices.status, ["approved", "sent"])];
      if (a.number) w.push(eq(s.invoices.number, String(a.number).trim().toUpperCase()));
      if (a.buyer_user_id) w.push(eq(s.leads.customerUserId, String(a.buyer_user_id)));
      if (!a.number && !a.buyer_user_id) throw new ToolError("Give the invoice number or the buyer");
      const rows = await db().select({ id: s.invoices.id }).from(s.invoices).innerJoin(s.leads, eq(s.leads.id, s.invoices.leadId)).where(and(...w)).orderBy(desc(s.invoices.createdAt)).limit(5);
      const out = [];
      for (const r of rows) {
        const f = await getInvoiceFull(r.id);
        if (f) out.push({ invoice_id: f.invoice.id, number: f.invoice.number, consignee: f.invoice.consigneeName, total_usd: f.totals.total, advance_usd: f.totals.advance, paid_usd: f.totals.paid, balance_usd: f.totals.balance, buyer_user_id: f.lead?.customerUserId ?? null });
      }
      return { invoices: out };
    },
  },
  {
    name: "record_payment",
    description: "Record a payment from a slip you have read. It is refused if the amount differs from the slip, the slip does not show the company's account, the slip belongs to another buyer, its reference was used before, or the amount is above the balance or your limit.",
    input: { invoice_id: idArg, amount_usd: z.number().positive(), received_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reference: z.string().min(3).max(60), file_id: idArg, why: z.string().min(5).max(300) },
    async run(a, ctx) {
      const fileId = String(a.file_id);
      const amount = Number(a.amount_usd);
      const ref = String(a.reference).trim();
      const { problems, full } = await slipProblems(fileId, String(a.invoice_id), amount, ref);
      if (problems.length) throw new ToolError(`Not recorded. ${problems.join(" ")} Do not retry with other numbers: tell the buyer through sales what is wrong, or pass it up with escalate_to_chief.`);
      const env0 = await envelope();
      if (amount > env0.paymentAutoRecordUsd) throw new ToolError(`$${amount} is above your limit of $${env0.paymentAutoRecordUsd}. Pass it up with escalate_to_chief.`);
      const p = { entityId: full.invoice.id, number: full.invoice.number, amountUsd: amount, receivedDate: String(a.received_date), reference: ref, fileId };
      if ((await levelOf("accounts", "payment.record")) === 1) return proposal(ctx, "task:payment.record", `record $${amount} on invoice ${full.invoice.number}`, p);
      await recordPaymentRow({ invoiceId: full.invoice.id, amountUsd: amount, receivedDate: p.receivedDate, reference: ref, fileId }, actorOf(ctx), "accounts", "payment.record", String(a.why));
      return { recorded: true, number: full.invoice.number, balance_usd: Math.round((full.totals.balance - amount) * 100) / 100 };
    },
  },
];

// ---------- Aoi: operations ----------
const OPS_TOOLS: ToolDef[] = [
  {
    name: "get_unit_work",
    description: "One unit: its car, chassis, the stages done and the documents already filed.",
    input: { unit_id: idArg },
    async run(a) {
      const [u] = await db().select().from(s.units).where(eq(s.units.id, String(a.unit_id))).limit(1);
      if (!u) throw new ToolError("No such unit");
      const docs = await db().select({ folder: s.unitDocuments.folder, name: s.files.originalName }).from(s.unitDocuments).innerJoin(s.files, eq(s.files.id, s.unitDocuments.fileId)).where(eq(s.unitDocuments.unitId, u.id));
      return { unit_id: u.id, car: `${u.year ?? ""} ${u.make} ${u.model}`.trim(), chassis: u.chassis, color: u.color, stages_done: u.invoiceVehicleId ? await stagesDone(u.invoiceVehicleId) : [], documents: docs, folders: UNIT_FOLDERS };
    },
  },
  {
    name: "read_document",
    description: "Read a document picture with vision: its type, the chassis written on it, the vessel and the date.",
    input: { file_id: idArg },
    async run(a) {
      return { reading: await readDocument(String(a.file_id)) };
    },
  },
  {
    name: "file_document",
    description: "File a document you have read into one of the unit's six folders. Refused if its chassis is for another car. The buyer is told by the sales FTE.",
    input: { unit_id: idArg, file_id: idArg, folder: z.enum(UNIT_FOLDERS as unknown as [string, ...string[]]) },
    async run(a, ctx) {
      const fileId = String(a.file_id);
      const reading = docReadingOf(fileId);
      if (!reading) throw new ToolError("Read the document with read_document first.");
      const [u] = await db().select().from(s.units).where(eq(s.units.id, String(a.unit_id))).limit(1);
      if (!u) throw new ToolError("No such unit");
      if (reading.chassis && clean(reading.chassis) !== clean(u.chassis)) throw new ToolError(`This document is for chassis ${reading.chassis}, but the unit is ${u.chassis}. Do not file it. Pass it up with escalate_to_chief.`);
      const [dup] = await db().select({ id: s.unitDocuments.id }).from(s.unitDocuments).where(and(eq(s.unitDocuments.unitId, u.id), eq(s.unitDocuments.fileId, fileId))).limit(1);
      if (dup) return { already_filed: true };
      await db().transaction(async (tx) => {
        await tx.insert(s.unitDocuments).values({ unitId: u.id, folder: String(a.folder), fileId });
        await audit(tx, { actorUserId: ctx.principalUserId, actorKind: "fte", action: "unit.document", entity: "unit", entityId: u.id, fteRunId: ctx.runId, summary: `${ctx.principalName} filed "${reading.document_type ?? "a document"}" in "${a.folder}" for ${u.make} ${u.model} (${u.chassis})` });
        await emit("document.uploaded", { unitId: u.id, folder: String(a.folder) }, { tx });
      });
      return { filed: true, folder: a.folder };
    },
  },
  {
    name: "update_shipping_progress",
    description: "Record a shipping stage for a car. The history is append-only; a stage already recorded changes nothing.",
    input: { invoice_vehicle_id: idArg, stage: z.enum(PROGRESS_STAGES as unknown as [string, ...string[]]), note: z.string().max(200).optional() },
    async run(a, ctx) {
      const added = await addProgress(String(a.invoice_vehicle_id), String(a.stage), (a.note as string) ?? null, actorOf(ctx));
      return { recorded: added };
    },
  },
];

// ---------- Kaito: the auction desk ----------
const ORDER_STEPS: Record<string, string[]> = { pending: ["approved", "cancelled"], approved: ["confirmed", "cancelled"], confirmed: ["paid", "cancelled"], paid: ["shipped"], shipped: ["delivered"] };
const AUCTION_TOOLS: ToolDef[] = [
  {
    name: "review_bid",
    description: "A bid a person placed: the amount against the start price and recent prices of this model, the bidder's own message, and your limit. It marks the bid as under review.",
    input: { bid_id: idArg },
    async run(a) {
      const [b] = await db().select({ b: s.auctionBids, l: s.auctionLots, who: s.users.name, kind: s.users.kind }).from(s.auctionBids).innerJoin(s.auctionLots, eq(s.auctionLots.id, s.auctionBids.lotId)).innerJoin(s.users, eq(s.users.id, s.auctionBids.userId)).where(eq(s.auctionBids.id, String(a.bid_id))).limit(1);
      if (!b) throw new ToolError("No such bid");
      if (b.b.status === "placed") await db().update(s.auctionBids).set({ status: "under review" }).where(eq(s.auctionBids.id, b.b.id));
      const h = await priceHistory(b.l.make, b.l.model, b.l.year);
      const env0 = await envelope();
      return { bid_no: b.b.bidNo, status: b.b.status === "placed" ? "under review" : b.b.status, bidder: b.who, bidder_is_staff: b.kind !== "customer", amount_jpy: b.b.amountJpy, over_bid_jpy: b.b.overBidJpy, message: b.b.message, lot: { lot_id: b.l.id, lot_no: b.l.lotNo, car: `${b.l.year} ${b.l.make} ${b.l.model}`, grade: b.l.grade, start_price_jpy: b.l.startPriceJpy, recent_average_jpy: b.l.avgPriceJpy, sale_date: b.l.saleDate, sale_status: b.l.status }, past_prices: { sold: h.soldCount, average_jpy: h.avgSoldJpy, lowest_jpy: h.minSoldJpy, highest_jpy: h.maxSoldJpy }, your_limit_jpy: env0.maxBidJpy };
    },
  },
  {
    name: "decide_bid",
    description: "Accept a bid (it goes on the day's sheet for the auction) or reject it. The note is what the bidder reads: say the reason plainly, never mention your limit. A bid above your limit cannot be accepted here: escalate it to the Chief of Staff.",
    input: { bid_id: idArg, decision: z.enum(["accepted", "rejected"]), note: z.string().min(5).max(200) },
    async run(a, ctx) {
      const [b] = await db().select({ b: s.auctionBids, l: s.auctionLots }).from(s.auctionBids).innerJoin(s.auctionLots, eq(s.auctionLots.id, s.auctionBids.lotId)).where(eq(s.auctionBids.id, String(a.bid_id))).limit(1);
      if (!b) throw new ToolError("No such bid");
      if (!["placed", "under review"].includes(b.b.status)) return { already_decided: true, status: b.b.status };
      if (a.decision === "accepted") {
        if (b.l.status !== "upcoming" || b.l.saleDate < (await now()).toISOString().slice(0, 10)) throw new ToolError("This lot's sale is over, so the bid cannot be accepted. Reject it and say so.");
        const env0 = await envelope();
        if (b.b.amountJpy > env0.maxBidJpy) {
          const [ok] = await db().select({ id: s.approvals.id }).from(s.approvals).where(and(eq(s.approvals.kind, "bid"), eq(s.approvals.status, "approved"), eq(s.approvals.lotId, b.l.id), sql`(${s.approvals.payload}->>'amountJpy')::int >= ${b.b.amountJpy}`)).limit(1);
          if (!ok) return { needs_chief: true, message: `¥${b.b.amountJpy.toLocaleString("en-US")} is above your limit of ¥${env0.maxBidJpy.toLocaleString("en-US")}. Call escalate_to_chief with this bid.` };
        }
      }
      await db().transaction(async (tx) => {
        await tx.update(s.auctionBids).set({ status: String(a.decision), note: String(a.note) }).where(eq(s.auctionBids.id, b.b.id));
        await audit(tx, { actorUserId: ctx.principalUserId, actorKind: "fte", action: "bid.status", entity: "bid", entityId: b.b.id, fteRunId: ctx.runId, summary: `${ctx.principalName} ${a.decision} bid ${b.b.bidNo ?? ""} of ¥${b.b.amountJpy.toLocaleString("en-US")} on lot ${b.l.lotNo}: ${a.note}` });
        await recordDecision({ workerKey: "auction", task: "auction.bid", entity: "bid", entityId: b.b.id, decision: String(a.decision), reason: String(a.note) }, tx);
      });
      await notify([b.b.userId], { type: "bid", title: `Bid ${b.b.bidNo ?? ""} ${a.decision}`, body: String(a.note).slice(0, 140), link: "/auction/me" });
      return { decided: true, status: a.decision };
    },
  },
  {
    name: "get_auction_enquiry",
    description: "A buyer's enquiry about a lot: the question and the lot's id.",
    input: { enquiry_id: idArg },
    async run(a) {
      const [e] = await db().select({ e: s.auctionEnquiries, who: s.users.name }).from(s.auctionEnquiries).innerJoin(s.users, eq(s.users.id, s.auctionEnquiries.userId)).where(eq(s.auctionEnquiries.id, String(a.enquiry_id))).limit(1);
      if (!e) throw new ToolError("No such enquiry");
      return { enquiry_no: e.e.enqNo, buyer: e.who, question: e.e.message, lot_id: e.e.lotId, status: e.e.status };
    },
  },
  {
    name: "answer_enquiry",
    description: "Answer a buyer's enquiry. They are told at once. Answer only from the lot's record, its sheet and past prices.",
    input: { enquiry_id: idArg, reply: z.string().min(5).max(1500) },
    async run(a, ctx) {
      const [e] = await db().select().from(s.auctionEnquiries).where(eq(s.auctionEnquiries.id, String(a.enquiry_id))).limit(1);
      if (!e) throw new ToolError("No such enquiry");
      if (e.status === "answered") return { already_answered: true };
      await db().update(s.auctionEnquiries).set({ reply: String(a.reply), repliedBy: ctx.principalUserId, repliedAt: new Date(), status: "answered" }).where(eq(s.auctionEnquiries.id, e.id));
      await notify([e.userId], { type: "enquiry_reply", title: `Reply to ${e.enqNo}`, body: String(a.reply).slice(0, 140), link: "/auction/me" });
      await audit(db(), { actorUserId: ctx.principalUserId, actorKind: "fte", action: "enquiry.replied", entity: "enquiry", entityId: e.id, fteRunId: ctx.runId, summary: `${ctx.principalName} answered enquiry ${e.enqNo}` });
      return { answered: true };
    },
  },
  {
    name: "review_auction_order",
    description: "An order on an auction lot: the lot's state and the order's stage, with the stages it can move to.",
    input: { order_id: idArg },
    async run(a) {
      const [o] = await db().select({ o: s.auctionOrders, lot: s.auctionLots, who: s.users.name }).from(s.auctionOrders).innerJoin(s.auctionLots, eq(s.auctionLots.id, s.auctionOrders.lotId)).innerJoin(s.users, eq(s.users.id, s.auctionOrders.userId)).where(eq(s.auctionOrders.id, String(a.order_id))).limit(1);
      if (!o) throw new ToolError("No such order");
      return { order_no: o.o.orderNo, buyer: o.who, status: o.o.status, can_move_to: ORDER_STEPS[o.o.status] ?? [], price_jpy: o.o.priceJpy, lot: { lot_no: o.lot.lotNo, car: `${o.lot.year} ${o.lot.make} ${o.lot.model}`, status: o.lot.status, sale_date: o.lot.saleDate } };
    },
  },
  {
    name: "update_auction_order",
    description: "Move an order to its next stage. Only the next stages in the fixed order are allowed.",
    input: { order_id: idArg, status: z.enum(["approved", "confirmed", "paid", "shipped", "delivered", "cancelled"]), why: z.string().min(3).max(200) },
    async run(a, ctx) {
      const [o] = await db().select().from(s.auctionOrders).where(eq(s.auctionOrders.id, String(a.order_id))).limit(1);
      if (!o) throw new ToolError("No such order");
      if (!(ORDER_STEPS[o.status] ?? []).includes(String(a.status))) throw new ToolError(`${o.orderNo} is ${o.status}: it can only move to ${(ORDER_STEPS[o.status] ?? []).join(" or ") || "nothing"}.`);
      await db().transaction(async (tx) => {
        await tx.update(s.auctionOrders).set({ status: String(a.status), updatedAt: new Date() }).where(eq(s.auctionOrders.id, o.id));
        await audit(tx, { actorUserId: ctx.principalUserId, actorKind: "fte", action: "order.status", entity: "order", entityId: o.id, fteRunId: ctx.runId, summary: `${ctx.principalName} moved ${o.orderNo} to ${a.status}: ${a.why}` });
      });
      await notify([o.userId], { type: "order", title: `Order ${o.orderNo} is ${a.status}`, body: String(a.why).slice(0, 140), link: "/auction/me" });
      return { moved: true };
    },
  },
];

// ---------- Yuki: the CRM desk ----------
const LOT_FACT_TOOLS: ToolDef[] = [
  {
    name: "estimate_fob",
    description: "The company's FOB estimate for a bid on an auction lot, in yen: transport, clearance, inspection, L/C, vanning, radiation, handling. An estimate, not a quote to a port: say so.",
    input: { bid_jpy: z.number().int().positive(), truck: z.boolean().optional(), inspection: z.enum(["None", "JAAI", "JEVIC"]).optional(), lc: z.boolean().optional(), vanning: z.boolean().optional() },
    async run(a) {
      return fobEstimate({ bidJpy: Number(a.bid_jpy), kind: a.truck ? "truck" : "car", inspection: a.inspection as string | undefined, lc: !!a.lc, vanning: !!a.vanning });
    },
  },
  {
    name: "chassis_lookup",
    description: "From a chassis number: year and month of manufacture, model name, grade code, seats, and our own lots of that model on sale now. Demo figures: say they are from the demo register.",
    input: { chassis: z.string().min(2).max(40) },
    async run(a) {
      const p = chassisParts(String(a.chassis));
      return { answer: await chassisLookup(p.code, p.number), our_lots: (await ourStock(p.code, 6)).map((l) => ({ lot_id: l.id, lot_no: l.lotNo, sale_date: l.saleDate, hall: l.hall, year: l.year, grade: l.grade, start_price_jpy: l.startPriceJpy })) };
    },
  },
];

const CRM_TOOLS: ToolDef[] = [
  {
    name: "reassign_lead",
    description: "Move one lead to another member of staff or Digital FTE when its owner has left or the Chief of Staff asked for it. Its invoices and units follow. Say why.",
    input: { lead_id: idArg, to_name: z.string().min(2).max(80), reason: z.string().min(5).max(300) },
    async run(a, ctx) {
      const [to] = await db().select({ id: s.users.id, name: s.users.name, kind: s.users.kind }).from(s.users).where(and(sql`lower(${s.users.name}) = lower(${String(a.to_name)})`, eq(s.users.isActive, true), inArray(s.users.kind, ["staff", "fte"]))).limit(1);
      if (!to) throw new ToolError("No active member of staff by that name");
      const r = await reassignLead(String(a.lead_id), to.id, actorOf(ctx), String(a.reason));
      if (r.moved && to.kind === "staff") await notify([to.id], { type: "lead", title: "A lead is now yours", body: `${r.customerName}: ${String(a.reason)}`, link: `/crm/leads/${String(a.lead_id)}` });
      return { moved: r.moved, to: to.name };
    },
  },
  {
    name: "first_contact_lead",
    description: "Write the first message to a new imported lead. It goes by e-mail if the lead has an address and the company has a mail server; otherwise it stays on the lead for a person. Never state a price.",
    input: { lead_id: idArg, subject: z.string().min(3).max(120), message: z.string().min(20).max(1500) },
    async run(a, ctx) {
      const [lead] = await db().select().from(s.leads).where(eq(s.leads.id, String(a.lead_id))).limit(1);
      if (!lead) throw new ToolError("No such lead");
      if (lead.status !== "new") return { already_in_hand: true };
      const sent = lead.email ? await sendMail({ to: lead.email, subject: String(a.subject), text: String(a.message) }).catch(() => false) : false;
      const how = sent ? "sent by e-mail" : lead.email ? "not sent: no mail server, kept here" : "no e-mail on the lead: a person can phone";
      await addLeadNote(lead.id, `First message (${how}): ${a.message}`, actorOf(ctx));
      await db().update(s.leads).set({ status: "in_progress", updatedAt: new Date() }).where(eq(s.leads.id, lead.id));
      return { done: true, sent_by_email: sent };
    },
  },
  {
    name: "get_contact_message",
    description: "A message from the website's contact form.",
    input: { message_id: idArg },
    async run(a) {
      const [m] = await db().select().from(s.contactMessages).where(eq(s.contactMessages.id, String(a.message_id))).limit(1);
      if (!m) throw new ToolError("No such message");
      return { name: m.name, email: m.email, phone: m.phone, subject: m.subject, message: m.message, already_handled: m.handled };
    },
  },
  {
    name: "reply_contact_message",
    description: "Answer a contact message. It goes by e-mail if the company has a mail server; otherwise it stays on the message for staff to send. Never quote a price: invite the sender to the chat for that.",
    input: { message_id: idArg, reply: z.string().min(5).max(2000) },
    async run(a, ctx) {
      const [m] = await db().select().from(s.contactMessages).where(eq(s.contactMessages.id, String(a.message_id))).limit(1);
      if (!m) throw new ToolError("No such message");
      if (m.handled) return { already_handled: true };
      const sent = await sendMail({ to: m.email, subject: `Re: ${m.subject ?? "your message"}`, text: String(a.reply) }).catch(() => false);
      await db().update(s.contactMessages).set({ reply: String(a.reply), handled: true }).where(eq(s.contactMessages.id, m.id));
      await audit(db(), { actorUserId: ctx.principalUserId, actorKind: "fte", action: "contact.replied", entity: "contact", entityId: m.id, fteRunId: ctx.runId, summary: `${ctx.principalName} answered ${m.name}'s message${sent ? " by e-mail" : " (no mail server, kept on the message)"}` });
      return { answered: true, sent_by_email: sent };
    },
  },
];

// ---------- Hana: the website desk ----------
const WEBSITE_TOOLS: ToolDef[] = [
  {
    name: "review_web_order",
    description: "A website order: its cars and whether each is still free, the buyer, and the port if the company knows it.",
    input: { order_id: idArg },
    async run(a) {
      const [o] = await db().select({ o: s.webOrders, buyer: s.users }).from(s.webOrders).innerJoin(s.users, eq(s.users.id, s.webOrders.userId)).where(eq(s.webOrders.id, String(a.order_id))).limit(1);
      if (!o) throw new ToolError("No such order");
      const items = await db().select({ vehicleId: s.webOrderItems.vehicleId, title: s.webOrderItems.title, priceUsd: s.webOrderItems.priceUsd, status: s.vehicles.status }).from(s.webOrderItems).leftJoin(s.vehicles, eq(s.vehicles.id, s.webOrderItems.vehicleId)).where(eq(s.webOrderItems.orderId, o.o.id));
      const [lead] = await db().select().from(s.leads).where(eq(s.leads.customerUserId, o.buyer.id)).orderBy(desc(s.leads.updatedAt)).limit(1);
      return { order_no: o.o.orderNo, status: o.o.status, paid_online: !!o.o.paidAt, paid_online_usd: o.o.paidUsd, pay_percent: o.o.payPercent, buyer_asked: { country: o.o.countryCode, city: o.o.city, port: o.o.port }, notes: o.o.notes, invoice_already_made: o.o.invoiceId, buyer: { user_id: o.buyer.id, name: o.buyer.name, company: o.buyer.company, phone: o.buyer.phone, email: o.buyer.email, country: o.buyer.countryCode }, known_port_id: lead?.portId ?? null, known_country: lead?.countryCode ?? o.buyer.countryCode ?? null, items, buyer_note: o.o.notes };
    },
  },
  {
    name: "update_web_order",
    description: "Set a website order's status. The buyer sees it in their chat.",
    input: { order_id: idArg, status: z.enum(["approved", "cancelled"]) },
    async run(a, ctx) {
      const o = await setWebOrderStatus(String(a.order_id), String(a.status), actorOf(ctx));
      if (!o) throw new ToolError("No such order");
      return { updated: true };
    },
  },
  {
    name: "order_to_invoice",
    description: "Turn a website order into an invoice request at the price engine's price to the buyer's port. The invoice desk then checks it. If the port is unknown, have the sales FTE ask the buyer first.",
    input: { order_id: idArg, port_id: z.string().min(2).max(80) },
    async run(a, ctx) {
      const orderId = String(a.order_id);
      const [o] = await db().select({ o: s.webOrders, buyer: s.users }).from(s.webOrders).innerJoin(s.users, eq(s.users.id, s.webOrders.userId)).where(eq(s.webOrders.id, orderId)).limit(1);
      if (!o) throw new ToolError("No such order");
      if (o.o.invoiceId) throw new ToolError("This order already has its invoice.");
      const [port] = await db().select().from(s.ports).where(eq(s.ports.id, String(a.port_id))).limit(1);
      if (!port) throw new ToolError("Unknown port. Use list_ports.");
      const items = await db().select({ vehicleId: s.webOrderItems.vehicleId, status: s.vehicles.status, v: s.vehicles }).from(s.webOrderItems).leftJoin(s.vehicles, eq(s.vehicles.id, s.webOrderItems.vehicleId)).where(eq(s.webOrderItems.orderId, orderId));
      const free = items.filter((i) => i.vehicleId && i.status === "available" && i.v);
      if (!free.length) throw new ToolError("None of the order's cars is available any more. Cancel the order and tell the buyer through sales.");
      if (!o.buyer.phone) throw new ToolError("The buyer has no phone on file, and an invoice needs one. Ask through tell_buyer_through_sales for their phone, country and port.");
      const { lead } = await findOrCreateLead({ customerName: o.buyer.company || o.buyer.name, contactPerson: o.buyer.name, phone: o.buyer.phone, email: o.buyer.email, countryCode: port.countryCode, portId: port.id, ownerUserId: (await workerUser("sales"))?.id ?? ctx.principalUserId, customerUserId: o.buyer.id, source: "website" }, actorOf(ctx));
      const vehicles = [];
      for (const i of free) {
        const p = await policyPrice(i.vehicleId!, port.id, port.countryCode);
        if (!p) throw new ToolError(`No price could be worked out for ${i.v!.stockNo}. Pass this up with escalate_to_chief.`);
        vehicles.push({ vehicleId: i.vehicleId, unitLabel: i.v!.title.replace(/^\d{4}\s+/, ""), year: i.v!.year, color: i.v!.color, chassisNo: i.v!.chassisNo, engine: i.v!.engineCc ? `${i.v!.engineCc} cc` : null, transmission: i.v!.transmission, fuel: i.v!.fuel, pushUsd: p.pushUsd, cnfUsd: p.cnfUsd });
      }
      const inv = await requestInvoice({ leadId: lead.id!, consigneeName: o.buyer.company || o.buyer.name, consigneePhone: lead.phone!, consigneeEmail: o.buyer.email, consigneeAddress: null, consigneeCountryCode: port.countryCode, consigneePortId: port.id, m3Rate: Number(port.freightUsdPerM3), vehicles }, actorOf(ctx));
      await db().update(s.webOrders).set({ invoiceId: inv.id }).where(eq(s.webOrders.id, orderId));
      if (!o.o.paidAt) await setWebOrderStatus(orderId, "approved", actorOf(ctx));
      return { invoice_id: inv.id, number: inv.number, cars: free.length, skipped_not_free: items.length - free.length };
    },
  },
  {
    name: "write_listing",
    description: "Write a car's listing text from its own record. It cannot change the price, the stock number or any fact about the car.",
    input: { vehicle_id: idArg, short_desc: z.string().min(10).max(160), description: z.string().min(40).max(1500), seo_title: z.string().min(5).max(80), seo_description: z.string().min(10).max(170) },
    async run(a, ctx) {
      const id = String(a.vehicle_id);
      const [v] = await db().select({ id: s.vehicles.id, stockNo: s.vehicles.stockNo }).from(s.vehicles).where(eq(s.vehicles.id, id)).limit(1);
      if (!v) throw new ToolError("No such car");
      await db().update(s.vehicles).set({ shortDesc: String(a.short_desc), description: String(a.description), seoTitle: String(a.seo_title), seoDescription: String(a.seo_description), updatedAt: new Date() }).where(eq(s.vehicles.id, id));
      await audit(db(), { actorUserId: ctx.principalUserId, actorKind: "fte", action: "vehicle.listing", entity: "vehicle", entityId: id, fteRunId: ctx.runId, summary: `${ctx.principalName} wrote the listing for ${v.stockNo}` });
      return { written: true };
    },
  },
];

// ---------- shared by the desks ----------
const SHARED_TOOLS: ToolDef[] = [
  {
    name: "escalate_to_chief",
    description: "Pass something above your limit, or something you cannot settle, to the chief of staff. Say why, and what you would do.",
    input: {
      kind: z.enum(["invoice", "payment", "other"]),
      entity_id: z.string().max(60).optional().describe("The invoice id for an invoice or a payment"),
      reason: z.string().min(5).max(500),
      amount_usd: z.number().optional(),
      received_date: z.string().optional(),
      reference: z.string().max(60).optional(),
      file_id: z.string().max(60).optional(),
    },
    async run(a, ctx) {
      const entityId = (a.entity_id as string) ?? null;
      const full = entityId && a.kind !== "other" ? await getInvoiceFull(entityId) : null;
      return queueForChief(ctx, a.kind as "invoice" | "payment" | "other", String(a.reason), { entityId, number: full?.invoice.number ?? null, amountUsd: a.amount_usd ?? (a.kind === "invoice" ? full?.totals.total : null), receivedDate: a.received_date ?? null, reference: a.reference ?? null, fileId: a.file_id ?? null }, full?.invoice.leadId);
    },
  },
  {
    name: "tell_buyer_through_sales",
    description: "Have the sales FTE, who holds the conversation, tell the buyer something. Say exactly what they must hear, in plain words: invoice numbers yes, internal ids never. Back-office FTEs never write to a buyer directly.",
    input: { buyer_user_id: idArg, note: z.string().min(5).max(500) },
    async run(a, ctx) {
      const conv = await buyerConversation(String(a.buyer_user_id));
      if (!conv) return { told: false, message: "This buyer has no chat." };
      if (eventsMuted()) return { told: true }; // an eval run: the test buyer needs no message
      const { triggerSora } = await import("./agent");
      triggerSora(conv, { kind: "event", note: `${ctx.principalName} (${ctx.workerKey} desk) asks you to tell the buyer, in one short polite message, with no internal ids: ${a.note}` });
      return { told: true };
    },
  },
];

// ---------- Tomo: the chief of staff ----------
const CHIEF_TOOLS: ToolDef[] = [
  {
    name: "list_pending_approvals",
    description: "Everything waiting for a decision, and whether it is already with the owner.",
    input: {},
    async run() {
      const rows = (await db().select().from(s.approvals).where(eq(s.approvals.status, "pending")).orderBy(s.approvals.createdAt).limit(30)).filter((r) => !r.kind.startsWith("task:"));
      return { waiting: rows.map((r) => ({ id: r.id, kind: r.kind, reason: r.reason, with_owner: !!(r.payload as { owner?: boolean }).owner, payload: r.payload, waiting_since: r.createdAt })) };
    },
  },
  {
    name: "get_approval",
    description: "One waiting item with what you need to judge it: the invoice's rubric or the buyer's record, your mandate, and the owner's past overrules.",
    input: { approval_id: idArg },
    async run(a) {
      const [ap] = await db().select().from(s.approvals).where(eq(s.approvals.id, String(a.approval_id))).limit(1);
      if (!ap) throw new ToolError("No such item");
      const env0 = await envelope();
      const p = ap.payload as Record<string, unknown>;
      const rubric = ap.kind === "invoice" && p.entityId ? await invoiceRubric(String(p.entityId)) : null;
      const overrules = await db().select({ decision: s.fteDecisions.decision, reason: s.fteDecisions.reason, note: s.fteDecisions.overruleNote }).from(s.fteDecisions).where(isNotNull(s.fteDecisions.overruledAt)).orderBy(desc(s.fteDecisions.overruledAt)).limit(10);
      return {
        id: ap.id,
        kind: ap.kind,
        status: ap.status,
        reason: ap.reason,
        payload: ap.payload,
        rubric,
        your_mandate: { invoice_or_payment_up_to_usd: env0.chiefApproveUsd, discount_up_to_pct: env0.chiefMaxDiscountPct, bid_up_to_jpy: env0.chiefMaxBidJpy, only_the_owner: env0.escalateTopics },
        owners_overrules_of_your_past_decisions: overrules,
      };
    },
  },
  {
    name: "decide_approval",
    description: "Decide an item inside your mandate and sign it. Refused when it is above your mandate or of a kind only the owner decides: then call escalate_to_owner.",
    input: { approval_id: idArg, decision: z.enum(["approved", "rejected"]), reason: z.string().min(5).max(500) },
    async run(a, ctx) {
      const [ap] = await db().select().from(s.approvals).where(eq(s.approvals.id, String(a.approval_id))).limit(1);
      if (!ap) throw new ToolError("No such item");
      if (ap.status !== "pending") throw new ToolError(`Already ${ap.status}`);
      const p = ap.payload as Record<string, unknown>;
      const env0 = await envelope();
      const decision = String(a.decision);
      const refuse = (why: string) => new ToolError(`${why} Call escalate_to_owner with your opinion.`);
      if (ap.kind === "other" || ap.kind.startsWith("task:")) throw refuse("This kind of item is the owner's.");
      if (decision === "approved") {
        if (ap.kind === "discount" && Number(p.discountPct) > env0.chiefMaxDiscountPct) throw refuse(`${p.discountPct}% is above your mandate of ${env0.chiefMaxDiscountPct}%.`);
        if (ap.kind === "bid" && Number(p.amountJpy) > env0.chiefMaxBidJpy) throw refuse(`¥${p.amountJpy} is above your mandate of ¥${env0.chiefMaxBidJpy}.`);
        if ((ap.kind === "invoice" || ap.kind === "payment") && Number(p.amountUsd) > env0.chiefApproveUsd) throw refuse(`$${p.amountUsd} is above your mandate of $${env0.chiefApproveUsd}.`);
        if (ap.kind === "invoice") {
          const r = await invoiceRubric(String(p.entityId));
          if (!r?.allPass) throw new ToolError(`Cannot approve. Failing: ${r?.failing.join(" | ") ?? "no invoice"}. Reject it, or call escalate_to_owner.`);
        }
        if (ap.kind === "payment") {
          if (!p.reference || !p.fileId || !p.entityId) throw refuse("A payment with no slip or no reference cannot be recorded by you.");
          await readSlip(String(p.fileId));
          const { problems } = await slipProblems(String(p.fileId), String(p.entityId), Number(p.amountUsd), String(p.reference));
          if (problems.length) throw refuse(`This slip does not pass: ${problems.join(" ")} You cannot approve it.`);
        }
      }
      await carryOut(ap, decision === "approved", actorOf(ctx), "chief", String(a.reason));
      await db().transaction(async (tx) => {
        await tx.update(s.approvals).set({ status: decision, decidedBy: ctx.principalUserId, decidedAt: new Date(), decisionNote: String(a.reason) }).where(eq(s.approvals.id, ap.id));
        await audit(tx, { actorUserId: ctx.principalUserId, actorKind: "fte", action: `approval.${decision}`, entity: "approval", entityId: ap.id, fteRunId: ctx.runId, summary: `${ctx.principalName} ${decision} (${ap.kind}): ${a.reason}` });
        await emit("approval.decided", { approvalId: ap.id }, { tx });
        if (ap.kind === "discount" || ap.kind === "bid") await recordDecision({ workerKey: "chief", task: "chief.approvals", entity: ap.kind, entityId: ap.id, decision, reason: String(a.reason) }, tx);
      });
      return { decided: decision };
    },
  },
  {
    name: "escalate_to_owner",
    description: "Send an item to the owner with your opinion. Only for what is above your mandate or is the owner's by rule. If the owner does not answer in time, the safe default applies.",
    input: { approval_id: idArg, opinion: z.string().min(5).max(500).describe("What you would do, and why") },
    async run(a, ctx) {
      const [ap] = await db().select().from(s.approvals).where(eq(s.approvals.id, String(a.approval_id))).limit(1);
      if (!ap) throw new ToolError("No such item");
      if (ap.status !== "pending") throw new ToolError(`Already ${ap.status}`);
      const payload = { ...(ap.payload as object), owner: true, opinion: String(a.opinion), ownerSince: (await now()).toISOString() };
      await db().update(s.approvals).set({ payload }).where(eq(s.approvals.id, ap.id));
      await audit(db(), { actorUserId: ctx.principalUserId, actorKind: "fte", action: "approval.to_owner", entity: "approval", entityId: ap.id, fteRunId: ctx.runId, summary: `${ctx.principalName} sent this to the owner: ${ap.reason}` });
      await notify(await usersWithPerm("fte.approvals.decide"), { type: "approval", title: `Needs you: ${ap.reason}`.slice(0, 120), body: `${ctx.principalName}'s opinion: ${a.opinion}`.slice(0, 200), link: "/fte" });
      return { with_owner: true };
    },
  },
];

export const WORKER_TOOLS: ToolDef[] = [...INVOICE_TOOLS, ...ACCOUNTS_TOOLS, ...OPS_TOOLS, ...AUCTION_TOOLS, ...LOT_FACT_TOOLS, ...CRM_TOOLS, ...WEBSITE_TOOLS, ...SHARED_TOOLS, ...CHIEF_TOOLS];
