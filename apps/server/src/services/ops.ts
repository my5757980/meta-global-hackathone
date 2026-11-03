import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { and, eq, inArray, sql } from "drizzle-orm";
import { PROGRESS_STAGES } from "@autofte/shared";
import { db } from "../db/client";
import * as s from "../db/schema";
import { ROOT, env } from "../env";
import { photoFor } from "../seed/photos";
import { audit } from "./audit";
import { carSvg } from "./carArt";
import { colorHex } from "../seed/catalog";
import type { Actor } from "./crm";
import { emit } from "./events";
import { saveFile } from "./files";
import { now, pricingPolicy } from "./settings";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** A unit for one car on an invoice, filled from the stock record or the auction lot. Doing it twice changes nothing. */
export async function ensureUnit(invoiceVehicleId: string, actor: Actor) {
  const [iv] = await db().select().from(s.invoiceVehicles).where(eq(s.invoiceVehicles.id, invoiceVehicleId)).limit(1);
  if (!iv) return null;
  const [exists] = await db().select().from(s.units).where(eq(s.units.invoiceVehicleId, iv.id)).limit(1);
  if (exists) return exists;
  const [car] = iv.vehicleId
    ? await db().select({ v: s.vehicles, brand: s.brands.name, model: s.vehicleModels.name }).from(s.vehicles).innerJoin(s.brands, eq(s.brands.id, s.vehicles.brandId)).innerJoin(s.vehicleModels, eq(s.vehicleModels.id, s.vehicles.modelId)).where(eq(s.vehicles.id, iv.vehicleId)).limit(1)
    : [];
  const [lot] = iv.auctionLotId ? await db().select().from(s.auctionLots).where(eq(s.auctionLots.id, iv.auctionLotId)).limit(1) : [];
  const words = iv.unitLabel.split(" ");
  const chassis = iv.chassisNo || car?.v.chassisNo || (lot ? `${lot.modelCode}-${String(lot.lotNo).padStart(4, "0")}${iv.id.slice(-3).toUpperCase()}` : `CH-${iv.id.slice(-8).toUpperCase()}`);
  const values = {
    invoiceId: iv.invoiceId,
    invoiceVehicleId: iv.id,
    make: car?.brand ?? lot?.make ?? words[0] ?? "Car",
    model: car?.model ?? lot?.model ?? (words.slice(1).join(" ") || iv.unitLabel),
    year: iv.year ?? car?.v.year ?? lot?.year ?? null,
    color: iv.color ?? car?.v.color ?? lot?.color ?? null,
    chassis,
    engineCc: car?.v.engineCc ?? lot?.engineCc ?? null,
    drive: car?.v.drive ?? lot?.drive ?? null,
    fuel: iv.fuel ?? car?.v.fuel ?? lot?.fuel ?? null,
    mileageKm: car?.v.mileageKm ?? lot?.mileageKm ?? null,
    transmission: iv.transmission ?? car?.v.transmission ?? lot?.transmission ?? null,
    steering: car?.v.steering ?? null,
    doors: car?.v.doors ?? null,
    seats: car?.v.seats ?? null,
    location: car?.v.location ? `${car.v.location} yard` : "Yokohama yard",
    createdBy: actor.userId,
  };
  return db().transaction(async (tx) => {
    const [un] = await tx.insert(s.units).values(values).returning();
    await tx.insert(s.unitFinancials).values({ unitId: un!.id, sellingPriceUsd: iv.cnfUsd });
    if (!iv.chassisNo) await tx.update(s.invoiceVehicles).set({ chassisNo: chassis }).where(eq(s.invoiceVehicles.id, iv.id));
    await audit(tx, { actorUserId: actor.userId, actorKind: actor.kind, action: "unit.created", entity: "unit", entityId: un!.id, fteRunId: actor.fteRunId, summary: `${actor.name} made unit ${values.make} ${values.model} (${chassis})` });
    return un!;
  });
}

