import { Router } from "express";
import archiver from "archiver";
import ExcelJS from "exceljs";
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import * as s from "../db/schema";
import { bad, conflict, forbidden, h, notFound, page, parse } from "../lib/http";
import { can, requireAuth, requirePerm } from "../auth/session";
import { BID_STATES, getLot, listLots, lotFacets, lotVisible, placeBid, priceHistory, toSheetLot, today, type LotFilters } from "../services/auction";
import { AUCTION_FEES, SHEET_MARKS, chassisLookup, fobEstimate, lookupMakers, lotEndsAt, ourStock, saleMayHaveRun } from "../services/auctionExtras";
import { feedSignal, runFeed, setFeedPaused } from "../services/demoFeed";
import { now as clockNow } from "../services/settings";
import { fetchImage } from "../services/lotImages";
import { sheetPng } from "../services/sheets";
import { carImageUrl, carSvg } from "../services/carArt";
import { renderPdf } from "../services/pdf";
import { audit } from "../services/audit";
import { emit } from "../services/events";
import { deskManual } from "../fte/workforce";
import { notify, usersWithPerm } from "../services/notify";
import { colorHex } from "../seed/catalog";
import { photoFor, photoPath } from "../seed/photos";
import { ROOT } from "../env";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const auctionRouter = Router();

const list = z.string().max(600).optional(); // several ticks arrive comma-separated
const filterSchema = z.object({
  saleDate: list,
  make: z.string().max(40).optional(),
  model: z.string().max(60).optional(),
  modelCode: list,
  hall: list,
  grade: list,
  color: list,
  transmission: list,
  yearMin: z.coerce.number().int().optional(),
  yearMax: z.coerce.number().int().optional(),
  mileageMin: z.coerce.number().int().optional(),
  mileageMax: z.coerce.number().int().optional(),
  ccMin: z.coerce.number().int().optional(),
  ccMax: z.coerce.number().int().optional(),
  priceMax: z.coerce.number().int().optional(),
  lots: z.string().max(200).optional(),
  chassisModel: z.string().max(30).optional(),
  chassisNo: z.string().max(40).optional(),
  status: z.enum(["upcoming", "concluded", "all"]).optional(),
  sort: z.enum(["lot", "price_asc", "price_desc", "year_desc", "mileage_asc", "lot_asc", "lot_desc", "date_asc", "date_desc", "year_new", "year_old", "cc_low", "cc_high", "mileage", "mileage_high", "cond_low", "cond_high", "price_low", "price_high"]).optional(),
});

const many = (v?: string) => (v ? v.split(",").map((x) => x.trim()).filter(Boolean) : undefined);

function toFilters(q: z.infer<typeof filterSchema>, archive: boolean): LotFilters {
  const lotNos = q.lots
    ? q.lots
        .split(/[,\s]+/)
        .map((x) => Number.parseInt(x, 10))
        .filter((n) => Number.isFinite(n))
    : undefined;
  return {
    make: q.make,
    model: q.model,
    saleDates: many(q.saleDate),
    modelCodes: many(q.modelCode),
    halls: many(q.hall),
    grades: many(q.grade),
    colors: many(q.color),
    transmissions: many(q.transmission),
    yearMin: q.yearMin,
    yearMax: q.yearMax,
    mileageMin: q.mileageMin,
    mileageMax: q.mileageMax,
    ccMin: q.ccMin,
    ccMax: q.ccMax,
    priceMax: q.priceMax,
    chassisModel: q.chassisModel,
    chassisNo: q.chassisNo,
    sort: q.sort,
    lotNos,
    status: archive ? q.status ?? "upcoming" : "upcoming",
  };
}

const ownPhotos = (l: { photoUrls?: unknown }) => (Array.isArray(l.photoUrls) ? (l.photoUrls as string[]) : []);
const modelPhotoPaths = (l: { make: string; model: string; color: string }) => {
  const p = photoFor(l.make, l.model, l.color);
  return p ? [photoPath(p.file), ...(p.also ? [photoPath(p.also)] : [])] : [];
};
const photosFor = (l: { make: string; model: string; bodyType: string; color: string; photoCount: number; photoUrls?: unknown }) => {
  if (ownPhotos(l).length) return ownPhotos(l);
  const real = modelPhotoPaths(l);
  const views = real.length ? (["side", "rear", "interior"] as const) : (["side", "front", "rear", "interior"] as const);
  return [...real, ...views.map((v) => carImageUrl(l.bodyType, colorHex(l.color), v))];
};

auctionRouter.get(
  "/facets",
  h(async (req) => {
    const u = requirePerm(req, "auction.access");
    const q = parse(filterSchema, req.query);
    return lotFacets(toFilters(q, can(u, "auction.lots.view_sold")));
  }),
);

auctionRouter.get(
  "/lots",
  h(async (req) => {
    const u = requirePerm(req, "auction.access");
    const q = parse(filterSchema, req.query);
    const { pageSize, offset, page: pageNo } = page(req.query, 20, 100);
    const r = await listLots({ ...toFilters(q, can(u, "auction.lots.view_sold")), limit: pageSize, offset });
    const clock = await clockNow();
    return {
      ...r,
      items: r.items.map((l) => {
        const photos = photosFor(l);
        return { ...l, image: photos[0], images: photos.slice(0, 2), sheet: l.sheetUrl === "" ? null : `/api/auction/lots/${l.id}/sheet.png`, photoCount: photos.length, endsAt: lotEndsAt(l.saleDate, l.saleTime) };
      }),
      page: pageNo,
      pageSize,
      today: await today(),
      serverNow: clock.toISOString(),
    };
  }),
);

auctionRouter.get(
  "/lots/:id",
  h(async (req) => {
    const u = requirePerm(req, "auction.access");
    const l = await getLot(String(req.params.id));
    if (!l || !(await lotVisible(l, can(u, "auction.lots.view_sold")))) throw notFound("This lot is not available");
    const history = await priceHistory(l.make, l.model, l.year);
    const myBids = await db().select().from(s.auctionBids).where(and(eq(s.auctionBids.lotId, l.id), eq(s.auctionBids.userId, u.id))).orderBy(desc(s.auctionBids.createdAt));
    const [reading] = await db().select().from(s.sheetReadings).where(eq(s.sheetReadings.lotId, l.id)).limit(1);
    const { damage: _d, sheetNotes: _n, ...pub } = l;
    const t0 = await today();
    const clock = await clockNow();
    const open = l.status === "upcoming" && l.saleDate >= t0;
    // the next car a buyer expects: the same make, in sale and lot order
    const near = await db().execute(sql`
      select prev_id, next_id from (
        select id, lag(id) over w as prev_id, lead(id) over w as next_id
        from auction_lots where make = ${l.make} and (${can(u, "auction.lots.view_sold")} or (status = 'upcoming' and sale_date >= ${t0}))
        window w as (order by sale_date, lot_no, id)
      ) x where id = ${l.id}`);
    const hood = (near as unknown as { rows: { prev_id: string | null; next_id: string | null }[] }).rows[0];
    const more = await listLots({ make: l.make, model: l.model, status: "upcoming", limit: 5 });
    return {
      lot: pub,
      photos: photosFor(l),
      sheet: l.sheetUrl === "" ? null : `/api/auction/lots/${l.id}/sheet.png`,
      history,
      myBids,
      soraReading: reading?.result ?? null,
      biddingOpen: open,
      endsAt: lotEndsAt(l.saleDate, l.saleTime),
      serverNow: clock.toISOString(),
      saleMayHaveRun: open && saleMayHaveRun(l.saleDate, l.saleTime, t0, clock),
      prevId: hood?.prev_id ?? null,
      nextId: hood?.next_id ?? null,
      related: more.items.filter((x) => x.id !== l.id).slice(0, 4).map((x) => ({ id: x.id, lotNo: x.lotNo, make: x.make, model: x.model, year: x.year, mileageKm: x.mileageKm, startPriceJpy: x.startPriceJpy, image: photosFor(x)[0] })),
      fees: AUCTION_FEES,
      marks: SHEET_MARKS,
      makers: lookupMakers(),
      isCustomer: u.kind === "customer",
    };
  }),
);

