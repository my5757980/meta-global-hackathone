import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db, type DBorTx } from "../db/client";
import * as s from "../db/schema";
import { hashPassword, randomPassword } from "../auth/passwords";
import { bad, conflict, notFound } from "../lib/http";
import { audit } from "./audit";
import { emit } from "./events";
import { deskManual } from "../fte/workforce";
import { notify, usersWithPerm } from "./notify";
import { siteSettings } from "./settings";

export interface Actor {
  userId: string;
  kind: "human" | "fte";
  name: string;
  conversationId?: string | null;
  fteRunId?: string | null;
}

const digits = (p: string) => p.replace(/\D+/g, "");

export async function findLeadByContact(phone?: string | null, email?: string | null) {
  const conds = [];
  if (email) conds.push(sql`lower(${s.leads.email}) = lower(${email})`);
  if (phone && digits(phone).length >= 7) conds.push(sql`regexp_replace(${s.leads.phone}, '\\D', '', 'g') like ${"%" + digits(phone).slice(-9)}`);
  if (!conds.length) return null;
  const [l] = await db().select().from(s.leads).where(or(...conds)).orderBy(desc(s.leads.createdAt)).limit(1);
  return l ?? null;
}

export interface LeadInput {
  customerName: string;
  contactPerson?: string;
  phone: string;
  email?: string | null;
  countryCode: string;
  portId?: string | null;
  address?: string | null;
  ownerUserId: string;
  customerUserId?: string | null;
  source?: string;
}

/** Match an existing lead by e-mail or phone (never duplicate a buyer), else create one. */
export async function findOrCreateLead(input: LeadInput, actor: Actor) {
  const existing = await findLeadByContact(input.phone, input.email);
  // Whoever is chatting may have typed someone else's number. A record with invoices (amounts, chassis, balance)
  // is therefore never joined to them automatically; staff link it from Customers.
  const [invoiced] = existing && !existing.customerUserId && input.customerUserId ? await db().select({ id: s.invoices.id }).from(s.invoices).where(eq(s.invoices.leadId, existing.id)).limit(1) : [];
  return db().transaction(async (tx) => {
    if (existing) {
      const patch: Partial<typeof s.leads.$inferInsert> = { updatedAt: new Date() };
      if (!existing.email && input.email) patch.email = input.email;
      if (!existing.portId && input.portId) patch.portId = input.portId;
      if (!existing.customerUserId && input.customerUserId && !invoiced) patch.customerUserId = input.customerUserId;
      if (existing.status === "new") patch.status = "in_progress";
      await tx.update(s.leads).set(patch).where(eq(s.leads.id, existing.id));
      await audit(tx, { actorUserId: actor.userId, actorKind: actor.kind, action: "lead.matched", entity: "lead", entityId: existing.id, summary: `Matched existing lead ${existing.customerName}`, conversationId: actor.conversationId, fteRunId: actor.fteRunId });
      return { lead: { ...existing, ...patch }, created: false };
    }
    const [lead] = await tx
      .insert(s.leads)
      .values({
        customerName: input.customerName,
        contactPerson: input.contactPerson || input.customerName,
        phone: input.phone,
        email: input.email ?? null,
        countryCode: input.countryCode,
        portId: input.portId ?? null,
        address: input.address ?? null,
        status: "in_progress",
        ownerUserId: input.ownerUserId,
        customerUserId: input.customerUserId ?? null,
        source: input.source ?? (actor.kind === "fte" ? "web_chat" : "manual"),
        createdBy: actor.userId,
      })
      .returning();
    await audit(tx, { actorUserId: actor.userId, actorKind: actor.kind, action: "lead.created", entity: "lead", entityId: lead!.id, summary: `Created lead ${lead!.customerName} (${input.countryCode})`, conversationId: actor.conversationId, fteRunId: actor.fteRunId });
    return { lead: lead!, created: true };
  });
}

/**
 * FR-022: a CRM customer with an invoice gets a website account on its own. The password is random and nobody
 * knows it: staff issue a one-time password on demand (Customers, or the lead's page). An account that already
 * uses this e-mail is left alone: it signed itself up, and only staff may link it to these invoices.
 */
