/**
 * CRM operations beyond the invoice decision: agent invoice requests, payments, units, documents,
 * costing, shipping progress, invoice PDF/Excel, lead status/transfer, reports, users.
 * Every write is permission-checked on the server and audited; customer-facing changes emit events
 * so Sora can tell the buyer.
 */
import { Router } from "express";
import multer from "multer";
import archiver from "archiver";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { PROGRESS_STAGES, UNIT_FOLDERS, ROLE_LABELS, type RoleSlug } from "@autofte/shared";
import { db } from "../db/client";
import * as s from "../db/schema";
import { bad, conflict, forbidden, h, notFound, parse } from "../lib/http";
import { can, clearPermCache, requirePerm, type AuthUser } from "../auth/session";
import { getInvoiceFull, requestInvoice, type Actor } from "../services/crm";
import { audit } from "../services/audit";
import { emit } from "../services/events";
import { getFile, saveFile } from "../services/files";
import { invoicePdf, invoiceXlsx } from "../services/invoiceDocs";
import { hashPassword, randomPassword } from "../auth/passwords";
import { reportData, reportXlsx, backupXlsx } from "../services/reports";

export const crmOps = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 20 } });
const actor = (u: AuthUser): Actor => ({ userId: u.id, kind: "human", name: u.name });

async function invoiceVisible(u: AuthUser, invoiceId: string) {
  const full = await getInvoiceFull(invoiceId);
  if (!full) throw notFound("Invoice not found");
  if (!can(u, "crm.invoices.view_all") && full.invoice.requestedBy !== u.id && full.lead?.ownerUserId !== u.id) throw notFound("Invoice not found");
  return full;
}

// ---------- agent invoice request (human agents; Sora uses its MCP tool) ----------
const vehicleSchema = z.object({
  vehicleId: z.string().optional().nullable(),
  unitLabel: z.string().trim().min(2).max(120),
  year: z.number().int().min(1950).max(2100).optional().nullable(),
  color: z.string().max(40).optional().nullable(),
  chassisNo: z.string().max(40).optional().nullable(),
  engine: z.string().max(40).optional().nullable(),
  transmission: z.string().max(20).optional().nullable(),
  fuel: z.string().max(20).optional().nullable(),
  pushUsd: z.number().min(0).default(0),
  cnfUsd: z.number().min(0).default(0),
});
crmOps.post(
  "/invoices",
  h(async (req) => {
    const u = requirePerm(req, "crm.invoices.request");
    const b = parse(
      z.object({
        leadId: z.string().min(8),
        consigneeName: z.string().trim().min(2).max(120),
        consigneePhone: z.string().trim().min(6).max(30),
        consigneeEmail: z.string().trim().email().max(120).optional().or(z.literal("")),
        consigneeAddress: z.string().max(200).optional(),
        consigneeCountryCode: z.string().length(2),
        consigneePortId: z.string().optional().nullable(),
        advancePercent: z.number().int().min(1).max(100).optional(),
        vehicles: z.array(vehicleSchema).min(1).max(50),
      }),
      req.body,
    );
    const [lead] = await db().select().from(s.leads).where(eq(s.leads.id, b.leadId)).limit(1);
    if (!lead || (lead.ownerUserId !== u.id && !can(u, "crm.leads.view_all"))) throw notFound("Lead not found");
    if (lead.status !== "in_progress" && lead.status !== "new") throw conflict(`This lead is "${lead.status.replace("_", " ")}" — an invoice can be requested for an in-progress lead`);
    const vehicles = b.vehicles.filter((v) => v.unitLabel.trim());
    return requestInvoice({ ...b, consigneeEmail: b.consigneeEmail || null, vehicles }, actor(u));
  }),
);

// ---------- documents ----------
crmOps.get(
  "/invoices/:id/pdf",
  h(async (req, res) => {
    const u = requirePerm(req, "crm.access");
    const full = await invoiceVisible(u, String(req.params.id));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${full.invoice.number}.pdf"`);
    res.send(await invoicePdf(full));
    return undefined;
  }),
);
crmOps.get(
  "/invoices/:id/xlsx",
  h(async (req, res) => {
    const u = requirePerm(req, "crm.access");
    const full = await invoiceVisible(u, String(req.params.id));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${full.invoice.number}.xlsx"`);
    res.send(await invoiceXlsx(full));
    return undefined;
  }),
);

