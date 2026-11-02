import { Router } from "express";
import archiver from "archiver";
import ExcelJS from "exceljs";
import { and, asc, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import * as s from "../db/schema";
import { bad, conflict, forbidden, h, notFound, page, parse } from "../lib/http";
import { can, requireAuth, requirePerm } from "../auth/session";
import { getLot, listLots, lotFacets, lotVisible, placeBid, priceHistory, toSheetLot, today, type LotFilters } from "../services/auction";
import { fetchImage } from "../services/lotImages";
import { sheetPng } from "../services/sheets";
import { carImageUrl, carSvg } from "../services/carArt";
import { renderPdf } from "../services/pdf";
import { audit } from "../services/audit";
import { notify, usersWithPerm } from "../services/notify";
import { colorHex } from "../seed/catalog";

export const auctionRouter = Router();

const filterSchema = z.object({
  saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  make: z.string().max(40).optional(),
  model: z.string().max(60).optional(),
  modelCode: z.string().max(20).optional(),
  hall: z.string().max(40).optional(),
  grade: z.string().max(4).optional(),
  color: z.string().max(30).optional(),
  transmission: z.string().max(20).optional(),
  yearMin: z.coerce.number().int().optional(),
  yearMax: z.coerce.number().int().optional(),
  mileageMax: z.coerce.number().int().optional(),
  priceMax: z.coerce.number().int().optional(),
  lots: z.string().max(200).optional(),
  status: z.enum(["upcoming", "concluded", "all"]).optional(),
  sort: z.enum(["lot", "price_asc", "price_desc", "year_desc", "mileage_asc"]).optional(),
});

function toFilters(q: z.infer<typeof filterSchema>, archive: boolean): LotFilters {
  const lotNos = q.lots
    ? q.lots
        .split(/[,\s]+/)
        .map((x) => Number.parseInt(x, 10))
        .filter((n) => Number.isFinite(n))
    : undefined;
  return { ...q, lotNos, status: archive ? q.status ?? "upcoming" : "upcoming" };
}

const ownPhotos = (l: { photoUrls?: unknown }) => (Array.isArray(l.photoUrls) ? (l.photoUrls as string[]) : []);
const photosFor = (l: { bodyType: string; color: string; photoCount: number; photoUrls?: unknown }) => (ownPhotos(l).length ? ownPhotos(l) : (["side", "front", "rear", "interior"] as const).map((v) => carImageUrl(l.bodyType, colorHex(l.color), v)));

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
    const { pageSize, offset, page: pageNo } = page(req.query, 30, 60);
    const r = await listLots({ ...toFilters(q, can(u, "auction.lots.view_sold")), limit: pageSize, offset });
    return { ...r, items: r.items.map((l) => ({ ...l, image: photosFor(l)[0] })), page: pageNo, pageSize, today: await today() };
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
    return { lot: pub, photos: photosFor(l), sheet: l.sheetUrl === "" ? null : `/api/auction/lots/${l.id}/sheet.png`, history, myBids, soraReading: reading?.result ?? null, biddingOpen: l.status === "upcoming" && l.saleDate >= (await today()) };
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
    const b = parse(z.object({ amountJpy: z.coerce.number().int().positive(), note: z.string().max(200).optional() }), req.body);
    const bid = await placeBid(u.id, String(req.params.id), b.amountJpy, b.note ?? null);
    await notify(await usersWithPerm("auction.bids.view_all"), { type: "bid", title: `New bid ¥${b.amountJpy.toLocaleString("en-US")}`, body: `${u.name} bid on a lot`, link: `/auction/admin/bids` });
    return bid;
  }),
);