export async function ensureWebsiteAccount(leadId: string) {
  const [lead] = await db().select().from(s.leads).where(eq(s.leads.id, leadId)).limit(1);
  const email = lead?.email?.trim().toLowerCase();
  if (!lead || lead.customerUserId || !email) return null;
  const [taken] = await db().select({ id: s.users.id }).from(s.users).where(sql`lower(${s.users.email}) = ${email}`).limit(1);
  if (taken) return null;
  const [role] = await db().select({ id: s.roles.id }).from(s.roles).where(eq(s.roles.slug, "customer")).limit(1);
  const passwordHash = await hashPassword(randomPassword());
  return db().transaction(async (tx) => {
    const [user] = await tx.insert(s.users).values({ kind: "customer", name: lead.contactPerson || lead.customerName, email, phone: lead.phone, company: lead.customerName, countryCode: lead.countryCode, roleId: role!.id, passwordHash, mustChangePassword: true }).returning({ id: s.users.id });
    await tx.update(s.leads).set({ customerUserId: user!.id, updatedAt: new Date() }).where(and(eq(s.leads.id, lead.id), isNull(s.leads.customerUserId)));
    await audit(tx, { actorKind: "system", action: "customer.account_created", entity: "lead", entityId: lead.id, summary: `Website account created for ${lead.customerName} when their invoice was approved` });
    return user!.id;
  });
}

export async function addLeadNote(leadId: string, body: string, actor: Actor, tx: DBorTx = db()) {
  const [lead] = await tx.select({ id: s.leads.id }).from(s.leads).where(eq(s.leads.id, leadId)).limit(1);
  if (!lead) throw notFound("Lead not found");
  const [note] = await tx.insert(s.leadNotes).values({ leadId, authorUserId: actor.userId, body: body.slice(0, 4000) }).returning();
  await audit(tx, { actorUserId: actor.userId, actorKind: actor.kind, action: "lead.note", entity: "lead", entityId: leadId, summary: `Note: ${body.slice(0, 120)}`, conversationId: actor.conversationId, fteRunId: actor.fteRunId });
  return note!;
}

export interface InvoiceVehicleInput {
  vehicleId?: string | null;
  auctionLotId?: string | null;
  unitLabel: string;
  year?: number | null;
  color?: string | null;
  chassisNo?: string | null;
  engine?: string | null;
  transmission?: string | null;
  fuel?: string | null;
  pushUsd: number;
  cnfUsd: number;
}

export interface InvoiceRequestInput {
  leadId: string;
  consigneeName: string;
  consigneePhone: string;
  consigneeEmail?: string | null;
  consigneeAddress?: string | null;
  consigneeCountryCode: string;
  consigneePortId?: string | null;
  vehicles: InvoiceVehicleInput[];
  m3Rate?: number | null;
  exchangeRate?: number | null;
  discountUsd?: number;
  advancePercent?: number;
  quoteId?: string | null;
}

async function nextInvoiceNumber(tx: DBorTx, prefix: string): Promise<string> {
  // from the highest number used, not the count: a deleted invoice must not make the next one take a number still in use
  const r = await tx.execute(sql`select coalesce(max((substring(number from '[0-9]+$'))::int), 2600) as n from invoices`);
  const n = Number((r as unknown as { rows: { n: number }[] }).rows[0]?.n ?? 2600) + 1;
  return `${prefix}${String(n).padStart(5, "0")}`;
}

