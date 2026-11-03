import { and, asc, desc, eq, gte, ilike, inArray, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import { brands, vehicleImages, vehicleModels, vehicles } from "../db/schema";

export interface VehicleFilters {
  q?: string;
  brand?: string;
  model?: string;
  grade?: string;
  body?: string;
  fuel?: string;
  transmission?: string;
  steering?: string;
  drive?: string;
  color?: string;
  yearMin?: number;
  yearMax?: number;
  priceMin?: number;
  priceMax?: number;
  mileageMax?: number;
  country?: string;
  status?: "available" | "all";
  homeSection?: string;
  featured?: boolean;
  sort?: "newest" | "featured" | "price_asc" | "price_desc" | "year_desc" | "mileage_asc";
  limit?: number;
  offset?: number;
  ids?: string[];
}

const effectivePrice = sql<number>`coalesce(${vehicles.discountPriceUsd}, ${vehicles.priceUsd})`;

export function vehicleWhere(f: VehicleFilters): SQL | undefined {
  const w: (SQL | undefined)[] = [eq(vehicles.published, true)];
  if (f.status !== "all") w.push(ne(vehicles.status, "sold"));
  if (f.q) {
    const like = `%${f.q.trim()}%`;
    w.push(or(ilike(vehicles.title, like), ilike(vehicles.stockNo, like), ilike(vehicles.modelCode, like), ilike(vehicles.chassisNo, like), ilike(vehicles.refNo, like)));
  }
  if (f.brand) w.push(sql`${vehicles.brandId} in (select id from brands where slug = ${f.brand} or lower(name) = lower(${f.brand}))`);
  if (f.model) w.push(sql`${vehicles.modelId} in (select id from vehicle_models where slug = ${f.model} or lower(name) = lower(${f.model}))`);
  if (f.body) w.push(ilike(vehicles.bodyType, f.body));
  if (f.fuel) w.push(ilike(vehicles.fuel, f.fuel));
  if (f.transmission) w.push(ilike(vehicles.transmission, f.transmission));
  if (f.steering) w.push(ilike(vehicles.steering, f.steering));
  if (f.grade) w.push(ilike(vehicles.grade, f.grade));
  if (f.drive) w.push(ilike(vehicles.drive, f.drive));
  if (f.color) w.push(ilike(vehicles.color, `%${f.color}%`));
  if (f.yearMin) w.push(gte(vehicles.year, f.yearMin));
  if (f.yearMax) w.push(lte(vehicles.year, f.yearMax));
  if (f.priceMin) w.push(gte(effectivePrice, f.priceMin));
  if (f.priceMax) w.push(lte(effectivePrice, f.priceMax));
  if (f.mileageMax) w.push(lte(vehicles.mileageKm, f.mileageMax));
  // cars that can be imported there: a country that refuses right-hand drive hides those (a code we do not know hides nothing)
  if (f.country) w.push(sql`(${vehicles.steering} <> 'Right' or coalesce((select rhd_allowed from countries where code = ${f.country.toUpperCase()}), true))`);
  if (f.homeSection) w.push(sql`${f.homeSection} = any(${vehicles.homeSections})`);
  if (f.featured) w.push(eq(vehicles.featured, true));
  if (f.ids?.length) w.push(inArray(vehicles.id, f.ids));
  return and(...w);
}

// Every order ends on the unique stock number: rows that tie (same price, or cars seeded in the same
// instant) otherwise come back in any order, and OFFSET paging then repeats some cars and skips others.
const orderFor = (s?: VehicleFilters["sort"]) => {
  const tie = asc(vehicles.stockNo);
  switch (s) {
    case "featured":
      return [desc(vehicles.featured), desc(vehicles.sort), desc(vehicles.createdAt), tie];
    case "price_asc":
      return [asc(effectivePrice), tie];
    case "price_desc":
      return [desc(effectivePrice), tie];
    case "year_desc":
      return [desc(vehicles.year), asc(vehicles.mileageKm), tie];
    case "mileage_asc":
      return [asc(vehicles.mileageKm), tie];
    default:
      // "Priority" from the admin (higher first; every seeded car is 0), then newest
      return [desc(vehicles.sort), desc(vehicles.createdAt), tie];
  }
};

/** Card-shaped rows: what a list, a home section, Sora's search or the app needs. Internal cost is never selected. */
export async function listVehicles(f: VehicleFilters) {
  const where = vehicleWhere(f);
  const rows = await db()
    .select({
      id: vehicles.id,
      slug: vehicles.slug,
      stockNo: vehicles.stockNo,
      title: vehicles.title,
      brand: brands.name,
      model: vehicleModels.name,
      modelCode: vehicles.modelCode,
      year: vehicles.year,
      mileageKm: vehicles.mileageKm,
      priceUsd: vehicles.priceUsd,
      discountPriceUsd: vehicles.discountPriceUsd,
      fuel: vehicles.fuel,
      transmission: vehicles.transmission,
      bodyType: vehicles.bodyType,
      engineCc: vehicles.engineCc,
      color: vehicles.color,
      drive: vehicles.drive,
      steering: vehicles.steering,
      grade: vehicles.grade,
      status: vehicles.status,
      featured: vehicles.featured,
      location: vehicles.location,
      m3: vehicles.m3,
      image: sql<string>`(select url from vehicle_images vi where vi.vehicle_id = ${vehicles.id} order by sort limit 1)`,
    })
    .from(vehicles)
    .innerJoin(brands, eq(brands.id, vehicles.brandId))
    .innerJoin(vehicleModels, eq(vehicleModels.id, vehicles.modelId))
    .where(where)
    .orderBy(...orderFor(f.sort))
    .limit(f.limit ?? 24)
    .offset(f.offset ?? 0);
  const [{ n }] = (await db().select({ n: sql<number>`count(*)::int` }).from(vehicles).where(where)) as [{ n: number }];
  return { items: rows, total: n };
}

export async function getVehicleBySlugOrId(key: string) {
  const [v] = await db()
    .select({ v: vehicles, brand: brands.name, brandSlug: brands.slug, model: vehicleModels.name, modelSlug: vehicleModels.slug })
    .from(vehicles)
    .innerJoin(brands, eq(brands.id, vehicles.brandId))
    .innerJoin(vehicleModels, eq(vehicleModels.id, vehicles.modelId))
    .where(or(eq(vehicles.slug, key), eq(vehicles.id, key), eq(vehicles.stockNo, key.toUpperCase())))
    .limit(1);
  if (!v) return null;
  const images = await db().select().from(vehicleImages).where(eq(vehicleImages.vehicleId, v.v.id)).orderBy(asc(vehicleImages.sort));
  const { costJpy: _internal, ...pub } = v.v;
  return { ...pub, brand: v.brand, brandSlug: v.brandSlug, model: v.model, modelSlug: v.modelSlug, images: images.map((i) => i.url) };
}

export async function relatedVehicles(id: string, bodyType: string, brandId: string) {
  const rows = await listVehicles({ limit: 12, sort: "newest" });
  const all = await listVehicles({ body: bodyType, limit: 12 });
  const byBrand = rows.items.filter((r) => r.id !== id);
  const merged = [...all.items.filter((r) => r.id !== id), ...byBrand];
  const seen = new Set<string>();
  void brandId;
  return merged.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true))).slice(0, 8);
}

