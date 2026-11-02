import { Router } from "express";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { BODY_TYPES, DRIVES, FUELS, SiteSettingsSchema, STEERINGS, TRANSMISSIONS, WEB_ORDER_STATUSES } from "@autofte/shared";
import { db } from "../db/client";
import * as s from "../db/schema";
import { bad, conflict, h, notFound, parse } from "../lib/http";
import { requirePerm } from "../auth/session";
import { audit } from "../services/audit";
import { ensureCustomerConversation, postMessage } from "../services/chat";
import { clearSettingsCache, putSetting, siteSettings } from "../services/settings";
import { renameInContent } from "../services/rename";
import { matchBuyerRequests } from "../fte/followTools";
import { genId, shortCode } from "../lib/id";
import { carImageUrl } from "../services/carArt";
import { colorHex } from "../seed/catalog";

/**
 * US9 — the website admin CMS. A non-developer manages the public site here:
 * vehicles (stock), the home page sections, static pages, branding and contact messages.
 * Everything a vehicle create/edit touches runs matchBuyerRequests() so Sora is woken for
 * any saved buyer wish the new/changed car fits.
 */
export const adminRouter = Router();

// ---------- helpers ----------
function slugify(str: string): string {
  return (
    str
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80) || "item"
  );
}

async function uniqueVehicleSlug(base: string): Promise<string> {
  let slug = base;
  for (let i = 0; i < 50; i++) {
    const [hit] = await db().select({ id: s.vehicles.id }).from(s.vehicles).where(eq(s.vehicles.slug, slug)).limit(1);
    if (!hit) return slug;
    slug = `${base}-${shortCode(genId(), 4).toLowerCase()}`;
  }
  return `${base}-${genId().slice(0, 8)}`;
}

async function genUniqueStock(): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const code = "HK" + shortCode(genId(), 6);
    const [hit] = await db().select({ id: s.vehicles.id }).from(s.vehicles).where(eq(s.vehicles.stockNo, code)).limit(1);
    if (!hit) return code;
  }
  return "HK" + genId().slice(0, 8).toUpperCase();
}

/** A car with no photos gets the same four drawn views as the demo stock, in its own body type and colour. */
const illustrations = (bodyType: string, color: string) => (["side", "front", "rear", "interior"] as const).map((view) => carImageUrl(bodyType, colorHex(color), view));
const isIllustration = (url: string) => url.startsWith("/api/media/car");

async function assertBrandModel(brandId: string, modelId: string) {
  const [m] = await db().select().from(s.vehicleModels).where(eq(s.vehicleModels.id, modelId)).limit(1);
  if (!m) throw bad("Pick a model that exists");
  if (m.brandId !== brandId) throw bad("That model does not belong to the chosen brand");
}

// ---------- form metadata (brands, models, enums, home-section tokens) ----------
adminRouter.get(
  "/meta",
  h(async (req) => {
    requirePerm(req, "website.admin");
    const [brandRows, modelRows, sectionRows] = await Promise.all([
      db().select().from(s.brands).orderBy(asc(s.brands.sort), asc(s.brands.name)),
      db().select().from(s.vehicleModels).orderBy(asc(s.vehicleModels.name)),
      db().select().from(s.homeSections).orderBy(asc(s.homeSections.sort)),
    ]);
    const brands = brandRows.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      models: modelRows.filter((m) => m.brandId === b.id).map((m) => ({ id: m.id, name: m.name, slug: m.slug })),
    }));
    // A vehicle joins a home carousel by storing that section's data.homeSection token in its homeSections[].
    const sectionTokens = sectionRows
      .map((r) => ({ key: r.key, title: r.title, token: (r.data as { homeSection?: string }).homeSection ?? null }))
      .filter((r): r is { key: string; title: string; token: string } => !!r.token);
    return {
      brands,
      enums: {
        bodyTypes: [...BODY_TYPES],
        fuels: [...FUELS],
        transmissions: [...TRANSMISSIONS],
        steerings: [...STEERINGS],
        drives: [...DRIVES],
        statuses: ["available", "reserved", "sold"],
      },
      homeSectionTokens: sectionTokens,
    };
  }),
);