/** Agent (human or Sora) asks for an invoice. It waits for the Supervisor; one pending request per lead. */
export async function requestInvoice(input: InvoiceRequestInput, actor: Actor) {
  if (!input.vehicles.length) throw bad("At least one vehicle is required");
  if (input.vehicles.length > 50) throw bad("At most 50 vehicles on one invoice");
  // read everything the transaction needs first: PGlite has one connection, so a db() call inside tx would wait forever
  const site = await siteSettings();
  const supervisors = (await deskManual("invoices", "invoice.review")) ? await usersWithPerm("crm.invoices.approve") : [];
  return db().transaction(async (tx) => {
    const [lead] = await tx.select().from(s.leads).where(eq(s.leads.id, input.leadId)).limit(1);
    if (!lead) throw notFound("Lead not found");
    const [pending] = await tx.select({ id: s.invoices.id, number: s.invoices.number }).from(s.invoices).where(and(eq(s.invoices.leadId, lead.id), eq(s.invoices.status, "pending"))).limit(1);
    if (pending) throw conflict(`Invoice ${pending.number} for this customer is already waiting for approval`);
    const totalPush = Math.round(input.vehicles.reduce((a, v) => a + (v.pushUsd || 0), 0) * 100) / 100;
    const totalCnf = Math.round(input.vehicles.reduce((a, v) => a + (v.cnfUsd || 0), 0) * 100) / 100;
    const number = await nextInvoiceNumber(tx, site.invoicePrefix);
    const [inv] = await tx
      .insert(s.invoices)
      .values({
        number,
        leadId: lead.id,
        requestedBy: actor.userId,
        status: "pending",
        consigneeName: input.consigneeName,
        consigneePhone: input.consigneePhone,
        consigneeEmail: input.consigneeEmail ?? null,
        consigneeAddress: input.consigneeAddress ?? null,
        consigneeCountryCode: input.consigneeCountryCode,
        consigneePortId: input.consigneePortId ?? null,
        salesperson: actor.name,
        m3Rate: input.m3Rate ?? null,
        exchangeRate: input.exchangeRate ?? null,
        totalPushUsd: totalPush,
        totalCnfUsd: totalCnf,
        discountUsd: input.discountUsd ?? 0,
        advancePercent: input.advancePercent ?? 50,
        quoteId: input.quoteId ?? null,
      })
      .returning();
    await tx.insert(s.invoiceVehicles).values(input.vehicles.map((v, i) => ({ ...v, invoiceId: inv!.id, position: i })));
    await tx.update(s.leads).set({ status: "invoice_requested", updatedAt: new Date() }).where(eq(s.leads.id, lead.id));
    const vehIds = input.vehicles.map((v) => v.vehicleId).filter(Boolean) as string[];
    if (vehIds.length) await tx.update(s.vehicles).set({ status: "reserved" }).where(and(inArray(s.vehicles.id, vehIds), eq(s.vehicles.status, "available")));
    await audit(tx, {
      actorUserId: actor.userId,
      actorKind: actor.kind,
      action: "invoice.requested",
      entity: "invoice",
      entityId: inv!.id,
      summary: `Requested invoice ${number} for ${lead.customerName}: ${input.vehicles.length} vehicle(s), C&F $${totalCnf.toLocaleString("en-US")}`,
      data: { vehicles: input.vehicles.length, totalCnf },
      conversationId: actor.conversationId,
      fteRunId: actor.fteRunId,
    });
    await emit("invoice.requested", { invoiceId: inv!.id }, { tx });
    await notify(supervisors, { type: "invoice_requested", title: `Invoice ${number} needs approval`, body: `${actor.name} requested it for ${lead.customerName} — C&F $${totalCnf.toLocaleString("en-US")}${input.vehicles.length > 1 ? ` (${input.vehicles.length} vehicles)` : ""}`, link: `/crm/invoices/${inv!.id}`, data: { invoiceId: inv!.id } }, tx);
    return inv!;
  });
}