/** The production year behind a chassis number, and our own lots of that model. */
auctionRouter.get(
  "/chassis-lookup",
  h(async (req) => {
    requirePerm(req, "auction.access");
    const q = parse(z.object({ code: z.string().trim().min(2).max(30), number: z.string().trim().max(20).optional(), maker: z.string().trim().max(30).optional() }), req.query);
    return chassisLookup(q.code, q.number ?? "", q.maker || undefined);
  }),
);
auctionRouter.get(
  "/our-stock",
  h(async (req) => {
    requirePerm(req, "auction.access");
    const q = parse(z.object({ code: z.string().trim().min(2).max(30) }), req.query);
    return { items: await ourStock(q.code) };
  }),
);
auctionRouter.get(
  "/fob",
  h(async (req) => {
    requirePerm(req, "auction.access");
    const q = parse(z.object({ bid: z.coerce.number().min(0), kind: z.enum(["car", "truck"]).optional(), inspection: z.string().max(10).optional(), lc: z.enum(["1", "0"]).optional(), vanning: z.enum(["1", "0"]).optional() }), req.query);
    return fobEstimate({ bidJpy: q.bid, kind: q.kind, inspection: q.inspection, lc: q.lc === "1", vanning: q.vanning === "1" });
  }),
);

auctionRouter.get(
  "/lots/:id/sheet.png",
  h(async (req, res) => {
    const u = requireAuth(req);
    const l = await getLot(String(req.params.id));
    if (!l) throw notFound();
    if (!(await lotVisible(l, can(u, "auction.lots.view_sold"))) && !can(u, "crm.access")) throw notFound();
    if (l.sheetUrl === "") throw notFound("No auction sheet was supplied for this lot");
    const own = l.sheetUrl ? await fetchImage(l.sheetUrl).catch(() => null) : null;
    if (l.sheetUrl && !own) throw notFound("The auction sheet could not be opened");
    res.setHeader("Content-Type", own?.mime ?? "image/png");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.send(own?.buf ?? sheetPng(toSheetLot(l)));
    return undefined;
  }),
);

async function specPdf(l: NonNullable<Awaited<ReturnType<typeof getLot>>>) {
  return renderPdf((doc) => {
    doc.fontSize(18).font("Helvetica-Bold").text(`Lot ${l.lotNo} — ${l.year} ${l.make} ${l.model}`);
    doc.moveDown(0.3).fontSize(10).font("Helvetica").fillColor("#555").text(`${l.hall} · sale date ${l.saleDate} · demo data`);
    doc.moveDown().fillColor("#111");
    const rows: [string, string][] = [
      ["Model code", l.modelCode],
      ["Grade / interior", `${l.grade} / ${l.interiorGrade}`],
      ["Mileage", `${l.mileageKm.toLocaleString("en-US")} km`],
      ["Engine", `${l.engineCc} cc ${l.fuel}`],
      ["Transmission / drive", `${l.transmission} / ${l.drive}`],
      ["Colour", l.color],
      ["Equipment", l.equipment],
      ["Start price", `¥${l.startPriceJpy.toLocaleString("en-US")}`],
      ["Recent average", l.avgPriceJpy ? `¥${l.avgPriceJpy.toLocaleString("en-US")}` : "—"],
    ];
    for (const [k, v] of rows) {
      doc.font("Helvetica-Bold").text(k, { continued: true }).font("Helvetica").text(`   ${v}`);
      doc.moveDown(0.2);
    }
  });
}

auctionRouter.get(
  "/lots/:id/spec.pdf",
  h(async (req, res) => {
    const u = requirePerm(req, "auction.access");
    const l = await getLot(String(req.params.id));
    if (!l || !(await lotVisible(l, can(u, "auction.lots.view_sold")))) throw notFound();
    res.setHeader("Content-Type", "application/pdf");
    res.send(await specPdf(l));
    return undefined;
  }),
);

