import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db, type DBorTx } from "../db/client";
import * as s from "../db/schema";
import { bad, conflict, notFound } from "../lib/http";
import { audit } from "./audit";
import { emit } from "./events";
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
  return db().transaction(async (tx) => {
    if (existing) {
      const patch: Partial<typeof s.leads.$inferInsert> = { updatedAt: new Date() };
      if (!existing.email && input.email) patch.email = input.email;
      if (!existing.portId && input.portId) patch.portId = input.portId;
      if (!existing.customerUserId && input.customerUserId) patch.customerUserId = input.customerUserId;
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
  const r = await tx.execute(sql`select count(*)::int as n from invoices`);
  const n = ((r as unknown as { rows: { n: number }[] }).rows[0]?.n ?? 0) + 2601;
  return `${prefix}${String(n).padStart(5, "0")}`;
}

/** Agent (human or Sora) asks for an invoice. It waits for the Supervisor; one pending request per lead. */
export async function requestInvoice(input: InvoiceRequestInput, actor: Actor) {
  if (!input.vehicles.length) throw bad("At least one vehicle is required");
  if (input.vehicles.length > 50) throw bad("At most 50 vehicles on one invoice");
  // read everything the transaction needs first: PGlite has one connection, so a db() call inside tx would wait forever
  const site = await siteSettings();
  const supervisors = await usersWithPerm("crm.invoices.approve");
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
    await tx.update(s.invoices).set({ status: "sent", sentAt: new Date() }).where(eq(s.invoices.id, id));
    await audit(tx, { actorUserId: actor.userId, actorKind: actor.kind, action: "invoice.sent", entity: "invoice", entityId: id, summary: `Marked invoice ${inv.number} as sent` });
    return { ok: true };
  });
}