export async function getInvoiceFull(id: string) {
  const [inv] = await db().select().from(s.invoices).where(eq(s.invoices.id, id)).limit(1);
  if (!inv) return null;
  const [lead] = await db().select().from(s.leads).where(eq(s.leads.id, inv.leadId)).limit(1);
  const vehicles = await db().select().from(s.invoiceVehicles).where(eq(s.invoiceVehicles.invoiceId, id)).orderBy(s.invoiceVehicles.position);
  const payments = await db().select().from(s.payments).where(eq(s.payments.invoiceId, id)).orderBy(s.payments.receivedDate);
  const [port] = inv.consigneePortId ? await db().select().from(s.ports).where(eq(s.ports.id, inv.consigneePortId)).limit(1) : [];
  const [country] = inv.consigneeCountryCode ? await db().select().from(s.countries).where(eq(s.countries.code, inv.consigneeCountryCode)).limit(1) : [];
  const people = await db().select({ id: s.users.id, name: s.users.name, kind: s.users.kind }).from(s.users).where(inArray(s.users.id, [inv.requestedBy, inv.approvedBy, lead?.ownerUserId].filter(Boolean) as string[]));
  const paid = Math.round(payments.reduce((a, p) => a + Number(p.amountUsd), 0) * 100) / 100;
  const total = Number(inv.totalCnfUsd);
  const advance = Math.round(((total * inv.advancePercent) / 100) * 100) / 100;
  return {
    invoice: inv,
    lead,
    vehicles,
    payments,
    port: port ?? null,
    country: country ?? null,
    requestedBy: people.find((p) => p.id === inv.requestedBy) ?? null,
    approvedBy: people.find((p) => p.id === inv.approvedBy) ?? null,
    owner: people.find((p) => p.id === lead?.ownerUserId) ?? null,
    totals: { total, advance, paid, balance: Math.round((total - paid) * 100) / 100 },
  };
}

export async function approveInvoice(id: string, actor: Actor, edits?: { vehicles?: { id: string; pushUsd: number; cnfUsd: number }[]; advancePercent?: number }) {
  return db().transaction(async (tx) => {
    const [inv] = await tx.select().from(s.invoices).where(eq(s.invoices.id, id)).limit(1);
    if (!inv) throw notFound("Invoice not found");
    if (inv.status !== "pending") throw conflict(`Invoice is already ${inv.status}`);
    let totalCnf = Number(inv.totalCnfUsd);
    let totalPush = Number(inv.totalPushUsd);
    if (edits?.vehicles?.length) {
      for (const v of edits.vehicles) await tx.update(s.invoiceVehicles).set({ pushUsd: v.pushUsd, cnfUsd: v.cnfUsd }).where(and(eq(s.invoiceVehicles.id, v.id), eq(s.invoiceVehicles.invoiceId, id)));
      const vs = await tx.select().from(s.invoiceVehicles).where(eq(s.invoiceVehicles.invoiceId, id));
      totalCnf = Math.round(vs.reduce((a, v) => a + Number(v.cnfUsd), 0) * 100) / 100;
      totalPush = Math.round(vs.reduce((a, v) => a + Number(v.pushUsd), 0) * 100) / 100;
    }
    if (totalCnf <= 0) throw conflict("This invoice has no price yet. Press Edit invoice and set the C&F price first");
    await tx
      .update(s.invoices)
      .set({ status: "approved", approvedBy: actor.userId, approvedAt: new Date(), totalCnfUsd: totalCnf, totalPushUsd: totalPush, advancePercent: edits?.advancePercent ?? inv.advancePercent, rejectionNote: null })
      .where(eq(s.invoices.id, id));
    await tx.update(s.leads).set({ status: "invoiced", isCustomer: true, updatedAt: new Date() }).where(eq(s.leads.id, inv.leadId));
    await audit(tx, { actorUserId: actor.userId, actorKind: actor.kind, action: "invoice.approved", entity: "invoice", entityId: id, summary: `Approved invoice ${inv.number} — C&F $${totalCnf.toLocaleString("en-US")}` });
    await emit("invoice.approved", { invoiceId: id }, { tx });
    if (inv.requestedBy) await notify([inv.requestedBy], { type: "invoice_approved", title: `Invoice ${inv.number} approved`, body: `Approved by ${actor.name}`, link: `/crm/invoices/${id}` }, tx);
    return { ok: true };
  });
}

