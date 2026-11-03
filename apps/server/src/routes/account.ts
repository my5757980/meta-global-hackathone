import { Router } from "express";
import multer from "multer";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import * as s from "../db/schema";
import { bad, forbidden, h, HttpError, notFound, parse } from "../lib/http";
import { requireAuth, type AuthUser } from "../auth/session";
import { env } from "../env";
import { getInvoiceFull } from "../services/crm";
import { getFile, saveFile } from "../services/files";
import { invoicePdf } from "../services/invoiceDocs";
import { tooMany } from "../services/publicDemo";
import { receiveSlip, sampleSlip } from "../services/slips";

export const accountRouter = Router();
const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024, files: 1 } });
const slipUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

/**
 * Leads linked to this signed-in customer. Linked only: anyone can type someone's e-mail when signing up
 * (nothing verifies it), so a matching address alone must never open a buyer's invoices. Staff link it.
 */
async function myLeadIds(u: AuthUser): Promise<string[]> {
  if (u.kind !== "customer") return [];
  const rows = await db().select({ id: s.leads.id }).from(s.leads).where(eq(s.leads.customerUserId, u.id));
  return rows.map((r) => r.id);
}

/** Customer-safe invoice shape: internal figures (push price, FX, M3 rate, costs, rejection notes) never leave the CRM. */
async function invoiceForCustomer(invId: string) {
  const [inv] = await db().select().from(s.invoices).where(eq(s.invoices.id, invId)).limit(1);
  if (!inv) return null;
  const vehicles = await db().select().from(s.invoiceVehicles).where(eq(s.invoiceVehicles.invoiceId, inv.id)).orderBy(s.invoiceVehicles.position);
  const payments = await db().select().from(s.payments).where(eq(s.payments.invoiceId, inv.id)).orderBy(s.payments.receivedDate);
  const [port] = inv.consigneePortId ? await db().select().from(s.ports).where(eq(s.ports.id, inv.consigneePortId)).limit(1) : [];
  const total = Number(inv.totalCnfUsd);
  const paid = Math.round(payments.reduce((a, p) => a + Number(p.amountUsd), 0) * 100) / 100;
  const vs = [];
  // a payment covers the cars in invoice order, so each car can say what is still owed on it
  let unallocated = paid;
  for (const v of vehicles) {
    const progress = await db().select({ stage: s.vehicleProgress.stage, date: s.vehicleProgress.stageDate, note: s.vehicleProgress.note }).from(s.vehicleProgress).where(eq(s.vehicleProgress.invoiceVehicleId, v.id)).orderBy(s.vehicleProgress.createdAt);
    const [unit] = await db().select({ id: s.units.id }).from(s.units).where(eq(s.units.invoiceVehicleId, v.id)).limit(1);
    const docs = unit
      ? await db().select({ id: s.unitDocuments.id, folder: s.unitDocuments.folder, fileId: s.unitDocuments.fileId, name: s.files.originalName, mime: s.files.mime, size: s.files.size, createdAt: s.unitDocuments.createdAt }).from(s.unitDocuments).innerJoin(s.files, eq(s.files.id, s.unitDocuments.fileId)).where(eq(s.unitDocuments.unitId, unit.id)).orderBy(s.unitDocuments.folder)
      : [];
    const cnf = Number(v.cnfUsd);
    const paidHere = Math.round(Math.min(cnf, Math.max(0, unallocated)) * 100) / 100;
    unallocated -= paidHere;
    vs.push({ paidUsd: paidHere, remainingUsd: Math.round((cnf - paidHere) * 100) / 100, id: v.id, label: `${v.year ?? ""} ${v.unitLabel}`.trim(), color: v.color, chassisNo: v.chassisNo, transmission: v.transmission, fuel: v.fuel, cnfUsd: Number(v.cnfUsd), progress, documents: docs });
  }
  // the running story the buyer reads on the invoice: each payment with its balance, each new file, each stage
  let running = 0;
  const paymentRows = payments.map((p) => {
    running += Number(p.amountUsd);
    return { date: p.receivedDate, amountUsd: Number(p.amountUsd), balanceAfter: Math.round((total - running) * 100) / 100, at: p.createdAt };
  });
  const timeline: { at: string; kind: string; text: string }[] = [];
  if (inv.approvedAt) timeline.push({ at: new Date(inv.approvedAt).toISOString(), kind: "invoice", text: `Invoice ${inv.number} approved.` });
  if (inv.sentAt) timeline.push({ at: new Date(inv.sentAt).toISOString(), kind: "invoice", text: `Invoice ${inv.number} sent to you.` });
  for (const r of paymentRows) timeline.push({ at: new Date(r.at).toISOString(), kind: "payment", text: `Payment received on ${r.date}: $${r.amountUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })}. Balance remaining: $${r.balanceAfter.toLocaleString("en-US", { minimumFractionDigits: 2 })}.` });
  for (const v of vs) {
    for (const d of v.documents) timeline.push({ at: new Date(d.createdAt).toISOString(), kind: "document", text: `New document added, ${d.folder}: ${d.name ?? "file"}` });
    for (const g of v.progress) timeline.push({ at: new Date(`${g.date}T12:00:00Z`).toISOString(), kind: "stage", text: `${v.label}: ${g.stage}${g.note ? `. ${g.note}` : ""}` });
  }
  timeline.sort((x, y) => y.at.localeCompare(x.at));
  const firstPicture = vs.flatMap((v) => v.documents).find((d) => d.mime.startsWith("image/"));
  return {
    orderState: total > 0 && total - paid <= 0.01 ? "Completed" : paid > 0 ? "Processing" : "On hold",
    salesperson: inv.salesperson ?? null,
    thumbnail: firstPicture ? `/api/account/files/${firstPicture.fileId}` : null,
    timeline,
    id: inv.id,
    number: inv.number,
    status: inv.status === "pending" ? "awaiting_approval" : inv.status,
    createdAt: inv.createdAt,
    approvedAt: inv.approvedAt,
    consigneeName: inv.consigneeName,
    port: port?.name ?? null,
    advancePercent: inv.advancePercent,
    totals: { total, advance: Math.round(((total * inv.advancePercent) / 100) * 100) / 100, paid, balance: Math.round((total - paid) * 100) / 100 },
    payments: paymentRows.map(({ date, amountUsd, balanceAfter }) => ({ date, amountUsd, balanceAfter })),
    vehicles: vs,
    demoSlips: env.DEMO_MODE, // the demo has no bank, so it can print a slip to send
  };
}

