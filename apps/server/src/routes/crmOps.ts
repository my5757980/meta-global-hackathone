/**
 * CRM operations beyond the invoice decision: agent invoice requests, payments, units, documents,
 * costing, shipping progress, invoice PDF/Excel, lead status/transfer, reports, users.
 * Every write is permission-checked on the server and audited; customer-facing changes emit events
 * so Sora can tell the buyer.
 */
import { Router } from "express";
import multer from "multer";
import archiver from "archiver";
import { and, asc, desc, eq, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { PROGRESS_STAGES, UNIT_FOLDERS, ROLE_LABELS, type RoleSlug } from "@autofte/shared";
import { db } from "../db/client";
import * as s from "../db/schema";
import { bad, conflict, forbidden, h, notFound, parse } from "../lib/http";
import { can, clearPermCache, requirePerm, type AuthUser } from "../auth/session";
import { attachFinalPdf, deleteInvoice, editInvoice, getInvoiceFull, removeFinalPdf, requestInvoice, type Actor } from "../services/crm";
import { notify, usersWithPerm } from "../services/notify";
import { audit } from "../services/audit";
import { emit } from "../services/events";
import { getFile, saveFile } from "../services/files";
import { invoicePdf, invoiceXlsx, letterheadOf } from "../services/invoiceDocs";
import { hashPassword, oneTimePassword, randomPassword } from "../auth/passwords";
import { reportCsv, reportData, reportDetail, reportDocx, reportXlsx, backupXlsx } from "../services/reports";
import { cellText } from "../lib/excel";

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

// ---------- Supervisor edits an invoice: consignee, terms, prices, the whole vehicle list ----------
crmOps.put(
  "/invoices/:id",
  h(async (req) => {
    const u = requirePerm(req, "crm.invoices.approve");
    const b = parse(
      z.object({
        consigneeName: z.string().trim().min(2).max(120),
        consigneePhone: z.string().trim().min(6).max(30),
        consigneeEmail: z.string().trim().email().max(120).optional().nullable().or(z.literal("")),
        consigneeAddress: z.string().max(200).optional().nullable(),
        consigneeCountryCode: z.string().length(2),
        consigneePortId: z.string().optional().nullable(),
        m3Rate: z.number().min(0).max(100000).optional().nullable(),
        exchangeRate: z.number().min(0).max(100000).optional().nullable(),
        advancePercent: z.number().int().min(1).max(100).optional(),
        vehicles: z.array(vehicleSchema.extend({ id: z.string().optional().nullable() })).min(1).max(50),
      }),
      req.body,
    );
    return editInvoice(String(req.params.id), b, actor(u));
  }),
);

crmOps.delete(
  "/invoices/:id",
  h(async (req) => {
    const u = requirePerm(req, "crm.invoices.delete");
    return deleteInvoice(String(req.params.id), actor(u));
  }),
);

// ---------- the final PDF the buyer receives: uploaded by the Supervisor, or the generated one ----------
crmOps.post(
  "/invoices/:id/final-pdf",
  upload.single("file"),
  h(async (req) => {
    const u = requirePerm(req, "crm.invoices.approve");
    const full = await invoiceVisible(u, String(req.params.id));
    if (full.invoice.status !== "approved") throw conflict("The final PDF goes on an approved invoice, before it is sent");
    const f = req.file;
    if (!f) throw bad("Attach the PDF");
    if (f.buffer.subarray(0, 5).toString("latin1") !== "%PDF-") throw bad("Only a PDF file can be the final invoice");
    const saved = await saveFile(f.buffer, { kind: "invoices", mime: "application/pdf", originalName: f.originalname, ownerUserId: u.id });
    return attachFinalPdf(full.invoice.id, saved.id, "Uploaded", actor(u));
  }),
);
crmOps.post(
  "/invoices/:id/final-pdf/generated",
  h(async (req) => {
    const u = requirePerm(req, "crm.invoices.approve");
    const full = await invoiceVisible(u, String(req.params.id));
    if (full.invoice.status !== "approved") throw conflict("The final PDF goes on an approved invoice, before it is sent");
    const saved = await saveFile(await invoicePdf(full), { kind: "invoices", mime: "application/pdf", originalName: `${full.invoice.number}.pdf`, ownerUserId: u.id });
    return attachFinalPdf(full.invoice.id, saved.id, "Generated", actor(u));
  }),
);

// ---------- documents ----------
crmOps.get(
  "/invoices/:id/pdf",
  h(async (req, res) => {
    const u = requirePerm(req, "crm.invoices.download");
    const full = await invoiceVisible(u, String(req.params.id));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${full.invoice.number}.pdf"`);
    res.send(await invoicePdf(full, letterheadOf(req.query.letterhead)));
    return undefined;
  }),
);
crmOps.get(
  "/invoices/:id/xlsx",
  h(async (req, res) => {
    const u = requirePerm(req, "crm.invoices.download");
    const full = await invoiceVisible(u, String(req.params.id));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${full.invoice.number}.xlsx"`);
    res.send(await invoiceXlsx(full, letterheadOf(req.query.letterhead)));
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
  if (f.currency === "USD") {
    const usd = f.costUsd != null ? Number(f.costUsd) : null;
    const selling = f.sellingPriceUsd != null ? Number(f.sellingPriceUsd) : null;
    return { costJpy: 0, costUsd: usd, sellingUsd: selling, profitUsd: usd != null && selling != null ? Math.round((selling - usd) * 100) / 100 : null, note: null };
  }
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
      z.object({ currency: z.enum(["JPY", "USD"]).default("JPY"), costUsd: z.coerce.number().min(0).optional().nullable(), lotNo: z.string().max(20).optional().nullable(), auctionName: z.string().max(80).optional().nullable(), buyingJpy: yen, domesticJpy: yen, storageJpy: yen, inspectJpy: yen, repairsJpy: yen, miscJpy: yen, agencyFeeJpy: yen, freightJpy: yen, dhlJpy: yen, auctionFeeJpy: yen, partsJpy: yen, vanningJpy: yen, docJpy: yen, fxRate: z.coerce.number().positive().optional().nullable(), sellingPriceUsd: z.coerce.number().min(0).optional().nullable() }),
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
    res.sendFile(f.abs, { dotfiles: "allow" }); // stored under .data/ — send() treats dot-folders as missing by default
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

// ---------- Supervisor hands his own imported leads to agents, country by country (never an agent's leads) ----------
const assignable = (userId: string) => and(eq(s.leads.ownerUserId, userId), eq(s.leads.source, "excel"), eq(s.leads.status, "new"));
function requireAssigner(req: Parameters<typeof requirePerm>[0]) {
  const u = requirePerm(req, "crm.leads.upload");
  if (!can(u, "crm.leads.view_all")) throw forbidden("Only a Supervisor assigns imported leads");
  return u;
}
crmOps.get(
  "/lead-assignment",
  h(async (req) => {
    const u = requireAssigner(req);
    const groups = await db()
      .select({ code: s.leads.countryCode, country: s.countries.name, n: sql<number>`count(*)::int` })
      .from(s.leads)
      .leftJoin(s.countries, eq(s.countries.code, s.leads.countryCode))
      .where(assignable(u.id))
      .groupBy(s.leads.countryCode, s.countries.name)
      .orderBy(s.countries.name);
    const ids = await usersWithPerm("crm.invoices.request");
    const agents = ids.length ? await db().select({ id: s.users.id, name: s.users.name }).from(s.users).where(and(inArray(s.users.id, ids), eq(s.users.kind, "staff"), eq(s.users.isActive, true))).orderBy(s.users.name) : [];
    return { groups, agents };
  }),
);
crmOps.post(
  "/lead-assignment",
  h(async (req) => {
    const u = requireAssigner(req);
    const b = parse(z.object({ countryCode: z.string().length(2), toUserId: z.string().min(8) }), req.body);
    const ids = await usersWithPerm("crm.invoices.request");
    const [to] = await db().select().from(s.users).where(eq(s.users.id, b.toUserId)).limit(1);
    if (!to || !to.isActive || to.kind !== "staff" || !ids.includes(to.id)) throw bad("Choose an active agent");
    const moved = await db()
      .update(s.leads)
      .set({ ownerUserId: to.id, updatedAt: new Date() })
      .where(and(assignable(u.id), eq(s.leads.countryCode, b.countryCode)))
      .returning({ id: s.leads.id });
    if (moved.length) {
      await audit(db(), { actorUserId: u.id, actorKind: "human", action: "lead.assign_country", summary: `${u.name} assigned ${moved.length} imported lead(s) in ${b.countryCode} to ${to.name}` });
      await notify([to.id], { type: "leads_assigned", title: `${moved.length} new lead${moved.length > 1 ? "s" : ""} assigned to you`, body: `${u.name} assigned them from an Excel import`, link: "/crm/leads" });
    }
    return { moved: moved.length };
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
const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

crmOps.get(
  "/reports/detail",
  h(async (req) => {
    requirePerm(req, "crm.reports.view");
    const q = parse(z.object({ userId: z.string().min(8), from: DAY, to: DAY }), req.query);
    return reportDetail(q.userId, q.from, q.to);
  }),
);

crmOps.get(
  "/reports.csv",
  h(async (req, res) => {
    requirePerm(req, "crm.reports.view");
    const q = parse(z.object({ from: DAY, to: DAY, userId: z.string().min(8).optional() }), req.query);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="report-${q.from}-to-${q.to}${q.userId ? "-agent" : ""}.csv"`);
    res.send(await reportCsv(q.from, q.to, q.userId));
    return undefined;
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
  "/reports.docx",
  h(async (req, res) => {
    requirePerm(req, "crm.reports.view");
    const q = parse(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req.query);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="report-${q.from}-to-${q.to}.docx"`);
    res.send(await reportDocx(q.from, q.to));
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
      .select({ id: s.users.id, name: s.users.name, email: s.users.email, username: s.users.username, phone: s.users.phone, kind: s.users.kind, isActive: s.users.isActive, showInChat: s.users.showInChat, title: s.users.title, lastSeenAt: s.users.lastSeenAt, createdAt: s.users.createdAt, role: s.roles.slug, roleName: s.roles.name, leads: sql<number>`(select count(*)::int from leads l where l.owner_user_id = ${s.users.id})` })
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
    const b = parse(z.object({ roleSlug: z.enum(["admin", "manager", "supervisor", "agent", "accounts"]).optional(), isActive: z.boolean().optional(), title: z.string().max(80).optional(), showInChat: z.boolean().optional() }), req.body);
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
    if (b.showInChat !== undefined) patch.showInChat = b.showInChat;
    await db().update(s.users).set(patch).where(eq(s.users.id, target.id));
    if (b.isActive === false) {
      await db().delete(s.sessions).where(eq(s.sessions.userId, target.id)); // switched off = signed out everywhere
      await emit("staff.switched_off", { userId: target.id, name: target.name }); // the CRM desk moves their open leads
    }
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
    await db().update(s.users).set({ passwordHash: await hashPassword(password), mustChangePassword: true }).where(eq(s.users.id, target.id));
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
    const term = String(req.query.q ?? "").trim();
    const like = `%${term}%`;
    const rows = await db()
      .select({ addedBy: s.users.name, addedByKind: s.users.kind, fin: s.unitFinancials, cover: sql<string | null>`coalesce("units"."cover_file_id", (select d.file_id from unit_documents d join files f on f.id = d.file_id where d.unit_id = "units"."id" and f.mime like 'image/%' order by d.created_at limit 1))`, unit: s.units, invoice: s.invoices.number, invoiceId: s.invoices.id, consignee: s.invoices.consigneeName, docs: sql<number>`(select count(*)::int from unit_documents d where d.unit_id = ${s.units.id})`, stage: sql<string>`(select stage from vehicle_progress p where p.invoice_vehicle_id = ${s.units.invoiceVehicleId} order by created_at desc limit 1)` })
      .from(s.units)
      .innerJoin(s.invoices, eq(s.invoices.id, s.units.invoiceId))
      .leftJoin(s.users, eq(s.users.id, s.units.createdBy))
      .leftJoin(s.unitFinancials, eq(s.unitFinancials.unitId, s.units.id))
      .where(term ? or(ilike(s.units.make, like), ilike(s.units.model, like), ilike(s.units.chassis, like), ilike(s.units.color, like), sql`"units"."year"::text ilike ${like}`) : undefined)
      .orderBy(desc(s.units.createdAt))
      .limit(200);
    return rows.map((r) => ({ ...r.unit, invoice: r.invoice, invoiceId: r.invoiceId, consignee: r.consignee, docs: r.docs, stage: r.stage, cover: r.cover, addedBy: r.addedBy, addedByKind: r.addedByKind, profitUsd: r.fin ? computeProfit(r.fin).profitUsd : null }));
  }),
);

async function unitVisible(u: AuthUser, id: string) {
  const [un] = await db().select().from(s.units).where(eq(s.units.id, id)).limit(1);
  if (!un) throw notFound("Unit not found");
  await invoiceVisible(u, un.invoiceId); // the same rule as its invoice
  return un;
}

crmOps.get(
  "/units/:id",
  h(async (req) => {
    const u = requirePerm(req, "crm.access");
    const un = await unitVisible(u, String(req.params.id));
    const full = (await getInvoiceFull(un.invoiceId))!;
    const documents = await db().select({ id: s.unitDocuments.id, folder: s.unitDocuments.folder, fileId: s.files.id, name: s.files.originalName, mime: s.files.mime, size: s.files.size, createdAt: s.unitDocuments.createdAt }).from(s.unitDocuments).innerJoin(s.files, eq(s.files.id, s.unitDocuments.fileId)).where(eq(s.unitDocuments.unitId, un.id)).orderBy(asc(s.unitDocuments.createdAt));
    const [fin] = await db().select().from(s.unitFinancials).where(eq(s.unitFinancials.unitId, un.id)).limit(1);
    const [added] = un.createdBy ? await db().select({ name: s.users.name, kind: s.users.kind }).from(s.users).where(eq(s.users.id, un.createdBy)).limit(1) : [];
    const recorders = await db().select({ id: s.users.id, name: s.users.name }).from(s.users).where(inArray(s.users.id, full.payments.map((p) => p.recordedBy).filter(Boolean).concat(["-"]) as string[]));
    const cover = un.coverFileId ?? documents.find((d) => d.mime.startsWith("image/"))?.fileId ?? null;
    const progress = un.invoiceVehicleId ? await db().select().from(s.vehicleProgress).where(eq(s.vehicleProgress.invoiceVehicleId, un.invoiceVehicleId)).orderBy(asc(s.vehicleProgress.createdAt)) : [];
    return {
      unit: un,
      addedBy: added ?? null,
      invoice: { id: full.invoice.id, number: full.invoice.number, status: full.invoice.status, consignee: full.invoice.consigneeName },
      totals: full.totals,
      payments: full.payments.map((p) => ({ ...p, recordedByName: recorders.find((x) => x.id === p.recordedBy)?.name ?? null })),
      documents,
      cover,
      financials: fin ?? null,
      profit: fin ? computeProfit(fin) : null,
      progress,
      folders: UNIT_FOLDERS,
      canManage: can(u, "crm.units.manage"),
    };
  }),
);

crmOps.patch(
  "/units/:id",
  h(async (req) => {
    const u = requirePerm(req, "crm.units.manage");
    const un = await unitVisible(u, String(req.params.id));
    const b = parse(unitSchema.omit({ invoiceVehicleId: true }).partial(), req.body);
    await db().update(s.units).set(b).where(eq(s.units.id, un.id));
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "unit.edited", entity: "unit", entityId: un.id, summary: `${u.name} edited unit ${un.make} ${un.model}` });
    return { ok: true };
  }),
);

crmOps.put(
  "/units/:id/cover",
  h(async (req) => {
    const u = requirePerm(req, "crm.units.manage");
    const un = await unitVisible(u, String(req.params.id));
    const { fileId } = parse(z.object({ fileId: z.string().min(8) }), req.body);
    const [d] = await db().select({ mime: s.files.mime }).from(s.unitDocuments).innerJoin(s.files, eq(s.files.id, s.unitDocuments.fileId)).where(and(eq(s.unitDocuments.unitId, un.id), eq(s.unitDocuments.fileId, fileId))).limit(1);
    if (!d || !d.mime.startsWith("image/")) throw bad("The cover must be one of this unit's pictures");
    await db().update(s.units).set({ coverFileId: fileId }).where(eq(s.units.id, un.id));
    return { ok: true };
  }),
);

crmOps.delete(
  "/units/:id/documents/:docId",
  h(async (req) => {
    const u = requirePerm(req, "crm.units.manage");
    const un = await unitVisible(u, String(req.params.id));
    const [d] = await db().select({ id: s.unitDocuments.id, fileId: s.unitDocuments.fileId, folder: s.unitDocuments.folder, name: s.files.originalName }).from(s.unitDocuments).innerJoin(s.files, eq(s.files.id, s.unitDocuments.fileId)).where(and(eq(s.unitDocuments.id, String(req.params.docId)), eq(s.unitDocuments.unitId, un.id))).limit(1);
    if (!d) throw notFound("That file is not on this unit");
    await db().transaction(async (tx) => {
      await tx.delete(s.unitDocuments).where(eq(s.unitDocuments.id, d.id));
      if (un.coverFileId === d.fileId) await tx.update(s.units).set({ coverFileId: null }).where(eq(s.units.id, un.id));
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: "unit.document_removed", entity: "unit", entityId: un.id, summary: `${u.name} removed "${d.name ?? "a file"}" from "${d.folder}" on ${un.make} ${un.model}` });
    });
    return { ok: true };
  }),
);

crmOps.get(
  "/units/:id/documents.zip",
  h(async (req, res) => {
    const u = requirePerm(req, "crm.access");
    const un = await unitVisible(u, String(req.params.id));
    const docs = await db().select({ folder: s.unitDocuments.folder, fileId: s.unitDocuments.fileId }).from(s.unitDocuments).where(eq(s.unitDocuments.unitId, un.id));
    const safe = (x: string) => x.replace(/[\\/:*?"<>|]/g, "_");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${safe(un.chassis ?? un.id)}-documents.zip"`);
    const zip = archiver("zip", { zlib: { level: 6 } });
    zip.pipe(res);
    const used = new Set<string>();
    for (const d of docs) {
      const f = await getFile(d.fileId);
      if (!f) continue;
      let name = `${d.folder.replace(/\//g, "-")}/${safe(f.originalName ?? f.id)}`;
      let n = 2;
      while (used.has(name)) name = name.replace(/(\.[^.]+)?$/, (m) => ` (${n++})${m}`);
      used.add(name);
      zip.file(f.abs, { name });
    }
    await zip.finalize();
    return undefined;
  }),
);

crmOps.delete(
  "/invoices/:id/final-pdf",
  h(async (req) => {
    const u = requirePerm(req, "crm.invoices.approve");
    await invoiceVisible(u, String(req.params.id));
    return removeFinalPdf(String(req.params.id), actor(u));
  }),
);

crmOps.delete(
  "/payments/:id",
  h(async (req) => {
    const u = requirePerm(req, "crm.payments.delete");
    const [p] = await db().select().from(s.payments).where(eq(s.payments.id, String(req.params.id))).limit(1);
    if (!p) throw notFound("Payment not found");
    const [inv] = await db().select({ number: s.invoices.number }).from(s.invoices).where(eq(s.invoices.id, p.invoiceId)).limit(1);
    await db().transaction(async (tx) => {
      await tx.delete(s.payments).where(eq(s.payments.id, p.id));
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: "payment.deleted", entity: "invoice", entityId: p.invoiceId, summary: `${u.name} deleted a payment of $${Number(p.amountUsd).toLocaleString("en-US")} (${p.receivedDate}) on ${inv?.number ?? "an invoice"}` });
    });
    return { ok: true };
  }),
);

void gte;
void lt;
void and;

// ── Leads from Excel ──────────────────────────────────────────────────────────────────────────────────────
const LEAD_COLUMNS = ["Customer / company name", "Contact person", "Phone / WhatsApp", "E-mail", "Country", "Port", "Address"];

crmOps.get(
  "/leads/template.xlsx",
  h(async (req, res) => {
    requirePerm(req, "crm.leads.upload");
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Leads");
    ws.columns = LEAD_COLUMNS.map((header, i) => ({ header, key: `c${i}`, width: [30, 22, 20, 30, 18, 22, 32][i] }));
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
    const ex = ws.addRow(["Mushi Logistics Ltd", "Daudi Mushi", "+255 754 000 111", "daudi@example.com", "Tanzania", "Dar es Salaam", "Plot 12, Kariakoo (example row - replace it)"]);
    ex.font = { italic: true, color: { argb: "FF64748B" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    const ref = wb.addWorksheet("Countries & ports");
    ref.columns = [
      { header: "Country", key: "c", width: 26 },
      { header: "Code", key: "k", width: 8 },
      { header: "Port", key: "p", width: 30 },
    ];
    ref.getRow(1).font = { bold: true };
    const rows = await db().select({ c: s.countries.name, k: s.countries.code, p: s.ports.name }).from(s.ports).innerJoin(s.countries, eq(s.countries.code, s.ports.countryCode)).orderBy(asc(s.countries.name), asc(s.ports.name));
    rows.forEach((r) => ref.addRow(r));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="leads-template.xlsx"');
    res.send(Buffer.from(await wb.xlsx.writeBuffer()));
    return undefined;
  }),
);

/** Check (dryRun=1) or import an Excel of leads: validated row by row, duplicates skipped, the Supervisor told once. */
crmOps.post(
  "/leads/import",
  upload.single("file"),
  h(async (req) => {
    const u = requirePerm(req, "crm.leads.upload");
    const f = req.file;
    if (!f) throw bad("Attach the Excel file");
    const dry = String(req.query.dryRun ?? req.body?.dryRun ?? "") === "1";
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(f.buffer as unknown as ArrayBuffer);
    } catch {
      throw bad("This is not an Excel .xlsx file - download the template and fill it in");
    }
    const ws = wb.worksheets[0];
    if (!ws) throw bad("The file has no sheet");
    const header = (ws.getRow(1).values as unknown[]).map((v) => cellText(v).toLowerCase());
    const col = (re: RegExp) => header.findIndex((x, i) => i > 0 && re.test(x));
    const ci = { name: col(/customer|company/), contact: col(/contact/), phone: col(/phone|whatsapp|mobile/), email: col(/e-?mail/), country: col(/country/), port: col(/port/), address: col(/address/) };
    if (ci.name < 0 || ci.phone < 0 || ci.country < 0) throw bad("Use the template: the columns Customer name, Phone and Country are required");
    const raw: { n: number; v: unknown[] }[] = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n > 1) raw.push({ n, v: row.values as unknown[] });
    });
    if (raw.length > 1000) throw bad("Up to 1,000 rows per file");
    const [countries, ports] = await Promise.all([db().select().from(s.countries), db().select().from(s.ports)]);
    const { findLeadByContact } = await import("../services/crm");
    const seen = new Set<string>();
    const rows: { row: number; name: string; phone: string; email: string; country: string; port: string; status: "ok" | "duplicate" | "error"; note: string; data?: typeof s.leads.$inferInsert }[] = [];
    for (const r of raw) {
      const get = (i: number) => (i > 0 ? cellText(r.v[i]).trim() : "");
      const name = get(ci.name);
      const contact = get(ci.contact);
      const phone = get(ci.phone);
      const email = get(ci.email).toLowerCase();
      const countryIn = get(ci.country);
      const portIn = get(ci.port);
      const address = get(ci.address);
      if (!name && !phone && !email) continue;
      if (/example row/i.test(address)) continue; // the template's sample line
      const errs: string[] = [];
      if (name.length < 2) errs.push("customer name missing");
      if (phone.replace(/\D/g, "").length < 6) errs.push("phone missing or too short");
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errs.push("e-mail looks wrong");
      const country = countries.find((c) => c.code.toLowerCase() === countryIn.toLowerCase() || c.name.toLowerCase() === countryIn.toLowerCase());
      if (!country) errs.push(countryIn ? `unknown country "${countryIn}"` : "country missing");
      const port = country && portIn ? ports.find((p) => p.countryCode === country.code && p.name.toLowerCase() === portIn.toLowerCase()) : undefined;
      if (country && portIn && !port) errs.push(`no port "${portIn}" in ${country.name}`);
      let status: "ok" | "duplicate" | "error" = errs.length ? "error" : "ok";
      let note = errs.join("; ");
      const key = phone.replace(/\D/g, "");
      if (status === "ok") {
        if (seen.has(key) || (email && seen.has(email))) {
          status = "duplicate";
          note = "repeated in this file";
        } else {
          const dup = await findLeadByContact(phone, email || null);
          if (dup) {
            status = "duplicate";
            note = `already a lead: ${dup.customerName}`;
          }
        }
        seen.add(key);
        if (email) seen.add(email);
      }
      rows.push({
        row: r.n,
        name,
        phone,
        email,
        country: country?.name ?? countryIn,
        port: port?.name ?? portIn,
        status,
        note,
        data: status === "ok" ? { customerName: name, contactPerson: contact || name, phone, email: email || null, countryCode: country!.code, portId: port?.id ?? null, address: address || null, status: "new", ownerUserId: u.id, source: "excel", createdBy: u.id } : undefined,
      });
    }
    const ok = rows.filter((r) => r.status === "ok");
    const duplicates = rows.filter((r) => r.status === "duplicate").length;
    const errors = rows.filter((r) => r.status === "error").length;
    if (!dry && ok.length) {
      await db().transaction(async (tx) => {
        const leadIds: string[] = [];
        for (const r of ok) {
          const [lead] = await tx.insert(s.leads).values(r.data!).returning();
          leadIds.push(lead!.id);
          await audit(tx, { actorUserId: u.id, actorKind: "human", action: "lead.created", entity: "lead", entityId: lead!.id, summary: `Imported lead ${lead!.customerName} from Excel (row ${r.row})` });
        }
        const { emit } = await import("../services/events");
        await emit("leads.imported", { leadIds, importedBy: u.name }, { tx });
      });
      const { notify, usersWithPerm } = await import("../services/notify");
      const sup = (await usersWithPerm("crm.leads.view_all")).filter((x) => x !== u.id);
      await notify(sup, { type: "leads_imported", title: `${u.name} imported ${ok.length} lead${ok.length > 1 ? "s" : ""} from Excel`, body: duplicates || errors ? `Skipped: ${duplicates} duplicate(s), ${errors} row(s) with errors` : "No duplicates, no errors", link: "/crm/leads" });
    }
    return { dryRun: dry, total: rows.length, ok: ok.length, duplicates, errors, imported: dry ? 0 : ok.length, rows: rows.map(({ data: _d, ...r }) => r) };
  }),
);

// ── Website account for a CRM customer (create or link) + one-time password ────────────────────────────────
crmOps.post(
  "/leads/:id/website-account",
  h(async (req) => {
    const u = requirePerm(req, "website.customers.manage");
    const [lead] = await db().select().from(s.leads).where(eq(s.leads.id, String(req.params.id))).limit(1);
    if (!lead || (!can(u, "crm.leads.view_all") && lead.ownerUserId !== u.id)) throw notFound();
    const email = lead.email?.trim().toLowerCase();
    if (!email) throw bad("Add the buyer's e-mail to the lead first - it is their sign-in");
    const [role] = await db().select().from(s.roles).where(eq(s.roles.slug, "customer")).limit(1);
    let [user] = lead.customerUserId ? await db().select().from(s.users).where(eq(s.users.id, lead.customerUserId)).limit(1) : [];
    let action: "created" | "linked" | "reset" = user ? "reset" : "linked";
    if (!user) [user] = await db().select().from(s.users).where(sql`lower(${s.users.email}) = ${email}`).limit(1);
    if (user && (user.kind === "staff" || user.kind === "fte")) throw conflict("That e-mail belongs to a staff account");
    const otp = oneTimePassword();
    const hash = await hashPassword(otp);
    if (!user) {
      action = "created";
      [user] = await db().insert(s.users).values({ kind: "customer", name: lead.contactPerson || lead.customerName, email, phone: lead.phone, company: lead.customerName, countryCode: lead.countryCode, roleId: role!.id, passwordHash: hash, mustChangePassword: true }).returning();
    } else {
      // a visitor who chatted becomes a customer: same person, same conversation history
      await db().update(s.users).set({ kind: "customer", roleId: role!.id, passwordHash: hash, mustChangePassword: true, company: user.company ?? lead.customerName, phone: user.phone ?? lead.phone, updatedAt: new Date() }).where(eq(s.users.id, user.id));
      if (action === "reset") await db().delete(s.sessions).where(eq(s.sessions.userId, user.id));
    }
    // every lead with this e-mail belongs to the account
    await db().update(s.leads).set({ customerUserId: user!.id }).where(and(sql`(${s.leads.id} = ${lead.id} or lower(${s.leads.email}) = ${email})`, sql`${s.leads.customerUserId} is null`));
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: `customer.account_${action}`, entity: "lead", entityId: lead.id, summary: `${u.name} ${action === "reset" ? "issued a new one-time password for" : action === "created" ? "created the website account of" : "linked the website account of"} ${lead.customerName}` });
    return { action, userId: user!.id, email, oneTimePassword: otp };
  }),
);