/** One ZIP: every photo + the inspection sheet + a spec PDF. */
auctionRouter.get(
  "/lots/:id/download.zip",
  h(async (req, res) => {
    const u = requirePerm(req, "auction.access");
    const l = await getLot(String(req.params.id));
    if (!l || !(await lotVisible(l, can(u, "auction.lots.view_sold")))) throw notFound();
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="lot-${l.lotNo}-${l.saleDate}.zip"`);
    const zip = archiver("zip", { zlib: { level: 6 } });
    zip.pipe(res);
    if (ownPhotos(l).length) {
      for (const [i, url] of ownPhotos(l).entries()) {
        const img = await fetchImage(url).catch(() => null);
        if (img) zip.append(img.buf, { name: `photos/${i + 1}.${img.ext}` });
      }
    } else {
      modelPhotoPaths(l).forEach((path, i) => {
        const abs = resolve(ROOT, "apps/web/public", path.slice(1));
        if (existsSync(abs)) zip.append(readFileSync(abs), { name: `photos/model-${i + 1}.jpg` });
      });
      (["side", "front", "rear", "interior"] as const).forEach((v, i) => zip.append(carSvg({ body: l.bodyType, color: colorHex(l.color), view: v }), { name: `photos/${i + 1}-${v}.svg` }));
    }
    if (l.sheetUrl === null) zip.append(sheetPng(toSheetLot(l)), { name: "auction-sheet.png" });
    else if (l.sheetUrl) {
      const sheet = await fetchImage(l.sheetUrl).catch(() => null);
      if (sheet) zip.append(sheet.buf, { name: `auction-sheet.${sheet.ext}` });
    }
    zip.append(await specPdf(l), { name: "spec-sheet.pdf" });
    await zip.finalize();
    return undefined;
  }),
);

auctionRouter.post(
  "/lots/:id/bids",
  h(async (req) => {
    const u = requirePerm(req, "auction.bids.place");
    const b = parse(z.object({ amountJpy: z.coerce.number().positive(), overBidJpy: z.coerce.number().int().min(0).optional().nullable(), message: z.string().trim().max(1000).optional(), agree: z.boolean().optional(), note: z.string().max(200).optional() }), req.body);
    // checked here, not only in the browser: a form can be posted without its box
    if (b.agree !== true) throw bad("Please accept the Terms & Conditions before placing your bid");
    const bid = await placeBid(u.id, String(req.params.id), Math.round(b.amountJpy), b.note ?? null, "human", undefined, { overBidJpy: b.overBidJpy ?? null, message: b.message || null });
    if (await deskManual("auction", "auction.bid")) await notify(await usersWithPerm("auction.bids.view_all"), { type: "bid", title: `New bid ¥${Math.round(b.amountJpy).toLocaleString("en-US")}`, body: `${u.name} bid on a lot`, link: `/auction/admin` });
    await emit("auction.bid.placed", { bidId: bid.id });
    return bid;
  }),
);

auctionRouter.post(
  "/lots/:id/order",
  h(async (req) => {
    const u = requirePerm(req, "auction.access");
    const b = parse(z.object({ agree: z.boolean().optional(), note: z.string().trim().max(500).optional() }), req.body ?? {});
    if (b.agree !== true) throw bad("Please confirm that this is a request to purchase and fees are quoted before payment");
    const l = await getLot(String(req.params.id));
    if (!l || !(await lotVisible(l, can(u, "auction.lots.view_sold")))) throw notFound();
    const year = new Date().getUTCFullYear();
    const [{ n }] = (await db().select({ n: sql<number>`count(*)::int` }).from(s.auctionOrders)) as [{ n: number }];
    const [o] = await db().insert(s.auctionOrders).values({ orderNo: `ORD-${year}-${String(100001 + n).padStart(6, "0")}`, lotId: l.id, userId: u.id, priceJpy: l.avgPriceJpy, note: b.note ?? null }).returning();
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "order.created", entity: "lot", entityId: l.id, summary: `${u.name} placed order ${o!.orderNo} on lot ${l.lotNo}` });
    await emit("auction.order.created", { orderId: o!.id });
    if (await deskManual("auction", "auction.order")) await notify(await usersWithPerm("auction.orders.manage"), { type: "order", title: `New order ${o!.orderNo}`, body: `${u.name} · lot ${l.lotNo} ${l.make} ${l.model}`, link: `/auction/admin/orders` });
    return o;
  }),
);

auctionRouter.post(
  "/lots/:id/enquiries",
  h(async (req) => {
    const u = requirePerm(req, "auction.access");
    if (u.kind !== "customer") throw bad("An enquiry is a question for the desk, so it comes from a customer account. You are signed in as staff");
    const b = parse(z.object({ message: z.string().trim().min(3).max(2000) }), req.body);
    const l = await getLot(String(req.params.id));
    if (!l) throw notFound();
    const year = new Date().getUTCFullYear();
    const [{ n }] = (await db().select({ n: sql<number>`count(*)::int` }).from(s.auctionEnquiries)) as [{ n: number }];
    const [e] = await db().insert(s.auctionEnquiries).values({ enqNo: `INQ-${year}-${String(200001 + n).padStart(6, "0")}`, lotId: l.id, userId: u.id, message: b.message }).returning();
    if (await deskManual("auction", "auction.enquiry")) await notify(await usersWithPerm("auction.enquiries.reply"), { type: "enquiry", title: `Enquiry ${e!.enqNo}`, body: b.message.slice(0, 120), link: `/auction/admin/enquiries` });
    await emit("enquiry.created", { enquiryId: e!.id });
    return e;
  }),
);

auctionRouter.get(
  "/me",
  h(async (req) => {
    const u = requirePerm(req, "auction.access");
    const bids = await db().select({ b: s.auctionBids, lotNo: s.auctionLots.lotNo, make: s.auctionLots.make, model: s.auctionLots.model, year: s.auctionLots.year, saleDate: s.auctionLots.saleDate, status: s.auctionLots.status }).from(s.auctionBids).innerJoin(s.auctionLots, eq(s.auctionLots.id, s.auctionBids.lotId)).where(eq(s.auctionBids.userId, u.id)).orderBy(desc(s.auctionBids.createdAt)).limit(50);
    const orders = await db().select({ o: s.auctionOrders, lotNo: s.auctionLots.lotNo, make: s.auctionLots.make, model: s.auctionLots.model }).from(s.auctionOrders).innerJoin(s.auctionLots, eq(s.auctionLots.id, s.auctionOrders.lotId)).where(eq(s.auctionOrders.userId, u.id)).orderBy(desc(s.auctionOrders.createdAt));
    const enquiries = await db().select({ e: s.auctionEnquiries, lotNo: s.auctionLots.lotNo, make: s.auctionLots.make, model: s.auctionLots.model }).from(s.auctionEnquiries).innerJoin(s.auctionLots, eq(s.auctionLots.id, s.auctionEnquiries.lotId)).where(eq(s.auctionEnquiries.userId, u.id)).orderBy(desc(s.auctionEnquiries.createdAt));
    const [{ onSale }] = (await db().select({ onSale: sql<number>`count(*)::int` }).from(s.auctionLots).where(and(eq(s.auctionLots.status, "upcoming"), gte(s.auctionLots.saleDate, await today())))) as [{ onSale: number }];
    const [{ past }] = (await db().select({ past: sql<number>`count(*)::int` }).from(s.auctionResults)) as [{ past: number }];
    return { onSale, pastResults: past, account: (await db().select({ name: s.users.name, email: s.users.email, phone: s.users.phone, memberSince: s.users.createdAt }).from(s.users).where(eq(s.users.id, u.id)).limit(1))[0], bids: bids.map((x) => ({ ...x.b, lot: { lotNo: x.lotNo, make: x.make, model: x.model, year: x.year, saleDate: x.saleDate, status: x.status } })), orders: orders.map((x) => ({ ...x.o, lot: { lotNo: x.lotNo, make: x.make, model: x.model } })), enquiries: enquiries.map((x) => ({ ...x.e, lot: { lotNo: x.lotNo, make: x.make, model: x.model } })) };
  }),
);

// ---------- statistics (past results) ----------
const statsQuery = z.object({
  make: z.string().max(40).optional(),
  model: z.string().max(60).optional(),
  chassis: z.string().max(30).optional(),
  lots: z.string().max(200).optional(),
  yearMin: z.coerce.number().int().optional(),
  yearMax: z.coerce.number().int().optional(),
  grade: list,
  color: list,
  transmission: list,
  hall: z.string().max(40).optional(),
  sold: z.enum(["1", "0"]).optional(),
  months: z.enum(["1", "2", "3"]).optional(),
  engine: z.string().regex(/^\d{0,5}-\d{0,5}$/).optional(),
  sort: z.enum(["date", "price_asc", "price_desc", "year_desc", "mileage_asc", "lot"]).optional(),
}).passthrough();

async function statsWhere(q: z.infer<typeof statsQuery>) {
  const [{ newest }] = (await db().select({ newest: sql<string>`max(${s.auctionResults.saleDate})::text` }).from(s.auctionResults)) as [{ newest: string }];
  const days = q.months ? Number(q.months) * 31 - 1 : 92;
  const from = new Date(new Date(newest).getTime() - days * 86400_000).toISOString().slice(0, 10);
  const w: (SQL | undefined)[] = [gte(s.auctionResults.saleDate, from)];
  if (q.make) w.push(ilike(s.auctionResults.make, q.make));
  if (q.model) w.push(ilike(s.auctionResults.model, `%${q.model}%`));
  if (q.chassis) w.push(ilike(s.auctionResults.modelCode, `${q.chassis.split("-")[0]}%`));
  const lotNos = q.lots ? q.lots.split(/[,\s]+/).map((x) => Number.parseInt(x, 10)).filter((n) => Number.isFinite(n)) : [];
  if (lotNos.length) w.push(inArray(s.auctionResults.lotNo, lotNos));
  if (q.yearMin) w.push(gte(s.auctionResults.year, q.yearMin));
  if (q.yearMax) w.push(lte(s.auctionResults.year, q.yearMax));
  if (many(q.grade)) w.push(inArray(s.auctionResults.grade, many(q.grade)!));
  if (many(q.color)) w.push(inArray(s.auctionResults.color, many(q.color)!));
  if (many(q.transmission)) w.push(inArray(s.auctionResults.transmission, many(q.transmission)!));
  if (q.hall) w.push(eq(s.auctionResults.hallId, q.hall));
  if (q.sold) w.push(eq(s.auctionResults.sold, Number(q.sold)));
  if (q.engine) {
    const [lo, hi] = q.engine.split("-");
    if (lo) w.push(gte(s.auctionResults.engineCc, Number(lo)));
    if (hi) w.push(lte(s.auctionResults.engineCc, Number(hi)));
  }
  return { where: and(...w), from, newest };
}

const statsOrder = (sort?: string) => (sort === "price_asc" ? [asc(s.auctionResults.finalPriceJpy)] : sort === "price_desc" ? [desc(s.auctionResults.finalPriceJpy)] : sort === "year_desc" ? [desc(s.auctionResults.year)] : sort === "mileage_asc" ? [asc(s.auctionResults.mileageKm)] : sort === "lot" ? [asc(s.auctionResults.lotNo)] : [desc(s.auctionResults.saleDate)]);

auctionRouter.get(
  "/stats",
  h(async (req) => {
    requirePerm(req, "auction.access");
    const q = parse(statsQuery, req.query);
    const { pageSize, offset, page: pageNo } = page(req.query, 20, 100);
    const { where, from, newest } = await statsWhere(q);
    const items = await db().select({ r: s.auctionResults, hall: s.auctionHalls.name }).from(s.auctionResults).innerJoin(s.auctionHalls, eq(s.auctionHalls.id, s.auctionResults.hallId)).where(where).orderBy(...statsOrder(q.sort), desc(s.auctionResults.saleDate), asc(s.auctionResults.lotNo), asc(s.auctionResults.id)).limit(pageSize).offset(offset);
    const [agg] = (await db().select({ n: sql<number>`count(*)::int`, sold: sql<number>`count(*) filter (where ${s.auctionResults.sold} = 1)::int`, avg: sql<number>`coalesce(avg(${s.auctionResults.finalPriceJpy}) filter (where ${s.auctionResults.sold} = 1),0)::float` }).from(s.auctionResults).where(where)) as [{ n: number; sold: number; avg: number }];
    // the same code over the same window: what a row's price is read against
    const codes = [...new Set(items.map((x) => x.r.modelCode))];
    const avgRows = codes.length ? await db().select({ code: s.auctionResults.modelCode, avg: sql<number>`avg(${s.auctionResults.finalPriceJpy}) filter (where ${s.auctionResults.sold} = 1)::float`, sold: sql<number>`count(*) filter (where ${s.auctionResults.sold} = 1)::int` }).from(s.auctionResults).where(and(inArray(s.auctionResults.modelCode, codes), gte(s.auctionResults.saleDate, from))).groupBy(s.auctionResults.modelCode) : [];
    return {
      items: items.map((x) => {
        const a = avgRows.find((v) => v.code === x.r.modelCode);
        const photo = photoFor(x.r.make, x.r.model, x.r.color);
        return { ...x.r, hall: x.hall, image: photo ? photoPath(photo.file) : null, avgSameCodeJpy: a?.avg ? Math.round(a.avg / 1000) * 1000 : null, soldSameCode: a?.sold ?? 0 };
      }),
      total: agg.n,
      soldCount: agg.sold,
      avgSoldJpy: Math.round(agg.avg / 1000) * 1000,
      page: pageNo,
      pageSize,
      window: { from, to: newest },
      canExport: can(requirePerm(req, "auction.access"), "auction.bids.export"),
    };
  }),
);

/** The list as a spreadsheet: up to 10,000 rows, for the desk only. */
auctionRouter.get(
  "/stats.csv",
  h(async (req, res) => {
    requirePerm(req, "auction.bids.export");
    const q = parse(statsQuery, req.query);
    const { where } = await statsWhere(q);
    const rows = await db().select({ r: s.auctionResults, hall: s.auctionHalls.name }).from(s.auctionResults).innerJoin(s.auctionHalls, eq(s.auctionHalls.id, s.auctionResults.hallId)).where(where).orderBy(...statsOrder(q.sort), desc(s.auctionResults.saleDate), asc(s.auctionResults.id)).limit(10_000);
    const cell = (v: unknown) => {
      const x = v == null ? "" : String(v);
      const safe = /^[=+\-@]/.test(x) ? `'${x}` : x;
      return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const lines = [["Sale date", "Hall", "Lot", "Make", "Model", "Chassis model", "Year", "Engine cc", "Mileage km", "Grade", "Colour", "Gearbox", "Start JPY", "Final JPY", "Result"].join(",")];
    for (const { r, hall } of rows) lines.push([r.saleDate, hall, r.lotNo, r.make, r.model, r.modelCode, r.year, r.engineCc, r.mileageKm, r.grade, r.color, r.transmission, r.startPriceJpy, r.finalPriceJpy, r.sold ? "Sold" : "Not sold"].map(cell).join(","));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="past-prices.csv"`);
    res.send(`\ufeff${lines.join("\r\n")}`);
    return undefined;
  }),
);

auctionRouter.get(
  "/stats/:id",
  h(async (req) => {
    requirePerm(req, "auction.access");
    const [r] = await db().select({ r: s.auctionResults, hall: s.auctionHalls.name }).from(s.auctionResults).innerJoin(s.auctionHalls, eq(s.auctionHalls.id, s.auctionResults.hallId)).where(eq(s.auctionResults.id, String(req.params.id))).limit(1);
    if (!r) throw notFound();
    const history = await priceHistory(r.r.make, r.r.model, r.r.year);
    const near = await db().execute(sql`
      select prev_id, next_id from (
        select id, lag(id) over w as prev_id, lead(id) over w as next_id
        from auction_results where sale_date = ${r.r.saleDate}
        window w as (order by lot_no, id)
      ) x where id = ${r.r.id}`);
    const hood = (near as unknown as { rows: { prev_id: string | null; next_id: string | null }[] }).rows[0];
    const photo = photoFor(r.r.make, r.r.model, r.r.color);
    return { result: { ...r.r, hall: r.hall }, history, prevId: hood?.prev_id ?? null, nextId: hood?.next_id ?? null, marks: SHEET_MARKS, makers: lookupMakers(), photo: photo ? photoPath(photo.file) : null };
  }),
);

auctionRouter.get("/halls", h(async (req) => {
  requirePerm(req, "auction.access");
  return db().select().from(s.auctionHalls).orderBy(asc(s.auctionHalls.name));
}));

// ---------- admin ----------
auctionRouter.get(
  "/admin/overview",
  h(async (req) => {
    requirePerm(req, "auction.admin");
    const t = await today();
    const u = req.user!;
    const [[lots], [clients], [bids], [orders], [enq], byDay, topBidders, desk, funnelRows, customerActs, deskActs, recentBids, recentOrders, bidStates, enqStates, activity, timeline, journeys, staffRows, deskKinds, bidFlow, [pastN], roleReach] = await Promise.all([
      db().select({ upcoming: sql<number>`count(*) filter (where status = 'upcoming' and sale_date >= ${t})::int`, upcomingB: sql<number>`count(*) filter (where status = 'upcoming' and sale_date >= ${t} and feed = 'B')::int`, total: sql<number>`count(*)::int` }).from(s.auctionLots),
      db().select({ n: sql<number>`count(*)::int` }).from(s.users).where(eq(s.users.kind, "customer")),
      db().select({ n: sql<number>`count(*)::int`, value: sql<number>`coalesce(sum(amount_jpy) filter (where status in ('placed','under review','accepted','won')),0)::float`, awaiting: sql<number>`count(*) filter (where status = 'placed')::int` }).from(s.auctionBids),
      db().select({ n: sql<number>`count(*)::int`, pending: sql<number>`count(*) filter (where status = 'pending')::int`, confirmed: sql<number>`coalesce(sum(price_jpy) filter (where status in ('confirmed','paid','shipped','delivered','completed')),0)::float`, pipeline: sql<number>`coalesce(sum(price_jpy) filter (where status = 'pending'),0)::float` }).from(s.auctionOrders),
      db().select({ open: sql<number>`count(*) filter (where status in ('new','open'))::int` }).from(s.auctionEnquiries),
      db().execute(sql`select to_char(created_at, 'YYYY-MM-DD') as day, count(*)::int as bids from auction_bids where created_at > now() - interval '14 days' group by 1 order by 1`),
      db().execute(sql`select u.name, u.email, count(*)::int as bids, count(*) filter (where b.status = 'won')::int as won, sum(b.amount_jpy)::float as value from auction_bids b join users u on u.id = b.user_id group by u.name, u.email order by bids desc, value desc limit 8`),
      db().select({ name: s.users.name, kind: s.users.kind, lastSeenAt: s.users.lastSeenAt }).from(s.users).where(eq(s.users.kind, "staff")).orderBy(desc(s.users.lastSeenAt)),
      db().execute(sql`select
        (select count(*)::int from users where kind = 'customer') as clients,
        (select count(distinct e.user_id)::int from auction_enquiries e join users u on u.id = e.user_id where u.kind = 'customer') as enquired,
        (select count(distinct b.user_id)::int from auction_bids b join users u on u.id = b.user_id where u.kind = 'customer') as bidders,
        (select count(distinct o.user_id)::int from auction_orders o join users u on u.id = o.user_id where u.kind = 'customer') as orderers,
        (select count(*)::int from auction_bids) as bids,
        (select count(*)::int from auction_bids where status = 'won') as won,
        (select count(*)::int from auction_orders) as orders,
        (select count(*)::int from auction_orders where status in ('paid','shipped','delivered','completed')) as paid`),
      db().execute(sql`select * from (
          select 'bid' as kind, u.name, b.created_at as at, l.id as lot_id, l.lot_no, l.make, l.model, b.amount_jpy as amount from auction_bids b join users u on u.id = b.user_id join auction_lots l on l.id = b.lot_id
          union all select 'order', u.name, o.created_at, l.id, l.lot_no, l.make, l.model, o.price_jpy from auction_orders o join users u on u.id = o.user_id join auction_lots l on l.id = o.lot_id
          union all select 'enquiry', u.name, e.created_at, l.id, l.lot_no, l.make, l.model, null from auction_enquiries e join users u on u.id = e.user_id join auction_lots l on l.id = e.lot_id
        ) x order by at desc limit 10`),
      db().execute(sql`select a.id, a.summary, a.created_at as at, u.name from audit_log a left join users u on u.id = a.actor_user_id where a.actor_kind in ('human','fte') and (a.action like 'bid.%' or a.action like 'order.%' or a.action like 'enquiry.%') order by a.created_at desc limit 10`),
      db().select({ id: s.auctionBids.id, bidNo: s.auctionBids.bidNo, amountJpy: s.auctionBids.amountJpy, status: s.auctionBids.status, createdAt: s.auctionBids.createdAt, who: s.users.name, lotId: s.auctionLots.id, lotNo: s.auctionLots.lotNo, make: s.auctionLots.make, model: s.auctionLots.model }).from(s.auctionBids).innerJoin(s.users, eq(s.users.id, s.auctionBids.userId)).innerJoin(s.auctionLots, eq(s.auctionLots.id, s.auctionBids.lotId)).orderBy(desc(s.auctionBids.createdAt)).limit(8),
      db().select({ id: s.auctionOrders.id, orderNo: s.auctionOrders.orderNo, priceJpy: s.auctionOrders.priceJpy, status: s.auctionOrders.status, createdAt: s.auctionOrders.createdAt, who: s.users.name, lotId: s.auctionLots.id, lotNo: s.auctionLots.lotNo, make: s.auctionLots.make, model: s.auctionLots.model }).from(s.auctionOrders).innerJoin(s.users, eq(s.users.id, s.auctionOrders.userId)).innerJoin(s.auctionLots, eq(s.auctionLots.id, s.auctionOrders.lotId)).orderBy(desc(s.auctionOrders.createdAt)).limit(8),
      db().select({ status: s.auctionBids.status, n: sql<number>`count(*)::int` }).from(s.auctionBids).groupBy(s.auctionBids.status),
      db().select({ status: s.auctionEnquiries.status, n: sql<number>`count(*)::int` }).from(s.auctionEnquiries).groupBy(s.auctionEnquiries.status),
      db().execute(sql`
        with days as (select to_char(d, 'YYYY-MM-DD') as day from generate_series(now() - interval '29 days', now(), interval '1 day') d)
        select d.day,
          (select count(*)::int from users u where u.kind = 'customer' and to_char(u.created_at, 'YYYY-MM-DD') = d.day) as registrations,
          (select count(*)::int from auction_enquiries e where to_char(e.created_at, 'YYYY-MM-DD') = d.day) as enquiries,
          (select count(*)::int from auction_bids b where to_char(b.created_at, 'YYYY-MM-DD') = d.day) as bids
        from days d order by d.day`),
      db().execute(sql`select * from (
          select 'registered' as kind, u.name, u.created_at as at, '' as what, null::text as ref from users u where u.kind = 'customer'
          union all select 'bid', u.name, b.created_at, l.make || ' ' || l.model || ' · ¥' || to_char(b.amount_jpy, 'FM999,999,999'), l.id from auction_bids b join users u on u.id = b.user_id join auction_lots l on l.id = b.lot_id
          union all select 'enquired', u.name, e.created_at, l.make || ' ' || l.model, e.id from auction_enquiries e join users u on u.id = e.user_id join auction_lots l on l.id = e.lot_id
          union all select 'ordered', u.name, o.created_at, '¥' || to_char(coalesce(o.price_jpy,0), 'FM999,999,999'), o.id from auction_orders o join users u on u.id = o.user_id
        ) x order by at desc limit 14`),
      db().execute(sql`select u.id, u.name, u.email, u.created_at as joined,
          (select count(*)::int from auction_enquiries e where e.user_id = u.id) as enquiries,
          (select count(*)::int from auction_bids b where b.user_id = u.id) as bids,
          (select coalesce(sum(b.amount_jpy),0)::float from auction_bids b where b.user_id = u.id) as offered,
          (select count(*)::int from auction_orders o where o.user_id = u.id) as orders,
          greatest(u.created_at, (select max(b.created_at) from auction_bids b where b.user_id = u.id), (select max(e.created_at) from auction_enquiries e where e.user_id = u.id)) as last_seen
        from users u where u.kind = 'customer' order by last_seen desc limit 10`),
      db().execute(sql`select u.id, u.name, u.kind, u.is_active, u.last_seen_at, r.name as role,
          (select count(*)::int from audit_log a where a.actor_user_id = u.id and a.created_at > now() - interval '30 days' and (a.action like 'bid.%' or a.action like 'order.%' or a.action like 'enquiry.%')) as acts
        from users u left join roles r on r.id = u.role_id where u.kind = 'staff' or u.username = 'kaito' order by acts desc, u.name limit 12`),
      db().execute(sql`select a.action, count(*)::int as n from audit_log a where a.created_at > now() - interval '30 days' and a.actor_kind in ('human','fte') and (a.action like 'bid.%' or a.action like 'order.%' or a.action like 'enquiry.%') group by a.action order by n desc`),
      db().execute(sql`select u.name, b.status, count(*)::int as n, sum(b.amount_jpy)::float as amount from auction_bids b join users u on u.id = b.user_id where u.kind = 'customer' group by u.name, b.status`),
      db().select({ n: sql<number>`count(*)::int` }).from(s.auctionResults),
      db().execute(sql`select r.name, count(rp.*)::int as perms from roles r left join role_permissions rp on rp.role_id = r.id where r.slug not in ('customer','fte') group by r.name order by perms desc`),
    ]);
    const totalBids = bids?.n ?? 0;
    const flow = new Map<string, { name: string; counts: Record<string, number>; amount: number }>();
    for (const r of (bidFlow as unknown as { rows: { name: string; status: string; n: number; amount: number }[] }).rows) {
      const one = flow.get(r.name) ?? { name: r.name, counts: {}, amount: 0 };
      one.counts[r.status] = r.n;
      one.amount += r.amount;
      flow.set(r.name, one);
    }
    const signal = await feedSignal();
    const iso = (x: string | Date | null) => (x ? new Date(x).toISOString() : null);
    return {
      lots,
      clients: clients?.n ?? 0,
      pastResults: pastN?.n ?? 0,
      bids,
      orders,
      enquiries: enq,
      bidsByDay: (byDay as unknown as { rows: { day: string; bids: number }[] }).rows,
      topBidders: (topBidders as unknown as { rows: { name: string; bids: number; value: number }[] }).rows.map((r) => ({ ...r, share: totalBids ? Math.round((r.bids / totalBids) * 100) : 0 })),
      desk,
      funnel: (funnelRows as unknown as { rows: Record<string, number>[] }).rows[0],
      customerActions: (customerActs as unknown as { rows: { at: string }[] }).rows.map((r) => ({ ...r, at: iso(r.at) })),
      deskActions: (deskActs as unknown as { rows: { at: string }[] }).rows.map((r) => ({ ...r, at: iso(r.at) })),
      recentBids,
      recentOrders,
      bidStates: BID_STATES.map((st) => ({ status: st, n: bidStates.find((x) => x.status === st)?.n ?? 0 })),
      enquiryStates: ["new", "open", "answered", "closed"].map((st) => ({ status: st, n: enqStates.find((x) => x.status === st)?.n ?? 0 })),
      activity: (activity as unknown as { rows: { day: string; registrations: number; enquiries: number; bids: number }[] }).rows,
      timeline: (timeline as unknown as { rows: { at: string }[] }).rows.map((r) => ({ ...r, at: iso(r.at) })),
      journeys: (journeys as unknown as { rows: { joined: string; last_seen: string }[] }).rows.map((r) => ({ ...r, joined: iso(r.joined), last_seen: iso(r.last_seen) })),
      staff: (staffRows as unknown as { rows: { last_seen_at: string | null }[] }).rows.map((r) => ({ ...r, last_seen_at: iso(r.last_seen_at) })),
      deskKinds: (deskKinds as unknown as { rows: { action: string; n: number }[] }).rows,
      bidFlow: [...flow.values()].sort((a, b) => b.amount - a.amount).slice(0, 12),
      roleReach: (roleReach as unknown as { rows: { name: string; perms: number }[] }).rows,
      feed: { status: signal.status === "working" ? "working" : "down", text: signal.text, detail: `${(lots?.upcoming ?? 0).toLocaleString("en-US")} lots on sale = ${((lots?.upcoming ?? 0) - (lots?.upcomingB ?? 0)).toLocaleString("en-US")} + ${(lots?.upcomingB ?? 0).toLocaleString("en-US")}`, newestAt: signal.feeds.map((f) => f.newestAt).filter(Boolean).sort().at(-1) ?? null },
      canSee: { bids: can(u, "auction.bids.view"), feeds: can(u, "auction.lots.import") },
    };
  }),
);

/** The green or red line on auction pages, for staff. */
auctionRouter.get(
  "/signal",
  h(async (req) => {
    requirePerm(req, "auction.admin");
    const r = await feedSignal();
    return { status: r.status, text: r.text };
  }),
);

/** The two numbers beside the desk's tabs: today's bids, and enquiries nobody has opened. */
auctionRouter.get(
  "/admin/badges",
  h(async (req) => {
    const u = requirePerm(req, "auction.admin");
    const t = await today();
    const [b] = can(u, "auction.bids.view") ? ((await db().select({ n: sql<number>`count(*)::int` }).from(s.auctionBids).where(and(sql`to_char(${s.auctionBids.createdAt}, 'YYYY-MM-DD') = ${t}`, can(u, "auction.bids.view_all") ? undefined : eq(s.auctionBids.userId, u.id)))) as [{ n: number }]) : [{ n: 0 }];
    const [e] = can(u, "auction.enquiries.reply") ? ((await db().select({ n: sql<number>`count(*)::int` }).from(s.auctionEnquiries).where(eq(s.auctionEnquiries.status, "new"))) as [{ n: number }]) : [{ n: 0 }];
    return { bids: b?.n ?? 0, enquiries: e?.n ?? 0 };
  }),
);

/** Data sources: the demo's two feeds. Real feeds and their sign-ins are not part of this demo. */
auctionRouter.get(
  "/admin/feeds",
  h(async (req) => {
    requirePerm(req, "auction.lots.import");
    return feedSignal();
  }),
);
auctionRouter.put(
  "/admin/feeds/:key",
  h(async (req) => {
    const u = requirePerm(req, "auction.lots.import");
    const key = String(req.params.key);
    if (key !== "A" && key !== "B") throw notFound();
    const b = parse(z.object({ paused: z.boolean() }), req.body);
    const r = await setFeedPaused(key, b.paused);
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "feed.paused", summary: `${u.name} ${b.paused ? "paused" : "restarted"} demo feed ${key}` });
    await emit("feed.changed", { key, paused: b.paused });
    return r;
  }),
);
auctionRouter.post(
  "/admin/feeds/:key/run",
  h(async (req) => {
    requirePerm(req, "auction.lots.import");
    const key = String(req.params.key);
    if (key !== "A" && key !== "B") throw notFound();
    return { added: await runFeed(key) };
  }),
);

const dayOf = (raw: unknown, fallback: string) => (/^\d{4}-\d{2}-\d{2}$/.test(String(raw ?? "")) ? String(raw) : fallback);

auctionRouter.get(
  "/admin/bids",
  h(async (req) => {
    const u = requirePerm(req, "auction.bids.view");
    const t = await today();
    const day = dayOf(req.query.day, t);
    const scope = can(u, "auction.bids.view_all") ? undefined : eq(s.auctionBids.userId, u.id);
    const onDay = sql`to_char(${s.auctionBids.createdAt}, 'YYYY-MM-DD') = ${day}`;
    const filter = BID_STATES.includes(String(req.query.status ?? "") as (typeof BID_STATES)[number]) ? String(req.query.status) : "";
    const rows = await db()
      .select({ b: s.auctionBids, who: s.users.name, whoEmail: s.users.email, whoKind: s.users.kind, lotId: s.auctionLots.id, lotNo: s.auctionLots.lotNo, make: s.auctionLots.make, model: s.auctionLots.model, year: s.auctionLots.year, saleDate: s.auctionLots.saleDate, hall: s.auctionHalls.name })
      .from(s.auctionBids)
      .innerJoin(s.users, eq(s.users.id, s.auctionBids.userId))
      .innerJoin(s.auctionLots, eq(s.auctionLots.id, s.auctionBids.lotId))
      .innerJoin(s.auctionHalls, eq(s.auctionHalls.id, s.auctionLots.hallId))
      .where(and(scope, onDay, filter ? eq(s.auctionBids.status, filter) : undefined))
      .orderBy(desc(s.auctionBids.createdAt))
      .limit(500);
    const counts = await db().select({ status: s.auctionBids.status, n: sql<number>`count(*)::int` }).from(s.auctionBids).where(and(scope, onDay)).groupBy(s.auctionBids.status);
    return {
      day,
      isToday: day === t,
      total: counts.reduce((a, c) => a + c.n, 0),
      counts: BID_STATES.map((st) => ({ status: st, n: counts.find((c) => c.status === st)?.n ?? 0 })),
      accepted: counts.find((c) => c.status === "accepted")?.n ?? 0,
      items: rows.map((r) => ({ ...r.b, who: r.who, whoEmail: r.whoEmail, whoKind: r.whoKind, lot: { id: r.lotId, lotNo: r.lotNo, make: r.make, model: r.model, year: r.year, saleDate: r.saleDate, hall: r.hall } })),
    };
  }),
);

/** The sheet the desk works from: accepted bids of one day, one buyer's cars together, in the order the desk must act. */
auctionRouter.get(
  "/admin/bids.xlsx",
  h(async (req, res) => {
    const u = requirePerm(req, "auction.bids.export");
    const day = dayOf(req.query.day, await today());
    const rows = await db()
      .select({ b: s.auctionBids, c: s.users, l: s.auctionLots, hall: s.auctionHalls.name })
      .from(s.auctionBids)
      .innerJoin(s.users, eq(s.users.id, s.auctionBids.userId))
      .innerJoin(s.auctionLots, eq(s.auctionLots.id, s.auctionBids.lotId))
      .innerJoin(s.auctionHalls, eq(s.auctionHalls.id, s.auctionLots.hallId))
      .where(and(eq(s.auctionBids.status, "accepted"), sql`to_char(${s.auctionBids.createdAt}, 'YYYY-MM-DD') = ${day}`, can(u, "auction.bids.view_all") ? undefined : eq(s.auctionBids.userId, u.id)));
    rows.sort((a, b) => a.c.name.localeCompare(b.c.name) || a.l.saleDate.localeCompare(b.l.saleDate) || a.l.lotNo - b.l.lotNo);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`Accepted ${day}`);
    ws.columns = [
      { header: "Lot No.", key: "lot", width: 10 },
      { header: "Auction", key: "hall", width: 24 },
      { header: "Date/Time", key: "when", width: 16 },
      { header: "Make", key: "veh", width: 28 },
      { header: "Year", key: "year", width: 7 },
      { header: "Grade", key: "grade", width: 7 },
      { header: "Push Price", key: "push", width: 13, style: { numFmt: "#,##0" } },
      { header: "Max Price", key: "max", width: 13, style: { numFmt: "#,##0" } },
      { header: "Notes", key: "notes", width: 34 },
      { header: "Chassis Model", key: "code", width: 14 },
      { header: "Model", key: "model", width: 20 },
      { header: "Mileage (km)", key: "km", width: 12, style: { numFmt: "#,##0" } },
      { header: "Engine (cc)", key: "cc", width: 11, style: { numFmt: "#,##0" } },
      { header: "Transmission", key: "trans", width: 13 },
      { header: "Colour", key: "color", width: 14 },
      { header: "Model Grade", key: "trim", width: 14 },
      { header: "Start Price", key: "start", width: 13, style: { numFmt: "#,##0" } },
      { header: "Bid No.", key: "no", width: 18 },
      { header: "Bid Date", key: "at", width: 17 },
      { header: "Status", key: "st", width: 10 },
      { header: "Client Name", key: "client", width: 22 },
      { header: "Client Email", key: "email", width: 28 },
      { header: "Client Phone", key: "phone", width: 18 },
      { header: "City", key: "city", width: 16 },
      { header: "Address", key: "address", width: 30 },
      { header: "Country", key: "country", width: 10 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };
    for (const { b, c, l, hall } of rows)
      ws.addRow({ lot: String(l.lotNo), hall, when: `${l.saleDate}${l.saleTime ? ` ${l.saleTime}` : ""}`, veh: `${l.make} ${l.model}`, year: l.year, grade: l.grade, push: b.amountJpy, max: b.amountJpy + (b.overBidJpy ?? 0), notes: [b.note, b.message].filter(Boolean).join(" · "), code: l.modelCode, model: l.model, km: l.mileageKm, cc: l.engineCc, trans: l.transmission, color: l.color, trim: l.modelGrade, start: l.startPriceJpy, no: b.bidNo, at: new Date(b.createdAt).toISOString().slice(0, 16).replace("T", " "), st: b.status, client: c.name, email: c.email, phone: c.phone, city: c.city, address: c.address, country: c.countryCode });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="accepted-bids-${day}.xlsx"`);
    res.send(Buffer.from(await wb.xlsx.writeBuffer()));
    return undefined;
  }),
);