accountRouter.get(
  "/invoices/:id/pdf",
  h(async (req, res) => {
    const u = requireAuth(req);
    const leadIds = await myLeadIds(u);
    const [inv] = leadIds.length ? await db().select({ id: s.invoices.id, status: s.invoices.status }).from(s.invoices).where(and(eq(s.invoices.id, String(req.params.id)), inArray(s.invoices.leadId, leadIds))).limit(1) : [];
    if (!inv || !["approved", "sent"].includes(inv.status)) throw notFound("Invoice not found");
    const full = await getInvoiceFull(inv.id);
    if (!full) throw notFound("Invoice not found");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${full.invoice.number}.pdf"`);
    const final = full.invoice.finalPdfFileId ? await getFile(full.invoice.finalPdfFileId) : null;
    if (final) {
      res.sendFile(final.abs, { dotfiles: "allow" });
      return undefined;
    }
    res.send(await invoicePdf(full));
    return undefined;
  }),
);

accountRouter.get(
  "/invoices",
  h(async (req) => {
    const u = requireAuth(req);
    const leadIds = await myLeadIds(u);
    if (!leadIds.length) return [];
    const invs = await db().select({ id: s.invoices.id }).from(s.invoices).where(and(inArray(s.invoices.leadId, leadIds), inArray(s.invoices.status, ["pending", "approved", "sent"]))).orderBy(desc(s.invoices.createdAt));
    const out = [];
    for (const i of invs) out.push(await invoiceForCustomer(i.id));
    return out.filter(Boolean);
  }),
);

accountRouter.get(
  "/invoices/:id",
  h(async (req) => {
    const u = requireAuth(req);
    const leadIds = await myLeadIds(u);
    const [inv] = await db().select({ id: s.invoices.id, leadId: s.invoices.leadId, status: s.invoices.status }).from(s.invoices).where(eq(s.invoices.id, String(req.params.id))).limit(1);
    if (!inv || !leadIds.includes(inv.leadId) || inv.status === "rejected") throw notFound();
    return invoiceForCustomer(inv.id);
  }),
);

/** The buyer's own open invoice, or nothing. */
async function takeSlip(u: AuthUser, invoiceId: string, buf: Buffer, mime: string, name: string) {
  const leadIds = await myLeadIds(u);
  const [inv] = leadIds.length ? await db().select({ id: s.invoices.id, number: s.invoices.number, status: s.invoices.status }).from(s.invoices).where(and(eq(s.invoices.id, invoiceId), inArray(s.invoices.leadId, leadIds))).limit(1) : [];
  if (!inv || !["approved", "sent"].includes(inv.status)) throw notFound("Invoice not found");
  if (env.PUBLIC_DEMO && tooMany(`slip:${u.id}`, 6, 10 * 60_000)) throw new HttpError(429, "This is a shared public demo: please wait a few minutes before sending more.");
  return receiveSlip(u.id, inv, buf, mime, name);
}

accountRouter.post(
  "/invoices/:id/slip",
  slipUpload.single("file"),
  h(async (req) => {
    const u = requireAuth(req);
    const file = req.file;
    if (!file) throw bad("Choose a picture of the bank slip");
    if (!/^image\/(png|jpeg|webp)$/.test(file.mimetype)) throw bad("Send the slip as a picture: JPG or PNG");
    return takeSlip(u, String(req.params.id), file.buffer, file.mimetype, file.originalname);
  }),
);

