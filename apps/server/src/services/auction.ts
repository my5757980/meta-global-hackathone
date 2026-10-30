import { and, asc, desc, eq, gte, ilike, inArray, lte, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import * as s from "../db/schema";
import { bad, conflict, notFound } from "../lib/http";
import { audit } from "./audit";
import { now as clockNow } from "./settings";
import type { SheetLot } from "./sheets";

export interface LotFilters {
  saleDate?: string;
  make?: string;
  model?: string;
  modelCode?: string;
  hall?: string;
  grade?: string;
  color?: string;
  transmission?: string;
  yearMin?: number;
  yearMax?: number;
  mileageMax?: number;
  priceMax?: number;
  lotNos?: number[];
  status?: "upcoming" | "concluded" | "all";
  sort?: "lot" | "price_asc" | "price_desc" | "year_desc" | "mileage_asc";
  limit?: number;
  offset?: number;
}

export async function today(): Promise<string> {
  return (await clockNow()).toISOString().slice(0, 10);
}

function where(f: LotFilters, t: string, skip?: keyof LotFilters): SQL | undefined {
  const w: (SQL | undefined)[] = [];
  if (f.status === "concluded") w.push(sql`(${s.auctionLots.status} <> 'upcoming' or ${s.auctionLots.saleDate} < ${t})`);
  else if (f.status !== "all") w.push(and(eq(s.auctionLots.status, "upcoming"), gte(s.auctionLots.saleDate, t)));
  if (f.saleDate && skip !== "saleDate") w.push(eq(s.auctionLots.saleDate, f.saleDate));
  if (f.make && skip !== "make") w.push(ilike(s.auctionLots.make, f.make));
  if (f.model && skip !== "model") w.push(ilike(s.auctionLots.model, f.model));
  if (f.modelCode && skip !== "modelCode") w.push(ilike(s.auctionLots.modelCode, f.modelCode));
  if (f.hall && skip !== "hall") w.push(eq(s.auctionLots.hallId, f.hall));
  if (f.grade && skip !== "grade") w.push(eq(s.auctionLots.grade, f.grade));
  if (f.color && skip !== "color") w.push(ilike(s.auctionLots.color, f.color));
  if (f.transmission && skip !== "transmission") w.push(ilike(s.auctionLots.transmission, f.transmission));
  if (f.yearMin) w.push(gte(s.auctionLots.year, f.yearMin));
  if (f.yearMax) w.push(lte(s.auctionLots.year, f.yearMax));
  if (f.mileageMax) w.push(lte(s.auctionLots.mileageKm, f.mileageMax));
  if (f.priceMax) w.push(lte(s.auctionLots.startPriceJpy, f.priceMax));
  if (f.lotNos?.length) w.push(inArray(s.auctionLots.lotNo, f.lotNos));
  return and(...w);
}

const lotCols = {
  id: s.auctionLots.id,
  saleDate: s.auctionLots.saleDate,
  lotNo: s.auctionLots.lotNo,
  hall: s.auctionHalls.name,
  hallCode: s.auctionHalls.code,
  make: s.auctionLots.make,
  model: s.auctionLots.model,
  modelCode: s.auctionLots.modelCode,
  bodyType: s.auctionLots.bodyType,
  grade: s.auctionLots.grade,
  interiorGrade: s.auctionLots.interiorGrade,
  year: s.auctionLots.year,
  color: s.auctionLots.color,
  transmission: s.auctionLots.transmission,
  fuel: s.auctionLots.fuel,
  drive: s.auctionLots.drive,
  mileageKm: s.auctionLots.mileageKm,
  engineCc: s.auctionLots.engineCc,
  equipment: s.auctionLots.equipment,
  startPriceJpy: s.auctionLots.startPriceJpy,
  avgPriceJpy: s.auctionLots.avgPriceJpy,
  status: s.auctionLots.status,
  resultPriceJpy: s.auctionLots.resultPriceJpy,
  highBidJpy: s.auctionLots.highBidJpy,
  photoCount: s.auctionLots.photoCount,
};

export async function listLots(f: LotFilters) {
  const t = await today();
  const w = where(f, t);
  const order =
    f.sort === "price_asc" ? [asc(s.auctionLots.startPriceJpy)] : f.sort === "price_desc" ? [desc(s.auctionLots.startPriceJpy)] : f.sort === "year_desc" ? [desc(s.auctionLots.year)] : f.sort === "mileage_asc" ? [asc(s.auctionLots.mileageKm)] : [asc(s.auctionLots.saleDate), asc(s.auctionLots.lotNo)];
  const items = await db().select(lotCols).from(s.auctionLots).innerJoin(s.auctionHalls, eq(s.auctionHalls.id, s.auctionLots.hallId)).where(w).orderBy(...order).limit(f.limit ?? 30).offset(f.offset ?? 0);
  const [{ n }] = (await db().select({ n: sql<number>`count(*)::int` }).from(s.auctionLots).where(w)) as [{ n: number }];
  return { items, total: n };
}

/** Facet counts that narrow as you choose: each facet is counted with every OTHER filter applied. */
export async function lotFacets(f: LotFilters) {
  const t = await today();
  const count = async (col: unknown, key: keyof LotFilters) => {
    const rows = await db().select({ v: sql<string>`${col as SQL}`, n: sql<number>`count(*)::int` }).from(s.auctionLots).where(where(f, t, key)).groupBy(sql`1`).orderBy(sql`2 desc`).limit(60);
    return rows;
  };
  const [saleDates, makes, models, codes, halls, grades, colors, gearboxes] = await Promise.all([
    count(sql`${s.auctionLots.saleDate}::text`, "saleDate"),
    count(s.auctionLots.make, "make"),
    f.make ? count(s.auctionLots.model, "model") : Promise.resolve([]),
    f.model ? count(s.auctionLots.modelCode, "modelCode") : Promise.resolve([]),
    count(s.auctionLots.hallId, "hall"),
    count(s.auctionLots.grade, "grade"),
    count(s.auctionLots.color, "color"),
    count(s.auctionLots.transmission, "transmission"),
  ]);
  const hallNames = await db().select().from(s.auctionHalls);
  return {
    saleDates: saleDates.sort((a, b) => a.v.localeCompare(b.v)),
    makes,
    models,
    modelCodes: codes,
    halls: halls.map((h) => ({ ...h, name: hallNames.find((x) => x.id === h.v)?.name ?? h.v })),
    grades,
    colors,
    transmissions: gearboxes,
  };
}

export async function getLot(id: string) {
  const [l] = await db().select({ ...lotCols, hallId: s.auctionLots.hallId, damage: s.auctionLots.damage, sheetNotes: s.auctionLots.sheetNotes }).from(s.auctionLots).innerJoin(s.auctionHalls, eq(s.auctionHalls.id, s.auctionLots.hallId)).where(eq(s.auctionLots.id, id)).limit(1);
  return l ?? null;
}

export function toSheetLot(l: NonNullable<Awaited<ReturnType<typeof getLot>>>): SheetLot {
  return { id: l.id, hallName: l.hall, hallCode: l.hallCode, saleDate: l.saleDate, lotNo: l.lotNo, make: l.make, model: l.model, modelCode: l.modelCode, year: l.year, engineCc: l.engineCc, transmission: l.transmission, fuel: l.fuel, drive: l.drive, mileageKm: l.mileageKm, color: l.color, grade: l.grade, interiorGrade: l.interiorGrade, equipment: l.equipment, damage: (l.damage as { code: string; part: string }[]) ?? [], sheetNotes: l.sheetNotes, startPriceJpy: l.startPriceJpy };
}

export async function lotVisible(l: { status: string; saleDate: string }, canSeeArchive: boolean): Promise<boolean> {
  if (canSeeArchive) return true;
  return l.status === "upcoming" && l.saleDate >= (await today());
}

/** What this model sold for (Statistics window: rolling 93 days ending on the newest day held). */
export async function priceHistory(make: string, model: string, year?: number) {
  const [{ newest }] = (await db().select({ newest: sql<string>`max(${s.auctionResults.saleDate})::text` }).from(s.auctionResults)) as [{ newest: string }];
  const from = newest ? new Date(new Date(newest).getTime() - 92 * 86400_000).toISOString().slice(0, 10) : "1970-01-01";
  const w = and(ilike(s.auctionResults.make, make), ilike(s.auctionResults.model, model), gte(s.auctionResults.saleDate, from), year ? and(gte(s.auctionResults.year, year - 1), lte(s.auctionResults.year, year + 1)) : undefined);
  const rows = await db().select({ id: s.auctionResults.id, saleDate: s.auctionResults.saleDate, lotNo: s.auctionResults.lotNo, year: s.auctionResults.year, mileageKm: s.auctionResults.mileageKm, grade: s.auctionResults.grade, finalPriceJpy: s.auctionResults.finalPriceJpy, sold: s.auctionResults.sold, hall: s.auctionHalls.name }).from(s.auctionResults).innerJoin(s.auctionHalls, eq(s.auctionHalls.id, s.auctionResults.hallId)).where(w).orderBy(desc(s.auctionResults.saleDate)).limit(12);
  const [agg] = (await db().select({ n: sql<number>`count(*)::int`, sold: sql<number>`count(*) filter (where ${s.auctionResults.sold} = 1)::int`, avg: sql<number>`coalesce(avg(${s.auctionResults.finalPriceJpy}) filter (where ${s.auctionResults.sold} = 1),0)::float`, min: sql<number>`coalesce(min(${s.auctionResults.finalPriceJpy}) filter (where ${s.auctionResults.sold} = 1),0)::int`, max: sql<number>`coalesce(max(${s.auctionResults.finalPriceJpy}) filter (where ${s.auctionResults.sold} = 1),0)::int` }).from(s.auctionResults).where(w)) as [{ n: number; sold: number; avg: number; min: number; max: number }];
  return { window: { from, to: newest }, count: agg.n, soldCount: agg.sold, avgSoldJpy: Math.round(agg.avg / 1000) * 1000, minSoldJpy: agg.min, maxSoldJpy: agg.max, recent: rows };
}

export async function placeBid(userId: string, lotId: string, amountJpy: number, note?: string | null, actorKind: "human" | "fte" = "human", ctx?: { conversationId?: string | null; fteRunId?: string | null }) {
  const l = await getLot(lotId);
  if (!l) throw notFound("Lot not found");
  if (l.status !== "upcoming" || l.saleDate < (await today())) throw conflict("This lot has already been auctioned — bidding is closed");
  if (amountJpy < l.startPriceJpy) throw bad(`The bid must be at least the start price ¥${l.startPriceJpy.toLocaleString("en-US")}`);
  if (amountJpy % 1000 !== 0) throw bad("Bids go in steps of ¥1,000");
  return db().transaction(async (tx) => {
    const [b] = await tx.insert(s.auctionBids).values({ lotId, userId, amountJpy, note: note ?? null }).returning();
    await audit(tx, { actorUserId: userId, actorKind, action: "bid.placed", entity: "lot", entityId: lotId, summary: `Bid ¥${amountJpy.toLocaleString("en-US")} on lot ${l.lotNo} (${l.hall}, ${l.saleDate}) — ${l.year} ${l.make} ${l.model}${note ? ` · ${note}` : ""}`, conversationId: ctx?.conversationId, fteRunId: ctx?.fteRunId });
    return b!;
  });
}

/** A fixed number per lot (same lot, same answer) for the demo market. */
function lotHash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/**
 * The demo auction's hammer. Once a sale day is over on the (demo) clock every lot gets its result: the outside
 * market's top bid is the lot's recent average ± up to 12% (fixed per lot), about one lot in seven goes unsold,
 * and our highest bid wins when it reaches the market — paying the market price, not the whole maximum.
 * Each bid becomes won / lost; one bids.settled event per batch lets Sora tell each buyer all results in one message.
 */
export async function settleAuctions(): Promise<number> {
  const t = await today();
  const due = await db()
    .select({ id: s.auctionLots.id, startPriceJpy: s.auctionLots.startPriceJpy, avgPriceJpy: s.auctionLots.avgPriceJpy })
    .from(s.auctionLots)
    .where(and(eq(s.auctionLots.status, "upcoming"), sql`${s.auctionLots.saleDate} < ${t}`));
  if (!due.length) return 0;
  const bids = await db()
    .select()
    .from(s.auctionBids)
    .where(and(inArray(s.auctionBids.lotId, due.map((l) => l.id)), eq(s.auctionBids.status, "active")))
    .orderBy(desc(s.auctionBids.amountJpy), asc(s.auctionBids.createdAt));
  const byLot = new Map<string, typeof bids>();
  for (const b of bids) byLot.set(b.lotId, [...(byLot.get(b.lotId) ?? []), b]);
  const { emit } = await import("./events");
  const settled: string[] = [];
  await db().transaction(async (tx) => {
    for (const l of due) {
      const h = lotHash(l.id);
      const market = Math.max(l.startPriceJpy, Math.round(((l.avgPriceJpy ?? l.startPriceJpy * 1.3) * (0.88 + (h % 25) / 100)) / 1000) * 1000);
      const lotBids = byLot.get(l.id) ?? [];
      const top = lotBids[0];
      const unsold = !top && h % 7 === 0;
      const weWin = !!top && top.amountJpy >= market;
      await tx
        .update(s.auctionLots)
        .set(unsold ? { status: "unsold", resultPriceJpy: null, highBidJpy: Math.round((l.startPriceJpy * 0.9) / 1000) * 1000 } : { status: "sold", resultPriceJpy: market, highBidJpy: Math.max(market, top?.amountJpy ?? 0) })
        .where(eq(s.auctionLots.id, l.id));
      for (const b of lotBids) {
        await tx.update(s.auctionBids).set({ status: weWin && b.id === top!.id ? "won" : "lost" }).where(eq(s.auctionBids.id, b.id));
        settled.push(b.id);
      }
    }
    // one event for the whole batch, so each buyer hears all their results in one message
    if (settled.length) await emit("bids.settled", { bidIds: settled }, { tx });
  });
  return due.length;
}