// ---------- vehicles ----------
const vehicleBody = z.object({
  title: z.string().trim().min(2).max(120),
  brandId: z.string().min(1),
  modelId: z.string().min(1),
  modelCode: z.string().max(40).nullable().optional(),
  chassisNo: z.string().max(40).nullable().optional(),
  year: z.number().int().min(1950).max(2100),
  month: z.number().int().min(1).max(12).nullable().optional(),
  priceUsd: z.number().positive().max(100_000_000),
  discountPriceUsd: z.number().positive().max(100_000_000).nullable().optional(),
  costJpy: z.number().int().min(0).nullable().optional(),
  mileageKm: z.number().int().min(0).max(5_000_000),
  fuel: z.string().min(1).max(20),
  transmission: z.string().min(1).max(20),
  bodyType: z.string().min(1).max(30),
  engineCc: z.number().int().min(0).max(100_000).nullable().optional(),
  color: z.string().min(1).max(30),
  steering: z.string().max(10).optional(),
  drive: z.string().max(10).optional(),
  doors: z.number().int().min(0).max(10).nullable().optional(),
  seats: z.number().int().min(0).max(100).nullable().optional(),
  lengthMm: z.number().int().nullable().optional(),
  widthMm: z.number().int().nullable().optional(),
  heightMm: z.number().int().nullable().optional(),
  m3: z.number().nullable().optional(),
  location: z.string().max(60).optional(),
  originCountry: z.string().max(60).optional(),
  features: z.array(z.string().max(80)).max(80).optional(),
  tags: z.array(z.string().max(40)).max(40).optional(),
  homeSections: z.array(z.string().max(40)).max(20).optional(),
  featured: z.boolean().optional(),
  status: z.enum(["available", "reserved", "sold"]).optional(),
  published: z.boolean().optional(),
  sort: z.number().int().optional(),
  shortDesc: z.string().max(400).nullable().optional(),
  description: z.string().max(8000).nullable().optional(),
  videoUrl: z.string().max(300).regex(/^https?:\/\//, "The video link must start with http:// or https://").nullable().optional(),
  seoTitle: z.string().max(200).nullable().optional(),
  seoDescription: z.string().max(400).nullable().optional(),
  seoKeywords: z.string().max(300).nullable().optional(),
  stockNo: z.string().max(40).optional(),
  refNo: z.string().max(40).optional(),
  images: z.array(z.string().max(500)).max(30).optional(),
});
const vehicleUpdate = vehicleBody.partial();

const adminVehFilters = z.object({
  q: z.string().max(100).optional(),
  status: z.string().max(20).optional(),
  published: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});

adminRouter.get(
  "/vehicles",
  h(async (req) => {
    requirePerm(req, "website.vehicles.manage");
    const f = parse(adminVehFilters, req.query);
    const w: (SQL | undefined)[] = [];
    if (f.q) {
      const like = `%${f.q.trim()}%`;
      w.push(or(ilike(s.vehicles.title, like), ilike(s.vehicles.stockNo, like), ilike(s.vehicles.chassisNo, like), ilike(s.vehicles.modelCode, like)));
    }
    if (f.status) w.push(eq(s.vehicles.status, f.status));
    if (f.published) w.push(eq(s.vehicles.published, f.published === "true"));
    const where = w.length ? and(...w) : undefined;
    const rows = await db()
      .select({
        id: s.vehicles.id,
        stockNo: s.vehicles.stockNo,
        slug: s.vehicles.slug,
        title: s.vehicles.title,
        brand: s.brands.name,
        model: s.vehicleModels.name,
        year: s.vehicles.year,
        priceUsd: s.vehicles.priceUsd,
        discountPriceUsd: s.vehicles.discountPriceUsd,
        status: s.vehicles.status,
        published: s.vehicles.published,
        featured: s.vehicles.featured,
        homeSections: s.vehicles.homeSections,
        updatedAt: s.vehicles.updatedAt,
        image: sql<string>`(select url from vehicle_images vi where vi.vehicle_id = ${s.vehicles.id} order by sort limit 1)`,
      })
      .from(s.vehicles)
      .innerJoin(s.brands, eq(s.brands.id, s.vehicles.brandId))
      .innerJoin(s.vehicleModels, eq(s.vehicleModels.id, s.vehicles.modelId))
      .where(where)
      .orderBy(desc(s.vehicles.updatedAt), asc(s.vehicles.stockNo)) // stock no breaks ties so paging never repeats or skips a car
      .limit(f.pageSize)
      .offset((f.page - 1) * f.pageSize);
    const [{ n }] = (await db().select({ n: sql<number>`count(*)::int` }).from(s.vehicles).where(where)) as [{ n: number }];
    return { items: rows, total: n, page: f.page, pageSize: f.pageSize };
  }),
);

adminRouter.get(
  "/vehicles/:id",
  h(async (req) => {
    requirePerm(req, "website.vehicles.manage");
    const [v] = await db().select().from(s.vehicles).where(eq(s.vehicles.id, String(req.params.id))).limit(1);
    if (!v) throw notFound("Vehicle not found");
    const images = await db().select().from(s.vehicleImages).where(eq(s.vehicleImages.vehicleId, v.id)).orderBy(asc(s.vehicleImages.sort));
    return { ...v, images: images.map((i) => i.url) };
  }),
);

adminRouter.post(
  "/vehicles",
  h(async (req) => {
    const u = requirePerm(req, "website.vehicles.manage");
    const b = parse(vehicleBody, req.body);
    await assertBrandModel(b.brandId, b.modelId);
    let stockNo = b.stockNo?.trim() || (await genUniqueStock());
    if (b.stockNo?.trim()) {
      const [hit] = await db().select({ id: s.vehicles.id }).from(s.vehicles).where(eq(s.vehicles.stockNo, stockNo)).limit(1);
      if (hit) throw conflict("That stock number is already used");
    }
    const refNo = b.refNo?.trim() || stockNo;
    const slug = await uniqueVehicleSlug(slugify(`${b.title} ${stockNo}`));
    const { images: given, stockNo: _s, refNo: _r, ...vals } = b;
    const images = given?.length ? given : illustrations(b.bodyType, b.color);
    const id = genId();
    await db().transaction(async (tx) => {
      await tx.insert(s.vehicles).values({ id, ...vals, stockNo, refNo, slug, updatedAt: new Date() });
      await tx.insert(s.vehicleImages).values(images.map((url, i) => ({ vehicleId: id, url, sort: i })));
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: "vehicle.created", entity: "vehicle", entityId: id, summary: `Added vehicle ${b.title} (${stockNo})` });
    });
    const matchedBuyerRequests = await matchBuyerRequests(id);
    return { id, stockNo, slug, matchedBuyerRequests };
  }),
);