auctionRouter.put(
  "/admin/bids/:id",
  h(async (req) => {
    const u = requirePerm(req, "auction.bids.manage");
    const b = parse(z.object({ status: z.enum(BID_STATES).optional(), note: z.string().max(200).optional() }), req.body);
    const [row] = await db().select().from(s.auctionBids).where(eq(s.auctionBids.id, String(req.params.id))).limit(1);
    if (!row) throw notFound("Bid not found");
    if (!can(u, "auction.bids.view_all") && row.userId !== u.id) throw forbidden("That bid was placed by somebody else");
    await db().update(s.auctionBids).set(b).where(eq(s.auctionBids.id, row.id));
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: b.status ? "bid.status" : "bid.note", entity: "bid", entityId: row.id, summary: `${u.name} updated bid ${row.bidNo ?? ""}${b.status ? ` → ${b.status}` : ""}` });
    return { ok: true };
  }),
);

auctionRouter.delete(
  "/admin/bids/:id",
  h(async (req) => {
    const u = requirePerm(req, "auction.bids.manage");
    const [b] = await db().select({ b: s.auctionBids, lotNo: s.auctionLots.lotNo, who: s.users.name }).from(s.auctionBids).innerJoin(s.auctionLots, eq(s.auctionLots.id, s.auctionBids.lotId)).innerJoin(s.users, eq(s.users.id, s.auctionBids.userId)).where(eq(s.auctionBids.id, String(req.params.id))).limit(1);
    if (!b) throw notFound("Bid not found");
    if (b.b.status === "won") throw conflict("A won bid has an order behind it, so it cannot be deleted. Change its status first");
    await db().delete(s.auctionBids).where(eq(s.auctionBids.id, b.b.id));
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "bid.deleted", entity: "lot", entityId: b.b.lotId, summary: `${u.name} deleted a bid of ¥${b.b.amountJpy.toLocaleString("en-US")} by ${b.who} on lot ${b.lotNo}` });
    return { ok: true };
  }),
);

