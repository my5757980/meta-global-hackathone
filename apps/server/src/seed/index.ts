/**
 * Demo data for the fictional exporter "Hikari Motors". Deterministic (seeded RNG) so every fresh
 * database is identical. Nothing here is real customer or supplier data.
 */
import { sql } from "drizzle-orm";
import {
  EnvelopeSchema,
  PERMISSIONS,
  PricingPolicySchema,
  PROGRESS_STAGES,
  SiteSettingsSchema,
  UNIT_FOLDERS,
  type PermissionKey,
  type RoleSlug,
} from "@autofte/shared";
import type { DB } from "../db/client";
import * as s from "../db/schema";
import { genId } from "../lib/id";
import { hashPassword, randomPassword } from "../auth/passwords";
import { carImageUrl } from "../services/carArt";
import { m3FromDims, quote } from "../services/pricing";
import { CATALOG, COLORS, FEATURES_BY_BODY, colorHex, type ModelSpec } from "./catalog";
import { BLOG, FAQS, HOME_SECTIONS, LOCATIONS, PAGES, PARTNERS, SERVICES, TESTIMONIALS } from "./content";
import { COUNTRIES } from "./geo";
import { BODY_PHOTOS, MODEL_PHOTOS, photoPath, type ModelPhoto } from "./photos";
import { COMPANY_SUFFIX, CUSTOMERS, FIRST_NAMES, LAST_NAMES, STAFF } from "./people";
import { Rng, slugify } from "./rng";
import { seedAuction } from "./auction";
import { seedDocuments } from "./documents";
import { addDays, chunkInsert, isoDate } from "./util";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "../env";
import { SEEDED_RUN } from "@autofte/shared";
import { recordDecision } from "../services/ledger";
export { addDays, chunkInsert, isoDate };

const ROLE_PERMS: Record<RoleSlug, PermissionKey[] | "all"> = {
  admin: "all",
  manager: [
    "website.admin", "website.vehicles.manage", "website.content.manage", "website.orders.manage", "website.customers.view", "website.customers.view_all", "website.customers.manage",
    "crm.access", "crm.leads.view_all", "crm.leads.status", "crm.leads.delete", "crm.leads.edit", "crm.leads.transfer", "crm.leads.reassign", "crm.invoices.view_all", "crm.invoices.delete", "crm.invoices.download", "crm.payments.record", "crm.payments.delete", "crm.units.manage", "crm.progress.update", "crm.reports.view", "crm.backup.download", "crm.users.manage",
    "auction.access", "auction.admin", "auction.lots.import", "auction.lots.view_sold", "auction.bids.view", "auction.bids.view_all", "auction.bids.manage", "auction.bids.export", "auction.clients.view", "auction.orders.manage", "auction.enquiries.reply",
    "chat.desk", "chat.view_all", "chat.groups", "fte.console", "fte.approvals.decide", "fte.evals.run",
  ],
  supervisor: [
    "website.admin", "website.customers.view", "website.customers.view_all", "website.customers.manage",
    "crm.access", "crm.leads.view_all", "crm.leads.edit", "crm.leads.upload", "crm.leads.reassign", "crm.invoices.view_all", "crm.invoices.approve", "crm.invoices.download", "crm.payments.record", "crm.payments.delete", "crm.units.manage", "crm.progress.update", "crm.reports.view", "crm.users.manage",
    "auction.access", "auction.admin", "auction.lots.view_sold", "auction.bids.view", "auction.bids.view_all", "auction.bids.manage", "auction.clients.view", "auction.orders.manage", "auction.enquiries.reply",
    "chat.desk", "chat.view_all", "chat.groups", "fte.console", "fte.envelope.manage", "fte.approvals.decide", "fte.evals.run",
  ],
  agent: [
    "website.admin", "website.customers.view", "website.customers.manage",
    "crm.access", "crm.leads.create", "crm.leads.upload", "crm.invoices.request", "crm.units.manage", "crm.progress.update",
    "auction.access", "auction.bids.place", "chat.desk", "chat.groups",
  ],
  accounts: ["crm.access", "crm.invoices.view_all", "crm.invoices.download", "crm.payments.record", "crm.units.manage", "crm.reports.view", "chat.desk"],
  customer: ["auction.access", "auction.bids.place"],
  fte: ["crm.access", "crm.leads.create", "crm.invoices.request", "crm.progress.update", "auction.access", "auction.bids.place", "chat.desk"],
};

export async function isSeeded(db: DB): Promise<boolean> {
  const r = await db.execute(sql`select count(*)::int as n from users`);
  const rows = (r as unknown as { rows: { n: number }[] }).rows;
  return (rows[0]?.n ?? 0) > 0;
}

export interface SeedSummary {
  [k: string]: number;
}

