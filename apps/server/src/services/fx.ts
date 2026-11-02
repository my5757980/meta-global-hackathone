import { pricingPolicy } from "./settings";

/** USD/JPY for the top bar. Live from the European Central Bank's public rates; the company's own rate if that cannot be reached. Prices never use it. */
let cached: { usdJpy: number; date: string | null; source: "ecb" | "company"; until: number } | null = null;

export async function usdJpy() {
  if (cached && cached.until > Date.now()) {
    const { until: _until, ...rate } = cached;
    return rate;
  }
  try {
    const r = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=JPY", { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { date?: string; rates?: { JPY?: number } };
    const rate = Number(j.rates?.JPY);
    if (!(rate > 0)) throw new Error("no rate");
    cached = { usdJpy: Math.round(rate * 100) / 100, date: j.date ?? null, source: "ecb", until: Date.now() + 6 * 3600_000 };
  } catch {
    cached = { usdJpy: (await pricingPolicy()).fxJpyPerUsd, date: null, source: "company", until: Date.now() + 10 * 60_000 };
  }
  const { until: _until, ...rate } = cached;
  return rate;
}