// ---------- every lot, whatever its state ----------
auctionRouter.get(
  "/admin/vehicles",
  h(async (req) => {
    requirePerm(req, "auction.admin");
    const q = parse(z.object({ q: z.string().trim().max(60).optional(), status: z.enum(["upcoming", "sold", "unsold", "withdrawn"]).optional(), hall: z.string().max(40).optional() }).passthrough(), req.query);
    const { pageSize, offset, page: pageNo } = page(req.query, 25, 100);
    const w: (SQL | undefined)[] = [];
    if (q.q) {
      const like = `%${q.q}%`;
      const code = q.q.toUpperCase().split("-")[0]!;
      w.push(or(ilike(s.auctionLots.make, like), ilike(s.auctionLots.model, like), ilike(s.auctionLots.modelCode, like), ilike(s.auctionLots.modelCode, `${code}%`), /^\d+$/.test(q.q) ? eq(s.auctionLots.lotNo, Number(q.q)) : undefined));
    }
    if (q.status) w.push(eq(s.auctionLots.status, q.status));
    if (q.hall) w.push(eq(s.auctionLots.hallId, q.hall));
    const where = and(...w);
    const rows = await db()
      .select({ bodyType: s.auctionLots.bodyType, color: s.auctionLots.color, resultPriceJpy: s.auctionLots.resultPriceJpy, id: s.auctionLots.id, lotNo: s.auctionLots.lotNo, saleDate: s.auctionLots.saleDate, make: s.auctionLots.make, model: s.auctionLots.model, modelCode: s.auctionLots.modelCode, year: s.auctionLots.year, mileageKm: s.auctionLots.mileageKm, grade: s.auctionLots.grade, startPriceJpy: s.auctionLots.startPriceJpy, status: s.auctionLots.status, hall: s.auctionHalls.name, bids: sql<number>`(select count(*)::int from auction_bids b where b.lot_id = "auction_lots"."id")` })
      .from(s.auctionLots)
      .innerJoin(s.auctionHalls, eq(s.auctionHalls.id, s.auctionLots.hallId))
      .where(where)
      .orderBy(desc(s.auctionLots.saleDate), asc(s.auctionLots.lotNo), asc(s.auctionLots.id))
      .limit(pageSize)
      .offset(offset);
    const [{ n }] = (await db().select({ n: sql<number>`count(*)::int` }).from(s.auctionLots).where(where)) as [{ n: number }];
    return { items: rows.map((r) => ({ ...r, image: carImageUrl(r.bodyType, colorHex(r.color), "side") })), total: n, page: pageNo, pageSize };
  }),
);