export async function rejectInvoice(id: string, note: string, actor: Actor) {
  return db().transaction(async (tx) => {
    const [inv] = await tx.select().from(s.invoices).where(eq(s.invoices.id, id)).limit(1);
    if (!inv) throw notFound("Invoice not found");
    if (inv.status !== "pending") throw conflict(`Invoice is already ${inv.status}`);
    await tx.update(s.invoices).set({ status: "rejected", approvedBy: actor.userId, rejectionNote: note || null }).where(eq(s.invoices.id, id));
    await tx.update(s.leads).set({ status: "in_progress", updatedAt: new Date() }).where(eq(s.leads.id, inv.leadId));
    const vs = await tx.select({ vehicleId: s.invoiceVehicles.vehicleId }).from(s.invoiceVehicles).where(eq(s.invoiceVehicles.invoiceId, id));
    const vehIds = vs.map((v) => v.vehicleId).filter(Boolean) as string[];
    if (vehIds.length) await tx.update(s.vehicles).set({ status: "available" }).where(and(inArray(s.vehicles.id, vehIds), eq(s.vehicles.status, "reserved")));
    await audit(tx, { actorUserId: actor.userId, actorKind: actor.kind, action: "invoice.rejected", entity: "invoice", entityId: id, summary: `Rejected invoice ${inv.number}${note ? `: ${note}` : ""}` });
    await emit("invoice.rejected", { invoiceId: id }, { tx });
    if (inv.requestedBy) await notify([inv.requestedBy], { type: "invoice_rejected", title: `Invoice ${inv.number} rejected`, body: note || `Rejected by ${actor.name}`, link: `/crm/invoices/${id}` }, tx);
    return { ok: true };
  });
}

export async function markInvoiceSent(id: string, actor: Actor) {
  return db().transaction(async (tx) => {
    const [inv] = await tx.select().from(s.invoices).where(eq(s.invoices.id, id)).limit(1);
    if (!inv) throw notFound("Invoice not found");
    if (inv.status !== "approved") throw conflict("Only an approved invoice can be marked as sent");
    if (!inv.finalPdfFileId) throw conflict("Add the final invoice PDF first: upload it, or use the generated one");
    await tx.update(s.invoices).set({ status: "sent", sentAt: new Date() }).where(eq(s.invoices.id, id));
    await audit(tx, { actorUserId: actor.userId, actorKind: actor.kind, action: "invoice.sent", entity: "invoice", entityId: id, summary: `Marked invoice ${inv.number} as sent` });
    return { ok: true };
  });
}

/** A name, phone, e-mail or address put right, even after sending. Prices and cars are not touched here. */
export async function correctConsignee(id: string, f: { consigneeName?: string; consigneePhone?: string; consigneeEmail?: string; consigneeAddress?: string }, why: string, actor: Actor) {
  return db().transaction(async (tx) => {
    const [inv] = await tx.select().from(s.invoices).where(eq(s.invoices.id, id)).limit(1);
    if (!inv) throw notFound("Invoice not found");
    if (!["pending", "approved", "sent"].includes(inv.status)) throw conflict(`A ${inv.status} invoice can no longer be changed`);
    const set = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== ""));
    if (!Object.keys(set).length) throw bad("Nothing to change");
    await tx.update(s.invoices).set(set).where(eq(s.invoices.id, id));
    const changes = Object.entries(set).map(([k, v]) => `${k.replace("consignee", "").toLowerCase()} "${(inv as unknown as Record<string, unknown>)[k] ?? ""}" to "${v}"`).join(", ");
    await audit(tx, { actorUserId: actor.userId, actorKind: actor.kind, action: "invoice.corrected", entity: "invoice", entityId: id, fteRunId: actor.fteRunId, summary: `Corrected invoice ${inv.number}: ${changes} (${why})` });
    return inv;
  });
}