// ---------- payments ----------
crmOps.post(
  "/invoices/:id/payments",
  upload.single("receipt"),
  h(async (req) => {
    const u = requirePerm(req, "crm.payments.record");
    const full = await invoiceVisible(u, String(req.params.id));
    if (!["approved", "sent"].includes(full.invoice.status)) throw conflict("Payments can be recorded on approved or sent invoices");
    const b = parse(
      z.object({ amountUsd: z.coerce.number().positive(), receivedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), fxRate: z.coerce.number().positive().optional(), sellingPriceUsd: z.coerce.number().positive().optional() }),
      req.body,
    );
    if (b.amountUsd > full.totals.balance + 0.01) throw bad(`This is more than the balance (${full.totals.balance.toFixed(2)} USD)`);
    let receiptId: string | null = null;
    if (req.file) {
      if (!/^image\/(png|jpeg|webp)|application\/pdf$/.test(req.file.mimetype)) throw bad("Receipt must be an image or PDF");
      receiptId = (await saveFile(req.file.buffer, { kind: "receipts", mime: req.file.mimetype, originalName: req.file.originalname, ownerUserId: u.id })).id;
    }
    await db().transaction(async (tx) => {
      await tx.insert(s.payments).values({ invoiceId: full.invoice.id, amountUsd: b.amountUsd, receivedDate: b.receivedDate, fxRate: b.fxRate ?? null, yenAmount: b.fxRate ? Math.round(b.amountUsd * b.fxRate) : null, sellingPriceUsd: b.sellingPriceUsd ?? full.totals.total, receiptFileId: receiptId, recordedBy: u.id });
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: "payment.recorded", entity: "invoice", entityId: full.invoice.id, summary: `${u.name} recorded $${b.amountUsd.toLocaleString("en-US")} on ${full.invoice.number}` });
      await emit("payment.recorded", { invoiceId: full.invoice.id, amountUsd: b.amountUsd }, { tx });
    });
    return { ok: true };
  }),
);

// ---------- units, documents, costing ----------
const unitSchema = z.object({
  invoiceVehicleId: z.string().min(8),
  make: z.string().trim().min(1).max(40),
  model: z.string().trim().min(1).max(60),
  year: z.number().int().optional().nullable(),
  color: z.string().max(40).optional().nullable(),
  chassis: z.string().max(40).optional().nullable(),
  engineCc: z.number().int().optional().nullable(),
  drive: z.string().max(10).optional().nullable(),
  fuel: z.string().max(20).optional().nullable(),
  mileageKm: z.number().int().optional().nullable(),
  transmission: z.string().max(20).optional().nullable(),
  steering: z.string().max(10).optional().nullable(),
  doors: z.number().int().optional().nullable(),
  seats: z.number().int().optional().nullable(),
  location: z.string().max(80).optional().nullable(),
});

crmOps.get(
  "/invoices/:id/units",
  h(async (req) => {
    const u = requirePerm(req, "crm.access");
    const full = await invoiceVisible(u, String(req.params.id));
    const units = await db().select().from(s.units).where(eq(s.units.invoiceId, full.invoice.id));
    const out = [];
    for (const un of units) {
      const docs = await db().select({ id: s.unitDocuments.id, folder: s.unitDocuments.folder, fileId: s.files.id, name: s.files.originalName, mime: s.files.mime, size: s.files.size, createdAt: s.unitDocuments.createdAt }).from(s.unitDocuments).innerJoin(s.files, eq(s.files.id, s.unitDocuments.fileId)).where(eq(s.unitDocuments.unitId, un.id)).orderBy(asc(s.unitDocuments.createdAt));
      const [fin] = await db().select().from(s.unitFinancials).where(eq(s.unitFinancials.unitId, un.id)).limit(1);
      out.push({ unit: un, documents: docs, financials: fin ?? null, profit: fin ? computeProfit(fin) : null });
    }
    const progress = await db().select().from(s.vehicleProgress).where(inArray(s.vehicleProgress.invoiceVehicleId, full.vehicles.map((v) => v.id).concat(["-"]))).orderBy(asc(s.vehicleProgress.createdAt));
    return { units: out, progress, canManage: can(u, "crm.units.manage"), canProgress: can(u, "crm.progress.update"), canPay: can(u, "crm.payments.record"), folders: UNIT_FOLDERS, stages: PROGRESS_STAGES.slice(1) };
  }),
);