export async function suggest(q: string) {
  if (!q || q.trim().length < 2) return [];
  const like = `%${q.trim()}%`;
  return db()
    .select({ id: vehicles.id, slug: vehicles.slug, title: vehicles.title, stockNo: vehicles.stockNo, status: vehicles.status })
    .from(vehicles)
    .where(and(eq(vehicles.published, true), ne(vehicles.status, "sold"), or(ilike(vehicles.title, like), ilike(vehicles.stockNo, like), ilike(vehicles.modelCode, like))))
    .limit(8);
}

export async function catalogFacets() {
  const b = await db().select().from(brands).orderBy(asc(brands.sort));
  const m = await db().select().from(vehicleModels).orderBy(asc(vehicleModels.name));
  const counts = await db().execute(sql`select body_type, count(*)::int as n from vehicles where published and status <> 'sold' group by body_type order by n desc`);
  const gradeRows = (await db().execute(sql`select distinct model_id, grade from vehicles where published and status <> 'sold' and grade is not null and grade <> '' order by grade`)) as unknown as { rows: { model_id: string; grade: string }[] };
  const steering = (await db().execute(sql`select steering, count(*)::int as n from vehicles where published and status <> 'sold' group by steering order by n desc`)) as unknown as { rows: { steering: string; n: number }[] };
  return {
    brands: b.map((x) => ({ ...x, models: m.filter((y) => y.brandId === x.id).map((y) => ({ name: y.name, slug: y.slug, grades: gradeRows.rows.filter((g) => g.model_id === y.id).map((g) => g.grade) })) })),
    bodyTypes: (counts as unknown as { rows: { body_type: string; n: number }[] }).rows.map((r) => ({ name: r.body_type, count: r.n })),
    grades: [...new Set(gradeRows.rows.map((g) => g.grade))],
    steering: steering.rows.map((r) => ({ name: r.steering, count: r.n })),
  };
}