/** Manager's correction: an invoice with no money and no units on it can be removed; the stock and the lead go back. */
export async function deleteInvoice(id: string, actor: Actor) {
  return db().transaction(async (tx) => {
    const [inv] = await tx.select().from(s.invoices).where(eq(s.invoices.id, id)).limit(1);
    if (!inv) throw notFound("Invoice not found");
    const [pay] = await tx.select({ id: s.payments.id }).from(s.payments).where(eq(s.payments.invoiceId, id)).limit(1);
    if (pay) throw conflict("This invoice has payments recorded, so it cannot be deleted");
    const [unit] = await tx.select({ id: s.units.id }).from(s.units).where(eq(s.units.invoiceId, id)).limit(1);
    if (unit) throw conflict("This invoice has units recorded, so it cannot be deleted");
    const vs = await tx.select({ vehicleId: s.invoiceVehicles.vehicleId }).from(s.invoiceVehicles).where(eq(s.invoiceVehicles.invoiceId, id));
    const vehIds = vs.map((v) => v.vehicleId).filter(Boolean) as string[];
    if (vehIds.length) await tx.update(s.vehicles).set({ status: "available" }).where(and(inArray(s.vehicles.id, vehIds), eq(s.vehicles.status, "reserved")));
    await tx.delete(s.notifications).where(eq(s.notifications.link, `/crm/invoices/${id}`));
    await tx.delete(s.invoices).where(eq(s.invoices.id, id));
    const [other] = await tx.select({ id: s.invoices.id }).from(s.invoices).where(and(eq(s.invoices.leadId, inv.leadId), inArray(s.invoices.status, ["pending", "approved", "sent"]))).limit(1);
    if (!other) await tx.update(s.leads).set({ status: "in_progress", updatedAt: new Date() }).where(eq(s.leads.id, inv.leadId));
    await audit(tx, { actorUserId: actor.userId, actorKind: actor.kind, action: "invoice.deleted", entity: "lead", entityId: inv.leadId, summary: `Deleted invoice ${inv.number} (${inv.status}, C&F $${Number(inv.totalCnfUsd).toLocaleString("en-US")})` });
    return { ok: true, leadId: inv.leadId };
  });
}

/** The copy the buyer receives. It goes on an approved invoice, and Mark as sent waits for it. */
/** One lead moves to another agent; what that agent's predecessor raised on it follows. */
export async function reassignLead(leadId: string, toUserId: string, actor: Actor, reason?: string | null) {
  const [lead] = await db().select().from(s.leads).where(eq(s.leads.id, leadId)).limit(1);
  if (!lead) throw notFound("Lead not found");
  const [to] = await db().select({ id: s.users.id, name: s.users.name, kind: s.users.kind, isActive: s.users.isActive }).from(s.users).where(eq(s.users.id, toUserId)).limit(1);
  if (!to || !to.isActive || (to.kind !== "staff" && to.kind !== "fte")) throw bad("The new owner must be an active member of staff");
  if (lead.ownerUserId === to.id) return { moved: false, to: to.name };
  const from = lead.ownerUserId;
  await db().transaction(async (tx) => {
    await tx.update(s.leads).set({ ownerUserId: to.id, updatedAt: new Date() }).where(eq(s.leads.id, lead.id));
    if (from) {
      await tx.update(s.invoices).set({ requestedBy: to.id }).where(and(eq(s.invoices.leadId, lead.id), eq(s.invoices.requestedBy, from)));
      await tx.update(s.units).set({ createdBy: to.id }).where(and(eq(s.units.createdBy, from), sql`${s.units.invoiceId} in (select id from invoices where lead_id = ${lead.id})`));
    }
    await audit(tx, { actorUserId: actor.userId, actorKind: actor.kind, action: "lead.reassigned", entity: "lead", entityId: lead.id, summary: `${actor.name} reassigned ${lead.customerName} to ${to.name}${reason ? `: ${reason}` : ""}` });
  });
  return { moved: true, to: to.name, toKind: to.kind, toId: to.id, customerName: lead.customerName };
}

/** The final PDF comes off again before the invoice goes out; once sent, the buyer already holds it. */
export async function removeFinalPdf(id: string, actor: Actor) {
  return db().transaction(async (tx) => {
    const [inv] = await tx.select().from(s.invoices).where(eq(s.invoices.id, id)).limit(1);
    if (!inv) throw notFound("Invoice not found");
    if (inv.status !== "approved") throw conflict("The final PDF can only be removed before the invoice is sent");
    if (!inv.finalPdfFileId) throw conflict("This invoice has no final PDF");
    await tx.update(s.invoices).set({ finalPdfFileId: null }).where(eq(s.invoices.id, id));
    await audit(tx, { actorUserId: actor.userId, actorKind: actor.kind, action: "invoice.final_pdf_removed", entity: "invoice", entityId: id, summary: `${actor.name} removed the final PDF of invoice ${inv.number}` });
    return { ok: true };
  });
}