crmOps.post(
  "/invoices/:id/units",
  h(async (req) => {
    const u = requirePerm(req, "crm.units.manage");
    const full = await invoiceVisible(u, String(req.params.id));
    const b = parse(unitSchema, req.body);
    if (!full.vehicles.some((v) => v.id === b.invoiceVehicleId)) throw bad("That vehicle is not on this invoice");
    const [exists] = await db().select({ id: s.units.id }).from(s.units).where(eq(s.units.invoiceVehicleId, b.invoiceVehicleId)).limit(1);
    if (exists) throw conflict("This vehicle already has a unit");
    return db().transaction(async (tx) => {
      const [un] = await tx.insert(s.units).values({ ...b, invoiceId: full.invoice.id, createdBy: u.id }).returning();
      await tx.insert(s.unitFinancials).values({ unitId: un!.id, sellingPriceUsd: full.vehicles.find((v) => v.id === b.invoiceVehicleId)?.cnfUsd ?? null });
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: "unit.created", entity: "unit", entityId: un!.id, summary: `${u.name} added unit ${b.make} ${b.model} (${b.chassis ?? "no chassis"}) to ${full.invoice.number}` });
      return un;
    });
  }),
);

export function computeProfit(f: typeof s.unitFinancials.$inferSelect) {
  const keys = ["buyingJpy", "domesticJpy", "storageJpy", "inspectJpy", "repairsJpy", "miscJpy", "agencyFeeJpy", "freightJpy", "dhlJpy", "auctionFeeJpy", "partsJpy", "vanningJpy", "docJpy"] as const;
  const costJpy = keys.reduce((a, k) => a + (Number(f[k]) || 0), 0);
  if (!f.fxRate || Number(f.fxRate) <= 0) return { costJpy, costUsd: null, sellingUsd: f.sellingPriceUsd != null ? Number(f.sellingPriceUsd) : null, profitUsd: null, note: "Needs the exchange rate" };
  const costUsd = Math.round((costJpy / Number(f.fxRate)) * 100) / 100;
  const sellingUsd = f.sellingPriceUsd != null ? Number(f.sellingPriceUsd) : null;
  return { costJpy, costUsd, sellingUsd, profitUsd: sellingUsd != null ? Math.round((sellingUsd - costUsd) * 100) / 100 : null, note: null };
}

crmOps.put(
  "/units/:id/financials",
  h(async (req) => {
    const u = requirePerm(req, "crm.units.manage");
    const yen = z.coerce.number().int().min(0).default(0);
    const b = parse(
      z.object({ lotNo: z.string().max(20).optional().nullable(), auctionName: z.string().max(80).optional().nullable(), buyingJpy: yen, domesticJpy: yen, storageJpy: yen, inspectJpy: yen, repairsJpy: yen, miscJpy: yen, agencyFeeJpy: yen, freightJpy: yen, dhlJpy: yen, auctionFeeJpy: yen, partsJpy: yen, vanningJpy: yen, docJpy: yen, fxRate: z.coerce.number().positive().optional().nullable(), sellingPriceUsd: z.coerce.number().min(0).optional().nullable() }),
      req.body,
    );
    const [un] = await db().select().from(s.units).where(eq(s.units.id, String(req.params.id))).limit(1);
    if (!un) throw notFound();
    await db().transaction(async (tx) => {
      await tx.insert(s.unitFinancials).values({ unitId: un.id, ...b, updatedAt: new Date() }).onConflictDoUpdate({ target: s.unitFinancials.unitId, set: { ...b, updatedAt: new Date() } });
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: "unit.costing", entity: "unit", entityId: un.id, summary: `${u.name} updated costing for ${un.make} ${un.model}` });
    });
    const [fin] = await db().select().from(s.unitFinancials).where(eq(s.unitFinancials.unitId, un.id)).limit(1);
    return { financials: fin, profit: computeProfit(fin!) };
  }),
);

