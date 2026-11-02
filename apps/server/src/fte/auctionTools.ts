/** Sora's auction tools: search lots, open one, read its sheet (vision), check past prices, bid inside the envelope. */
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import * as s from "../db/schema";
import { getLot, listLots, placeBid, priceHistory } from "../services/auction";
import { fobFromLot } from "../services/pricing";
import { envelope, pricingPolicy } from "../services/settings";
import { readSheet } from "./sheetReader";
import type { ToolDef } from "./tools";
import { ToolError } from "./errors";
import { carImageUrl } from "../services/carArt";
import { colorHex } from "../seed/catalog";
import { photoFor, photoPath } from "../seed/photos";

const yen = (n: number | null | undefined) => (n == null ? null : Math.round(n));

/** The model may pass the internal lot_id or the visible lot NUMBER — accept both, refuse ambiguity. */
export const lotRef = z.union([z.string().min(1).max(40), z.number().int().positive()]).describe("lot_id from search_auction_lots (or the lot number shown to the buyer)");

export async function resolveLot(ref: unknown) {
  const raw = String(ref ?? "").trim().replace(/^lot\s*/i, "");
  if (raw.length >= 16) {
    const l = await getLot(raw);
    if (l) return l;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) throw new ToolError(`Unknown lot "${raw}"`);
  const today0 = new Date().toISOString().slice(0, 10);
  const rows = await db()
    .select({ id: s.auctionLots.id, saleDate: s.auctionLots.saleDate, hallId: s.auctionLots.hallId, status: s.auctionLots.status })
    .from(s.auctionLots)
    .where(eq(s.auctionLots.lotNo, n))
    .orderBy(desc(s.auctionLots.saleDate))
    .limit(10);
  const upcoming = rows.filter((r) => r.status === "upcoming" && r.saleDate >= today0);
  const pick = upcoming.length === 1 ? upcoming[0] : upcoming.length === 0 && rows.length === 1 ? rows[0] : null;
  if (!pick) {
    if (!rows.length) throw new ToolError(`No auction lot number ${n} this week`);
    throw new ToolError(`Several lots have number ${n}: ${rows.map((r) => `${r.id} (${r.saleDate})`).join(", ")} — use the lot_id`);
  }
  return (await getLot(pick.id))!;
}

