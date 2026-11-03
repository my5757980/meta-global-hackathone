import { and, asc, eq, lte } from "drizzle-orm";
import { db, type DBorTx } from "../db/client";
import { events } from "../db/schema";
import { now } from "./settings";

/**
 * The platform's "nervous system": an outbox table of events. Anything that should make Sora act later
 * (an approved invoice, a recorded payment, a follow-up due tomorrow) is written here in the same
 * transaction as the change, and the scheduler dispatches it to the registered handlers.
 */
type Handler = (payload: Record<string, unknown>, ev: { id: string; type: string }) => Promise<void>;
const handlers = new Map<string, Handler[]>();
let kick: (() => void) | null = null;
let muted = new Set<string>();
/** While the eval suite runs, its test sales must not set the business's reactions off. */
export const muteEvents = (types: string[]) => {
  muted = new Set(types);
};
export const eventsMuted = () => muted.size > 0;

export function on(type: string, fn: Handler) {
  const list = handlers.get(type) ?? [];
  list.push(fn);
  handlers.set(type, list);
}

export async function emit(type: string, payload: Record<string, unknown>, opts: { dueAt?: Date; tx?: DBorTx } = {}) {
  await (opts.tx ?? db()).insert(events).values({ type, payload, dueAt: opts.dueAt ?? new Date() });
  if (!opts.dueAt) setTimeout(() => kick?.(), 50);
}

let running = false;
export async function processDue(limit = 20): Promise<number> {
  if (running) return 0;
  running = true;
  let n = 0;
  try {
    const t = await now();
    const due = await db().select().from(events).where(and(eq(events.status, "pending"), lte(events.dueAt, t))).orderBy(asc(events.dueAt)).limit(limit);
    for (const ev of due) {
      const list = muted.has(ev.type) ? [] : (handlers.get(ev.type) ?? []);
      try {
        for (const fn of list) await fn(ev.payload as Record<string, unknown>, { id: ev.id, type: ev.type });
        await db().update(events).set({ status: list.length ? "done" : "skipped", processedAt: new Date(), attempts: ev.attempts + 1 }).where(eq(events.id, ev.id));
      } catch (e) {
        const attempts = ev.attempts + 1;
        await db()
          .update(events)
          .set({ status: attempts >= 3 ? "failed" : "pending", attempts, lastError: String((e as Error)?.message ?? e).slice(0, 500), dueAt: new Date(Date.now() + 30_000 * attempts) })
          .where(eq(events.id, ev.id));
      }
      n++;
    }
  } finally {
    running = false;
  }
  return n;
}

export function startScheduler(intervalMs = 5000) {
  kick = () => void processDue();
  const t = setInterval(() => void processDue(), intervalMs);
  t.unref();
}