crmOps.post(
  "/units/:id/documents",
  upload.array("files", 20),
  h(async (req) => {
    const u = requirePerm(req, "crm.units.manage");
    const folder = String(req.body.folder ?? "");
    if (!(UNIT_FOLDERS as readonly string[]).includes(folder)) throw bad("Choose one of the document folders");
    const [un] = await db().select().from(s.units).where(eq(s.units.id, String(req.params.id))).limit(1);
    if (!un) throw notFound();
    const files = (req.files as Express.Multer.File[]) ?? [];
    if (!files.length) throw bad("No file");
    for (const f of files) {
      if (!/^(image\/(png|jpeg|webp|svg\+xml)|application\/pdf)$/.test(f.mimetype)) throw bad(`${f.originalname}: only images or PDF`);
      const saved = await saveFile(f.buffer, { kind: "unit-docs", mime: f.mimetype, originalName: f.originalname, ownerUserId: u.id });
      await db().insert(s.unitDocuments).values({ unitId: un.id, folder, fileId: saved.id });
    }
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "unit.document", entity: "unit", entityId: un.id, summary: `${u.name} uploaded ${files.length} file(s) to "${folder}" for ${un.make} ${un.model}` });
    await emit("document.uploaded", { unitId: un.id, folder });
    return { ok: true, count: files.length };
  }),
);

/** One ZIP of every document, foldered per chassis: CHASSIS/Folder/file. Duplicate names never overwrite. */
crmOps.get(
  "/invoices/:id/documents.zip",
  h(async (req, res) => {
    const u = requirePerm(req, "crm.access");
    const full = await invoiceVisible(u, String(req.params.id));
    const units = await db().select().from(s.units).where(eq(s.units.invoiceId, full.invoice.id));
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${full.invoice.number}-documents.zip"`);
    const zip = archiver("zip", { zlib: { level: 6 } });
    zip.pipe(res);
    for (const un of units) {
      const docs = await db().select({ folder: s.unitDocuments.folder, fileId: s.unitDocuments.fileId }).from(s.unitDocuments).where(eq(s.unitDocuments.unitId, un.id));
      const used = new Set<string>();
      for (const d of docs) {
        const f = await getFile(d.fileId);
        if (!f) continue;
        let name = `${(un.chassis ?? un.id).replace(/[\\/:*?"<>|]/g, "_")}/${d.folder.replace(/\//g, "-")}/${(f.originalName ?? f.id).replace(/[\\/:*?"<>|]/g, "_")}`;
        let n = 2;
        while (used.has(name)) name = name.replace(/(\.[^.]+)?$/, (m) => ` (${n++})${m}`);
        used.add(name);
        zip.file(f.abs, { name });
      }
    }
    await zip.finalize();
    return undefined;
  }),
);

crmOps.get(
  "/files/:fileId",
  h(async (req, res) => {
    requirePerm(req, "crm.access");
    const f = await getFile(String(req.params.fileId));
    if (!f) throw notFound();
    res.setHeader("Content-Type", f.mime);
    res.setHeader("Content-Disposition", `inline; filename="${(f.originalName ?? "file").replace(/"/g, "")}"`);
    res.sendFile(f.abs);
    return undefined;
  }),
);

// ---------- shipping progress ----------
crmOps.post(
  "/invoice-vehicles/:id/progress",
  h(async (req) => {
    const u = requirePerm(req, "crm.progress.update");
    const b = parse(z.object({ stage: z.enum(PROGRESS_STAGES as unknown as [string, ...string[]]), stageDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string().max(300).optional() }), req.body);
    if (new Date(b.stageDate).getTime() > Date.now() + 86400_000) throw bad("The date cannot be in the future");
    const [iv] = await db().select().from(s.invoiceVehicles).where(eq(s.invoiceVehicles.id, String(req.params.id))).limit(1);
    if (!iv) throw notFound();
    await invoiceVisible(u, iv.invoiceId);
    await db().transaction(async (tx) => {
      await tx.insert(s.vehicleProgress).values({ invoiceVehicleId: iv.id, stage: b.stage, stageDate: b.stageDate, note: b.note ?? null, createdBy: u.id });
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: "progress.updated", entity: "invoice", entityId: iv.invoiceId, summary: `${u.name} set ${iv.unitLabel} to "${b.stage}"` });
      await emit("progress.updated", { invoiceVehicleId: iv.id, stage: b.stage, note: b.note ?? null }, { tx });
    });
    return { ok: true };
  }),
);