auctionRouter.post(
  "/lots/:id/order",
  h(async (req) => {
    const u = requirePerm(req, "auction.access");
    const l = await getLot(String(req.params.id));
    if (!l || !(await lotVisible(l, can(u, "auction.lots.view_sold")))) throw notFound();
    const year = new Date().getUTCFullYear();
    const [{ n }] = (await db().select({ n: sql<number>`count(*)::int` }).from(s.auctionOrders)) as [{ n: number }];
    const [o] = await db().insert(s.auctionOrders).values({ orderNo: `ORD-${year}-${String(100001 + n).padStart(6, "0")}`, lotId: l.id, userId: u.id, priceJpy: l.avgPriceJpy, note: (req.body?.note as string) ?? null }).returning();
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "order.created", entity: "lot", entityId: l.id, summary: `${u.name} placed order ${o!.orderNo} on lot ${l.lotNo}` });
    await notify(await usersWithPerm("auction.orders.manage"), { type: "order", title: `New order ${o!.orderNo}`, body: `${u.name} · lot ${l.lotNo} ${l.make} ${l.model}`, link: `/auction/admin/orders` });
    return o;
  }),
);

auctionRouter.post(
  "/lots/:id/enquiries",
  h(async (req) => {
    const u = requirePerm(req, "auction.access");
    const b = parse(z.object({ message: z.string().trim().min(3).max(2000) }), req.body);
    const l = await getLot(String(req.params.id));
    if (!l) throw notFound();
    const year = new Date().getUTCFullYear();
    const [{ n }] = (await db().select({ n: sql<number>`count(*)::int` }).from(s.auctionEnquiries)) as [{ n: number }];
    const [e] = await db().insert(s.auctionEnquiries).values({ enqNo: `INQ-${year}-${String(200001 + n).padStart(6, "0")}`, lotId: l.id, userId: u.id, message: b.message }).returning();
    await notify(await usersWithPerm("auction.enquiries.reply"), { type: "enquiry", title: `Enquiry ${e!.enqNo}`, body: b.message.slice(0, 120), link: `/auction/admin/enquiries` });
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
    return { bids: bids.map((x) => ({ ...x.b, lot: { lotNo: x.lotNo, make: x.make, model: x.model, year: x.year, saleDate: x.saleDate, status: x.status } })), orders: orders.map((x) => ({ ...x.o, lot: { lotNo: x.lotNo, make: x.make, model: x.model } })), enquiries: enquiries.map((x) => ({ ...x.e, lot: { lotNo: x.lotNo, make: x.make, model: x.model } })) };
  }),
);

// ---------- statistics (past results) ----------
auctionRouter.get(
  "/stats",
  h(async (req) => {
    requirePerm(req, "auction.access");
    const q = parse(z.object({ make: z.string().max(40).optional(), model: z.string().max(60).optional(), yearMin: z.coerce.number().int().optional(), yearMax: z.coerce.number().int().optional(), grade: z.string().max(4).optional(), hall: z.string().max(40).optional(), sold: z.enum(["1", "0"]).optional(), engine: z.string().regex(/^\d{0,5}-\d{0,5}$/).optional(), sort: z.enum(["date", "price_asc", "price_desc", "year_desc", "mileage_asc"]).optional() }).passthrough(), req.query);
    const { pageSize, offset, page: pageNo } = page(req.query, 20, 50);
    const [{ newest }] = (await db().select({ newest: sql<string>`max(${s.auctionResults.saleDate})::text` }).from(s.auctionResults)) as [{ newest: string }];
    const from = new Date(new Date(newest).getTime() - 92 * 86400_000).toISOString().slice(0, 10);
    const w: (SQL | undefined)[] = [gte(s.auctionResults.saleDate, from)];
    if (q.make) w.push(ilike(s.auctionResults.make, q.make));
    if (q.model) w.push(ilike(s.auctionResults.model, q.model));
    if (q.yearMin) w.push(gte(s.auctionResults.year, q.yearMin));
    if (q.yearMax) w.push(lte(s.auctionResults.year, q.yearMax));
    if (q.grade) w.push(eq(s.auctionResults.grade, q.grade));
    if (q.hall) w.push(eq(s.auctionResults.hallId, q.hall));
    if (q.sold) w.push(eq(s.auctionResults.sold, Number(q.sold)));
    if (q.engine) {
      const [lo, hi] = q.engine.split("-");
      if (lo) w.push(gte(s.auctionResults.engineCc, Number(lo)));
      if (hi) w.push(lte(s.auctionResults.engineCc, Number(hi)));
    }
    const where = and(...w);
    const order = q.sort === "price_asc" ? [asc(s.auctionResults.finalPriceJpy)] : q.sort === "price_desc" ? [desc(s.auctionResults.finalPriceJpy)] : q.sort === "year_desc" ? [desc(s.auctionResults.year)] : q.sort === "mileage_asc" ? [asc(s.auctionResults.mileageKm)] : [desc(s.auctionResults.saleDate)];
    const items = await db().select({ r: s.auctionResults, hall: s.auctionHalls.name }).from(s.auctionResults).innerJoin(s.auctionHalls, eq(s.auctionHalls.id, s.auctionResults.hallId)).where(where).orderBy(...order, desc(s.auctionResults.saleDate), asc(s.auctionResults.lotNo), asc(s.auctionResults.id)).limit(pageSize).offset(offset);
    const [{ n }] = (await db().select({ n: sql<number>`count(*)::int` }).from(s.auctionResults).where(where)) as [{ n: number }];
    return { items: items.map((x) => ({ ...x.r, hall: x.hall })), total: n, page: pageNo, pageSize, window: { from, to: newest } };
  }),
);