adminRouter.patch(
  "/vehicles/:id",
  h(async (req) => {
    const u = requirePerm(req, "website.vehicles.manage");
    const id = String(req.params.id);
    const [existing] = await db().select().from(s.vehicles).where(eq(s.vehicles.id, id)).limit(1);
    if (!existing) throw notFound("Vehicle not found");
    const b = parse(vehicleUpdate, req.body);
    if (b.brandId || b.modelId) await assertBrandModel(b.brandId ?? existing.brandId, b.modelId ?? existing.modelId);
    if (b.stockNo?.trim() && b.stockNo.trim() !== existing.stockNo) {
      const [hit] = await db().select({ id: s.vehicles.id }).from(s.vehicles).where(eq(s.vehicles.stockNo, b.stockNo.trim())).limit(1);
      if (hit) throw conflict("That stock number is already used");
    }
    const { images: given, ...vals } = b;
    // drawn views follow the car: no photos left, or the body/colour changed while it only has drawings
    const body = b.bodyType ?? existing.bodyType;
    const color = b.color ?? existing.color;
    const repaint = body !== existing.bodyType || color !== existing.color;
    const current = given ?? (repaint ? (await db().select({ url: s.vehicleImages.url }).from(s.vehicleImages).where(eq(s.vehicleImages.vehicleId, id))).map((r) => r.url) : undefined);
    const images = current && (!current.length || (repaint && current.every(isIllustration))) ? illustrations(body, color) : given;
    await db().transaction(async (tx) => {
      await tx.update(s.vehicles).set({ ...vals, updatedAt: new Date() }).where(eq(s.vehicles.id, id));
      if (images) {
        await tx.delete(s.vehicleImages).where(eq(s.vehicleImages.vehicleId, id));
        if (images.length) await tx.insert(s.vehicleImages).values(images.map((url, i) => ({ vehicleId: id, url, sort: i })));
      }
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: "vehicle.updated", entity: "vehicle", entityId: id, summary: `Edited vehicle ${existing.title} (${existing.stockNo})` });
    });
    const matchedBuyerRequests = await matchBuyerRequests(id);
    return { ok: true, matchedBuyerRequests };
  }),
);

