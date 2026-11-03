import { Router } from "express";
import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import * as s from "../db/schema";
import { bad, conflict, forbidden, h, notFound, page, parse } from "../lib/http";
import { can, requirePerm, type AuthUser } from "../auth/session";
import { audit } from "../services/audit";
import { addLeadNote, approveInvoice, ensureWebsiteAccount, findLeadByContact, findOrCreateLead, getInvoiceFull, markInvoiceSent, reassignLead, rejectInvoice, type Actor } from "../services/crm";
import { emit } from "../services/events";
import { notify, usersWithPerm } from "../services/notify";

export const crmRouter = Router();

const actor = (u: AuthUser): Actor => ({ userId: u.id, kind: u.kind === "fte" ? "fte" : "human", name: u.name });

function leadScope(u: AuthUser): SQL | undefined {
  return can(u, "crm.leads.view_all") ? undefined : eq(s.leads.ownerUserId, u.id);
}

crmRouter.get(
  "/summary",
  h(async (req) => {
    const u = requirePerm(req, "crm.access");
    const scope = leadScope(u);
    const counts = await db()
      .select({ status: s.leads.status, n: sql<number>`count(*)::int` })
      .from(s.leads)
      .where(scope)
      .groupBy(s.leads.status);
    const invScope = can(u, "crm.invoices.view_all") ? undefined : eq(s.invoices.requestedBy, u.id);
    const inv = await db()
      .select({ status: s.invoices.status, n: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${s.invoices.totalCnfUsd}),0)::float` })
      .from(s.invoices)
      .where(invScope)
      .groupBy(s.invoices.status);
    const recent = await db()
      .select({ id: s.invoices.id, number: s.invoices.number, status: s.invoices.status, total: s.invoices.totalCnfUsd, consignee: s.invoices.consigneeName, createdAt: s.invoices.createdAt, requestedBy: s.users.name, requestedKind: s.users.kind })
      .from(s.invoices)
      .leftJoin(s.users, eq(s.users.id, s.invoices.requestedBy))
      .where(invScope)
      .orderBy(desc(s.invoices.createdAt))
      .limit(8);
    const [{ customers }] = (await db().select({ customers: sql<number>`count(*)::int` }).from(s.leads).where(and(scope, eq(s.leads.isCustomer, true)))) as [{ customers: number }];
    return { leads: counts, invoices: inv, recent, customers };
  }),
);

crmRouter.get(
  "/leads",
  h(async (req) => {
    const u = requirePerm(req, "crm.access");
    const q = parse(z.object({ q: z.string().max(80).optional(), status: z.string().max(30).optional(), country: z.string().max(2).optional(), port: z.string().max(40).optional(), customers: z.enum(["1"]).optional(), agent: z.string().max(40).optional(), from: z.string().max(10).optional(), to: z.string().max(10).optional() }).passthrough(), req.query);
    const { pageSize, offset, page: pageNo } = page(req.query, 25);
    const w: (SQL | undefined)[] = [leadScope(u)];
    if (q.q) w.push(or(ilike(s.leads.customerName, `%${q.q}%`), ilike(s.leads.contactPerson, `%${q.q}%`), ilike(s.leads.phone, `%${q.q}%`), ilike(s.leads.email, `%${q.q}%`)));
    if (q.status) w.push(eq(s.leads.status, q.status));
    if (q.country) w.push(eq(s.leads.countryCode, q.country.toUpperCase()));
    if (q.port) w.push(eq(s.leads.portId, q.port));
    if (q.customers) w.push(eq(s.leads.isCustomer, true));
    if (q.agent && can(u, "crm.leads.view_all")) w.push(eq(s.leads.ownerUserId, q.agent));
    if (q.from) w.push(sql`${s.leads.createdAt} >= ${q.from}::date`);
    if (q.to) w.push(sql`${s.leads.createdAt} < (${q.to}::date + interval '1 day')`);
    const where = and(...w);
    const rows = await db()
      .select({
        lead: s.leads,
        owner: s.users.name,
        ownerKind: s.users.kind,
        country: s.countries.name,
        port: s.ports.name,
        invoiced: sql<number>`(select coalesce(sum(i.total_cnf_usd),0)::float from invoices i where i.lead_id = "leads"."id" and i.status in ('approved','sent'))`,
        paid: sql<number>`(select coalesce(sum(p.amount_usd),0)::float from payments p join invoices i on i.id = p.invoice_id where i.lead_id = "leads"."id")`,
        duplicateBy: sql<string | null>`(select d.name from users d where d.id = "leads"."duplicate_attempt_by")`,
      })
      .from(s.leads)
      .leftJoin(s.users, eq(s.users.id, s.leads.ownerUserId))
      .leftJoin(s.countries, eq(s.countries.code, s.leads.countryCode))
      .leftJoin(s.ports, eq(s.ports.id, s.leads.portId))
      .where(where)
      .orderBy(desc(s.leads.createdAt))
      .limit(pageSize)
      .offset(offset);
    const [{ n }] = (await db().select({ n: sql<number>`count(*)::int` }).from(s.leads).where(where)) as [{ n: number }];
    const agents = can(u, "crm.leads.view_all")
      ? await db().select({ id: s.users.id, name: s.users.name, kind: s.users.kind, n: sql<number>`(select count(*)::int from leads l where l.owner_user_id = "users"."id")` }).from(s.users).where(inArray(s.users.kind, ["staff", "fte"])).orderBy(s.users.name)
      : [];
    return { items: rows.map((r) => ({ ...r.lead, owner: r.owner, ownerKind: r.ownerKind, country: r.country, port: r.port, invoiced: r.invoiced, paid: r.paid, duplicateBy: r.duplicateBy })), total: n, page: pageNo, pageSize, agents: agents.filter((a) => a.n > 0) };
  }),
);

// GET /leads/template.xlsx is served by crmOps; without this, "/leads/:id" below would
// read "template.xlsx" as a lead id and answer 404.
crmRouter.get("/leads/template.xlsx", (_req, _res, next) => next("router"));

crmRouter.get(
  "/leads/:id",
  h(async (req) => {
    const u = requirePerm(req, "crm.access");
    const [lead] = await db().select().from(s.leads).where(eq(s.leads.id, String(req.params.id))).limit(1);
    if (!lead) throw notFound();
    if (!can(u, "crm.leads.view_all") && lead.ownerUserId !== u.id) throw notFound();
    const notes = await db().select({ n: s.leadNotes, author: s.users.name, authorKind: s.users.kind }).from(s.leadNotes).leftJoin(s.users, eq(s.users.id, s.leadNotes.authorUserId)).where(eq(s.leadNotes.leadId, lead.id)).orderBy(s.leadNotes.createdAt);
    const invoices = await db().select().from(s.invoices).where(eq(s.invoices.leadId, lead.id)).orderBy(desc(s.invoices.createdAt));
    const [country] = lead.countryCode ? await db().select().from(s.countries).where(eq(s.countries.code, lead.countryCode)).limit(1) : [];
    const [port] = lead.portId ? await db().select().from(s.ports).where(eq(s.ports.id, lead.portId)).limit(1) : [];
    const [owner] = lead.ownerUserId ? await db().select({ id: s.users.id, name: s.users.name, kind: s.users.kind }).from(s.users).where(eq(s.users.id, lead.ownerUserId)).limit(1) : [];
    const [account] = lead.customerUserId ? await db().select({ id: s.users.id, email: s.users.email, kind: s.users.kind, mustChangePassword: s.users.mustChangePassword, lastSeenAt: s.users.lastSeenAt }).from(s.users).where(eq(s.users.id, lead.customerUserId)).limit(1) : [];
    const [dupBy] = lead.duplicateAttemptBy ? await db().select({ name: s.users.name }).from(s.users).where(eq(s.users.id, lead.duplicateAttemptBy)).limit(1) : [];
    const staff = can(u, "crm.leads.reassign") ? await db().select({ id: s.users.id, name: s.users.name, kind: s.users.kind }).from(s.users).where(and(inArray(s.users.kind, ["staff", "fte"]), eq(s.users.isActive, true))).orderBy(s.users.name) : [];
    return { duplicateBy: dupBy?.name ?? null, staff, lead, notes: notes.map((x) => ({ ...x.n, author: x.author, authorKind: x.authorKind })), invoices, country: country ?? null, port: port ?? null, owner: owner ?? null, account: account ?? null };
  }),
);

crmRouter.post(
  "/leads",
  h(async (req) => {
    const u = requirePerm(req, "crm.leads.create");
    const b = parse(z.object({ customerName: z.string().trim().min(2).max(120), contactPerson: z.string().trim().min(2).max(80), phone: z.string().trim().min(6).max(30), email: z.string().trim().email().max(120).optional().or(z.literal("")), address: z.string().max(200).optional(), countryCode: z.string().length(2), portId: z.string().min(8) }), req.body);
    // Another agent's client is refused, not quietly opened: the owner stays, the attempt is on record, and the Supervisors know.
    const taken = await findLeadByContact(b.phone, b.email || null);
    if (taken && taken.ownerUserId && taken.ownerUserId !== u.id) {
      const [owner] = await db().select({ name: s.users.name }).from(s.users).where(eq(s.users.id, taken.ownerUserId)).limit(1);
      await db().update(s.leads).set({ duplicateAttemptBy: u.id, duplicateAttemptAt: new Date() }).where(eq(s.leads.id, taken.id));
      await audit(db(), { actorUserId: u.id, actorKind: "human", action: "lead.duplicate_attempt", entity: "lead", entityId: taken.id, summary: `${u.name} tried to add ${taken.customerName}, who is already under ${owner?.name ?? "another agent"}` });
      await notify(await usersWithPerm("crm.invoices.approve"), { type: "lead", title: "Duplicate lead attempt", body: `${u.name} tried to add ${taken.customerName} (${taken.phone}), already under ${owner?.name ?? "another agent"}`, link: `/crm/leads/${taken.id}` });
      await emit("lead.duplicate_attempt", { leadId: taken.id, byName: u.name, ownerName: owner?.name ?? null });
      throw conflict(`This client is already registered under ${owner?.name ?? "another agent"} since ${new Date(taken.createdAt).toISOString().slice(0, 10)}. The Supervisor has been told.`);
    }
    const r = await findOrCreateLead({ ...b, email: b.email || null, ownerUserId: u.id, source: "manual" }, actor(u));
    return { lead: r.lead, duplicate: !r.created };
  }),
);

crmRouter.post(
  "/leads/:id/reassign",
  h(async (req) => {
    const u = requirePerm(req, "crm.leads.reassign");
    const b = parse(z.object({ userId: z.string().min(8), reason: z.string().trim().max(300).optional() }), req.body);
    const r = await reassignLead(String(req.params.id), b.userId, actor(u), b.reason ?? null);
    if (r.moved && r.toKind === "staff" && r.toId !== u.id) await notify([r.toId!], { type: "lead", title: "A lead is now yours", body: `${u.name} gave you ${r.customerName}`, link: `/crm/leads/${String(req.params.id)}` });
    return { moved: r.moved, to: r.to };
  }),
);

crmRouter.patch(
  "/leads/:id",
  h(async (req) => {
    const u = requirePerm(req, "crm.leads.edit");
    const b = parse(
      z.object({
        customerName: z.string().trim().min(2).max(120),
        contactPerson: z.string().trim().min(2).max(80),
        phone: z.string().trim().min(6).max(30),
        email: z.string().trim().toLowerCase().email().max(120).nullable().optional().or(z.literal("")),
        address: z.string().trim().max(200).nullable().optional(),
        countryCode: z.string().length(2),
        portId: z.string().nullable().optional(),
      }),
      req.body,
    );
    const [lead] = await db().select().from(s.leads).where(eq(s.leads.id, String(req.params.id))).limit(1);
    if (!lead || (!can(u, "crm.leads.view_all") && lead.ownerUserId !== u.id)) throw notFound();
    const [country] = await db().select({ code: s.countries.code }).from(s.countries).where(eq(s.countries.code, b.countryCode)).limit(1);
    if (!country) throw bad("Choose a country from the list");
    if (b.portId) {
      const [port] = await db().select({ id: s.ports.id }).from(s.ports).where(and(eq(s.ports.id, b.portId), eq(s.ports.countryCode, country.code))).limit(1);
      if (!port) throw bad("That port is not in the chosen country");
    }
    const dup = await findLeadByContact(b.phone, b.email || null);
    if (dup && dup.id !== lead.id) throw conflict(`This phone or e-mail already belongs to ${dup.customerName}`);
    await db().update(s.leads).set({ customerName: b.customerName, contactPerson: b.contactPerson, phone: b.phone, email: b.email || null, address: b.address || null, countryCode: b.countryCode, portId: b.portId || null, updatedAt: new Date() }).where(eq(s.leads.id, lead.id));
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "lead.edited", entity: "lead", entityId: lead.id, summary: `${u.name} edited the details of ${b.customerName}` });
    // a customer who had no e-mail gets the website account as soon as one is known
    if (lead.isCustomer && b.email) await ensureWebsiteAccount(lead.id);
    return { ok: true };
  }),
);
crmRouter.delete(
  "/leads/:id",
  h(async (req) => {
    const u = requirePerm(req, "crm.leads.delete");
    const [lead] = await db().select().from(s.leads).where(eq(s.leads.id, String(req.params.id))).limit(1);
    if (!lead || (!can(u, "crm.leads.view_all") && lead.ownerUserId !== u.id)) throw notFound();
    const [live] = await db().select({ number: s.invoices.number }).from(s.invoices).where(and(eq(s.invoices.leadId, lead.id), inArray(s.invoices.status, ["approved", "sent"]))).limit(1);
    if (live) throw conflict(`Invoice ${live.number} is approved, so this lead cannot be deleted`);
    const held = await db().select({ vehicleId: s.invoiceVehicles.vehicleId }).from(s.invoiceVehicles).innerJoin(s.invoices, eq(s.invoices.id, s.invoiceVehicles.invoiceId)).where(eq(s.invoices.leadId, lead.id));
    const vehIds = held.map((v) => v.vehicleId).filter(Boolean) as string[];
    await db().transaction(async (tx) => {
      if (vehIds.length) await tx.update(s.vehicles).set({ status: "available" }).where(and(inArray(s.vehicles.id, vehIds), eq(s.vehicles.status, "reserved")));
      await tx.delete(s.leads).where(eq(s.leads.id, lead.id));
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: "lead.deleted", summary: `${u.name} deleted the lead ${lead.customerName}` });
    });
    return { ok: true };
  }),
);

crmRouter.post(
  "/leads/:id/notes",
  h(async (req) => {
    const u = requirePerm(req, "crm.access");
    const [lead] = await db().select().from(s.leads).where(eq(s.leads.id, String(req.params.id))).limit(1);
    if (!lead || (!can(u, "crm.leads.view_all") && lead.ownerUserId !== u.id)) throw notFound();
    const b = parse(z.object({ body: z.string().trim().min(1).max(4000) }), req.body);
    return addLeadNote(lead.id, b.body, actor(u));
  }),
);

crmRouter.get(
  "/invoices",
  h(async (req) => {
    const u = requirePerm(req, "crm.access");
    const { pageSize, offset, page: pageNo } = page(req.query, 25);
    const w: (SQL | undefined)[] = [];
    if (!can(u, "crm.invoices.view_all")) w.push(or(eq(s.invoices.requestedBy, u.id), sql`${s.invoices.leadId} in (select id from leads where owner_user_id = ${u.id})`));
    if (req.query.month && /^\d{4}-\d{2}$/.test(String(req.query.month))) w.push(sql`to_char("invoices"."created_at", 'YYYY-MM') = ${String(req.query.month)}`);
    if (req.query.agent) w.push(sql`"invoices"."requested_by" in (select id from users where name ilike ${`%${req.query.agent}%`})`);
    if (req.query.q) w.push(or(ilike(s.invoices.number, `%${req.query.q}%`), ilike(s.invoices.consigneeName, `%${req.query.q}%`)));
    const beforeStatus = and(...w);
    const FULLY_PAID = sql`("invoices"."total_cnf_usd" > 0 and (select coalesce(sum(p.amount_usd),0) from payments p where p.invoice_id = "invoices"."id") >= "invoices"."total_cnf_usd" - 0.01)`;
    const wanted = String(req.query.status ?? "");
    if (wanted === "payment_received") w.push(and(eq(s.invoices.status, "sent"), FULLY_PAID));
    else if (wanted) w.push(eq(s.invoices.status, wanted));
    const where = and(...w);
    const [counts] = (await db()
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where "invoices"."status" = 'pending')::int`,
        approved: sql<number>`count(*) filter (where "invoices"."status" = 'approved')::int`,
        sent: sql<number>`count(*) filter (where "invoices"."status" = 'sent')::int`,
        rejected: sql<number>`count(*) filter (where "invoices"."status" = 'rejected')::int`,
        paymentReceived: sql<number>`count(*) filter (where "invoices"."status" = 'sent' and ${FULLY_PAID})::int`,
      })
      .from(s.invoices)
      .where(beforeStatus)) as [{ total: number; pending: number; approved: number; sent: number; rejected: number; paymentReceived: number }];
    const months = await db().execute(sql`select distinct to_char(created_at, 'YYYY-MM') as m from invoices order by 1 desc limit 36`);
    const rows = await db()
      .select({ inv: s.invoices, requestedBy: s.users.name, requestedKind: s.users.kind, port: s.ports.name, vehicles: sql<number>`(select count(*)::int from invoice_vehicles iv where iv.invoice_id = ${s.invoices.id})`, firstVehicle: sql<string>`(select unit_label from invoice_vehicles iv where iv.invoice_id = ${s.invoices.id} order by position limit 1)`, chassis: sql<string>`(select chassis_no from invoice_vehicles iv where iv.invoice_id = ${s.invoices.id} order by position limit 1)`, paid: sql<number>`(select coalesce(sum(amount_usd),0)::float from payments p where p.invoice_id = ${s.invoices.id})` })
      .from(s.invoices)
      .leftJoin(s.users, eq(s.users.id, s.invoices.requestedBy))
      .leftJoin(s.ports, eq(s.ports.id, s.invoices.consigneePortId))
      .where(where)
      .orderBy(sql`case when ${s.invoices.status} = 'pending' then 0 else 1 end`, desc(s.invoices.createdAt))
      .limit(pageSize)
      .offset(offset);
    const [{ n }] = (await db().select({ n: sql<number>`count(*)::int` }).from(s.invoices).where(where)) as [{ n: number }];
    return {
      items: rows.map((r) => ({ ...r.inv, requestedByName: r.requestedBy, requestedByKind: r.requestedKind, port: r.port, vehicleCount: r.vehicles, firstVehicle: r.firstVehicle, chassis: r.chassis, paid: r.paid, displayStatus: r.inv.status === "sent" && Number(r.inv.totalCnfUsd) > 0 && r.paid >= Number(r.inv.totalCnfUsd) - 0.01 ? "payment_received" : r.inv.status })),
      total: n,
      page: pageNo,
      pageSize,
      counts,
      months: (months as unknown as { rows: { m: string }[] }).rows.map((x) => x.m),
    };
  }),
);