auctionRouter.get(
  "/stats/:id",
  h(async (req) => {
    requirePerm(req, "auction.access");
    const [r] = await db().select({ r: s.auctionResults, hall: s.auctionHalls.name }).from(s.auctionResults).innerJoin(s.auctionHalls, eq(s.auctionHalls.id, s.auctionResults.hallId)).where(eq(s.auctionResults.id, String(req.params.id))).limit(1);
    if (!r) throw notFound();
    const history = await priceHistory(r.r.make, r.r.model, r.r.year);
    return { result: { ...r.r, hall: r.hall }, history };
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
    const [[lots], [clients], [bids], [orders], [enq], byDay, topBidders, desk, funnelRows, customerActs, deskActs, recentBids, recentOrders, [newestLot]] = await Promise.all([
      db().select({ upcoming: sql<number>`count(*) filter (where status = 'upcoming' and sale_date >= ${t})::int`, total: sql<number>`count(*)::int` }).from(s.auctionLots),
      db().select({ n: sql<number>`count(*)::int` }).from(s.users).where(eq(s.users.kind, "customer")),
      db().select({ n: sql<number>`count(*)::int`, value: sql<number>`coalesce(sum(amount_jpy),0)::float` }).from(s.auctionBids),
      db().select({ pending: sql<number>`count(*) filter (where status = 'pending')::int`, confirmed: sql<number>`coalesce(sum(price_jpy) filter (where status in ('confirmed','paid','shipped','delivered')),0)::float`, pipeline: sql<number>`coalesce(sum(price_jpy) filter (where status in ('pending','approved')),0)::float` }).from(s.auctionOrders),
      db().select({ open: sql<number>`count(*) filter (where status = 'open')::int` }).from(s.auctionEnquiries),
      db().execute(sql`select to_char(created_at, 'YYYY-MM-DD') as day, count(*)::int as bids from auction_bids where created_at > now() - interval '14 days' group by 1 order by 1`),
      db().execute(sql`select u.name, count(*)::int as bids, sum(b.amount_jpy)::float as value from auction_bids b join users u on u.id = b.user_id group by u.name order by bids desc limit 6`),
      db().select({ name: s.users.name, kind: s.users.kind, lastSeenAt: s.users.lastSeenAt }).from(s.users).where(eq(s.users.kind, "staff")).orderBy(desc(s.users.lastSeenAt)).limit(8),
      db().execute(sql`select
        (select count(*)::int from users where kind = 'customer') as clients,
        (select count(distinct b.user_id)::int from auction_bids b join users u on u.id = b.user_id where u.kind = 'customer') as bidders,
        (select count(*)::int from auction_bids) as bids,
        (select count(*)::int from auction_bids where status = 'won') as won,
        (select count(*)::int from auction_orders) as orders,
        (select count(*)::int from auction_orders where status in ('paid','shipped','delivered')) as paid`),
      db().execute(sql`select * from (
          select 'bid' as kind, u.name, b.created_at as at, l.id as lot_id, l.lot_no, l.make, l.model, b.amount_jpy as amount from auction_bids b join users u on u.id = b.user_id join auction_lots l on l.id = b.lot_id where u.kind <> 'staff'
          union all select 'order', u.name, o.created_at, l.id, l.lot_no, l.make, l.model, o.price_jpy from auction_orders o join users u on u.id = o.user_id join auction_lots l on l.id = o.lot_id where u.kind <> 'staff'
          union all select 'enquiry', u.name, e.created_at, l.id, l.lot_no, l.make, l.model, null from auction_enquiries e join users u on u.id = e.user_id join auction_lots l on l.id = e.lot_id where u.kind <> 'staff'
        ) x order by at desc limit 10`),
      db().execute(sql`select a.id, a.summary, a.created_at as at, u.name from audit_log a left join users u on u.id = a.actor_user_id where a.actor_kind = 'human' and (a.action like 'bid.%' or a.action like 'order.%' or a.action like 'enquiry.%' or a.action like 'lots.%') and a.action <> 'bid.placed' order by a.created_at desc limit 10`),
      db().select({ id: s.auctionBids.id, amountJpy: s.auctionBids.amountJpy, status: s.auctionBids.status, createdAt: s.auctionBids.createdAt, who: s.users.name, lotId: s.auctionLots.id, lotNo: s.auctionLots.lotNo, make: s.auctionLots.make, model: s.auctionLots.model }).from(s.auctionBids).innerJoin(s.users, eq(s.users.id, s.auctionBids.userId)).innerJoin(s.auctionLots, eq(s.auctionLots.id, s.auctionBids.lotId)).orderBy(desc(s.auctionBids.createdAt)).limit(6),
      db().select({ id: s.auctionOrders.id, orderNo: s.auctionOrders.orderNo, priceJpy: s.auctionOrders.priceJpy, status: s.auctionOrders.status, createdAt: s.auctionOrders.createdAt, who: s.users.name, lotId: s.auctionLots.id, lotNo: s.auctionLots.lotNo, make: s.auctionLots.make, model: s.auctionLots.model }).from(s.auctionOrders).innerJoin(s.users, eq(s.users.id, s.auctionOrders.userId)).innerJoin(s.auctionLots, eq(s.auctionLots.id, s.auctionOrders.lotId)).orderBy(desc(s.auctionOrders.createdAt)).limit(6),
      db().select({ at: sql<string | null>`max(created_at)` }).from(s.auctionLots),
    ]);
    const totalBids = bids?.n ?? 0;
    const upcoming = lots?.upcoming ?? 0;
    return {
      lots,
      clients: clients?.n ?? 0,
      bids,
      orders,
      enquiries: enq,
      bidsByDay: (byDay as unknown as { rows: { day: string; bids: number }[] }).rows,
      topBidders: (topBidders as unknown as { rows: { name: string; bids: number; value: number }[] }).rows.map((r) => ({ ...r, share: totalBids ? Math.round((r.bids / totalBids) * 100) : 0 })),
      desk,
      funnel: (funnelRows as unknown as { rows: Record<string, number>[] }).rows[0],
      customerActions: (customerActs as unknown as { rows: { at: string }[] }).rows.map((r) => ({ ...r, at: new Date(r.at).toISOString() })),
      deskActions: (deskActs as unknown as { rows: { at: string }[] }).rows.map((r) => ({ ...r, at: new Date(r.at).toISOString() })),
      recentBids,
      recentOrders,
      // measured: it says working only while there are lots on sale
      feed: upcoming > 0 ? { status: "working", text: "Auction is working", detail: `${upcoming.toLocaleString("en-US")} lots on sale`, newestAt: newestLot?.at ?? null } : { status: "not_working", text: "Auction is not working", detail: "No lots on sale. Import a lot list.", newestAt: newestLot?.at ?? null },
    };
  }),
);