/** The costing lines from what the company paid and the policy's fees. */
export async function fillCosting(unitId: string, actor: Actor) {
  const [un] = await db().select().from(s.units).where(eq(s.units.id, unitId)).limit(1);
  if (!un?.invoiceVehicleId) return;
  const [iv] = await db().select().from(s.invoiceVehicles).where(eq(s.invoiceVehicles.id, un.invoiceVehicleId)).limit(1);
  const [car] = iv?.vehicleId ? await db().select().from(s.vehicles).where(eq(s.vehicles.id, iv.vehicleId)).limit(1) : [];
  const [lot] = iv?.auctionLotId ? await db().select().from(s.auctionLots).where(eq(s.auctionLots.id, iv.auctionLotId)).limit(1) : [];
  const [inv] = await db().select().from(s.invoices).where(eq(s.invoices.id, un.invoiceId)).limit(1);
  const [port] = inv?.consigneePortId ? await db().select().from(s.ports).where(eq(s.ports.id, inv.consigneePortId)).limit(1) : [];
  const policy = await pricingPolicy();
  const buying = car?.costJpy ?? lot?.resultPriceJpy ?? lot?.avgPriceJpy ?? 0;
  const freightUsd = port && car?.m3 ? Number(port.freightUsdPerM3) * Number(car.m3) : 0;
  const lines = {
    lotNo: lot ? String(lot.lotNo) : null,
    auctionName: null,
    buyingJpy: Math.round(Number(buying)),
    auctionFeeJpy: policy.auctionFeeJpy,
    domesticJpy: policy.inlandTransportJpy,
    freightJpy: Math.round(freightUsd * policy.fxJpyPerUsd),
    docJpy: 4000,
    dhlJpy: 6000,
    fxRate: policy.fxJpyPerUsd,
    sellingPriceUsd: iv?.cnfUsd ?? null,
    updatedAt: new Date(),
  };
  await db().transaction(async (tx) => {
    await tx.insert(s.unitFinancials).values({ unitId, ...lines }).onConflictDoUpdate({ target: s.unitFinancials.unitId, set: lines });
    await audit(tx, { actorUserId: actor.userId, actorKind: actor.kind, action: "unit.costing", entity: "unit", entityId: unitId, fteRunId: actor.fteRunId, summary: `${actor.name} filled the costing for ${un.make} ${un.model}` });
  });
}

/** One shipping stage, once. The history is append-only, so a repeated signal changes nothing. */
export async function addProgress(invoiceVehicleId: string, stage: string, note: string | null, actor: Actor) {
  if (!(PROGRESS_STAGES as readonly string[]).includes(stage)) throw new Error(`Unknown stage ${stage}`);
  const [iv] = await db().select().from(s.invoiceVehicles).where(eq(s.invoiceVehicles.id, invoiceVehicleId)).limit(1);
  if (!iv) return false;
  const [done] = await db().select({ id: s.vehicleProgress.id }).from(s.vehicleProgress).where(and(eq(s.vehicleProgress.invoiceVehicleId, iv.id), eq(s.vehicleProgress.stage, stage))).limit(1);
  if (done) return false;
  const day = isoDay(await now());
  await db().transaction(async (tx) => {
    await tx.insert(s.vehicleProgress).values({ invoiceVehicleId: iv.id, stage, stageDate: day, note, createdBy: actor.userId });
    await audit(tx, { actorUserId: actor.userId, actorKind: actor.kind, action: "progress.updated", entity: "invoice", entityId: iv.invoiceId, fteRunId: actor.fteRunId, summary: `${actor.name} set ${iv.unitLabel} to "${stage}"` });
    await emit("progress.updated", { invoiceVehicleId: iv.id, stage, note }, { tx });
  });
  return true;
}