// ---------- leads: status, transfer ----------
crmOps.post(
  "/leads/:id/status",
  h(async (req) => {
    const u = requirePerm(req, "crm.leads.status");
    const b = parse(z.object({ status: z.enum(["new", "in_progress", "closed"]) }), req.body);
    const [lead] = await db().select().from(s.leads).where(eq(s.leads.id, String(req.params.id))).limit(1);
    if (!lead) throw notFound();
    await db().update(s.leads).set({ status: b.status, updatedAt: new Date() }).where(eq(s.leads.id, lead.id));
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "lead.status", entity: "lead", entityId: lead.id, summary: `${u.name} set ${lead.customerName} to ${b.status}` });
    return { ok: true };
  }),
);

crmOps.post(
  "/leads/transfer",
  h(async (req) => {
    const u = requirePerm(req, "crm.leads.transfer");
    const b = parse(z.object({ fromUserId: z.string().min(8), toUserId: z.string().min(8) }), req.body);
    if (b.fromUserId === b.toUserId) throw bad("Choose two different agents");
    const [to] = await db().select().from(s.users).where(eq(s.users.id, b.toUserId)).limit(1);
    if (!to || !to.isActive || (to.kind !== "staff" && to.kind !== "fte")) throw bad("The receiving agent must be an active staff member");
    const r = await db().update(s.leads).set({ ownerUserId: b.toUserId, updatedAt: new Date() }).where(eq(s.leads.ownerUserId, b.fromUserId)).returning({ id: s.leads.id });
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "lead.transfer", summary: `${u.name} moved ${r.length} lead(s) to ${to.name}` });
    return { moved: r.length };
  }),
);