auctionRouter.get(
  "/admin/bids",
  h(async (req) => {
    const u = requirePerm(req, "auction.bids.view");
    const rows = await db()
      .select({ b: s.auctionBids, who: s.users.name, whoKind: s.users.kind, lotNo: s.auctionLots.lotNo, make: s.auctionLots.make, model: s.auctionLots.model, year: s.auctionLots.year, saleDate: s.auctionLots.saleDate, hall: s.auctionHalls.name })
      .from(s.auctionBids)
      .innerJoin(s.users, eq(s.users.id, s.auctionBids.userId))
      .innerJoin(s.auctionLots, eq(s.auctionLots.id, s.auctionBids.lotId))
      .innerJoin(s.auctionHalls, eq(s.auctionHalls.id, s.auctionLots.hallId))
      .where(can(u, "auction.bids.view_all") ? undefined : eq(s.auctionBids.userId, u.id))
      .orderBy(desc(s.auctionBids.createdAt))
      .limit(300);
    return rows.map((r) => ({ ...r.b, who: r.who, whoKind: r.whoKind, lot: { lotNo: r.lotNo, make: r.make, model: r.model, year: r.year, saleDate: r.saleDate, hall: r.hall } }));
  }),
);

auctionRouter.get(
  "/admin/bids.xlsx",
  h(async (req, res) => {
    const u = requirePerm(req, "auction.bids.export");
    const rows = await db().select({ b: s.auctionBids, who: s.users.name, lotNo: s.auctionLots.lotNo, make: s.auctionLots.make, model: s.auctionLots.model, saleDate: s.auctionLots.saleDate }).from(s.auctionBids).innerJoin(s.users, eq(s.users.id, s.auctionBids.userId)).innerJoin(s.auctionLots, eq(s.auctionLots.id, s.auctionBids.lotId)).where(can(u, "auction.bids.view_all") ? undefined : eq(s.auctionBids.userId, u.id)).orderBy(desc(s.auctionBids.createdAt));
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Bids");
    ws.columns = [{ header: "Date", key: "d", width: 22 }, { header: "Bidder", key: "who", width: 24 }, { header: "Lot", key: "lot", width: 10 }, { header: "Vehicle", key: "veh", width: 30 }, { header: "Sale date", key: "sale", width: 14 }, { header: "Amount (JPY)", key: "amt", width: 16 }, { header: "Status", key: "st", width: 12 }, { header: "Note", key: "note", width: 30 }];
    ws.getRow(1).font = { bold: true };
    rows.forEach((r) => ws.addRow({ d: r.b.createdAt, who: r.who, lot: r.lotNo, veh: `${r.make} ${r.model}`, sale: r.saleDate, amt: r.b.amountJpy, st: r.b.status, note: r.b.note }));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="bids.xlsx"`);
    res.send(Buffer.from(await wb.xlsx.writeBuffer()));
    return undefined;
  }),
);

auctionRouter.put(
  "/admin/bids/:id",
  h(async (req) => {
    const u = requirePerm(req, "auction.bids.manage");
    const b = parse(z.object({ status: z.enum(["active", "won", "lost", "cancelled"]).optional(), note: z.string().max(200).optional() }), req.body);
    await db().update(s.auctionBids).set(b).where(eq(s.auctionBids.id, String(req.params.id)));
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "bid.updated", entity: "bid", entityId: String(req.params.id), summary: `${u.name} updated a bid${b.status ? ` → ${b.status}` : ""}` });
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
      w.push(or(ilike(s.auctionLots.make, like), ilike(s.auctionLots.model, like), ilike(s.auctionLots.modelCode, like), /^\d+$/.test(q.q) ? eq(s.auctionLots.lotNo, Number(q.q)) : undefined));
    }
    if (q.status) w.push(eq(s.auctionLots.status, q.status));
    if (q.hall) w.push(eq(s.auctionLots.hallId, q.hall));
    const where = and(...w);
    const rows = await db()
      .select({ id: s.auctionLots.id, lotNo: s.auctionLots.lotNo, saleDate: s.auctionLots.saleDate, make: s.auctionLots.make, model: s.auctionLots.model, modelCode: s.auctionLots.modelCode, year: s.auctionLots.year, mileageKm: s.auctionLots.mileageKm, grade: s.auctionLots.grade, startPriceJpy: s.auctionLots.startPriceJpy, status: s.auctionLots.status, hall: s.auctionHalls.name, bids: sql<number>`(select count(*)::int from auction_bids b where b.lot_id = "auction_lots"."id")` })
      .from(s.auctionLots)
      .innerJoin(s.auctionHalls, eq(s.auctionHalls.id, s.auctionLots.hallId))
      .where(where)
      .orderBy(desc(s.auctionLots.saleDate), asc(s.auctionLots.lotNo), asc(s.auctionLots.id))
      .limit(pageSize)
      .offset(offset);
    const [{ n }] = (await db().select({ n: sql<number>`count(*)::int` }).from(s.auctionLots).where(where)) as [{ n: number }];
    return { items: rows, total: n, page: pageNo, pageSize };
  }),
);

auctionRouter.get(
  "/admin/orders",
  h(async (req) => {
    requirePerm(req, "auction.orders.manage");
    const rows = await db().select({ o: s.auctionOrders, who: s.users.name, lotNo: s.auctionLots.lotNo, make: s.auctionLots.make, model: s.auctionLots.model }).from(s.auctionOrders).innerJoin(s.users, eq(s.users.id, s.auctionOrders.userId)).innerJoin(s.auctionLots, eq(s.auctionLots.id, s.auctionOrders.lotId)).orderBy(desc(s.auctionOrders.createdAt));
    return rows.map((r) => ({ ...r.o, who: r.who, lot: { lotNo: r.lotNo, make: r.make, model: r.model } }));
  }),
);

auctionRouter.put(
  "/admin/orders/:id",
  h(async (req) => {
    const u = requirePerm(req, "auction.orders.manage");
    const b = parse(z.object({ status: z.enum(["pending", "approved", "confirmed", "paid", "shipped", "delivered", "cancelled"]) }), req.body);
    await db().update(s.auctionOrders).set({ status: b.status, updatedAt: new Date() }).where(eq(s.auctionOrders.id, String(req.params.id)));
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "order.status", entity: "order", entityId: String(req.params.id), summary: `${u.name} set an order to ${b.status}` });
    return { ok: true };
  }),
);

auctionRouter.get(
  "/admin/enquiries",
  h(async (req) => {
    requirePerm(req, "auction.enquiries.reply");
    const rows = await db().select({ e: s.auctionEnquiries, who: s.users.name, lotNo: s.auctionLots.lotNo, make: s.auctionLots.make, model: s.auctionLots.model, lotId: s.auctionLots.id }).from(s.auctionEnquiries).innerJoin(s.users, eq(s.users.id, s.auctionEnquiries.userId)).innerJoin(s.auctionLots, eq(s.auctionLots.id, s.auctionEnquiries.lotId)).orderBy(asc(s.auctionEnquiries.status), desc(s.auctionEnquiries.createdAt));
    return rows.map((r) => ({ ...r.e, who: r.who, lot: { id: r.lotId, lotNo: r.lotNo, make: r.make, model: r.model } }));
  }),
);

auctionRouter.post(
  "/admin/enquiries/:id/reply",
  h(async (req) => {
    const u = requirePerm(req, "auction.enquiries.reply");
    const b = parse(z.object({ reply: z.string().trim().min(2).max(2000) }), req.body);
    const [e] = await db().select().from(s.auctionEnquiries).where(eq(s.auctionEnquiries.id, String(req.params.id))).limit(1);
    if (!e) throw notFound();
    await db().update(s.auctionEnquiries).set({ reply: b.reply, repliedBy: u.id, repliedAt: new Date(), status: "answered" }).where(eq(s.auctionEnquiries.id, e.id));
    await notify([e.userId], { type: "enquiry_reply", title: `Reply to ${e.enqNo}`, body: b.reply.slice(0, 140), link: `/auction/me` });
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "enquiry.replied", entity: "enquiry", entityId: e.id, summary: `${u.name} answered enquiry ${e.enqNo}` });
    return { ok: true };
  }),
);

auctionRouter.get(
  "/admin/clients",
  h(async (req) => {
    requirePerm(req, "auction.clients.view");
    return db()
      .select({ id: s.users.id, name: s.users.name, email: s.users.email, phone: s.users.phone, countryCode: s.users.countryCode, company: s.users.company, createdAt: s.users.createdAt, bids: sql<number>`(select count(*)::int from auction_bids b where b.user_id = "users"."id")`, orders: sql<number>`(select count(*)::int from auction_orders o where o.user_id = "users"."id")` })
      .from(s.users)
      .where(eq(s.users.kind, "customer"))
      .orderBy(asc(s.users.name));
  }),
);

void bad;
void forbidden;