export async function attachFinalPdf(id: string, fileId: string, how: "Uploaded" | "Generated", actor: Actor) {
  return db().transaction(async (tx) => {
    const [inv] = await tx.select().from(s.invoices).where(eq(s.invoices.id, id)).limit(1);
    if (!inv) throw notFound("Invoice not found");
    if (inv.status !== "approved") throw conflict("The final PDF goes on an approved invoice, before it is sent");
    await tx.update(s.invoices).set({ finalPdfFileId: fileId }).where(eq(s.invoices.id, id));
    await audit(tx, { actorUserId: actor.userId, actorKind: actor.kind, action: "invoice.final_pdf", entity: "invoice", entityId: id, summary: `${how} the final PDF for invoice ${inv.number}` });
    return { ok: true, fileId };
  });
}

export interface InvoiceEditInput {
  consigneeName: string;
  consigneePhone: string;
  consigneeEmail?: string | null;
  consigneeAddress?: string | null;
  consigneeCountryCode: string;
  consigneePortId?: string | null;
  m3Rate?: number | null;
  exchangeRate?: number | null;
  advancePercent?: number;
  vehicles: { id?: string | null; vehicleId?: string | null; unitLabel: string; year?: number | null; color?: string | null; chassisNo?: string | null; engine?: string | null; transmission?: string | null; fuel?: string | null; pushUsd: number; cnfUsd: number }[];
}