export async function stagesDone(invoiceVehicleId: string) {
  const rows = await db().select({ stage: s.vehicleProgress.stage }).from(s.vehicleProgress).where(eq(s.vehicleProgress.invoiceVehicleId, invoiceVehicleId));
  return rows.map((r) => r.stage);
}

/** A website order's status, told to the buyer in their own thread, the same way staff do it. */
export async function setWebOrderStatus(orderId: string, status: string, actor: Actor) {
  const [o] = await db().select().from(s.webOrders).where(eq(s.webOrders.id, orderId)).limit(1);
  if (!o) return null;
  if (status === o.status) return o;
  await db().transaction(async (tx) => {
    await tx.update(s.webOrders).set({ status }).where(eq(s.webOrders.id, orderId));
    await audit(tx, { actorUserId: actor.userId, actorKind: actor.kind, action: "web_order.status", entity: "web_order", entityId: orderId, fteRunId: actor.fteRunId, summary: `Order ${o.orderNo}: ${o.status} to ${status} (${actor.name})` });
  });
  const { ensureCustomerConversation, postMessage } = await import("./chat");
  const conv = await ensureCustomerConversation(o.userId, "web");
  await postMessage({ conversationId: conv.id, senderUserId: null, kind: "system", body: `Order ${o.orderNo} is now ${status}.`, meta: { webOrderId: orderId, orderNo: o.orderNo, status } }).catch((e) => console.error("[order status]", e));
  return o;
}

// ---------- the outside world in demo mode: a yard and a shipping line that send signals and paperwork ----------
const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A document as a picture, because a real one reaches the office as a scan. Marked DEMO on its face. */
export function documentPng(title: string, rows: [string, string][]): Buffer {
  const lines = rows
    .map(([k, v], i) => `<text x="70" y="${250 + i * 46}" font-size="24" fill="#555" font-family="Arial, Helvetica, sans-serif">${esc(k)}</text><text x="370" y="${250 + i * 46}" font-size="26" fill="#111" font-family="Arial, Helvetica, sans-serif">${esc(v)}</text>`)
    .join("");
  const h = 340 + rows.length * 46;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${h}" viewBox="0 0 1000 ${h}"><rect width="1000" height="${h}" fill="#fbfaf6"/><rect x="30" y="30" width="940" height="${h - 60}" fill="none" stroke="#1a2b6d" stroke-width="3"/><text x="500" y="110" font-size="38" font-weight="bold" text-anchor="middle" fill="#1a2b6d" font-family="Arial, Helvetica, sans-serif">${esc(title)}</text><text x="500" y="160" font-size="20" text-anchor="middle" fill="#a33" font-family="Arial, Helvetica, sans-serif">SAMPLE, PRINTED BY THE DEMO COMPANY</text><line x1="70" y1="190" x2="930" y2="190" stroke="#999"/>${lines}</svg>`;
  return Buffer.from(new Resvg(svg, { fitTo: { mode: "width", value: 1000 }, font: { loadSystemFonts: true, defaultFontFamily: "Arial" } }).render().asPng());
}

