/**
 * How much of a website order is paid now. The buyer picks a share, or types an amount. An order of $3,000 or less must pay
 * at least a quarter now. The same sum runs on the page, and the server's answer is the one that counts.
 */
export const round2 = (n: number) => Math.round(n * 100) / 100;

export function paymentBreakdown(subtotalUsd: number, percent?: number | null, amountUsd?: number | null) {
  const floor = subtotalUsd <= 3000 ? 25 : 0.01;
  const asked = amountUsd && subtotalUsd > 0 ? (amountUsd / subtotalUsd) * 100 : (percent ?? 100);
  const effective = Math.min(100, Math.max(asked, floor));
  const payNowUsd = effective >= 100 ? subtotalUsd : round2((subtotalUsd * effective) / 100);
  return { effectivePercent: effective, floorPercent: floor, payNowUsd, remainingUsd: round2(subtotalUsd - payNowUsd) };
}