/** The Supervisor changes an invoice before it goes out: consignee, terms, prices and the whole vehicle list. */
export async function editInvoice(id: string, input: InvoiceEditInput, actor: Actor) {
  if (!input.vehicles.length) throw bad("At least one vehicle is required");
  if (input.vehicles.length > 50) throw bad("At most 50 vehicles on one invoice");
  return db().transaction(async (tx) => {
    const [inv] = await tx.select().from(s.invoices).where(eq(s.invoices.id, id)).limit(1);
    if (!inv) throw notFound("Invoice not found");
    if (inv.status !== "pending" && inv.status !== "approved") throw conflict(inv.status === "sent" ? "This invoice has gone to the buyer and can no longer be changed" : `A ${inv.status} invoice can no longer be changed`);
    const [country] = await tx.select({ code: s.countries.code }).from(s.countries).where(eq(s.countries.code, input.consigneeCountryCode)).limit(1);
    if (!country) throw bad("Choose a country from the list");
    if (input.consigneePortId) {
      const [port] = await tx.select({ id: s.ports.id }).from(s.ports).where(and(eq(s.ports.id, input.consigneePortId), eq(s.ports.countryCode, country.code))).limit(1);
      if (!port) throw bad("That port is not in the chosen country");
    }
    const old = await tx.select().from(s.invoiceVehicles).where(eq(s.invoiceVehicles.invoiceId, id));
    const oldIds = new Set(old.map((o) => o.id));
    for (const v of input.vehicles) if (v.id && !oldIds.has(v.id)) throw bad("A vehicle on this form is no longer on the invoice. Reload the page and try again");
    const newStock = [...new Set(input.vehicles.map((v) => v.vehicleId).filter(Boolean) as string[])];
    if (newStock.length) {
      const found = await tx.select({ id: s.vehicles.id }).from(s.vehicles).where(inArray(s.vehicles.id, newStock));
      if (found.length !== newStock.length) throw bad("A vehicle on this form is no longer in stock. Pick it again");
    }
    const keptIds = new Set(input.vehicles.map((v) => v.id).filter(Boolean));
    const removed = old.filter((o) => !keptIds.has(o.id));
    if (removed.length) {
      const ids = removed.map((r) => r.id);
      const withUnit = await tx.select({ id: s.units.invoiceVehicleId }).from(s.units).where(inArray(s.units.invoiceVehicleId, ids));
      const withProgress = await tx.select({ id: s.vehicleProgress.invoiceVehicleId }).from(s.vehicleProgress).where(inArray(s.vehicleProgress.invoiceVehicleId, ids));
      const busy = new Set([...withUnit, ...withProgress].map((x) => x.id));
      const stuck = removed.find((r) => busy.has(r.id));
      if (stuck) throw conflict(`${stuck.unitLabel} already has a unit or shipping progress, so it cannot be removed`);
    }
    const totalCnf = Math.round(input.vehicles.reduce((a, v) => a + (v.cnfUsd || 0), 0) * 100) / 100;
    const totalPush = Math.round(input.vehicles.reduce((a, v) => a + (v.pushUsd || 0), 0) * 100) / 100;
    const [{ paid }] = (await tx.select({ paid: sql<number>`coalesce(sum(${s.payments.amountUsd}),0)::float` }).from(s.payments).where(eq(s.payments.invoiceId, id))) as [{ paid: number }];
    if (totalCnf < paid) throw conflict(`$${paid.toLocaleString("en-US")} has already been received on this invoice. The total cannot go below that`);
    if (inv.status === "approved" && totalCnf <= 0) throw bad("An approved invoice must keep a price");
    if (removed.length) await tx.delete(s.invoiceVehicles).where(inArray(s.invoiceVehicles.id, removed.map((r) => r.id)));
    for (const [i, v] of input.vehicles.entries()) {
      const row = { position: i, vehicleId: v.vehicleId ?? null, unitLabel: v.unitLabel, year: v.year ?? null, color: v.color ?? null, chassisNo: v.chassisNo ?? null, engine: v.engine ?? null, transmission: v.transmission ?? null, fuel: v.fuel ?? null, pushUsd: v.pushUsd || 0, cnfUsd: v.cnfUsd || 0 };
      if (v.id) await tx.update(s.invoiceVehicles).set(row).where(and(eq(s.invoiceVehicles.id, v.id), eq(s.invoiceVehicles.invoiceId, id)));
      else await tx.insert(s.invoiceVehicles).values({ ...row, invoiceId: id });
    }
    // stock follows the list: a car taken off goes back on sale, a car put on is held
    const oldStock = old.map((o) => o.vehicleId).filter(Boolean) as string[];
    const freed = oldStock.filter((v) => !newStock.includes(v));
    const taken = newStock.filter((v) => !oldStock.includes(v));
    if (freed.length) await tx.update(s.vehicles).set({ status: "available" }).where(and(inArray(s.vehicles.id, freed), eq(s.vehicles.status, "reserved")));
    if (taken.length) await tx.update(s.vehicles).set({ status: "reserved" }).where(and(inArray(s.vehicles.id, taken), eq(s.vehicles.status, "available")));
    await tx
      .update(s.invoices)
      .set({
        consigneeName: input.consigneeName,
        consigneePhone: input.consigneePhone,
        consigneeEmail: input.consigneeEmail || null,
        consigneeAddress: input.consigneeAddress || null,
        consigneeCountryCode: input.consigneeCountryCode,
        consigneePortId: input.consigneePortId || null,
        m3Rate: input.m3Rate ?? null,
        exchangeRate: input.exchangeRate ?? null,
        advancePercent: input.advancePercent ?? inv.advancePercent,
        totalPushUsd: totalPush,
        totalCnfUsd: totalCnf,
        finalPdfFileId: null, // a PDF made before this change no longer matches the invoice
      })
      .where(eq(s.invoices.id, id));
    const before = Number(inv.totalCnfUsd);
    const fmt = (n: number) => `$${n.toLocaleString("en-US")}`;
    const summary = `Edited invoice ${inv.number}: ${input.vehicles.length} vehicle(s), C&F ${before === totalCnf ? fmt(totalCnf) : `${fmt(before)} to ${fmt(totalCnf)}`}`;
    await audit(tx, { actorUserId: actor.userId, actorKind: actor.kind, action: "invoice.edited", entity: "invoice", entityId: id, summary, data: { before: { total: before, vehicles: old.length }, after: { total: totalCnf, vehicles: input.vehicles.length } } });
    if (inv.status === "approved" && before !== totalCnf) await emit("invoice.edited", { invoiceId: id, before, after: totalCnf }, { tx });
    if (inv.requestedBy && inv.requestedBy !== actor.userId) await notify([inv.requestedBy], { type: "invoice_edited", title: `Invoice ${inv.number} was edited`, body: `${actor.name} changed it. Total C&F is now ${fmt(totalCnf)}`, link: `/crm/invoices/${id}` }, tx);
    return { ok: true, totalCnf };
  });
}