/** A bank transfer slip for the demo: the picture a buyer would photograph. */
export function slipPng(s0: { amountUsd: number; date: string; reference: string; invoiceNumber: string; beneficiaryName: string; beneficiaryAccount: string; bank: string; sender: string; senderBank?: string }): Buffer {
  return documentPng("TELEGRAPHIC TRANSFER RECEIPT", [
    ["Sender", s0.sender],
    ["Sending bank", s0.senderBank ?? "Demo Commercial Bank"],
    ["Beneficiary", s0.beneficiaryName],
    ["Beneficiary account", s0.beneficiaryAccount],
    ["Beneficiary bank", s0.bank],
    ["Amount", `USD ${s0.amountUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
    ["Value date", s0.date],
    ["Transaction reference", s0.reference],
    ["Payment details", `Invoice ${s0.invoiceNumber}`],
  ]);
}

/** What the yard and shipping line send for a stage. Only in demo mode: a real company plugs in its own feeds. */
const PAPERWORK: Record<string, { title: string; type: string }[]> = {
  "Car Booked": [{ title: "AUCTION DETAILS", type: "doc" }],
  "Inspection/Yard": [{ title: "PRE-SHIPMENT INSPECTION CERTIFICATE", type: "doc" }],
  "In Yard": [{ title: "Yard picture", type: "photo" }],
  Shipped: [
    { title: "EXPORT CERTIFICATE", type: "doc" },
    { title: "BILL OF LADING", type: "doc" },
  ],
  "Delivered to port": [{ title: "COURIER RECEIPT", type: "doc" }],
};

export async function paperworkFor(stage: string, unit: typeof s.units.$inferSelect, uploaderId: string): Promise<{ fileId: string; title: string }[]> {
  const out: { fileId: string; title: string }[] = [];
  const common: [string, string][] = [
    ["Vehicle", `${unit.year ?? ""} ${unit.make} ${unit.model}`.trim()],
    ["Chassis No.", unit.chassis ?? "-"],
    ["Colour", unit.color ?? "-"],
    ["Date", isoDay(await now())],
  ];
  for (const d of PAPERWORK[stage] ?? []) {
    let buf: Buffer;
    let mime = "image/png";
    if (d.type === "photo") {
      const p = photoFor(unit.make, unit.model, unit.color ?? "");
      const abs = p ? resolve(ROOT, "apps/web/public/cars", p.file) : "";
      if (p && existsSync(abs)) {
        buf = readFileSync(abs);
        mime = "image/jpeg";
      } else {
        buf = Buffer.from(new Resvg(carSvg({ body: "SUV", color: colorHex(unit.color ?? ""), view: "side" }), { fitTo: { mode: "width", value: 800 } }).render().asPng());
      }
    } else {
      const extra: [string, string][] = d.title === "BILL OF LADING" ? [["Vessel", "Pacific Star V.026"], ["Port of loading", "Yokohama, Japan"]] : d.title === "COURIER RECEIPT" ? [["Courier", "Harbor Express Courier"], ["Tracking No.", `HX${unit.id.slice(-8).toUpperCase()}`]] : [["Issued by", "Yokohama Vehicle Yard"]];
      buf = documentPng(d.title, [...common, ...extra]);
    }
    const f = await saveFile(buf, { kind: "unit-docs", mime, originalName: `${slugTitle(d.title)}-${(unit.chassis ?? unit.id).toLowerCase()}.${mime === "image/png" ? "png" : "jpg"}`, ownerUserId: uploaderId });
    out.push({ fileId: f.id, title: d.title });
  }
  return out;
}
const slugTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-");

export const feedOn = () => env.DEMO_MODE;

/** The demo world's next signals for a car, on the demo clock. */
export async function scheduleSignal(invoiceVehicleId: string, stage: string, daysFromNow: number) {
  const t = await now();
  await emit("ops.signal", { invoiceVehicleId, stage }, { dueAt: new Date(t.getTime() + daysFromNow * 86400_000) });
}

/** Paid so far on each of the invoice's cars' invoice: the balance decides when a car may ship. */
export async function balanceOf(invoiceId: string) {
  const [inv] = await db().select({ total: s.invoices.totalCnfUsd }).from(s.invoices).where(eq(s.invoices.id, invoiceId)).limit(1);
  const [p] = (await db().select({ paid: sql<number>`coalesce(sum(${s.payments.amountUsd}),0)::float` }).from(s.payments).where(eq(s.payments.invoiceId, invoiceId))) as [{ paid: number }];
  return Math.round((Number(inv?.total ?? 0) - p.paid) * 100) / 100;
}

export async function markSold(vehicleIds: string[]) {
  if (vehicleIds.length) await db().update(s.vehicles).set({ status: "sold" }).where(inArray(s.vehicles.id, vehicleIds));
}