export const ORDER_STATES = ["pending", "approved", "confirmed", "paid", "shipped", "delivered", "completed", "cancelled"] as const;

auctionRouter.get(
  "/admin/orders",
  h(async (req) => {
    requirePerm(req, "auction.orders.manage");
    const filter = (ORDER_STATES as readonly string[]).includes(String(req.query.status ?? "")) ? String(req.query.status) : "";
    const rows = await db().select({ o: s.auctionOrders, who: s.users.name, email: s.users.email, lotId: s.auctionLots.id, lotNo: s.auctionLots.lotNo, make: s.auctionLots.make, model: s.auctionLots.model, year: s.auctionLots.year }).from(s.auctionOrders).innerJoin(s.users, eq(s.users.id, s.auctionOrders.userId)).innerJoin(s.auctionLots, eq(s.auctionLots.id, s.auctionOrders.lotId)).where(filter ? eq(s.auctionOrders.status, filter) : undefined).orderBy(desc(s.auctionOrders.createdAt)).limit(300);
    const counts = await db().select({ status: s.auctionOrders.status, n: sql<number>`count(*)::int` }).from(s.auctionOrders).groupBy(s.auctionOrders.status);
    return { items: rows.map((r) => ({ ...r.o, who: r.who, email: r.email, lot: { id: r.lotId, lotNo: r.lotNo, make: r.make, model: r.model, year: r.year } })), total: counts.reduce((a, c) => a + c.n, 0), counts: ORDER_STATES.map((st) => ({ status: st, n: counts.find((c) => c.status === st)?.n ?? 0 })) };
  }),
);

