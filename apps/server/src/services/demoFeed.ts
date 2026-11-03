/**
 * The demo's two auction feeds. A real portal is fed by outside suppliers; those are other people's data, so this demo makes
 * its own: every few minutes a handful of new fictional lots arrive from Feed A and Feed B. Staff can pause a feed on the Data
 * sources screen, and the auction desk says so in the team room when one stops.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../db/client";
import * as s from "../db/schema";
import { env } from "../env";
import { Rng } from "../seed/rng";
import { makeLotRow } from "../seed/auction";
import { today } from "./auction";
import { getSetting, now, putSetting } from "./settings";

export type FeedKey = "A" | "B";
export interface FeedRow {
  paused: boolean;
  lastAt: string | null;
  added: number;
}
type FeedState = Record<FeedKey, FeedRow>;
const EMPTY: FeedState = { A: { paused: false, lastAt: null, added: 0 }, B: { paused: false, lastAt: null, added: 0 } };

export const feedState = async (): Promise<FeedState> => {
  const st = await getSetting<Partial<FeedState>>("demo_feed", {});
  return { A: { ...EMPTY.A, ...st.A }, B: { ...EMPTY.B, ...st.B } };
};

const everyMs = () => env.DEMO_FEED_MINUTES * 60_000;

/** Working = not paused, and it has lots on sale from it. The same sentence everywhere. */
export async function feedSignal() {
  const st = await feedState();
  const t = await today();
  const rows = await db()
    .select({ feed: s.auctionLots.feed, n: sql<number>`count(*)::int`, newest: sql<string | null>`max(${s.auctionLots.createdAt})` })
    .from(s.auctionLots)
    .where(and(eq(s.auctionLots.status, "upcoming"), gte(s.auctionLots.saleDate, t)))
    .groupBy(s.auctionLots.feed);
  const one = (k: FeedKey) => {
    const r = rows.find((x) => x.feed === k);
    return { key: k, onSale: r?.n ?? 0, newestAt: r?.newest ?? null, paused: st[k].paused, lastAt: st[k].lastAt, added: st[k].added, working: !st[k].paused && (r?.n ?? 0) > 0 };
  };
  const a = one("A");
  const b = one("B");
  const text = a.working && b.working ? "Auction is working" : !a.working && !b.working ? "Auction A and B are not working" : `Auction A is ${a.working ? "working" : "not working"} · B is ${b.working ? "working" : "not working"}`;
  return { status: a.working && b.working ? "working" : !a.working && !b.working ? "down" : "partial", text, feeds: [a, b], everyMinutes: env.DEMO_FEED_MINUTES };
}

/** One pass of one feed: a few new lots on the next sale days, none of them a number already used. */
export async function runFeed(key: FeedKey, count?: number): Promise<number> {
  const clock = await now();
  const rng = new Rng((clock.getTime() % 2147483647) + key.charCodeAt(0));
  const halls = await db().select({ id: s.auctionHalls.id }).from(s.auctionHalls);
  const days = await db().selectDistinct({ d: s.auctionLots.saleDate }).from(s.auctionLots).where(and(eq(s.auctionLots.status, "upcoming"), gte(s.auctionLots.saleDate, await today()))).orderBy(s.auctionLots.saleDate).limit(6);
  if (!halls.length || !days.length) return 0;
  const n = count ?? rng.int(3, 8);
  const rows: ReturnType<typeof makeLotRow>[] = [];
  const used = new Set<string>();
  for (let i = 0; i < n; i++) {
    const saleDate = rng.pick(days).d;
    const hallId = rng.pick(halls).id;
    const lotNo = rng.int(10000, 99999);
    const k = `${saleDate}|${hallId}|${lotNo}`;
    if (used.has(k)) continue;
    used.add(k);
    rows.push({ ...makeLotRow(rng, saleDate, hallId, lotNo, "upcoming"), feed: key });
  }
  // the identity (day, hall, number) stops a lot arriving twice
  const inserted = rows.length ? await db().insert(s.auctionLots).values(rows).onConflictDoNothing().returning({ id: s.auctionLots.id }) : [];
  const st = await feedState();
  st[key] = { ...st[key], lastAt: clock.toISOString(), added: st[key].added + inserted.length };
  await putSetting("demo_feed", st);
  return inserted.length;
}

export async function setFeedPaused(key: FeedKey, paused: boolean) {
  const st = await feedState();
  st[key] = { ...st[key], paused };
  await putSetting("demo_feed", st);
  return feedSignal();
}

let timer: NodeJS.Timeout | null = null;

export function startDemoFeed() {
  if (timer || env.DEMO_FEED_MINUTES <= 0) return;
  timer = setInterval(() => {
    void (async () => {
      const st = await feedState();
      for (const k of ["A", "B"] as const) if (!st[k].paused) await runFeed(k);
    })().catch((e) => console.error("[feed]", e));
  }, everyMs());
  timer.unref();
}