adminRouter.delete(
  "/vehicles/:id",
  h(async (req) => {
    const u = requirePerm(req, "website.vehicles.manage");
    const id = String(req.params.id);
    const [v] = await db().select().from(s.vehicles).where(eq(s.vehicles.id, id)).limit(1);
    if (!v) throw notFound("Vehicle not found");
    await db().transaction(async (tx) => {
      await tx.delete(s.webOrderItems).where(eq(s.webOrderItems.vehicleId, id)); // demo: drop any order-line refs first
      await tx.delete(s.vehicles).where(eq(s.vehicles.id, id));
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: "vehicle.deleted", entity: "vehicle", entityId: id, summary: `Deleted vehicle ${v.title} (${v.stockNo})` });
    });
    return { ok: true };
  }),
);

// ---------- home sections ----------
adminRouter.get(
  "/home-sections",
  h(async (req) => {
    requirePerm(req, "website.content.manage");
    return db().select().from(s.homeSections).orderBy(asc(s.homeSections.sort));
  }),
);

const sectionUpdate = z.object({
  title: z.string().max(120).optional(),
  subtitle: z.string().max(300).nullable().optional(),
  enabled: z.boolean().optional(),
  sort: z.number().int().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

adminRouter.patch(
  "/home-sections/:id",
  h(async (req) => {
    const u = requirePerm(req, "website.content.manage");
    const id = String(req.params.id);
    const [row] = await db().select().from(s.homeSections).where(eq(s.homeSections.id, id)).limit(1);
    if (!row) throw notFound("Section not found");
    const b = parse(sectionUpdate, req.body);
    if (Object.keys(b).length === 0) return { ok: true };
    await db().transaction(async (tx) => {
      await tx.update(s.homeSections).set(b).where(eq(s.homeSections.id, id));
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: "home_section.updated", entity: "home_section", entityId: id, summary: `Edited home section "${row.title}"` });
    });
    return { ok: true };
  }),
);

// ---------- pages ----------
const pageBody = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes only"),
  title: z.string().trim().min(1).max(160),
  body: z.string().max(100_000).optional(),
  seoTitle: z.string().max(200).nullable().optional(),
  seoDescription: z.string().max(400).nullable().optional(),
  published: z.boolean().optional(),
});
const pageUpdate = pageBody.partial();

adminRouter.get(
  "/pages",
  h(async (req) => {
    requirePerm(req, "website.content.manage");
    return db().select({ id: s.pages.id, slug: s.pages.slug, title: s.pages.title, published: s.pages.published, updatedAt: s.pages.updatedAt }).from(s.pages).orderBy(asc(s.pages.slug));
  }),
);

adminRouter.get(
  "/pages/:id",
  h(async (req) => {
    requirePerm(req, "website.content.manage");
    const [p] = await db().select().from(s.pages).where(eq(s.pages.id, String(req.params.id))).limit(1);
    if (!p) throw notFound("Page not found");
    return p;
  }),
);

adminRouter.post(
  "/pages",
  h(async (req) => {
    const u = requirePerm(req, "website.content.manage");
    const b = parse(pageBody, req.body);
    const [hit] = await db().select({ id: s.pages.id }).from(s.pages).where(eq(s.pages.slug, b.slug)).limit(1);
    if (hit) throw conflict("A page with that slug already exists");
    const id = genId();
    await db().transaction(async (tx) => {
      await tx.insert(s.pages).values({ id, slug: b.slug, title: b.title, body: b.body ?? "", seoTitle: b.seoTitle ?? null, seoDescription: b.seoDescription ?? null, published: b.published ?? true, updatedAt: new Date() });
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: "page.created", entity: "page", entityId: id, summary: `Created page /${b.slug}` });
    });
    return { id, slug: b.slug };
  }),
);