auctionRouter.put(
  "/admin/orders/:id",
  h(async (req) => {
    const u = requirePerm(req, "auction.orders.manage");
    const b = parse(z.object({ status: z.enum(ORDER_STATES) }), req.body);
    await db().update(s.auctionOrders).set({ status: b.status, updatedAt: new Date() }).where(eq(s.auctionOrders.id, String(req.params.id)));
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "order.status", entity: "order", entityId: String(req.params.id), summary: `${u.name} set an order to ${b.status}` });
    return { ok: true };
  }),
);

const ENQUIRY_STATES = ["new", "open", "answered", "closed"] as const;

auctionRouter.get(
  "/admin/enquiries",
  h(async (req) => {
    requirePerm(req, "auction.enquiries.reply");
    const filter = (ENQUIRY_STATES as readonly string[]).includes(String(req.query.status ?? "")) ? String(req.query.status) : "";
    const rows = await db().select({ e: s.auctionEnquiries, who: s.users.name, email: s.users.email, lotNo: s.auctionLots.lotNo, make: s.auctionLots.make, model: s.auctionLots.model, lotId: s.auctionLots.id }).from(s.auctionEnquiries).innerJoin(s.users, eq(s.users.id, s.auctionEnquiries.userId)).innerJoin(s.auctionLots, eq(s.auctionLots.id, s.auctionEnquiries.lotId)).where(filter ? eq(s.auctionEnquiries.status, filter) : undefined).orderBy(desc(s.auctionEnquiries.createdAt)).limit(300);
    const counts = await db().select({ status: s.auctionEnquiries.status, n: sql<number>`count(*)::int` }).from(s.auctionEnquiries).groupBy(s.auctionEnquiries.status);
    return { items: rows.map((r) => ({ ...r.e, who: r.who, email: r.email, lot: { id: r.lotId, lotNo: r.lotNo, make: r.make, model: r.model } })), total: counts.reduce((a, c) => a + c.n, 0), counts: ENQUIRY_STATES.map((st) => ({ status: st, n: counts.find((c) => c.status === st)?.n ?? 0 })) };
  }),
);