// ---------- reports + backup ----------
crmOps.get(
  "/reports",
  h(async (req) => {
    requirePerm(req, "crm.reports.view");
    const q = parse(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req.query);
    return reportData(q.from, q.to);
  }),
);
crmOps.get(
  "/reports.xlsx",
  h(async (req, res) => {
    requirePerm(req, "crm.reports.view");
    const q = parse(z.object({ from: z.string(), to: z.string() }), req.query);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="report-${q.from}-to-${q.to}.xlsx"`);
    res.send(await reportXlsx(q.from, q.to));
    return undefined;
  }),
);
crmOps.get(
  "/backup.xlsx",
  h(async (req, res) => {
    const u = requirePerm(req, "crm.backup.download");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="crm-backup-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.send(await backupXlsx());
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "backup.download", summary: `${u.name} downloaded the full CRM backup` });
    return undefined;
  }),
);

// ---------- users ----------
crmOps.get(
  "/users",
  h(async (req) => {
    requirePerm(req, "crm.users.manage");
    const rows = await db()
      .select({ id: s.users.id, name: s.users.name, email: s.users.email, username: s.users.username, phone: s.users.phone, kind: s.users.kind, isActive: s.users.isActive, title: s.users.title, lastSeenAt: s.users.lastSeenAt, createdAt: s.users.createdAt, role: s.roles.slug, roleName: s.roles.name, leads: sql<number>`(select count(*)::int from leads l where l.owner_user_id = ${s.users.id})` })
      .from(s.users)
      .leftJoin(s.roles, eq(s.roles.id, s.users.roleId))
      .where(inArray(s.users.kind, ["staff", "fte"]))
      .orderBy(asc(s.users.name));
    const roles = await db().select().from(s.roles).where(inArray(s.roles.slug, ["admin", "manager", "supervisor", "agent", "accounts"]));
    return { users: rows, roles: roles.map((r) => ({ id: r.id, slug: r.slug, name: ROLE_LABELS[r.slug as RoleSlug] ?? r.name })) };
  }),
);

const userSchema = z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email().max(120), username: z.string().trim().min(2).max(40).optional(), phone: z.string().max(30).optional(), roleSlug: z.enum(["admin", "manager", "supervisor", "agent", "accounts"]), title: z.string().max(80).optional() });

crmOps.post(
  "/users",
  h(async (req) => {
    const u = requirePerm(req, "crm.users.manage");
    const b = parse(userSchema, req.body);
    if (b.roleSlug === "admin" && !can(u, "system.demo.reset")) throw forbidden("Only an Admin can create another Admin");
    if (u.roleSlug === "supervisor" && b.roleSlug !== "agent") throw forbidden("A Supervisor creates agents");
    const [dup] = await db().select({ id: s.users.id }).from(s.users).where(sql`lower(${s.users.email}) = ${b.email}`).limit(1);
    if (dup) throw conflict("An account with this e-mail already exists");
    const [role] = await db().select().from(s.roles).where(eq(s.roles.slug, b.roleSlug)).limit(1);
    const password = randomPassword().slice(0, 14);
    const [created] = await db().insert(s.users).values({ kind: "staff", name: b.name, email: b.email, username: b.username ?? null, phone: b.phone ?? null, roleId: role!.id, title: b.title ?? ROLE_LABELS[b.roleSlug], passwordHash: await hashPassword(password) }).returning({ id: s.users.id });
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "user.created", entity: "user", entityId: created!.id, summary: `${u.name} created ${b.name} (${ROLE_LABELS[b.roleSlug]})` });
    return { id: created!.id, oneTimePassword: password };
  }),
);

crmOps.put(
  "/users/:id",
  h(async (req) => {
    const u = requirePerm(req, "crm.users.manage");
    const b = parse(z.object({ roleSlug: z.enum(["admin", "manager", "supervisor", "agent", "accounts"]).optional(), isActive: z.boolean().optional(), title: z.string().max(80).optional() }), req.body);
    const [target] = await db().select().from(s.users).where(eq(s.users.id, String(req.params.id))).limit(1);
    if (!target || target.kind !== "staff") throw notFound();
    if (target.id === u.id && b.isActive === false) throw bad("You cannot switch yourself off");
    const patch: Partial<typeof s.users.$inferInsert> = { updatedAt: new Date() };
    if (b.roleSlug) {
      if (b.roleSlug === "admin" && !can(u, "system.demo.reset")) throw forbidden("Only an Admin can make an Admin");
      const [role] = await db().select().from(s.roles).where(eq(s.roles.slug, b.roleSlug)).limit(1);
      patch.roleId = role!.id;
    }
    if (b.isActive !== undefined) patch.isActive = b.isActive;
    if (b.title !== undefined) patch.title = b.title;
    await db().update(s.users).set(patch).where(eq(s.users.id, target.id));
    if (b.isActive === false) await db().delete(s.sessions).where(eq(s.sessions.userId, target.id)); // switched off = signed out everywhere
    clearPermCache();
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "user.updated", entity: "user", entityId: target.id, summary: `${u.name} updated ${target.name}${b.roleSlug ? ` → ${b.roleSlug}` : ""}${b.isActive === false ? " (switched off)" : b.isActive ? " (switched on)" : ""}` });
    return { ok: true };
  }),
);

crmOps.post(
  "/users/:id/reset-password",
  h(async (req) => {
    const u = requirePerm(req, "crm.users.manage");
    const [target] = await db().select().from(s.users).where(eq(s.users.id, String(req.params.id))).limit(1);
    if (!target || target.kind !== "staff") throw notFound();
    const password = randomPassword().slice(0, 14);
    await db().update(s.users).set({ passwordHash: await hashPassword(password) }).where(eq(s.users.id, target.id));
    await db().delete(s.sessions).where(eq(s.sessions.userId, target.id));
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "user.password", entity: "user", entityId: target.id, summary: `${u.name} reset ${target.name}'s password` });
    return { oneTimePassword: password };
  }),
);

// ---------- units list ----------
crmOps.get(
  "/units",
  h(async (req) => {
    requirePerm(req, "crm.access");
    const rows = await db()
      .select({ unit: s.units, invoice: s.invoices.number, invoiceId: s.invoices.id, consignee: s.invoices.consigneeName, docs: sql<number>`(select count(*)::int from unit_documents d where d.unit_id = ${s.units.id})`, stage: sql<string>`(select stage from vehicle_progress p where p.invoice_vehicle_id = ${s.units.invoiceVehicleId} order by created_at desc limit 1)` })
      .from(s.units)
      .innerJoin(s.invoices, eq(s.invoices.id, s.units.invoiceId))
      .orderBy(desc(s.units.createdAt))
      .limit(200);
    return rows.map((r) => ({ ...r.unit, invoice: r.invoice, invoiceId: r.invoiceId, consignee: r.consignee, docs: r.docs, stage: r.stage }));
  }),
);

void gte;
void lt;
void and;