export const AUCTION_TOOLS: ToolDef[] = [
  {
    name: "search_auction_lots",
    description:
      "Search this week's Japanese auction lots (cars not yet auctioned). Use when the buyer wants auction cars, a model not in stock, a lower price, or asks about the auction. Prices are in JPY (start price and recent average); est_fob_usd is an estimate if bought at the average price.",
    input: {
      make: z.string().max(40).optional(),
      model: z.string().max(40).optional(),
      model_code: z.string().max(20).optional().describe("Chassis model code, e.g. GDJ150W"),
      max_start_price_jpy: z.number().int().positive().optional(),
      min_year: z.number().int().optional(),
      max_mileage_km: z.number().int().optional(),
      min_grade: z.number().min(1).max(6).optional().describe("Minimum numeric grade, e.g. 4"),
      sale_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      sort: z.enum(["price_asc", "year_desc", "mileage_asc", "lot"]).optional(),
      limit: z.number().int().min(1).max(100).optional().describe("At most 6 come back"),
    },
    async run(a) {
      const policy = await pricingPolicy();
      const sort = ((a.sort as string) ?? "price_asc") as "price_asc" | "year_desc" | "mileage_asc" | "lot";
      // buyers say "Hiace" or "Prado"; the lots say "Hiace Van" / "Land Cruiser Prado". An exact name wins, else every model that contains the words.
      let models: (string | undefined)[] = [a.model as string | undefined];
      if (a.model) {
        const q = String(a.model).trim();
        const like = await db()
          .selectDistinct({ m: s.auctionLots.model })
          .from(s.auctionLots)
          .where(and(ilike(s.auctionLots.model, `%${q.replace(/[%_\\]/g, (ch) => `\\${ch}`)}%`), a.make ? ilike(s.auctionLots.make, String(a.make)) : undefined))
          .limit(5);
        const exact = like.find((x) => x.m.toLowerCase() === q.toLowerCase());
        if (like.length) models = exact ? [exact.m] : like.map((x) => x.m);
      }
      const found = await Promise.all(models.map((model) => listLots({ make: a.make as string, model, modelCode: a.model_code as string, priceMax: a.max_start_price_jpy as number, yearMin: a.min_year as number, mileageMax: a.max_mileage_km as number, saleDate: a.sale_date as string, sort, limit: 30 })));
      let items = found.flatMap((r) => r.items);
      if (found.length > 1) {
        const key = { price_asc: (l: (typeof items)[number]) => Number(l.startPriceJpy), year_desc: (l: (typeof items)[number]) => -l.year, mileage_asc: (l: (typeof items)[number]) => l.mileageKm, lot: (l: (typeof items)[number]) => l.lotNo }[sort];
        items.sort((x, y) => key(x) - key(y));
      }
      if (a.min_grade) items = items.filter((l) => Number.parseFloat(l.grade) >= Number(a.min_grade));
      items = items.slice(0, Math.min((a.limit as number) ?? 4, 6));
      return {
        total_matches: found.reduce((n, r) => n + r.total, 0),
        results: items.map((l) => ({
          lot_id: l.id,
          lot_no: l.lotNo,
          hall: l.hall,
          sale_date: l.saleDate,
          title: `${l.year} ${l.make} ${l.model} (${l.modelCode})`,
          grade: l.grade,
          interior: l.interiorGrade,
          mileage_km: l.mileageKm,
          color: l.color,
          transmission: l.transmission,
          fuel: l.fuel,
          start_price_jpy: yen(l.startPriceJpy),
          avg_price_jpy: yen(l.avgPriceJpy),
          est_fob_usd: l.avgPriceJpy ? fobFromLot(l.avgPriceJpy, policy) : null,
          link: `/auction/lots/${l.id}`,
          image: (l.photoUrls as string[] | null)?.[0] ?? (() => {
            const p = photoFor(l.make, l.model, l.color);
            return p ? photoPath(p.file) : carImageUrl(l.bodyType, colorHex(l.color), "side");
          })(),
        })),
      };
    },
  },
  {
    name: "get_auction_lot",
    description: "Full details of one auction lot (by lot_id from search_auction_lots), plus what this model sold for recently.",
    input: { lot_id: lotRef },
    async run(a) {
      const l = await resolveLot(a.lot_id);
      const hist = await priceHistory(l.make, l.model, l.year);
      return {
        lot_id: l.id,
        lot_no: l.lotNo,
        hall: l.hall,
        sale_date: l.saleDate,
        status: l.status,
        title: `${l.year} ${l.make} ${l.model} (${l.modelCode})`,
        grade: l.grade,
        interior: l.interiorGrade,
        mileage_km: l.mileageKm,
        engine_cc: l.engineCc,
        transmission: l.transmission,
        fuel: l.fuel,
        drive: l.drive,
        color: l.color,
        equipment: l.equipment,
        start_price_jpy: l.startPriceJpy,
        avg_price_jpy: l.avgPriceJpy,
        recent_results: { count: hist.count, sold: hist.soldCount, avg_sold_jpy: hist.avgSoldJpy, min_sold_jpy: hist.minSoldJpy, max_sold_jpy: hist.maxSoldJpy, window: hist.window },
        sheet_note: "Call read_auction_sheet to read the inspection sheet image before judging the condition.",
        link: `/auction/lots/${l.id}`,
      };
    },
  },
  {
    name: "read_auction_sheet",
    description: "Read the lot's auction inspection sheet IMAGE with vision: grade, interior grade, every damage code and panel, equipment, inspector's remarks, and a verdict (good / caution / avoid) with reasons. Use before telling a buyer whether a lot is good.",
    input: { lot_id: lotRef },
    async run(a, ctx) {
      const l = await resolveLot(a.lot_id);
      const r = await readSheet(l.id);
      await db().insert(s.auditLog).values({ actorUserId: ctx.principalUserId, actorKind: ctx.principalKind, action: "sheet.read", entity: "lot", entityId: l.id, summary: `Read the auction sheet of lot ${l.lotNo} (${l.hall}) — verdict ${r.reading.verdict ?? "?"}${r.cached ? " (cached)" : ""}`, conversationId: ctx.conversationId ?? null, fteRunId: ctx.runId ?? null });
      return { lot_id: l.id, lot_no: l.lotNo, source: "vision reading of the sheet image", ...r.reading, sheet_image: l.sheetUrl === "" ? null : `/api/auction/lots/${l.id}/sheet.png` };
    },
  },
  {
    name: "get_price_history",
    description: "What a model has sold for at auction in the last 93 days (count, average, min, max and recent results). Use to tell a buyer what to bid.",
    input: { make: z.string().min(2).max(40), model: z.string().min(1).max(40), year: z.number().int().optional() },
    async run(a) {
      const h = await priceHistory(String(a.make), String(a.model), a.year as number | undefined);
      return { ...h, recent: h.recent.slice(0, 6).map((r) => ({ sale_date: r.saleDate, hall: r.hall, year: r.year, grade: r.grade, mileage_km: r.mileageKm, result: r.sold ? `sold ¥${r.finalPriceJpy.toLocaleString("en-US")}` : `not sold (highest bid ¥${r.finalPriceJpy.toLocaleString("en-US")})` })) };
    },
  },
  {
    name: "place_bid",
    description: "Place a bid for the buyer on an auction lot, ONLY after the buyer clearly agreed to the amount. Bids up to your envelope limit go in directly; above it you must request_approval (kind 'bid') first — once approved you can place it.",
    input: { lot_id: lotRef, amount_jpy: z.number().int().positive(), buyer_confirmed: z.literal(true).describe("true only if the buyer explicitly agreed to this bid") },
    async run(a, ctx) {
      const lotRow = await resolveLot(a.lot_id);
      a = { ...a, lot_id: lotRow.id };
      const env0 = await envelope();
      const amount = Number(a.amount_jpy);
      if (amount > env0.maxBidJpy) {
        const [ok] = await db()
          .select()
          .from(s.approvals)
          .where(and(eq(s.approvals.kind, "bid"), eq(s.approvals.status, "approved"), eq(s.approvals.lotId, String(a.lot_id)), sql`(${s.approvals.payload}->>'amountJpy')::int >= ${amount}`))
          .orderBy(desc(s.approvals.decidedAt))
          .limit(1);
        if (!ok) return { needs_approval: true, max_bid_jpy: env0.maxBidJpy, message: `¥${amount.toLocaleString("en-US")} is above your bid limit of ¥${env0.maxBidJpy.toLocaleString("en-US")}. Call request_approval with kind "bid", the lot_id and amount_jpy, and tell the buyer a supervisor will confirm.` };
      }
      const [buyer] = ctx.buyerUserId ? await db().select().from(s.users).where(eq(s.users.id, ctx.buyerUserId)).limit(1) : [];
      const bid = await placeBid(ctx.principalUserId, String(a.lot_id), amount, `For buyer ${buyer?.name ?? "unknown"} via chat`, ctx.principalKind, { conversationId: ctx.conversationId, fteRunId: ctx.runId });
      return { bid_id: bid.id, status: "placed", amount_jpy: amount, message: "Bid placed. Tell the buyer the result is known after the sale day; you will update them." };
    },
  },
];