/** One enquiry in full. Reading it is what moves it from new to open: the desk can tell unread from read. */
auctionRouter.get(
  "/admin/enquiries/:id",
  h(async (req) => {
    const u = requirePerm(req, "auction.enquiries.reply");
    const [row] = await db().select({ e: s.auctionEnquiries, c: s.users, l: s.auctionLots, hall: s.auctionHalls.name }).from(s.auctionEnquiries).innerJoin(s.users, eq(s.users.id, s.auctionEnquiries.userId)).innerJoin(s.auctionLots, eq(s.auctionLots.id, s.auctionEnquiries.lotId)).innerJoin(s.auctionHalls, eq(s.auctionHalls.id, s.auctionLots.hallId)).where(eq(s.auctionEnquiries.id, String(req.params.id))).limit(1);
    if (!row) throw notFound("No enquiry with that number. It may have been removed");
    const others = await db().select({ id: s.auctionEnquiries.id, enqNo: s.auctionEnquiries.enqNo, status: s.auctionEnquiries.status, createdAt: s.auctionEnquiries.createdAt, make: s.auctionLots.make, model: s.auctionLots.model }).from(s.auctionEnquiries).innerJoin(s.auctionLots, eq(s.auctionLots.id, s.auctionEnquiries.lotId)).where(and(eq(s.auctionEnquiries.userId, row.e.userId), sql`${s.auctionEnquiries.id} <> ${row.e.id}`)).orderBy(desc(s.auctionEnquiries.createdAt)).limit(20);
    const shown = row.e.status;
    if (row.e.status === "new") {
      await db().update(s.auctionEnquiries).set({ status: "open" }).where(and(eq(s.auctionEnquiries.id, row.e.id), eq(s.auctionEnquiries.status, "new")));
      await audit(db(), { actorUserId: u.id, actorKind: "human", action: "enquiry.open", entity: "enquiry", entityId: row.e.id, summary: `${u.name} opened enquiry ${row.e.enqNo}` });
    }
    const [replier] = row.e.repliedBy ? await db().select({ name: s.users.name, kind: s.users.kind }).from(s.users).where(eq(s.users.id, row.e.repliedBy)).limit(1) : [];
    return {
      enquiry: { ...row.e, status: shown === "new" ? "open" : shown },
      repliedByName: replier?.name ?? null,
      repliedByKind: replier?.kind ?? null,
      client: { name: row.c.name, email: row.c.email, phone: row.c.phone },
      lot: { id: row.l.id, lotNo: row.l.lotNo, make: row.l.make, model: row.l.model, year: row.l.year, grade: row.l.grade, hall: row.hall, saleDate: row.l.saleDate },
      others,
    };
  }),
);

auctionRouter.post(
  "/admin/enquiries/:id/reply",
  h(async (req) => {
    const u = requirePerm(req, "auction.enquiries.reply");
    const b = parse(z.object({ reply: z.string().trim().max(2000).optional(), status: z.enum(ENQUIRY_STATES).optional() }), req.body);
    const [e] = await db().select().from(s.auctionEnquiries).where(eq(s.auctionEnquiries.id, String(req.params.id))).limit(1);
    if (!e) throw notFound();
    const text = b.reply ?? "";
    if (text && text.length < 2) throw bad("Write the reply first");
    // writing a reply is answering, unless the person deliberately closed it
    const status = b.status === "closed" ? "closed" : text ? "answered" : b.status ?? e.status;
    await db().update(s.auctionEnquiries).set(text ? { reply: text, repliedBy: u.id, repliedAt: new Date(), status } : { status }).where(eq(s.auctionEnquiries.id, e.id));
    if (text) await notify([e.userId], { type: "enquiry_reply", title: `Reply to ${e.enqNo}`, body: text.slice(0, 140), link: `/auction/me` });
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: text ? "enquiry.replied" : "enquiry.status", entity: "enquiry", entityId: e.id, summary: `${u.name} ${text ? "answered" : `set to ${status}`} enquiry ${e.enqNo}` });
    return { ok: true, status };
  }),
);

auctionRouter.get(
  "/admin/clients",
  h(async (req) => {
    requirePerm(req, "auction.clients.view");
    const items = await db()
      .select({ id: s.users.id, name: s.users.name, email: s.users.email, phone: s.users.phone, countryCode: s.users.countryCode, company: s.users.company, isActive: s.users.isActive, createdAt: s.users.createdAt, bids: sql<number>`(select count(*)::int from auction_bids b where b.user_id = "users"."id")`, orders: sql<number>`(select count(*)::int from auction_orders o where o.user_id = "users"."id")`, orderValue: sql<number>`(select coalesce(sum(o.price_jpy),0)::float from auction_orders o where o.user_id = "users"."id")`, enquiries: sql<number>`(select count(*)::int from auction_enquiries e where e.user_id = "users"."id")` })
      .from(s.users)
      .where(eq(s.users.kind, "customer"))
      .orderBy(desc(s.users.createdAt));
    return { items, registered: items.length, withOrders: items.filter((c) => c.orders > 0).length, totalOrderValue: items.reduce((a, c) => a + c.orderValue, 0) };
  }),
);

void bad;
void forbidden;