adminRouter.patch(
  "/pages/:id",
  h(async (req) => {
    const u = requirePerm(req, "website.content.manage");
    const id = String(req.params.id);
    const [existing] = await db().select().from(s.pages).where(eq(s.pages.id, id)).limit(1);
    if (!existing) throw notFound("Page not found");
    const b = parse(pageUpdate, req.body);
    if (b.slug && b.slug !== existing.slug) {
      const [hit] = await db().select({ id: s.pages.id }).from(s.pages).where(eq(s.pages.slug, b.slug)).limit(1);
      if (hit) throw conflict("A page with that slug already exists");
    }
    if (Object.keys(b).length === 0) return { ok: true };
    await db().transaction(async (tx) => {
      await tx.update(s.pages).set({ ...b, updatedAt: new Date() }).where(eq(s.pages.id, id));
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: "page.updated", entity: "page", entityId: id, summary: `Edited page /${existing.slug}` });
    });
    return { ok: true };
  }),
);

adminRouter.delete(
  "/pages/:id",
  h(async (req) => {
    const u = requirePerm(req, "website.content.manage");
    const id = String(req.params.id);
    const [p] = await db().select().from(s.pages).where(eq(s.pages.id, id)).limit(1);
    if (!p) throw notFound("Page not found");
    await db().transaction(async (tx) => {
      await tx.delete(s.pages).where(eq(s.pages.id, id));
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: "page.deleted", entity: "page", entityId: id, summary: `Deleted page /${p.slug}` });
    });
    return { ok: true };
  }),
);

// ---------- site settings / branding ----------
adminRouter.get(
  "/site",
  h(async (req) => {
    requirePerm(req, "website.settings.manage");
    return siteSettings();
  }),
);

adminRouter.put(
  "/site",
  h(async (req) => {
    const u = requirePerm(req, "website.settings.manage");
    const site = parse(SiteSettingsSchema, req.body);
    site.companyName = site.companyName.trim();
    site.ftEName = site.ftEName.trim();
    if (!site.companyName || !site.ftEName) throw bad("The company and the AI employee both need a name");
    if (![site.primaryColor, site.accentColor].every((c) => /^#[0-9a-fA-F]{6}$/.test(c))) throw bad("Colours are written like #0f4c81");
    const before = await siteSettings();
    await db().transaction((tx) => renameInContent(tx, { company: [before.companyName, site.companyName], fte: [before.ftEName, site.ftEName] }));
    await putSetting("site", site);
    clearSettingsCache();
    const renamed = [before.companyName !== site.companyName ? `company: ${before.companyName} → ${site.companyName}` : "", before.ftEName !== site.ftEName ? `AI employee: ${before.ftEName} → ${site.ftEName}` : ""].filter(Boolean).join("; ");
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "site.settings.updated", entity: "settings", entityId: "site", summary: `Updated site settings & branding${renamed ? ` (${renamed})` : ""}` });
    return { ok: true, site };
  }),
);

// ---------- contact messages ----------
adminRouter.get(
  "/messages",
  h(async (req) => {
    requirePerm(req, "website.content.manage");
    const handled = req.query.handled;
    const where = handled === "true" ? eq(s.contactMessages.handled, true) : handled === "false" ? eq(s.contactMessages.handled, false) : undefined;
    return db().select().from(s.contactMessages).where(where).orderBy(desc(s.contactMessages.createdAt)).limit(200);
  }),
);

adminRouter.post(
  "/messages/:id/handled",
  h(async (req) => {
    requirePerm(req, "website.content.manage");
    const id = String(req.params.id);
    const b = parse(z.object({ handled: z.boolean().default(true) }), req.body ?? {});
    const r = await db().update(s.contactMessages).set({ handled: b.handled }).where(eq(s.contactMessages.id, id)).returning({ id: s.contactMessages.id });
    if (!r.length) throw notFound("Message not found");
    return { ok: true };
  }),
);