crmRouter.get(
  "/invoices/:id",
  h(async (req) => {
    const u = requirePerm(req, "crm.access");
    const full = await getInvoiceFull(String(req.params.id));
    if (!full) throw notFound();
    if (!can(u, "crm.invoices.view_all") && full.invoice.requestedBy !== u.id && full.lead?.ownerUserId !== u.id) throw notFound();
    const unitIds = (await db().select({ id: s.units.id }).from(s.units).where(eq(s.units.invoiceId, full.invoice.id))).map((x) => x.id);
    const audit = await db().select({ a: s.auditLog, actor: s.users.name, actorType: s.users.kind }).from(s.auditLog).leftJoin(s.users, eq(s.users.id, s.auditLog.actorUserId)).where(inArray(s.auditLog.entityId, [full.invoice.id, ...unitIds])).orderBy(s.auditLog.createdAt);
    let conversation = null;
    let fteTrail: unknown[] = [];
    if (full.lead?.customerUserId) {
      const [c] = await db().select().from(s.chatConversations).where(and(eq(s.chatConversations.kind, "customer"), eq(s.chatConversations.customerUserId, full.lead.customerUserId))).limit(1);
      if (c) {
        conversation = { id: c.id, summary: c.fteSummary, holder: c.holder };
        fteTrail = (await db().select({ a: s.auditLog, actor: s.users.name }).from(s.auditLog).leftJoin(s.users, eq(s.users.id, s.auditLog.actorUserId)).where(and(eq(s.auditLog.conversationId, c.id), eq(s.auditLog.actorKind, "fte"))).orderBy(desc(s.auditLog.createdAt)).limit(30)).map((x) => ({ ...x.a, actor: x.actor })).reverse();
      }
    }
    const [quote] = full.invoice.quoteId ? await db().select().from(s.quotes).where(eq(s.quotes.id, full.invoice.quoteId)).limit(1) : [];
    const recorders = await db().select({ id: s.users.id, name: s.users.name }).from(s.users).where(inArray(s.users.id, full.payments.map((p) => p.recordedBy).filter(Boolean).concat(["-"]) as string[]));
    const payments = full.payments.map((p) => ({ ...p, recordedByName: recorders.find((x) => x.id === p.recordedBy)?.name ?? null }));
    const unitsByVehicle = await db().select({ id: s.units.id, invoiceVehicleId: s.units.invoiceVehicleId }).from(s.units).where(eq(s.units.invoiceId, full.invoice.id));
    return { ...full, payments, unitsByVehicle, canDeletePayment: can(u, "crm.payments.delete"), audit: audit.map((x) => ({ ...x.a, actor: x.actor, actorType: x.actorType })), conversation, fteTrail, quote: quote ?? null, canApprove: can(u, "crm.invoices.approve"), canDelete: can(u, "crm.invoices.delete") };
  }),
);