export async function seedAll(db: DB, log: (m: string) => void = console.log): Promise<SeedSummary> {
  const rng = new Rng(20261030);
  const sum: SeedSummary = {};
  const now = new Date();

  // ---------- settings ----------
  await db.insert(s.settings).values([
    { key: "site", value: SiteSettingsSchema.parse({}) },
    { key: "pricing", value: PricingPolicySchema.parse({}) },
    { key: "envelope", value: EnvelopeSchema.parse({}) },
    { key: "demo.clockOffsetMs", value: 0 },
    { key: "recoveryKey", value: { hash: null } },
  ]);
  const policy = PricingPolicySchema.parse({});

  // ---------- access ----------
  await db.insert(s.permissions).values(
    Object.entries(PERMISSIONS).map(([key, label]) => ({ key, area: key.split(".")[0]!, label })),
  );
  const roleIds: Record<string, string> = {};
  const roleRows = (Object.keys(ROLE_PERMS) as RoleSlug[]).map((slug) => {
    const id = genId();
    roleIds[slug] = id;
    const name = { admin: "Admin", manager: "Manager", supervisor: "Supervisor", agent: "Agent", accounts: "Accounts", customer: "Customer", fte: "Digital FTE" }[slug];
    return { id, slug, name, isSystem: true };
  });
  await db.insert(s.roles).values(roleRows);
  const rp: { roleId: string; permissionKey: string }[] = [];
  for (const [slug, perms] of Object.entries(ROLE_PERMS)) {
    const keys = perms === "all" ? (Object.keys(PERMISSIONS) as PermissionKey[]) : perms;
    for (const k of keys) rp.push({ roleId: roleIds[slug]!, permissionKey: k });
  }
  await db.insert(s.rolePermissions).values(rp);

  const userIds: Record<string, string> = {};
  const pwHash = await hashPassword(randomPassword()); // one unknown hash is enough for demo accounts
  await db.insert(s.users).values(
    STAFF.map((u) => {
      const id = genId();
      userIds[u.key] = id;
      return {
        id,
        kind: u.role === "fte" ? "fte" : "staff",
        name: u.name,
        email: u.email,
        username: u.username,
        phone: u.phone,
        passwordHash: u.role === "fte" ? null : pwHash,
        roleId: roleIds[u.role]!,
        title: u.title,
        countryCode: "JP",
        lastSeenAt: now,
      };
    }),
  );
  await db.insert(s.users).values(
    CUSTOMERS.map((c) => {
      const id = genId();
      userIds[c.key] = id;
      return {
        id,
        kind: "customer",
        name: c.name,
        email: c.email,
        phone: c.phone,
        passwordHash: pwHash,
        roleId: roleIds.customer!,
        countryCode: c.country,
        city: c.city,
        company: c.company,
      };
    }),
  );
  sum.users = STAFF.length + CUSTOMERS.length;
  log(`users ${sum.users}`);

  // ---------- geography ----------
  // JP is needed for staff rows' country code only; not a destination.
  await db.insert(s.countries).values([
    { code: "JP", name: "Japan", region: "East Asia", inspectionRequired: false, inspectionFeeUsd: 0, timezone: "Asia/Tokyo", rhdAllowed: true },
    ...COUNTRIES.map((c) => ({
      code: c.code,
      name: c.name,
      region: c.region,
      inspectionRequired: c.inspectionRequired,
      inspectionFeeUsd: c.inspectionFeeUsd,
      timezone: c.timezone,
      rhdAllowed: c.rhdAllowed,
    })),
  ]);
  const portRows = COUNTRIES.flatMap((c) =>
    c.ports.map((p) => ({ id: genId(), countryCode: c.code, name: p.name, freightUsdPerM3: p.freightUsdPerM3, transitDays: p.transitDays })),
  );
  await chunkInsert(db, s.ports, portRows);
  const firstPort = (code: string) => portRows.find((p) => p.countryCode === code)!;
  sum.countries = COUNTRIES.length;
  sum.ports = portRows.length;
  log(`countries ${sum.countries}, ports ${sum.ports}`);

  // ---------- catalog + stock ----------
  const brandIds: Record<string, string> = {};
  const modelIds: Record<string, string> = {};
  const brandNames = [...new Set(CATALOG.map((m) => m.brand))];
  await db.insert(s.brands).values(
    brandNames.map((b, i) => {
      const id = genId();
      brandIds[b] = id;
      return { id, name: b, slug: slugify(b), sort: i };
    }),
  );
  await db.insert(s.vehicleModels).values(
    CATALOG.map((m) => {
      const id = genId();
      modelIds[`${m.brand}|${m.model}`] = id;
      return { id, brandId: brandIds[m.brand]!, name: m.model, slug: slugify(m.model) };
    }),
  );

  type StockRow = typeof s.vehicles.$inferInsert & { id: string; spec: ModelSpec; colorHex: string; photo: ModelPhoto | null };
  const stock: StockRow[] = [];
  let stockNo = 10001;
  for (const spec of CATALOG) {
    const count = spec.baseUsd > 30000 ? 2 : rng.int(2, 3);
    for (let k = 0; k < count; k++) {
      const year = rng.int(spec.years[0], spec.years[1]);
      const month = rng.int(1, 12);
      const mileage = rng.round(Math.max(8000, rng.int(15000, 120000) - (year - 2015) * 6000), 100);
      const anyColor = rng.weighted(COLORS.map((c) => [c.name, c.weight] as const));
      const photos = MODEL_PHOTOS[`${spec.brand}|${spec.model}`] ?? [];
      const photo = photos.length ? photos[stockNo % photos.length]! : null;
      const color = photo?.color ?? anyColor; // a listing takes the colour of its picture
      const trim = rng.pick(spec.trims);
      const fuel = rng.pick(spec.fuel);
      const engine = spec.engineCc[Math.min(spec.engineCc.length - 1, spec.fuel.indexOf(fuel))] ?? spec.engineCc[0]!;
      const drive = rng.pick(spec.drive);
      const trans = rng.pick(spec.transmission);
      const code = rng.pick(spec.codes);
      const yearFactor = Math.pow(1.085, year - 2018);
      const kmFactor = 1 + (60000 - mileage) / 450000;
      const price = rng.round(spec.baseUsd * yearFactor * kmFactor * (0.94 + rng.next() * 0.12), 50);
      const discount = rng.chance(0.18) ? rng.round(price * (0.92 + rng.next() * 0.04), 50) : null;
      const engineLabel = engine ? `${(engine / 1000).toFixed(1)}${fuel === "Diesel" ? " Diesel" : fuel === "Hybrid" ? " Hybrid" : ""}` : "EV";
      const title = `${year} ${spec.brand} ${spec.model} ${trim} ${engineLabel} ${drive}`.replace(/\s+/g, " ");
      const id = genId();
      const no = `HK-${stockNo++}`;
      const features = rng.shuffle([...(FEATURES_BY_BODY[spec.body] ?? [])]).slice(0, rng.int(4, 8));
      const [L, W, H] = spec.dims;
      const sections: string[] = [];
      if (rng.chance(0.14)) sections.push("best_seller");
      if (rng.chance(0.1)) sections.push("upcoming");
      if (rng.chance(0.14)) sections.push("new_arrivals");
      if (spec.brand === "Lexus" || ["Land Cruiser", "Alphard", "Crown", "Harrier"].includes(spec.model)) sections.push("luxury");
      if (spec.body === "Truck" || spec.body === "Van") sections.push("commercial");
      stock.push({
        id,
        spec,
        colorHex: colorHex(color),
        photo,
        stockNo: no,
        refNo: `R${(100000 + rng.int(0, 899999)).toString()}`,
        slug: `${slugify(title)}-${no.toLowerCase()}`,
        title,
        brandId: brandIds[spec.brand]!,
        modelId: modelIds[`${spec.brand}|${spec.model}`]!,
        modelCode: code,
        grade: trim,
        chassisNo: `${code}-${rng.int(1000000, 9999999)}`,
        year,
        month,
        priceUsd: price,
        discountPriceUsd: discount,
        costJpy: Math.round(price * policy.fxJpyPerUsd * (0.74 + rng.next() * 0.08)),
        mileageKm: mileage,
        fuel,
        transmission: trans,
        bodyType: spec.body,
        engineCc: engine || null,
        color,
        // some left-hand cars, so a left-hand market has something to buy (from the stock number: the random stream stays the same)
        steering: ["SUV", "Pickup", "Sedan"].includes(spec.body) && Number(no.slice(3)) % 7 === 3 ? "Left" : "Right",
        drive,
        doors: spec.doors,
        seats: spec.seats,
        lengthMm: L,
        widthMm: W,
        heightMm: H,
        m3: m3FromDims(L, W, H),
        location: rng.pick(["Yokohama", "Yokohama", "Nagoya", "Osaka", "Kobe"]),
        features,
        tags: [spec.body, fuel, drive].filter(Boolean),
        homeSections: sections,
        featured: rng.chance(0.15),
        status: "available",
        published: true,
        sort: 0,
        shortDesc: `${spec.brand} ${spec.model} ${trim}, ${mileage.toLocaleString("en-US")} km, ${color}, ${trans}.`,
        description:
          `This ${year} ${spec.brand} ${spec.model} ${trim} is in our ${"Yokohama"} yard and ready for export. ` +
          `${engine ? `${engine} cc ${fuel.toLowerCase()} engine` : "Electric drive"}, ${trans.toLowerCase()} transmission, ${drive}, ${spec.seats} seats. ` +
          `Inspected and photographed; full auction/inspection history available on request. Chassis code ${code}.`,
        seoTitle: `${title} for export | Hikari Motors`,
        seoDescription: `${title} — ${mileage.toLocaleString("en-US")} km, ${color}. C&F quotes to your port.`,
        seoKeywords: [spec.brand, spec.model, code, spec.body, "Japanese used car"].join(", "),
        createdAt: addDays(now, -rng.int(0, 60)),
      });
    }
  }
  // ensure each home section has enough cars
  for (const sec of ["best_seller", "upcoming", "new_arrivals"]) {
    let have = stock.filter((v) => v.homeSections!.includes(sec)).length;
    for (const v of rng.shuffle([...stock])) {
      if (have >= 8) break;
      if (!v.homeSections!.includes(sec)) {
        v.homeSections!.push(sec);
        have++;
      }
    }
  }
  await chunkInsert(
    db,
    s.vehicles,
    stock.map(({ spec: _s, colorHex: _c, photo: _p, ...row }) => row),
  );
  const images = stock.flatMap((v) => {
    const real = v.photo ? [photoPath(v.photo.file), ...(v.photo.also ? [photoPath(v.photo.also)] : [])] : [];
    const views = real.length ? (["side", "rear", "interior"] as const) : (["side", "front", "rear", "interior"] as const);
    return [...real, ...views.map((view) => carImageUrl(v.spec.body, v.colorHex, view))].map((url, i) => ({ vehicleId: v.id, url, sort: i }));
  });
  await chunkInsert(db, s.vehicleImages, images);
  sum.vehicles = stock.length;
  log(`stock vehicles ${stock.length}`);

  // ---------- website content ----------
  await db.insert(s.homeSections).values(HOME_SECTIONS.map((h, i) => ({ key: h.key, title: h.title, subtitle: (h as { subtitle?: string }).subtitle ?? null, data: h.data, sort: i })));
  await db.insert(s.services).values(SERVICES.map((x, i) => ({ ...x, sort: i })));
  await db.insert(s.faqs).values(FAQS.map((x, i) => ({ ...x, sort: i })));
  await db.insert(s.testimonials).values(TESTIMONIALS.map((x, i) => ({ ...x, sort: i })));
  await db.insert(s.partners).values(PARTNERS.map((x, i) => ({ name: x.name, url: x.url, sort: i })));
  await db.insert(s.locations).values(LOCATIONS.map((x, i) => ({ ...x, sort: i })));
  await db.insert(s.pages).values(PAGES.map((p) => ({ ...p, seoTitle: p.title })));
  await db.insert(s.blogPosts).values(
    BLOG.map((b, i) => ({ ...b, publishedAt: addDays(now, -(i * 6 + 2)), coverUrl: BODY_PHOTOS[(rng.pick(COLORS), rng.pick(["SUV", "Sedan", "Pickup", "Wagon", "Minivan"]))] ?? null, seoTitle: b.title, seoDescription: b.excerpt })),
  );
  await db.insert(s.contactMessages).values([
    { name: "Brian Otieno", email: "brian.otieno@example.com", phone: "+254 700 111 222", subject: "Fleet of Probox", message: "Hello, I need 5 Probox vans for a delivery business in Nairobi. Can you quote C&F Mombasa?", createdAt: addDays(now, -2) },
    { name: "Keisha Brown", email: "keisha.brown@example.com", subject: "RHD in Barbados", message: "Do you ship to Bridgetown and how long does it take?", createdAt: addDays(now, -1) },
  ]);

  // ---------- CRM ----------
  const agents = { agent: userIds.agent!, agent2: userIds.agent2!, fte: userIds.fte! };
  const leadRows: (typeof s.leads.$inferInsert & { id: string })[] = [];
  const noteRows: (typeof s.leadNotes.$inferInsert)[] = [];
  const customerLead: Record<string, string> = {};
  const regionOf = (code: string) => COUNTRIES.find((c) => c.code === code)?.region ?? "default";
  const namePool = (region: string) => {
    const key = region.includes("Africa") ? (region === "East Africa" ? "East Africa" : "Southern Africa") : ["Caribbean", "South Asia", "Oceania"].includes(region) ? region : "default";
    return { first: FIRST_NAMES[key] ?? FIRST_NAMES.default!, last: LAST_NAMES[key] ?? LAST_NAMES.default! };
  };

  for (const c of CUSTOMERS) {
    const id = genId();
    customerLead[c.key] = id;
    const port = firstPort(c.country);
    leadRows.push({
      id,
      customerName: c.company,
      contactPerson: c.name,
      address: `${c.city}`,
      phone: c.phone,
      email: c.email,
      countryCode: c.country,
      portId: port.id,
      status: "in_progress",
      isCustomer: true,
      ownerUserId: agents[c.agent],
      customerUserId: userIds[c.key]!,
      source: c.agent === "fte" ? "web_chat" : "manual",
      createdBy: agents[c.agent],
      createdAt: addDays(now, -rng.int(30, 120)),
    });
    noteRows.push(
      { leadId: id, authorUserId: agents[c.agent], body: `First contact. Interested in ${rng.pick(["SUVs", "pickups", "vans", "hybrids", "a family car"])} for ${c.city}.`, createdAt: addDays(now, -rng.int(20, 30)) },
      { leadId: id, authorUserId: agents[c.agent], body: "Sent stock list and C&F estimates. Customer will confirm after checking with the bank.", createdAt: addDays(now, -rng.int(5, 19)) },
    );
  }
  const markets = ["KE", "KE", "KE", "TZ", "TZ", "UG", "ZM", "ZW", "MW", "MZ", "JM", "JM", "TT", "GY", "BS", "BB", "PK", "PK", "LK", "BD", "AE", "CL", "NZ", "FJ", "TO", "PG", "RU", "MN", "GE", "SO", "IE", "GB", "MU", "BW", "NA", "CD"];
  const statuses = [["new", 35], ["in_progress", 45], ["closed", 12], ["new", 8]] as const;
  for (let i = 0; i < 380; i++) {
    const cc = rng.pick(markets);
    const region = regionOf(cc);
    const pool = namePool(region);
    const first = rng.pick(pool.first);
    const last = rng.pick(pool.last);
    const ownerKey = rng.weighted([["agent", 45], ["agent2", 40], ["fte", 15]] as const);
    const portsHere = portRows.filter((p) => p.countryCode === cc);
    const created = addDays(now, -rng.int(0, 150));
    const phoneDigits = String(rng.int(100000000, 999999999));
    const company = rng.chance(0.7) ? `${last} ${rng.pick(COMPANY_SUFFIX)}` : `${first} ${last}`;
    leadRows.push({
      id: genId(),
      customerName: company,
      contactPerson: `${first} ${last}`,
      address: null,
      phone: `+${rng.int(1, 999)} ${phoneDigits}`,
      email: rng.chance(0.75) ? `${slugify(first)}.${slugify(last)}${rng.int(1, 99)}@example.com` : null,
      countryCode: cc,
      portId: rng.pick(portsHere).id,
      status: rng.weighted(statuses),
      isCustomer: false,
      ownerUserId: agents[ownerKey],
      source: ownerKey === "fte" ? rng.pick(["web_chat", "app_chat"]) : rng.pick(["manual", "manual", "excel"]),
      createdBy: agents[ownerKey],
      createdAt: created,
      updatedAt: created,
    });
  }
  await chunkInsert(db, s.leads, leadRows);
  await chunkInsert(db, s.leadNotes, noteRows);
  sum.leads = leadRows.length;
  log(`leads ${leadRows.length}`);

  // invoices for customers (the showcase customer gets a full story)
  const countriesByCode = Object.fromEntries(COUNTRIES.map((c) => [c.code, c]));
  const available = rng.shuffle(stock.filter((v) => v.status === "available"));
  let invSeq = 0;
  const invoiceRows: (typeof s.invoices.$inferInsert & { id: string })[] = [];
  const invVehRows: (typeof s.invoiceVehicles.$inferInsert & { id: string })[] = [];
  const paymentRows: (typeof s.payments.$inferInsert)[] = [];
  const unitRows: (typeof s.units.$inferInsert & { id: string })[] = [];
  const finRows: (typeof s.unitFinancials.$inferInsert)[] = [];
  const progressRows: (typeof s.vehicleProgress.$inferInsert)[] = [];
  const leadStatus: Record<string, string> = {};
  const showcase: { invoiceIds: string[]; unitIds: string[] } = { invoiceIds: [], unitIds: [] };

  const stagesUpTo = (n: number) => PROGRESS_STAGES.slice(1, n + 1);

  for (const c of CUSTOMERS) {
    const leadId = customerLead[c.key]!;
    const country = countriesByCode[c.country]!;
    const port = firstPort(c.country);
    const plan: ("sent_paid" | "sent_advance" | "approved" | "pending" | "rejected")[] =
      c.key === "customer" ? ["sent_paid", "sent_advance"] : rng.weighted([[["sent_paid"], 30], [["sent_advance"], 25], [["approved"], 15], [["pending"], 15], [["sent_paid", "approved"], 15]] as const) as never;
    for (const kind of plan) {
      const nVeh = c.key === "c4" && kind === "sent_paid" ? 3 : 1;
      const vehs = available.splice(0, nVeh);
      if (vehs.length < nVeh) break;
      const invId = genId();
      const created = addDays(now, -(kind === "sent_paid" ? rng.int(35, 70) : kind === "pending" ? rng.int(0, 2) : rng.int(6, 25)));
      let totalPush = 0;
      let totalCnf = 0;
      vehs.forEach((v, pos) => {
        const q = quote({ basis: { kind: "stock", priceUsd: Number(v.discountPriceUsd ?? v.priceUsd) }, m3: Number(v.m3), port, country, policy });
        totalPush += q.fobUsd;
        totalCnf += q.cnfUsd;
        const ivId = genId();
        invVehRows.push({
          id: ivId,
          invoiceId: invId,
          position: pos,
          vehicleId: v.id,
          unitLabel: `${v.spec.brand} ${v.spec.model}`,
          year: v.year as number,
          color: v.color as string,
          chassisNo: v.chassisNo as string,
          engine: v.engineCc ? `${v.engineCc} cc` : "EV",
          transmission: v.transmission as string,
          fuel: v.fuel as string,
          pushUsd: q.fobUsd,
          cnfUsd: q.cnfUsd,
        });
        v.status = kind === "pending" ? "reserved" : "sold";
        // payments → units → progress
        if (kind === "sent_paid" || kind === "sent_advance") {
          const unitId = genId();
          if (kind === "sent_paid") {
            unitRows.push({
              id: unitId,
              invoiceId: invId,
              invoiceVehicleId: ivId,
              make: v.spec.brand,
              model: v.spec.model,
              year: v.year as number,
              color: v.color as string,
              chassis: v.chassisNo as string,
              engineCc: (v.engineCc as number) ?? null,
              drive: v.drive as string,
              fuel: v.fuel as string,
              mileageKm: v.mileageKm as number,
              transmission: v.transmission as string,
              steering: v.steering as string,
              doors: v.doors as number,
              seats: v.seats as number,
              location: "Yokohama yard",
              createdBy: userIds.accounts!,
              createdAt: addDays(created, 12),
            });
            const fx = policy.fxJpyPerUsd;
            finRows.push({
              unitId,
              lotNo: String(rng.int(1000, 9999)),
              auctionName: rng.pick(["Kanto Auto Auction", "Yokohama Bay Auction", "Chubu Motor Auction"]),
              buyingJpy: Math.round((v.costJpy as number) * 0.86),
              domesticJpy: 18000,
              storageJpy: 5000,
              inspectJpy: country.inspectionRequired ? Math.round(country.inspectionFeeUsd * fx * 0.6) : 0,
              repairsJpy: rng.chance(0.3) ? rng.int(5, 40) * 1000 : 0,
              miscJpy: 3000,
              agencyFeeJpy: 30000,
              freightJpy: Math.round(Number(v.m3) * port.freightUsdPerM3 * fx * 0.82),
              dhlJpy: 6000,
              auctionFeeJpy: 25000,
              partsJpy: 0,
              vanningJpy: 0,
              docJpy: 4000,
              fxRate: fx,
              sellingPriceUsd: totalCnf,
            });
            if (c.key === "customer") showcase.unitIds.push(unitId);
          }
          const stageCount = kind === "sent_paid" ? (c.key === "customer" ? 8 : rng.int(7, 9)) : 4;
          stagesUpTo(stageCount).forEach((stage, i) => {
            progressRows.push({ invoiceVehicleId: ivId, stage, stageDate: isoDate(addDays(created, i * 4)), note: i === stageCount - 1 && stage === "Shipped" ? "Vessel: Pacific Star (demo), ETA in ~25 days" : null, createdBy: agents[c.agent] === agents.fte ? userIds.supervisor! : agents[c.agent], createdAt: addDays(created, i * 4) });
          });
        }
      });
      const status = kind === "pending" ? "pending" : kind === "rejected" ? "rejected" : kind === "approved" ? "approved" : "sent";
      const settings = SiteSettingsSchema.parse({});
      invoiceRows.push({
        id: invId,
        number: `${settings.invoicePrefix}${String(2601 + invSeq++).padStart(5, "0")}`,
        leadId,
        requestedBy: agents[c.agent],
        approvedBy: status === "pending" ? null : userIds.supervisor!,
        status,
        consigneeName: c.company,
        consigneeAddress: `${c.city}, ${country.name}`,
        consigneePhone: c.phone,
        consigneeEmail: c.email,
        consigneeCountryCode: c.country,
        consigneePortId: port.id,
        salesperson: STAFF.find((s0) => s0.key === c.agent)?.name ?? "Sora",
        m3Rate: port.freightUsdPerM3,
        exchangeRate: policy.fxJpyPerUsd,
        totalPushUsd: Math.round(totalPush * 100) / 100,
        totalCnfUsd: Math.round(totalCnf * 100) / 100,
        advancePercent: policy.advancePercent,
        createdAt: created,
        approvedAt: status === "pending" ? null : addDays(created, 1),
        sentAt: status === "sent" ? addDays(created, 1) : null,
      });
      if (c.key === "customer") showcase.invoiceIds.push(invId);
      const cnf = Math.round(totalCnf * 100) / 100;
      if (kind === "sent_paid") {
        const adv = Math.round(cnf * 0.5 * 100) / 100;
        paymentRows.push(
          { invoiceId: invId, sellingPriceUsd: cnf, amountUsd: adv, receivedDate: isoDate(addDays(created, 3)), fxRate: policy.fxJpyPerUsd, yenAmount: Math.round(adv * policy.fxJpyPerUsd), recordedBy: userIds.accounts!, createdAt: addDays(created, 3) },
          { invoiceId: invId, sellingPriceUsd: cnf, amountUsd: Math.round((cnf - adv) * 100) / 100, receivedDate: isoDate(addDays(created, 18)), fxRate: policy.fxJpyPerUsd, yenAmount: Math.round((cnf - adv) * policy.fxJpyPerUsd), recordedBy: userIds.accounts!, createdAt: addDays(created, 18) },
        );
      } else if (kind === "sent_advance") {
        const adv = Math.round(cnf * 0.5 * 100) / 100;
        paymentRows.push({ invoiceId: invId, sellingPriceUsd: cnf, amountUsd: adv, receivedDate: isoDate(addDays(created, 3)), fxRate: policy.fxJpyPerUsd, yenAmount: Math.round(adv * policy.fxJpyPerUsd), recordedBy: userIds.accounts!, createdAt: addDays(created, 3) });
      }
      leadStatus[leadId] = status === "pending" ? "invoice_requested" : "invoiced";
    }
  }
  // three buyers the CRM knows only by phone: no e-mail, so no website account until staff add one (admin Customers lists them)
  const phoneOnly = leadRows.filter((l) => !l.email && !l.isCustomer && l.status === "in_progress").slice(0, 3);
  for (const lead of phoneOnly) {
    const [v] = available.splice(0, 1);
    if (!v) break;
    const country = countriesByCode[lead.countryCode!]!;
    const port = firstPort(lead.countryCode!);
    const q = quote({ basis: { kind: "stock", priceUsd: Number(v.discountPriceUsd ?? v.priceUsd) }, m3: Number(v.m3), port, country, policy });
    const invId = genId();
    const created = addDays(now, -8);
    v.status = "sold";
    invVehRows.push({ id: genId(), invoiceId: invId, position: 0, vehicleId: v.id, unitLabel: `${v.spec.brand} ${v.spec.model}`, year: v.year as number, color: v.color as string, chassisNo: v.chassisNo as string, engine: v.engineCc ? `${v.engineCc} cc` : "EV", transmission: v.transmission as string, fuel: v.fuel as string, pushUsd: q.fobUsd, cnfUsd: q.cnfUsd });
    invoiceRows.push({
      id: invId,
      number: `${SiteSettingsSchema.parse({}).invoicePrefix}${String(2601 + invSeq++).padStart(5, "0")}`,
      leadId: lead.id!,
      requestedBy: lead.ownerUserId,
      approvedBy: userIds.supervisor!,
      status: "approved",
      consigneeName: lead.customerName,
      consigneeAddress: country.name,
      consigneePhone: lead.phone,
      consigneeCountryCode: lead.countryCode,
      consigneePortId: port.id,
      m3Rate: port.freightUsdPerM3,
      exchangeRate: policy.fxJpyPerUsd,
      totalPushUsd: Math.round(q.fobUsd * 100) / 100,
      totalCnfUsd: Math.round(q.cnfUsd * 100) / 100,
      advancePercent: policy.advancePercent,
      createdAt: created,
      approvedAt: addDays(created, 1),
    });
    leadStatus[lead.id!] = "invoiced";
    await db.execute(sql`update leads set is_customer = true where id = ${lead.id!}`);
  }
  await chunkInsert(db, s.invoices, invoiceRows);
  await chunkInsert(db, s.invoiceVehicles, invVehRows);
  await chunkInsert(db, s.payments, paymentRows);
  await chunkInsert(db, s.units, unitRows);
  await chunkInsert(db, s.unitFinancials, finRows);
  await chunkInsert(db, s.vehicleProgress, progressRows);
  for (const [leadId, st] of Object.entries(leadStatus)) {
    await db.execute(sql`update leads set status = ${st} where id = ${leadId}`);
  }
  for (const v of stock.filter((x) => x.status !== "available")) {
    await db.execute(sql`update vehicles set status = ${v.status} where id = ${v.id}`);
  }
  sum.invoices = invoiceRows.length;
  sum.payments = paymentRows.length;
  sum.units = unitRows.length;
  log(`invoices ${invoiceRows.length}, payments ${paymentRows.length}, units ${unitRows.length}`);

  // documents for the showcase customer's shipped unit(s)
  sum.documents = await seedDocuments(db, showcase.unitIds, userIds.accounts!);

  // ---------- auction ----------
  const auctionSum = await seedAuction(db, rng, now, userIds, log);
  Object.assign(sum, auctionSum);

  // ---------- chat ----------
  // the roster, and the room where the FTEs work in the open
  const seats: [string, string][] = [["sales", "fte"], ["invoices", "w_invoices"], ["accounts", "w_accounts"], ["operations", "w_operations"], ["auction", "w_auction"], ["crm", "w_crm"], ["website", "w_website"], ["chief", "w_chief"]];
  await db.insert(s.fteWorkers).values(seats.map(([key, user]) => ({ key, userId: userIds[user]! })));
  const roomId = genId();
  await db.insert(s.chatConversations).values({ id: roomId, kind: "group", title: "AI workforce room", holder: "human", lastMessageAt: now });
  await db.insert(s.chatMembers).values([...seats.map(([, user]) => userIds[user]!), userIds.admin!, userIds.manager!, userIds.supervisor!].map((userId) => ({ conversationId: roomId, userId })));
  await db.insert(s.settings).values({ key: "workforce.room", value: roomId as never });
  const groupId = genId();
  await db.insert(s.chatConversations).values({ id: groupId, kind: "group", title: "Sales team", holder: "human", lastMessageAt: addDays(now, -1) });
  await db.insert(s.chatMembers).values(
    ["manager", "supervisor", "agent", "agent2", "accounts"].map((k, i) => ({ conversationId: groupId, userId: userIds[k]!, role: i < 2 ? "admin" : "member" })),
  );
  await db.insert(s.chatMessages).values([
    { conversationId: groupId, senderUserId: userIds.manager!, body: "Morning team. The desks handled 14 chats overnight and cleared the invoice requests. Nothing is waiting for us.", createdAt: addDays(now, -1) },
    { conversationId: groupId, senderUserId: userIds.supervisor!, body: "Good. I will call the Mombasa buyer who asked to speak to a person.", createdAt: addDays(now, -1) },
  ]);
  const custConv = genId();
  await db.insert(s.chatConversations).values({ id: custConv, kind: "customer", customerUserId: userIds.customer!, holder: "fte", assignedUserId: userIds.agent!, lastMessageAt: addDays(now, -3), fteSummary: "Joseph (Mwangi Auto Traders, Mombasa) bought a car earlier; second invoice approved, advance paid; asking about shipping dates." });
  await db.insert(s.chatMembers).values([
    { conversationId: custConv, userId: userIds.customer!, lastReadAt: addDays(now, -3) },
    { conversationId: custConv, userId: userIds.fte! },
    { conversationId: custConv, userId: userIds.agent! },
  ]);
  await db.insert(s.chatMessages).values([
    { conversationId: custConv, senderUserId: userIds.customer!, body: "Hello, when will my second car be booked on a vessel?", createdAt: addDays(now, -3) },
    { conversationId: custConv, senderUserId: userIds.fte!, body: "Hi Joseph — your advance is received. The car is booked for the next vessel once the balance arrives; I'll update you at every step.", createdAt: addDays(now, -3) },
  ]);

  // a week of the AI employee's work, so its console is not empty on a fresh demo; the console says how many of these are seeded
  const runTools = [["search_stock"], ["search_stock", "quote_cnf"], ["list_ports", "quote_cnf"], ["search_auction_lots"], ["search_auction_lots", "read_auction_sheet"], ["find_or_create_lead", "quote_cnf", "request_invoice"], ["get_customer_record"], ["load_skill", "search_stock", "quote_cnf"]];
  const seededRuns = Array.from({ length: 64 }, () => {
    const startedAt = new Date(now.getTime() - rng.int(26 * 60, 6.8 * 24 * 60) * 60_000);
    const first = rng.int(1400, 5200);
    const latency = first + rng.int(200, 6000);
    const names = rng.pick(runTools);
    return {
      trigger: "message",
      conversationId: custConv,
      status: rng.chance(0.05) ? "handover" : "ok",
      steps: names.length + 1,
      provider: SEEDED_RUN,
      model: "meta-models/muse-spark-open-1026",
      promptTokens: rng.int(3500, 9000),
      completionTokens: rng.int(120, 700),
      latencyMs: latency,
      firstReplyMs: first,
      toolCalls: names.map((name) => ({ name, args: {}, ok: true, ms: rng.int(20, 300), preview: "" })),
      startedAt,
      finishedAt: new Date(startedAt.getTime() + latency),
    };
  });
  await chunkInsert(db, s.fteRuns, seededRuns);

  // the desks' week too, labelled the same way, so the workforce page is not empty on a fresh demo
  const deskJobs: [string, string[]][] = [
    ["invoices", ["review_invoice", "approve_invoice"]],
    ["invoices", ["review_invoice", "price_invoice", "review_invoice", "approve_invoice"]],
    ["accounts", ["read_payment_slip", "find_invoice", "record_payment"]],
    ["operations", ["read_document", "get_unit_work", "file_document"]],
    ["auction", ["get_auction_enquiry", "get_auction_lot", "answer_enquiry"]],
    ["auction", ["review_auction_order", "update_auction_order"]],
    ["crm", ["get_contact_message", "find_or_create_lead", "add_lead_note", "reply_contact_message"]],
    ["website", ["review_web_order", "order_to_invoice"]],
    ["website", ["write_listing"]],
    ["chief", ["get_approval", "decide_approval"]],
  ];
  await chunkInsert(db, s.fteRuns, Array.from({ length: 40 }, (_, i) => {
    const [workerKey, names] = deskJobs[i % deskJobs.length]!;
    const startedAt = new Date(now.getTime() - rng.int(26 * 60, 6.8 * 24 * 60) * 60_000);
    const latency = rng.int(3000, 14000);
    return { workerKey, trigger: "event", status: "ok", steps: names.length, provider: SEEDED_RUN, model: "meta-models/muse-spark-open-1026", promptTokens: rng.int(3000, 8000), completionTokens: rng.int(100, 500), latencyMs: latency, firstReplyMs: latency, toolCalls: names.map((name) => ({ name, args: {}, ok: true, ms: rng.int(20, 300), preview: "" })), startedAt, finishedAt: new Date(startedAt.getTime() + latency) };
  }));
  const decided = invoiceRows.filter((i) => i.status === "approved" || i.status === "sent").slice(0, 5);
  for (const [i, inv] of decided.entries()) {
    await recordDecision({ workerKey: "invoices", task: "invoice.review", entity: "invoice", entityId: inv.id, decision: "approved", reason: `Seeded demo history: invoice ${inv.number}, every rubric check passed and the price is the accepted quote.`, createdAt: addDays(now, -(decided.length - i)) }, db);
  }
  await db.insert(s.fteReports).values({
    day: addDays(now, -1).toISOString().slice(0, 10),
    body: "Seeded demo report.\nDone: 14 chats answered, 3 invoices approved and sent, 2 payments recorded, 4 documents filed.\nMissed or failed: nothing.\nNeeds you: nothing.",
    data: {},
  });
  await db.insert(s.chatMessages).values(
    decided.slice(0, 2).flatMap((inv, i) => [
      { conversationId: roomId, senderUserId: userIds.w_invoices!, body: `Invoice ${inv.number} is out: every check passed, final PDF added and marked as sent.`, createdAt: addDays(now, -(2 - i)) },
      { conversationId: roomId, senderUserId: userIds.w_accounts!, body: `Advance on ${inv.number} read from the slip and recorded. The slip matched the invoice and the company's account.`, createdAt: new Date(addDays(now, -(2 - i)).getTime() + 3 * 3600_000) },
    ]),
  );
  const weekAgo = addDays(now, -7).getTime();
  const fteLeads = leadRows.filter((l) => l.ownerUserId === agents.fte && new Date(l.createdAt as Date).getTime() > weekAgo).slice(0, 12);
  const fteInvoices = invoiceRows.filter((i) => i.requestedBy === agents.fte && new Date(i.createdAt as Date).getTime() > weekAgo).slice(0, 6);
  await chunkInsert(db, s.auditLog, [
    ...fteLeads.map((l) => ({ actorUserId: userIds.fte!, actorKind: "fte", action: "lead.created", entity: "lead", entityId: l.id, summary: `Created lead ${l.customerName} from chat`, createdAt: l.createdAt as Date })),
    ...fteInvoices.map((i) => ({ actorUserId: userIds.fte!, actorKind: "fte", action: "invoice.requested", entity: "invoice", entityId: i.id, summary: `Requested invoice ${i.number} for ${i.consigneeName}`, createdAt: i.createdAt as Date })),
    ...[1, 3].map((d) => ({ actorUserId: userIds.fte!, actorKind: "fte", action: "chat.handover", entity: "conversation", entityId: custConv, summary: "Handed a chat to a team member", createdAt: addDays(now, -d) })),
  ]);

  log("seed done");
  // the last real eval run, so the console shows a result before anyone has spent tokens on one
  const lastRun = resolve(ROOT, "evals/last-run.json");
  if (existsSync(lastRun)) {
    const run = JSON.parse(readFileSync(lastRun, "utf8")) as { startedAt: string; finishedAt: string; total: number; passed: number; provider: string; model: string; results: unknown[] };
    await db.insert(s.evalRuns).values({ startedAt: new Date(run.startedAt), finishedAt: new Date(run.finishedAt), total: run.total, passed: run.passed, provider: run.provider, model: run.model, results: run.results });
  }
  return sum;
}