// ---------- website orders (cart checkout requests) ----------
adminRouter.get(
  "/orders",
  h(async (req) => {
    requirePerm(req, "website.orders.manage");
    const status = typeof req.query.status === "string" && req.query.status ? req.query.status : undefined;
    const rows = await db()
      .select({
        id: s.webOrders.id,
        orderNo: s.webOrders.orderNo,
        status: s.webOrders.status,
        totalUsd: s.webOrders.totalUsd,
        notes: s.webOrders.notes,
        createdAt: s.webOrders.createdAt,
        customer: { id: s.users.id, name: s.users.name, email: s.users.email, phone: s.users.phone, countryCode: s.users.countryCode },
        items: sql<number>`(select count(*)::int from web_order_items i where i.order_id = ${s.webOrders.id})`,
      })
      .from(s.webOrders)
      .innerJoin(s.users, eq(s.users.id, s.webOrders.userId))
      .where(status ? eq(s.webOrders.status, status) : undefined)
      .orderBy(desc(s.webOrders.createdAt))
      .limit(200);
    const counts = await db().select({ status: s.webOrders.status, n: sql<number>`count(*)::int` }).from(s.webOrders).groupBy(s.webOrders.status);
    return { items: rows, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) };
  }),
);

adminRouter.get(
  "/orders/:id",
  h(async (req) => {
    requirePerm(req, "website.orders.manage");
    const [row] = await db()
      .select({ o: s.webOrders, customer: { id: s.users.id, name: s.users.name, email: s.users.email, phone: s.users.phone, countryCode: s.users.countryCode, company: s.users.company } })
      .from(s.webOrders)
      .innerJoin(s.users, eq(s.users.id, s.webOrders.userId))
      .where(eq(s.webOrders.id, String(req.params.id)))
      .limit(1);
    if (!row) throw notFound("Order not found");
    const items = await db()
      .select({ id: s.webOrderItems.id, vehicleId: s.webOrderItems.vehicleId, title: s.webOrderItems.title, priceUsd: s.webOrderItems.priceUsd, slug: s.vehicles.slug, status: s.vehicles.status })
      .from(s.webOrderItems)
      .leftJoin(s.vehicles, eq(s.vehicles.id, s.webOrderItems.vehicleId))
      .where(eq(s.webOrderItems.orderId, row.o.id));
    return { ...row.o, customer: row.customer, items };
  }),
);

adminRouter.patch(
  "/orders/:id",
  h(async (req) => {
    const u = requirePerm(req, "website.orders.manage");
    const id = String(req.params.id);
    const [o] = await db().select().from(s.webOrders).where(eq(s.webOrders.id, id)).limit(1);
    if (!o) throw notFound("Order not found");
    // staff change the status only; `notes` is what the BUYER wrote at checkout and stays theirs
    const { status } = parse(z.object({ status: z.enum(WEB_ORDER_STATUSES) }), req.body);
    if (status === o.status) return { ok: true };
    await db().transaction(async (tx) => {
      await tx.update(s.webOrders).set({ status }).where(eq(s.webOrders.id, id));
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: "web_order.status", entity: "web_order", entityId: id, summary: `Order ${o.orderNo}: ${o.status} → ${status}` });
    });
    // tell the buyer in their own thread (web + app). After the commit: postMessage uses db().
    const conv = await ensureCustomerConversation(o.userId, "web");
    await postMessage({ conversationId: conv.id, senderUserId: null, kind: "system", body: `Order ${o.orderNo} is now ${status}.`, meta: { webOrderId: id, orderNo: o.orderNo, status } }).catch((e) =>
      console.error("[order status] chat note failed", e),
    );
    return { ok: true };
  }),
);

adminRouter.delete(
  "/messages/:id",
  h(async (req) => {
    const u = requirePerm(req, "website.content.manage");
    const id = String(req.params.id);
    const r = await db().delete(s.contactMessages).where(eq(s.contactMessages.id, id)).returning({ id: s.contactMessages.id, name: s.contactMessages.name });
    if (!r.length) throw notFound("Message not found");
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "contact_message.deleted", entity: "contact_message", entityId: id, summary: `Deleted contact message from ${r[0]!.name}` });
    return { ok: true };
  }),
);