const decisionSchema = z.object({ note: z.string().max(1000).optional(), vehicles: z.array(z.object({ id: z.string(), pushUsd: z.number().min(0), cnfUsd: z.number().min(0) })).optional(), advancePercent: z.number().int().min(1).max(100).optional() });

crmRouter.post(
  "/invoices/:id/approve",
  h(async (req) => {
    const u = requirePerm(req, "crm.invoices.approve");
    const b = parse(decisionSchema, req.body ?? {});
    return approveInvoice(String(req.params.id), actor(u), { vehicles: b.vehicles, advancePercent: b.advancePercent });
  }),
);
crmRouter.post(
  "/invoices/:id/reject",
  h(async (req) => {
    const u = requirePerm(req, "crm.invoices.approve");
    const b = parse(decisionSchema, req.body ?? {});
    return rejectInvoice(String(req.params.id), b.note ?? "", actor(u));
  }),
);
crmRouter.post(
  "/invoices/:id/sent",
  h(async (req) => {
    const u = requirePerm(req, "crm.invoices.approve");
    return markInvoiceSent(String(req.params.id), actor(u));
  }),
);

crmRouter.get(
  "/notifications",
  h(async (req) => {
    const u = requirePerm(req, "crm.access");
    const rows = await db().select().from(s.notifications).where(eq(s.notifications.userId, u.id)).orderBy(desc(s.notifications.createdAt)).limit(40);
    const unread = rows.filter((r) => !r.readAt).length;
    return { items: rows, unread };
  }),
);

crmRouter.post(
  "/notifications/read",
  h(async (req) => {
    const u = req.user;
    if (!u) throw forbidden();
    await db().update(s.notifications).set({ readAt: new Date() }).where(and(eq(s.notifications.userId, u.id), sql`${s.notifications.readAt} is null`));
    return { ok: true };
  }),
);
