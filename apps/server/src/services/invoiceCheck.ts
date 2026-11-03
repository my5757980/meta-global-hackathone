import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../db/client";
import * as s from "../db/schema";
import { getInvoiceFull } from "./crm";
import { quote } from "./pricing";
import { envelope, pricingPolicy } from "./settings";

export interface RubricCheck {
  name: string;
  pass: boolean;
  detail: string;
}

/** The price engine's C&F for one car on this invoice's port: what a line should cost at the most. */
export async function policyPrice(vehicleId: string, portId: string, countryCode: string) {
  const [v] = await db().select().from(s.vehicles).where(eq(s.vehicles.id, vehicleId)).limit(1);
  const [port] = await db().select().from(s.ports).where(eq(s.ports.id, portId)).limit(1);
  const [country] = await db().select().from(s.countries).where(eq(s.countries.code, countryCode)).limit(1);
  if (!v || !port || !country || !v.m3) return null;
  const q = quote({ basis: { kind: "stock", priceUsd: Number(v.discountPriceUsd ?? v.priceUsd) }, m3: Number(v.m3), port, country, policy: await pricingPolicy() });
  return { pushUsd: q.fobUsd, cnfUsd: q.cnfUsd };
}

/**
 * The invoice rubric: pass or fail, in code, so the same checks run when the FTE reads them and again when it tries to
 * approve. A person's approval on the same screen does not go through this.
 */
export async function invoiceRubric(invoiceId: string) {
  const full = await getInvoiceFull(invoiceId);
  if (!full) return null;
  const inv = full.invoice;
  const env0 = await envelope();
  const checks: RubricCheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  add("Consignee is complete", !!inv.consigneeName && !!inv.consigneePhone && !!inv.consigneeCountryCode && !!inv.consigneePortId, `name "${inv.consigneeName}", phone "${inv.consigneePhone}", country ${inv.consigneeCountryCode ?? "missing"}, port ${full.port?.name ?? "missing"}`);
  add("It is still waiting for a decision", inv.status === "pending", `status ${inv.status}`);
  add("Every car has a price", full.vehicles.length > 0 && full.vehicles.every((v) => Number(v.cnfUsd) > 0), full.vehicles.map((v) => `${v.unitLabel} $${Number(v.cnfUsd)}`).join("; "));

  // no other live invoice holds the same car, and no car has been sold from under this one
  const stock = full.vehicles.map((v) => v.vehicleId).filter(Boolean) as string[];
  if (stock.length) {
    const cars = await db().select({ id: s.vehicles.id, stockNo: s.vehicles.stockNo, status: s.vehicles.status }).from(s.vehicles).where(inArray(s.vehicles.id, stock));
    const sold = cars.filter((c) => c.status === "sold");
    add("No car has been sold", !sold.length, sold.length ? `sold: ${sold.map((c) => c.stockNo).join(", ")}` : "all still held");
    const others = await db()
      .select({ number: s.invoices.number, vehicleId: s.invoiceVehicles.vehicleId })
      .from(s.invoiceVehicles)
      .innerJoin(s.invoices, eq(s.invoices.id, s.invoiceVehicles.invoiceId))
      .where(and(inArray(s.invoiceVehicles.vehicleId, stock), ne(s.invoices.id, inv.id), inArray(s.invoices.status, ["pending", "approved", "sent"])));
    add("No other invoice holds these cars", !others.length, others.length ? `also on ${others.map((o) => o.number).join(", ")}` : "none");
  }

  // the price: the accepted quote when there is one, otherwise the price engine less the largest discount allowed
  const [q] = inv.quoteId ? await db().select().from(s.quotes).where(eq(s.quotes.id, inv.quoteId)).limit(1) : [];
  if (q && full.vehicles.length === 1) {
    const off = Math.abs(Number(q.totalCnfUsd) - Number(full.vehicles[0]!.cnfUsd));
    add("The price is the accepted quote", off <= 1, `quote $${Number(q.totalCnfUsd)}, invoice $${Number(full.vehicles[0]!.cnfUsd)}`);
    // a bigger discount counts only if it was asked for and approved in this same chat
    const pct = Number(q.discountPct);
    const [agreed] = pct > env0.chiefMaxDiscountPct && q.conversationId ? await db().select({ id: s.approvals.id }).from(s.approvals).where(and(eq(s.approvals.kind, "discount"), eq(s.approvals.status, "approved"), eq(s.approvals.conversationId, q.conversationId), sql`(${s.approvals.payload}->>'discountPct')::numeric >= ${pct}`)).limit(1) : [];
    add("The quote's discount is inside the limit", pct <= env0.chiefMaxDiscountPct || !!agreed, agreed ? `${pct}%, approved` : `${pct}%`);
  } else if (inv.consigneePortId && inv.consigneeCountryCode) {
    for (const v of full.vehicles) {
      if (!v.vehicleId || !(Number(v.cnfUsd) > 0)) continue;
      const p = await policyPrice(v.vehicleId, inv.consigneePortId, inv.consigneeCountryCode);
      if (!p) continue;
      const floor = Math.round(p.cnfUsd * (1 - env0.maxDiscountPct / 100) * 100) / 100;
      add(`${v.unitLabel}: the price is not below the policy`, Number(v.cnfUsd) >= floor, `invoice $${Number(v.cnfUsd)}, policy $${p.cnfUsd}, lowest allowed $${floor}`);
    }
  }
  // an auction car: only one the company actually won can be invoiced
  for (const v of full.vehicles) {
    if (!v.auctionLotId) continue;
    const [won] = await db().select({ id: s.auctionBids.id }).from(s.auctionBids).where(and(eq(s.auctionBids.lotId, v.auctionLotId), eq(s.auctionBids.status, "won"))).limit(1);
    add(`${v.unitLabel}: the auction lot was won`, !!won, won ? "won" : "no winning bid on this lot");
  }
  const total = Number(inv.totalCnfUsd);
  const withinLimit = total <= env0.invoiceAutoApproveUsd;
  return {
    number: inv.number,
    status: inv.status,
    totalCnfUsd: total,
    consignee: inv.consigneeName,
    port: full.port?.name ?? null,
    country: full.country?.name ?? null,
    vehicles: full.vehicles.map((v) => ({ id: v.id, vehicleId: v.vehicleId, label: v.unitLabel, pushUsd: Number(v.pushUsd), cnfUsd: Number(v.cnfUsd) })),
    checks,
    allPass: checks.every((c) => c.pass),
    failing: checks.filter((c) => !c.pass).map((c) => `${c.name}: ${c.detail}`),
    limitUsd: env0.invoiceAutoApproveUsd,
    withinLimit,
  };
}
