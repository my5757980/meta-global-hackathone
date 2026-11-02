import { Router } from "express";
import { asc, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import * as s from "../db/schema";
import { h, notFound, parse } from "../lib/http";
import { carSvg } from "../services/carArt";
import { getFile } from "../services/files";
import { siteSettings } from "../services/settings";
import { catalogFacets, getVehicleBySlugOrId, listVehicles, relatedVehicles, suggest, type VehicleFilters } from "../services/website";
import { notify, usersWithPerm } from "../services/notify";

export const publicRouter = Router();

publicRouter.get(
  "/site",
  h(async () => {
    const site = await siteSettings();
    return { site, builtWith: "Muse Spark Open" };
  }),
);

publicRouter.get(
  "/home",
  h(async () => {
    const [site, sections, testimonials, blog, faqs, brandRows, facets] = await Promise.all([
      siteSettings(),
      db().select().from(s.homeSections).where(eq(s.homeSections.enabled, true)).orderBy(asc(s.homeSections.sort)),
      db().select().from(s.testimonials).orderBy(asc(s.testimonials.sort)),
      db().select({ slug: s.blogPosts.slug, title: s.blogPosts.title, excerpt: s.blogPosts.excerpt, coverUrl: s.blogPosts.coverUrl, publishedAt: s.blogPosts.publishedAt }).from(s.blogPosts).where(isNotNull(s.blogPosts.publishedAt)).orderBy(desc(s.blogPosts.publishedAt)).limit(3),
      db().select().from(s.faqs).orderBy(asc(s.faqs.sort)).limit(6),
      db().select().from(s.brands).orderBy(asc(s.brands.sort)),
      catalogFacets(),
    ]);
    const lists: Record<string, unknown> = {};
    for (const sec of sections) {
      const hs = (sec.data as { homeSection?: string }).homeSection;
      if (hs) lists[sec.key] = (await listVehicles({ homeSection: hs, limit: 8, sort: "newest" })).items;
    }
    return { site, sections, lists, testimonials, blog, faqs, brands: brandRows, bodyTypes: facets.bodyTypes };
  }),
);

const filtersSchema = z.object({
  q: z.string().max(100).optional(),
  brand: z.string().max(60).optional(),
  model: z.string().max(60).optional(),
  body: z.string().max(30).optional(),
  fuel: z.string().max(20).optional(),
  transmission: z.string().max(20).optional(),
  steering: z.string().max(10).optional(),
  drive: z.string().max(10).optional(),
  color: z.string().max(30).optional(),
  yearMin: z.coerce.number().int().optional(),
  yearMax: z.coerce.number().int().optional(),
  priceMin: z.coerce.number().optional(),
  priceMax: z.coerce.number().optional(),
  mileageMax: z.coerce.number().optional(),
  country: z.string().max(3).optional(),
  sort: z.enum(["newest", "price_asc", "price_desc", "year_desc", "mileage_asc"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});

publicRouter.get(
  "/vehicles",
  h(async (req) => {
    const f = parse(filtersSchema, req.query);
    const r = await listVehicles({ ...(f as VehicleFilters), limit: f.pageSize, offset: (f.page - 1) * f.pageSize });
    return { ...r, page: f.page, pageSize: f.pageSize };
  }),
);

publicRouter.get("/vehicles/facets", h(() => catalogFacets()));
publicRouter.get("/vehicles/suggest", h((req) => suggest(String(req.query.q ?? ""))));

publicRouter.get(
  "/vehicles/:key",
  h(async (req) => {
    const v = await getVehicleBySlugOrId(String(req.params.key));
    if (!v || !v.published) throw notFound("This vehicle is not available");
    const related = await relatedVehicles(v.id, v.bodyType, v.brandId);
    return { vehicle: v, related };
  }),
);

publicRouter.get("/pages/:slug", h(async (req) => {
  const [p] = await db().select().from(s.pages).where(eq(s.pages.slug, String(req.params.slug))).limit(1);
  if (!p || !p.published) throw notFound();
  return p;
}));

publicRouter.get("/blog", h(() => db().select({ slug: s.blogPosts.slug, title: s.blogPosts.title, excerpt: s.blogPosts.excerpt, coverUrl: s.blogPosts.coverUrl, publishedAt: s.blogPosts.publishedAt }).from(s.blogPosts).where(isNotNull(s.blogPosts.publishedAt)).orderBy(desc(s.blogPosts.publishedAt))));
publicRouter.get("/blog/:slug", h(async (req) => {
  const [p] = await db().select().from(s.blogPosts).where(eq(s.blogPosts.slug, String(req.params.slug))).limit(1);
  if (!p || !p.publishedAt) throw notFound(); // a draft stays private, even by its direct link
  return p;
}));
publicRouter.get("/faqs", h(() => db().select().from(s.faqs).orderBy(asc(s.faqs.sort))));
publicRouter.get("/services", h(() => db().select().from(s.services).orderBy(asc(s.services.sort))));
publicRouter.get("/partners", h(() => db().select().from(s.partners).orderBy(asc(s.partners.sort))));
publicRouter.get("/locations", h(() => db().select().from(s.locations).orderBy(asc(s.locations.sort))));
publicRouter.get("/testimonials", h(() => db().select().from(s.testimonials).orderBy(asc(s.testimonials.sort))));

publicRouter.get(
  "/countries",
  h(async () => {
    const cs = await db().select().from(s.countries).orderBy(asc(s.countries.name));
    const ps = await db().select().from(s.ports).orderBy(asc(s.ports.name));
    return cs
      .filter((c) => c.code !== "JP")
      .map((c) => ({ ...c, ports: ps.filter((p) => p.countryCode === c.code).map((p) => ({ id: p.id, name: p.name, transitDays: p.transitDays })) }));
  }),
);

publicRouter.post(
  "/contact",
  h(async (req) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(2).max(80),
        email: z.string().trim().email().max(120),
        phone: z.string().trim().max(40).optional(),
        subject: z.string().trim().max(120).optional(),
        message: z.string().trim().min(5).max(4000),
      }),
      req.body,
    );
    await db().insert(s.contactMessages).values(body);
    await notify(await usersWithPerm("website.content.manage"), { type: "contact", title: `New contact message from ${body.name}`, body: body.subject ?? body.message.slice(0, 80), link: "/admin/messages" });
    return { ok: true };
  }),
);

export const mediaRouter = Router();

/** Pictures staff uploaded for the public site. Only that kind: chat media and documents stay behind their checks. */
mediaRouter.get(
  "/site/:id",
  h(async (req, res) => {
    const f = await getFile(String(req.params.id));
    if (!f || f.kind !== "site-image") throw notFound();
    res.setHeader("Content-Type", f.mime);
    res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    res.sendFile(f.abs, { dotfiles: "allow" }); // stored under .data/ — send() treats dot-folders as missing by default
    return undefined;
  }),
);

mediaRouter.get("/car", (req, res) => {
  const body = String(req.query.body ?? "Sedan").slice(0, 20);
  const color = String(req.query.color ?? "#9aa0a6").slice(0, 9);
  const view = (["side", "front", "rear", "interior"].includes(String(req.query.view)) ? req.query.view : "side") as "side";
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=604800, immutable");
  res.send(carSvg({ body, color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#9aa0a6", view }));
});
