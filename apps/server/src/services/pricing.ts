import type { PricingPolicy, QuoteLine } from "@autofte/shared";

/**
 * Landed-price engine. Pure and deterministic: Sora never does price arithmetic itself, it calls this.
 * Every line is rounded to the cent first and the totals are the sum of the rounded lines, so the
 * numbers a buyer sees always add up exactly.
 */
export type PriceBasis =
  | { kind: "stock"; priceUsd: number } // stock price is already FOB Yokohama (margin included)
  | { kind: "lot"; bidJpy: number }; // auction: hammer/bid in yen → FOB via fees, FX and margin

export interface QuoteInput {
  basis: PriceBasis;
  m3: number;
  port: { name: string; freightUsdPerM3: number };
  country: { name: string; inspectionRequired: boolean; inspectionFeeUsd: number };
  policy: PricingPolicy;
  discountPct?: number;
}

export interface QuoteResult {
  lines: QuoteLine[];
  fobUsd: number;
  discountUsd: number;
  inspectionUsd: number;
  freightUsd: number;
  insuranceUsd: number;
  /** C&F = FOB − discount + inspection + freight */
  cnfUsd: number;
  /** CIF = C&F + marine insurance */
  cifUsd: number;
  advanceUsd: number;
}

export const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function fobFromLot(bidJpy: number, policy: PricingPolicy): number {
  const jpy = bidJpy + policy.auctionFeeJpy + policy.inlandTransportJpy;
  return cents((jpy / policy.fxJpyPerUsd) * (1 + policy.marginPct / 100));
}

export function quote(input: QuoteInput): QuoteResult {
  const { policy } = input;
  if (!(input.m3 > 0)) throw new Error("Vehicle volume (m³) is required for freight");
  if (!(input.port.freightUsdPerM3 > 0)) throw new Error(`No freight rate for ${input.port.name}`);
  const discountPct = Math.max(0, input.discountPct ?? 0);

  const fobUsd = input.basis.kind === "stock" ? cents(input.basis.priceUsd) : fobFromLot(input.basis.bidJpy, policy);
  const discountUsd = cents((fobUsd * discountPct) / 100);
  const inspectionUsd = input.country.inspectionRequired ? cents(input.country.inspectionFeeUsd) : 0;
  const freightUsd = cents(input.m3 * input.port.freightUsdPerM3);
  const cnfUsd = cents(fobUsd - discountUsd + inspectionUsd + freightUsd);
  const insuranceUsd = cents((cnfUsd * policy.insurancePct) / 100);
  const cifUsd = cents(cnfUsd + insuranceUsd);
  const advanceUsd = cents((cnfUsd * policy.advancePercent) / 100);

  const lines: QuoteLine[] = [
    { label: input.basis.kind === "stock" ? "Vehicle price (FOB Yokohama)" : "Vehicle (auction price + fees, FOB Japan)", usd: fobUsd },
  ];
  if (discountUsd > 0) lines.push({ label: `Discount (${discountPct}%)`, usd: -discountUsd });
  if (inspectionUsd > 0) lines.push({ label: `Pre-shipment inspection (${input.country.name})`, usd: inspectionUsd });
  lines.push({ label: `Ocean freight to ${input.port.name} (${input.m3.toFixed(2)} m³ × $${input.port.freightUsdPerM3})`, usd: freightUsd });
  lines.push({ label: `C&F ${input.port.name}`, usd: cnfUsd });
  lines.push({ label: `Marine insurance (${policy.insurancePct}%)`, usd: insuranceUsd });
  lines.push({ label: `CIF ${input.port.name} (C&F + insurance)`, usd: cifUsd });

  return { lines, fobUsd, discountUsd, inspectionUsd, freightUsd, insuranceUsd, cnfUsd, cifUsd, advanceUsd };
}

/** m³ from millimetres (length × width × height). */
export function m3FromDims(l?: number | null, w?: number | null, h?: number | null): number {
  if (!l || !w || !h) return 0;
  return Math.round(((l * w * h) / 1e9) * 100) / 100;
}

/** Amount in words (USD) for invoices, handles millions. */
export function amountInWords(n: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const chunk = (x: number): string => {
    let s = "";
    if (x >= 100) {
      s += ones[Math.floor(x / 100)] + " Hundred";
      x %= 100;
      if (x) s += " ";
    }
    if (x >= 20) {
      s += tens[Math.floor(x / 10)];
      if (x % 10) s += "-" + ones[x % 10];
    } else if (x > 0) s += ones[x];
    return s;
  };
  const whole = Math.floor(n);
  const c = Math.round((n - whole) * 100);
  if (whole === 0 && c === 0) return "Zero US Dollars";
  const parts: string[] = [];
  const scales: [number, string][] = [
    [1e9, "Billion"],
    [1e6, "Million"],
    [1e3, "Thousand"],
    [1, ""],
  ];
  let rest = whole;
  for (const [v, name] of scales) {
    const q = Math.floor(rest / v);
    if (q) {
      parts.push(chunk(q) + (name ? " " + name : ""));
      rest %= v;
    }
  }
  let out = parts.join(" ") + " US Dollar" + (whole === 1 ? "" : "s");
  if (c) out += ` and ${chunk(c)} Cent${c === 1 ? "" : "s"}`;
  return out;
}
