import { env } from "../env";

/** The model is paid for: a public demo has a daily allowance, so strangers cannot run it dry. */
let budgetDay = "";
let usedToday = 0;
export function countTokens(n: number) {
  const day = new Date().toISOString().slice(0, 10);
  if (day !== budgetDay) {
    budgetDay = day;
    usedToday = 0;
  }
  usedToday += n;
}
export const overBudget = () => env.PUBLIC_DEMO && budgetDay === new Date().toISOString().slice(0, 10) && usedToday >= env.PUBLIC_DEMO_TOKENS_PER_DAY;

/** A cap per person and window. Only a public demo calls it. */
const windows = new Map<string, { n: number; until: number }>();
export function tooMany(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const w = windows.get(key);
  if (!w || w.until < now) {
    if (windows.size > 5000) windows.clear();
    windows.set(key, { n: 1, until: now + windowMs });
    return false;
  }
  w.n += 1;
  return w.n > max;
}