/** The app uploads its picture the way the chat does, then names it here. */
accountRouter.post(
  "/invoices/:id/slip-file",
  h(async (req) => {
    const u = requireAuth(req);
    const b = parse(z.object({ fileId: z.string().min(8).max(60) }), req.body);
    const f = await getFile(b.fileId);
    if (!f || f.ownerUserId !== u.id || !/^image\/(png|jpeg|webp)$/.test(f.mime)) throw bad("Send the slip as a picture: JPG or PNG");
    const { readFileSync } = await import("node:fs");
    return takeSlip(u, String(req.params.id), readFileSync(f.abs), f.mime, f.originalName ?? "slip");
  }),
);

/** The demo has no bank: this prints the slip a buyer would photograph, with this invoice's real figures, and sends it the same way. */
accountRouter.post(
  "/invoices/:id/demo-slip",
  h(async (req) => {
    const u = requireAuth(req);
    if (!env.DEMO_MODE) throw notFound();
    const b = parse(z.object({ part: z.enum(["advance", "balance"]) }), req.body ?? {});
    const full = await getInvoiceFull(String(req.params.id));
    if (!full) throw notFound("Invoice not found");
    const png = await sampleSlip(full, b.part);
    if (!png) throw bad("Nothing is owed on this invoice");
    return takeSlip(u, full.invoice.id, png, "image/png", `slip-${full.invoice.number}.png`);
  }),
);

/** A document of the customer's own vehicle — ownership checked through unit → invoice → lead. */
/** A customer's own picture. Anyone signed in may see it: it stands beside their name in a chat. */
accountRouter.post(
  "/avatar",
  avatarUpload.single("file"),
  h(async (req) => {
    const u = requireAuth(req);
    const f = req.file;
    if (!f) throw bad("Choose a picture");
    if (!/^image\/(png|jpeg|webp)$/.test(f.mimetype)) throw bad("A profile picture must be PNG, JPG or WebP");
    const saved = await saveFile(f.buffer, { kind: "avatars", mime: f.mimetype, originalName: f.originalname, ownerUserId: u.id });
    const url = `/api/account/avatar/${saved.id}`;
    await db().update(s.users).set({ avatarUrl: url }).where(eq(s.users.id, u.id));
    return { avatarUrl: url };
  }),
);
accountRouter.delete(
  "/avatar",
  h(async (req) => {
    const u = requireAuth(req);
    await db().update(s.users).set({ avatarUrl: null }).where(eq(s.users.id, u.id));
    return { ok: true };
  }),
);
accountRouter.get(
  "/avatar/:fileId",
  h(async (req, res) => {
    requireAuth(req);
    const f = await getFile(String(req.params.fileId));
    if (!f || f.kind !== "avatars") throw notFound();
    res.type(f.mime);
    res.sendFile(f.abs, { dotfiles: "allow" });
    return undefined;
  }),
);

accountRouter.get(
  "/files/:fileId",
  h(async (req, res) => {
    const u = requireAuth(req);
    const leadIds = await myLeadIds(u);
    const [row] = await db()
      .select({ leadId: s.invoices.leadId })
      .from(s.unitDocuments)
      .innerJoin(s.units, eq(s.units.id, s.unitDocuments.unitId))
      .innerJoin(s.invoices, eq(s.invoices.id, s.units.invoiceId))
      .where(eq(s.unitDocuments.fileId, String(req.params.fileId)))
      .limit(1);
    if (!row || !leadIds.includes(row.leadId)) throw notFound();
    const f = await getFile(String(req.params.fileId));
    if (!f) throw notFound();
    res.setHeader("Content-Type", f.mime);
    res.setHeader("Content-Disposition", `${req.query.download ? "attachment" : "inline"}; filename="${(f.originalName ?? "document").replace(/"/g, "")}"`);
    res.sendFile(f.abs, { dotfiles: "allow" }); // stored under .data/ — send() treats dot-folders as missing by default
    return undefined;
  }),
);

accountRouter.get(
  "/profile",
  h(async (req) => {
    const u = requireAuth(req);
    const [p] = await db().select({ name: s.users.name, email: s.users.email, phone: s.users.phone, company: s.users.company, countryCode: s.users.countryCode, city: s.users.city, address: s.users.address, kind: s.users.kind }).from(s.users).where(eq(s.users.id, u.id)).limit(1);
    return p;
  }),
);

accountRouter.put(
  "/profile",
  h(async (req) => {
    const u = requireAuth(req);
    if (u.kind !== "customer") throw forbidden();
    const b = parse(z.object({ name: z.string().trim().min(2).max(80), phone: z.string().trim().min(6).max(30), company: z.string().trim().max(120).optional(), countryCode: z.string().length(2).optional(), city: z.string().max(80).optional(), address: z.string().max(200).optional() }), req.body);
    await db().update(s.users).set({ ...b, updatedAt: new Date() }).where(eq(s.users.id, u.id));
    return { ok: true };
  }),
);
