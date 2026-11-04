import { Router, type Request } from "express";
import multer from "multer";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { z, type ZodObject, type ZodRawShape } from "zod";
import { PERMISSIONS } from "@autofte/shared";
import { env } from "../env";
import { db } from "../db/client";
import * as s from "../db/schema";
import { bad, conflict, forbidden, h, notFound, parse } from "../lib/http";
import { can, clearPermCache, requireAuth, requirePerm, type AuthUser } from "../auth/session";
import { lastResetAt, resetDemo, resetRunning } from "../services/demoReset";
import { hashPassword, oneTimePassword } from "../auth/passwords";
import { audit } from "../services/audit";
import { deleteFile, saveFile } from "../services/files";

/**
 * The rest of the website admin: the simple content lists, brands and models, customers (with their CRM
 * record and vehicle progress), and roles & permissions. Mounted beside routes/admin.ts on /api/admin.
 */
export const adminContentRouter = Router();

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

const countOf = (x: { n: number }[]) => x[0]?.n ?? 0;
const opt = (max: number) => z.string().trim().max(max).nullable().optional();

// ---------- content lists: one small CRUD, six tables ----------
export const SERVICE_ICONS = ["Gavel", "Car", "ClipboardCheck", "Ship", "FileText", "Headphones"] as const;

interface Collection {
  table: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- the six tables differ; each schema below checks its own columns
  schema: ZodObject<ZodRawShape>;
  label: (row: Record<string, unknown>) => string;
  order: () => SQL[];
}

const COLLECTIONS: Record<string, Collection> = {
  services: {
    table: s.services,
    schema: z.object({ title: z.string().trim().min(2).max(120), body: z.string().trim().min(2).max(2000), icon: z.enum(SERVICE_ICONS).nullable().optional(), sort: z.number().int().optional() }) as never,
    label: (r) => String(r.title),
    order: () => [asc(s.services.sort), asc(s.services.title)],
  },
  faqs: {
    table: s.faqs,
    schema: z.object({ question: z.string().trim().min(3).max(300), answer: z.string().trim().min(2).max(4000), category: z.string().trim().min(1).max(60).optional(), sort: z.number().int().optional() }) as never,
    label: (r) => String(r.question),
    order: () => [asc(s.faqs.category), asc(s.faqs.sort), asc(s.faqs.question)],
  },
  testimonials: {
    table: s.testimonials,
    schema: z.object({ name: z.string().trim().min(2).max(80), country: opt(60), text: z.string().trim().min(3).max(1000), rating: z.number().int().min(1).max(5).optional(), videoUrl: opt(300), sort: z.number().int().optional() }) as never,
    label: (r) => String(r.name),
    order: () => [asc(s.testimonials.sort), asc(s.testimonials.name)],
  },
  partners: {
    table: s.partners,
    schema: z.object({ name: z.string().trim().min(2).max(120), logoUrl: opt(500), url: opt(300), sort: z.number().int().optional() }) as never,
    label: (r) => String(r.name),
    order: () => [asc(s.partners.sort), asc(s.partners.name)],
  },
  locations: {
    table: s.locations,
    schema: z.object({ name: z.string().trim().min(2).max(120), address: z.string().trim().min(3).max(300), phone: opt(40), email: opt(120), mapUrl: opt(500), sort: z.number().int().optional() }) as never,
    label: (r) => String(r.name),
    order: () => [asc(s.locations.sort), asc(s.locations.name)],
  },
  blog: {
    table: s.blogPosts,
    schema: z.object({ title: z.string().trim().min(2).max(200), slug: z.string().trim().max(80).regex(/^[a-z0-9-]*$/, "Use lowercase letters, numbers and dashes only").optional(), excerpt: z.string().trim().max(500).optional(), body: z.string().max(100_000).optional(), coverUrl: opt(500), seoTitle: opt(200), seoDescription: opt(400), published: z.boolean().optional() }) as never,
    label: (r) => String(r.title),
    order: () => [sql`${s.blogPosts.publishedAt} desc nulls first`, asc(s.blogPosts.title)],
  },
};

function collectionOf(req: Request): Collection & { name: string } {
  const name = String(req.params.collection);
  const c = COLLECTIONS[name];
  if (!c) throw notFound("No such content list");
  return { ...c, name };
}

/** A blog post is a draft until it has a publish date; the form only says published yes/no. */
async function blogValues(b: Record<string, unknown>, existing: { id: string; slug: string; publishedAt: Date | null } | null) {
  const { published, ...v } = b as { published?: boolean; slug?: string; title?: string };
  const out: Record<string, unknown> = { ...v };
  if (published !== undefined) out.publishedAt = published ? (existing?.publishedAt ?? new Date()) : null;
  if (!existing || v.slug !== undefined) {
    const base = (v.slug || "").trim() || slugify(v.title ?? existing?.slug ?? "post");
    const [hit] = await db().select({ id: s.blogPosts.id }).from(s.blogPosts).where(eq(s.blogPosts.slug, base)).limit(1);
    if (hit && hit.id !== existing?.id) throw conflict("A guide with that path already exists");
    out.slug = base;
  }
  return out;
}

adminContentRouter.get(
  "/content/:collection",
  h(async (req) => {
    requirePerm(req, "website.content.manage");
    const c = collectionOf(req);
    return db().select().from(c.table).orderBy(...c.order());
  }),
);

adminContentRouter.post(
  "/content/:collection",
  h(async (req) => {
    const u = requirePerm(req, "website.content.manage");
    const c = collectionOf(req);
    let values: Record<string, unknown> = parse(c.schema, req.body) as Record<string, unknown>;
    if (c.name === "blog") values = await blogValues(values, null);
    const row = (await db().transaction(async (tx) => {
      const [created] = (await tx.insert(c.table).values(values as never).returning()) as Record<string, unknown>[];
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: `${c.name}.created`, entity: c.name, entityId: String(created!.id), summary: `Added to ${c.name}: ${c.label(created!)}`.slice(0, 200) });
      return created!;
    })) as Record<string, unknown>;
    return row;
  }),
);

adminContentRouter.patch(
  "/content/:collection/:id",
  h(async (req) => {
    const u = requirePerm(req, "website.content.manage");
    const c = collectionOf(req);
    const id = String(req.params.id);
    const [existing] = (await db().select().from(c.table).where(eq(c.table.id, id)).limit(1)) as Record<string, unknown>[];
    if (!existing) throw notFound();
    let values: Record<string, unknown> = parse(c.schema.partial(), req.body) as Record<string, unknown>;
    if (c.name === "blog") values = await blogValues(values, existing as never);
    if (!Object.keys(values).length) return existing;
    const row = (await db().transaction(async (tx) => {
      const [updated] = (await tx.update(c.table).set(values as never).where(eq(c.table.id, id)).returning()) as Record<string, unknown>[];
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: `${c.name}.updated`, entity: c.name, entityId: id, summary: `Edited in ${c.name}: ${c.label(updated!)}`.slice(0, 200) });
      return updated!;
    })) as Record<string, unknown>;
    return row;
  }),
);

adminContentRouter.delete(
  "/content/:collection/:id",
  h(async (req) => {
    const u = requirePerm(req, "website.content.manage");
    const c = collectionOf(req);
    const id = String(req.params.id);
    const [existing] = (await db().select().from(c.table).where(eq(c.table.id, id)).limit(1)) as Record<string, unknown>[];
    if (!existing) throw notFound();
    await db().transaction(async (tx) => {
      await tx.delete(c.table).where(eq(c.table.id, id));
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: `${c.name}.deleted`, entity: c.name, entityId: id, summary: `Removed from ${c.name}: ${c.label(existing)}`.slice(0, 200) });
    });
    return { ok: true };
  }),
);

// ---------- brands and models ----------
// Sub-selects below name the outer table by hand: in a single-table select Drizzle strips the table from ${column},
// and the sub-select would then compare its own column with itself.
adminContentRouter.get(
  "/brands",
  h(async (req) => {
    requirePerm(req, "website.vehicles.manage");
    const brands = await db()
      .select({ id: s.brands.id, name: s.brands.name, slug: s.brands.slug, logoUrl: s.brands.logoUrl, sort: s.brands.sort, vehicles: sql<number>`(select count(*)::int from vehicles v where v.brand_id = "brands"."id")` })
      .from(s.brands)
      .orderBy(asc(s.brands.sort), asc(s.brands.name));
    const models = await db()
      .select({ id: s.vehicleModels.id, brandId: s.vehicleModels.brandId, name: s.vehicleModels.name, slug: s.vehicleModels.slug, vehicles: sql<number>`(select count(*)::int from vehicles v where v.model_id = "vehicle_models"."id")` })
      .from(s.vehicleModels)
      .orderBy(asc(s.vehicleModels.name));
    return brands.map((b) => ({ ...b, models: models.filter((m) => m.brandId === b.id) }));
  }),
);

const brandBody = z.object({ name: z.string().trim().min(2).max(60), logoUrl: opt(500), sort: z.number().int().optional() });

adminContentRouter.post(
  "/brands",
  h(async (req) => {
    const u = requirePerm(req, "website.vehicles.manage");
    const b = parse(brandBody, req.body);
    const slug = slugify(b.name);
    const [hit] = await db().select({ id: s.brands.id }).from(s.brands).where(eq(s.brands.slug, slug)).limit(1);
    if (hit) throw conflict("That brand already exists");
    return db().transaction(async (tx) => {
      const [row] = await tx.insert(s.brands).values({ name: b.name, slug, logoUrl: b.logoUrl ?? null, sort: b.sort ?? 0 }).returning();
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: "brand.created", entity: "brand", entityId: row!.id, summary: `Added brand ${b.name}` });
      return row;
    });
  }),
);

adminContentRouter.patch(
  "/brands/:id",
  h(async (req) => {
    const u = requirePerm(req, "website.vehicles.manage");
    const id = String(req.params.id);
    const [existing] = await db().select().from(s.brands).where(eq(s.brands.id, id)).limit(1);
    if (!existing) throw notFound("Brand not found");
    const b = parse(brandBody.partial(), req.body);
    if (!Object.keys(b).length) return existing;
    return db().transaction(async (tx) => {
      // the slug stays: links and saved filters on the site keep working after a rename
      const [row] = await tx.update(s.brands).set(b).where(eq(s.brands.id, id)).returning();
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: "brand.updated", entity: "brand", entityId: id, summary: `Edited brand ${row!.name}` });
      return row;
    });
  }),
);

adminContentRouter.delete(
  "/brands/:id",
  h(async (req) => {
    const u = requirePerm(req, "website.vehicles.manage");
    const id = String(req.params.id);
    const [existing] = await db().select().from(s.brands).where(eq(s.brands.id, id)).limit(1);
    if (!existing) throw notFound("Brand not found");
    const n = countOf((await db().select({ n: sql<number>`count(*)::int` }).from(s.vehicles).where(eq(s.vehicles.brandId, id))) as { n: number }[]);
    if (n) throw conflict(`${n} vehicle${n === 1 ? " uses" : "s use"} this brand. Move or delete them first.`);
    await db().transaction(async (tx) => {
      await tx.delete(s.brands).where(eq(s.brands.id, id)); // its models go with it
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: "brand.deleted", entity: "brand", entityId: id, summary: `Deleted brand ${existing.name}` });
    });
    return { ok: true };
  }),
);

const modelBody = z.object({ name: z.string().trim().min(1).max(60) });

adminContentRouter.post(
  "/brands/:id/models",
  h(async (req) => {
    const u = requirePerm(req, "website.vehicles.manage");
    const brandId = String(req.params.id);
    const [brand] = await db().select().from(s.brands).where(eq(s.brands.id, brandId)).limit(1);
    if (!brand) throw notFound("Brand not found");
    const { name } = parse(modelBody, req.body);
    const slug = slugify(name);
    const [hit] = await db().select({ id: s.vehicleModels.id }).from(s.vehicleModels).where(and(eq(s.vehicleModels.brandId, brandId), eq(s.vehicleModels.slug, slug))).limit(1);
    if (hit) throw conflict(`${brand.name} already has that model`);
    return db().transaction(async (tx) => {
      const [row] = await tx.insert(s.vehicleModels).values({ brandId, name, slug }).returning();
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: "model.created", entity: "model", entityId: row!.id, summary: `Added model ${brand.name} ${name}` });
      return row;
    });
  }),
);

adminContentRouter.patch(
  "/models/:id",
  h(async (req) => {
    const u = requirePerm(req, "website.vehicles.manage");
    const id = String(req.params.id);
    const { name } = parse(modelBody, req.body);
    return db().transaction(async (tx) => {
      const [row] = await tx.update(s.vehicleModels).set({ name }).where(eq(s.vehicleModels.id, id)).returning();
      if (!row) throw notFound("Model not found");
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: "model.updated", entity: "model", entityId: id, summary: `Renamed model to ${name}` });
      return row;
    });
  }),
);

adminContentRouter.delete(
  "/models/:id",
  h(async (req) => {
    const u = requirePerm(req, "website.vehicles.manage");
    const id = String(req.params.id);
    const [existing] = await db().select().from(s.vehicleModels).where(eq(s.vehicleModels.id, id)).limit(1);
    if (!existing) throw notFound("Model not found");
    const n = countOf((await db().select({ n: sql<number>`count(*)::int` }).from(s.vehicles).where(eq(s.vehicles.modelId, id))) as { n: number }[]);
    if (n) throw conflict(`${n} vehicle${n === 1 ? " uses" : "s use"} this model. Move or delete them first.`);
    await db().transaction(async (tx) => {
      await tx.delete(s.vehicleModels).where(eq(s.vehicleModels.id, id));
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: "model.deleted", entity: "model", entityId: id, summary: `Deleted model ${existing.name}` });
    });
    return { ok: true };
  }),
);

// ---------- customers ----------
/** A customer's CRM records: linked to the account, or carrying the same e-mail. */
const leadOfUser = (userId: string, email: string | null) => (email ? or(eq(s.leads.customerUserId, userId), sql`lower(${s.leads.email}) = lower(${email})`) : eq(s.leads.customerUserId, userId));

/** An agent sees the customers whose CRM record they own; "see all customers" sees everyone. */
function visibleToStaff(u: AuthUser): SQL | undefined {
  if (can(u, "website.customers.view_all")) return undefined;
  return sql`exists (select 1 from leads l where (l.customer_user_id = ${s.users.id} or lower(l.email) = lower(${s.users.email})) and l.owner_user_id = ${u.id})`;
}

async function customerFor(u: AuthUser, id: string) {
  const [row] = await db()
    .select()
    .from(s.users)
    .where(and(eq(s.users.id, id), inArray(s.users.kind, ["customer", "visitor"]), visibleToStaff(u)))
    .limit(1);
  if (!row) throw notFound("Customer not found");
  return row;
}

adminContentRouter.get(
  "/customers",
  h(async (req) => {
    const u = requirePerm(req, "website.customers.view");
    const f = parse(z.object({ q: z.string().trim().max(100).optional(), kind: z.enum(["customer", "visitor"]).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) }), req.query);
    const w: (SQL | undefined)[] = [f.kind ? eq(s.users.kind, f.kind) : inArray(s.users.kind, ["customer", "visitor"]), visibleToStaff(u)];
    if (f.q) {
      const like = `%${f.q}%`;
      w.push(or(ilike(s.users.name, like), ilike(s.users.email, like), ilike(s.users.phone, like), ilike(s.users.company, like)));
    }
    const where = and(...w);
    const items = await db()
      .select({
        id: s.users.id,
        kind: s.users.kind,
        name: s.users.name,
        email: s.users.email,
        phone: s.users.phone,
        company: s.users.company,
        countryCode: s.users.countryCode,
        isActive: s.users.isActive,
        lastSeenAt: s.users.lastSeenAt,
        createdAt: s.users.createdAt,
        leads: sql<number>`(select count(*)::int from leads l where l.customer_user_id = "users"."id" or lower(l.email) = lower("users"."email"))`,
        orders: sql<number>`(select count(*)::int from web_orders o where o.user_id = "users"."id")`,
      })
      .from(s.users)
      .where(where)
      .orderBy(desc(s.users.createdAt), asc(s.users.id))
      .limit(f.pageSize)
      .offset((f.page - 1) * f.pageSize);
    const n = countOf((await db().select({ n: sql<number>`count(*)::int` }).from(s.users).where(where)) as { n: number }[]);
    return { items, total: n, page: f.page, pageSize: f.pageSize };
  }),
);

adminContentRouter.get(
  "/customers/:id",
  h(async (req) => {
    const u = requirePerm(req, "website.customers.view");
    const c = await customerFor(u, String(req.params.id));
    const leads = await db()
      .select({ id: s.leads.id, customerName: s.leads.customerName, status: s.leads.status, phone: s.leads.phone, createdAt: s.leads.createdAt, linked: sql<boolean>`${s.leads.customerUserId} = ${c.id}`, owner: s.users.name })
      .from(s.leads)
      .leftJoin(s.users, eq(s.users.id, s.leads.ownerUserId))
      .where(leadOfUser(c.id, c.email))
      .orderBy(desc(s.leads.createdAt));
    const invoiceRows = leads.length
      ? await db().select({ id: s.invoices.id, number: s.invoices.number, status: s.invoices.status, totalCnfUsd: s.invoices.totalCnfUsd, createdAt: s.invoices.createdAt }).from(s.invoices).where(inArray(s.invoices.leadId, leads.map((l) => l.id))).orderBy(desc(s.invoices.createdAt))
      : [];
    const invoices = [];
    for (const inv of invoiceRows) {
      const vehicles = await db().select({ id: s.invoiceVehicles.id, unitLabel: s.invoiceVehicles.unitLabel, year: s.invoiceVehicles.year, chassisNo: s.invoiceVehicles.chassisNo }).from(s.invoiceVehicles).where(eq(s.invoiceVehicles.invoiceId, inv.id)).orderBy(s.invoiceVehicles.position);
      const withProgress = [];
      for (const v of vehicles) {
        const progress = await db().select({ stage: s.vehicleProgress.stage, date: s.vehicleProgress.stageDate }).from(s.vehicleProgress).where(eq(s.vehicleProgress.invoiceVehicleId, v.id)).orderBy(s.vehicleProgress.createdAt);
        withProgress.push({ id: v.id, label: `${v.year ?? ""} ${v.unitLabel}`.trim(), chassisNo: v.chassisNo, progress });
      }
      const [{ paid }] = (await db().select({ paid: sql<number>`coalesce(sum(${s.payments.amountUsd}), 0)::float` }).from(s.payments).where(eq(s.payments.invoiceId, inv.id))) as [{ paid: number }];
      invoices.push({ ...inv, paidUsd: paid, vehicles: withProgress });
    }
    const orders = await db().select({ id: s.webOrders.id, orderNo: s.webOrders.orderNo, status: s.webOrders.status, totalUsd: s.webOrders.totalUsd, createdAt: s.webOrders.createdAt }).from(s.webOrders).where(eq(s.webOrders.userId, c.id)).orderBy(desc(s.webOrders.createdAt));
    const [conv] = await db().select({ id: s.chatConversations.id }).from(s.chatConversations).where(and(eq(s.chatConversations.kind, "customer"), eq(s.chatConversations.customerUserId, c.id))).limit(1);
    const { passwordHash: _p, recoveryKeyHash: _r, ...profile } = c;
    return { ...profile, leads, invoices, orders, conversationId: conv?.id ?? null };
  }),
);

const customerEdit = z.object({ name: z.string().trim().min(2).max(80), phone: z.string().trim().min(6).max(30), company: opt(120), countryCode: z.string().length(2).nullable().optional(), city: opt(80), address: opt(200), isActive: z.boolean().optional() });

adminContentRouter.patch(
  "/customers/:id",
  h(async (req) => {
    const u = requirePerm(req, "website.customers.manage");
    const c = await customerFor(u, String(req.params.id));
    const b = parse(customerEdit.partial(), req.body);
    if (!Object.keys(b).length) return { ok: true };
    await db().transaction(async (tx) => {
      await tx.update(s.users).set({ ...b, updatedAt: new Date() }).where(eq(s.users.id, c.id));
      if (b.isActive === false) await tx.delete(s.sessions).where(eq(s.sessions.userId, c.id)); // switched off means signed out now
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: "customer.updated", entity: "user", entityId: c.id, summary: `${u.name} edited customer ${b.name ?? c.name}${b.isActive === false ? " (switched off)" : b.isActive === true ? " (switched on)" : ""}` });
    });
    return { ok: true };
  }),
);

adminContentRouter.post(
  "/customers",
  h(async (req) => {
    const u = requirePerm(req, "website.customers.manage");
    const b = parse(z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email().max(120), phone: z.string().trim().min(6).max(30), company: opt(120), countryCode: z.string().length(2).nullable().optional() }), req.body);
    const [exists] = await db().select({ id: s.users.id, kind: s.users.kind }).from(s.users).where(sql`lower(${s.users.email}) = ${b.email}`).limit(1);
    if (exists && exists.kind !== "visitor") throw conflict("An account with this e-mail already exists");
    const [role] = await db().select().from(s.roles).where(eq(s.roles.slug, "customer")).limit(1);
    const otp = oneTimePassword();
    const hash = await hashPassword(otp);
    const id = await db().transaction(async (tx) => {
      let userId = exists?.id;
      if (userId) await tx.update(s.users).set({ kind: "customer", name: b.name, phone: b.phone, company: b.company ?? null, countryCode: b.countryCode ?? null, roleId: role!.id, passwordHash: hash, mustChangePassword: true, updatedAt: new Date() }).where(eq(s.users.id, userId));
      else {
        const [row] = await tx.insert(s.users).values({ kind: "customer", name: b.name, email: b.email, phone: b.phone, company: b.company ?? null, countryCode: b.countryCode ?? null, roleId: role!.id, passwordHash: hash, mustChangePassword: true }).returning({ id: s.users.id });
        userId = row!.id;
      }
      // CRM records with this e-mail belong to the account (the buyer then sees their invoices)
      await tx.update(s.leads).set({ customerUserId: userId }).where(and(sql`lower(${s.leads.email}) = ${b.email}`, sql`${s.leads.customerUserId} is null`));
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: "customer.created", entity: "user", entityId: userId, summary: `${u.name} created the website account of ${b.name}` });
      return userId!;
    });
    return { id, email: b.email, oneTimePassword: otp };
  }),
);

adminContentRouter.post(
  "/customers/:id/reset-password",
  h(async (req) => {
    const u = requirePerm(req, "website.customers.manage");
    const c = await customerFor(u, String(req.params.id));
    if (c.kind !== "customer") throw bad("This is a chat guest with no password. Create an account with the same e-mail instead.");
    const otp = oneTimePassword();
    const hash = await hashPassword(otp);
    await db().transaction(async (tx) => {
      await tx.update(s.users).set({ passwordHash: hash, mustChangePassword: true, updatedAt: new Date() }).where(eq(s.users.id, c.id));
      await tx.delete(s.sessions).where(eq(s.sessions.userId, c.id));
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: "customer.password_reset", entity: "user", entityId: c.id, summary: `${u.name} issued a new one-time password for ${c.name}` });
    });
    return { oneTimePassword: otp };
  }),
);

adminContentRouter.post(
  "/customers/:id/link-lead",
  h(async (req) => {
    const u = requirePerm(req, "website.customers.manage");
    const c = await customerFor(u, String(req.params.id));
    const { leadId } = parse(z.object({ leadId: z.string().min(1).max(40) }), req.body);
    const [lead] = await db().select().from(s.leads).where(eq(s.leads.id, leadId)).limit(1);
    if (!lead || (!can(u, "crm.leads.view_all") && lead.ownerUserId !== u.id)) throw notFound("CRM record not found");
    if (lead.customerUserId && lead.customerUserId !== c.id) throw conflict("That CRM record belongs to another account");
    await db().transaction(async (tx) => {
      await tx.update(s.leads).set({ customerUserId: c.id, updatedAt: new Date() }).where(eq(s.leads.id, lead.id));
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: "customer.lead_linked", entity: "lead", entityId: lead.id, summary: `${u.name} linked ${lead.customerName} to the account of ${c.name}` });
    });
    return { ok: true };
  }),
);

// ---------- CRM customers the website cannot reach: no e-mail, so no account ----------
adminContentRouter.get(
  "/customers-no-email",
  h(async (req) => {
    const u = requirePerm(req, "website.customers.view");
    const items = await db()
      .select({ id: s.leads.id, customerName: s.leads.customerName, contactPerson: s.leads.contactPerson, phone: s.leads.phone, countryCode: s.leads.countryCode, owner: s.users.name })
      .from(s.leads)
      .leftJoin(s.users, eq(s.users.id, s.leads.ownerUserId))
      .where(and(eq(s.leads.isCustomer, true), isNull(s.leads.customerUserId), or(isNull(s.leads.email), eq(s.leads.email, "")), can(u, "website.customers.view_all") ? undefined : eq(s.leads.ownerUserId, u.id)))
      .orderBy(asc(s.leads.customerName))
      .limit(200);
    return { items };
  }),
);

// ---------- one-time passwords in bulk, for accounts that have never signed in ----------
const neverSignedIn = (u: AuthUser) => and(eq(s.users.kind, "customer"), eq(s.users.isActive, true), isNull(s.users.lastSeenAt), sql`${s.users.email} is not null`, visibleToStaff(u));
adminContentRouter.get(
  "/customers-bulk-passwords",
  h(async (req) => {
    const u = requirePerm(req, "website.customers.manage");
    const items = await db().select({ id: s.users.id, name: s.users.name, email: s.users.email }).from(s.users).where(neverSignedIn(u)).orderBy(asc(s.users.name)).limit(100);
    return { items };
  }),
);
adminContentRouter.post(
  "/customers-bulk-passwords",
  h(async (req) => {
    const u = requirePerm(req, "website.customers.manage");
    const b = parse(z.object({ ids: z.array(z.string().min(8)).min(1).max(100) }), req.body);
    const rows = await db().select({ id: s.users.id, name: s.users.name, email: s.users.email }).from(s.users).where(and(neverSignedIn(u), inArray(s.users.id, b.ids)));
    if (!rows.length) throw bad("None of these accounts can get a new password here");
    const made = await Promise.all(rows.map(async (r) => { const otp = oneTimePassword(); return { ...r, oneTimePassword: otp, hash: await hashPassword(otp) }; })); // hashed before the transaction: PGlite has one connection
    await db().transaction(async (tx) => {
      for (const m of made) await tx.update(s.users).set({ passwordHash: m.hash, mustChangePassword: true, updatedAt: new Date() }).where(eq(s.users.id, m.id));
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: "customer.password_bulk", summary: `${u.name} issued one-time passwords for ${made.length} account(s)` });
    });
    return { items: made.map(({ hash: _h, ...m }) => m) };
  }),
);

// ---------- newsletter list ----------
adminContentRouter.get(
  "/newsletter",
  h(async (req) => {
    requirePerm(req, "website.content.manage");
    const f = parse(z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50) }), req.query);
    const items = await db().select().from(s.newsletterSubscribers).orderBy(desc(s.newsletterSubscribers.createdAt), asc(s.newsletterSubscribers.email)).limit(f.pageSize).offset((f.page - 1) * f.pageSize);
    const n = countOf((await db().select({ n: sql<number>`count(*)::int` }).from(s.newsletterSubscribers)) as { n: number }[]);
    return { items, total: n, page: f.page, pageSize: f.pageSize };
  }),
);
adminContentRouter.get(
  "/newsletter.csv",
  h(async (req, res) => {
    requirePerm(req, "website.content.manage");
    const rows = await db().select().from(s.newsletterSubscribers).orderBy(asc(s.newsletterSubscribers.email));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="newsletter.csv"');
    // an address starting with + or - would be a formula in Excel
    const cell = (x: string) => (/^[=+\-@]/.test(x) ? `'${x}` : x);
    res.send(["email,signed_up", ...rows.map((r) => `${cell(r.email)},${new Date(r.createdAt).toISOString().slice(0, 10)}`)].join("\n") + "\n");
    return undefined;
  }),
);
adminContentRouter.delete(
  "/newsletter/:id",
  h(async (req) => {
    const u = requirePerm(req, "website.content.manage");
    const [row] = await db().delete(s.newsletterSubscribers).where(eq(s.newsletterSubscribers.id, String(req.params.id))).returning();
    if (!row) throw notFound("Not on the list");
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "newsletter.removed", summary: `${u.name} removed an address from the newsletter list` });
    return { ok: true };
  }),
);

// ---------- media library: every picture uploaded for the site ----------
function requireMedia(req: Request) {
  const u = requireAuth(req);
  if (!can(u, "website.vehicles.manage") && !can(u, "website.content.manage") && !can(u, "website.settings.manage")) throw forbidden();
  return u;
}
adminContentRouter.get(
  "/media",
  h(async (req) => {
    requireMedia(req);
    const f = parse(z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(48) }), req.query);
    const rows = await db().select().from(s.files).where(eq(s.files.kind, "site-image")).orderBy(desc(s.files.createdAt), asc(s.files.id)).limit(f.pageSize).offset((f.page - 1) * f.pageSize);
    const n = countOf((await db().select({ n: sql<number>`count(*)::int` }).from(s.files).where(eq(s.files.kind, "site-image"))) as { n: number }[]);
    return { items: rows.map((r) => ({ id: r.id, url: `/api/media/site/${r.id}`, name: r.originalName, mime: r.mime, size: r.size, createdAt: r.createdAt })), total: n, page: f.page, pageSize: f.pageSize };
  }),
);
adminContentRouter.delete(
  "/media/:id",
  h(async (req) => {
    const u = requireMedia(req);
    const id = String(req.params.id);
    const [file] = await db().select().from(s.files).where(and(eq(s.files.id, id), eq(s.files.kind, "site-image"))).limit(1);
    if (!file) throw notFound("Picture not found");
    const url = `/api/media/site/${id}`;
    const like = `%${url}%`;
    const used = (await db().execute(sql`select
      (select count(*)::int from vehicle_images where url = ${url}) as vehicles,
      (select count(*)::int from brands where logo_url = ${url}) as brands,
      (select count(*)::int from blog_posts where cover_url = ${url} or body like ${like}) as guides,
      (select count(*)::int from pages where body like ${like}) as pages,
      (select count(*)::int from home_sections where data::text like ${like}) as home,
      (select count(*)::int from settings where value::text like ${like}) as settings,
      (select count(*)::int from partners where logo_url = ${url}) as partners`)) as unknown as { rows: Record<string, number>[] };
    const where = Object.entries(used.rows[0] ?? {}).filter(([, n]) => n > 0).map(([k]) => k);
    if (where.length) throw conflict(`This picture is still used in: ${where.join(", ")}`);
    await deleteFile(id);
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "media.deleted", entity: "file", entityId: id, summary: `${u.name} deleted the picture ${file.originalName ?? id}` });
    return { ok: true };
  }),
);

// ---------- pictures for the site (car photos, logo, guide covers) ----------
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 20 } });

adminContentRouter.post(
  "/uploads",
  upload.array("files", 20),
  h(async (req) => {
    const u = requireAuth(req);
    if (!can(u, "website.vehicles.manage") && !can(u, "website.content.manage") && !can(u, "website.settings.manage")) throw forbidden();
    const files = (req.files as Express.Multer.File[]) ?? [];
    if (!files.length) throw bad("No file");
    // no SVG: a picture served from this origin must not be able to carry a script
    const wrong = files.find((f) => !/^image\/(png|jpeg|webp)$/.test(f.mimetype));
    if (wrong) throw bad(`${wrong.originalname}: use a PNG, JPG or WebP picture`);
    const urls: string[] = [];
    for (const f of files) {
      const saved = await saveFile(f.buffer, { kind: "site-image", mime: f.mimetype, originalName: f.originalname, ownerUserId: u.id });
      urls.push(`/api/media/site/${saved.id}`);
    }
    return { urls };
  }),
);

// ---------- demo reset (FR-072) ----------
adminContentRouter.post(
  "/demo/reset",
  h(async (req) => {
    requirePerm(req, "system.demo.reset");
    if (!env.DEMO_MODE) throw forbidden("Demo mode is switched off");
    if (resetRunning()) throw conflict("A reset is already running");
    if (env.PUBLIC_DEMO && Date.now() - lastResetAt() < 5 * 60_000) throw conflict("This public demo was reset less than five minutes ago");
    return { ok: true, seconds: await resetDemo() }; // everyone is signed out: sessions went too
  }),
);

// ---------- roles & permissions ----------
adminContentRouter.get(
  "/roles",
  h(async (req) => {
    requirePerm(req, "auction.roles.view");
    const roles = await db().select().from(s.roles).orderBy(asc(s.roles.name));
    const links = await db().select().from(s.rolePermissions);
    const held = await db().select({ roleId: s.users.roleId, n: sql<number>`count(*)::int` }).from(s.users).groupBy(s.users.roleId);
    return {
      roles: roles.map((r) => ({ id: r.id, slug: r.slug, name: r.name, locked: r.slug === "admin", isSystem: r.isSystem, people: held.find((h0) => h0.roleId === r.id)?.n ?? 0, perms: links.filter((l) => l.roleId === r.id).map((l) => l.permissionKey) })),
      permissions: Object.entries(PERMISSIONS).map(([key, label]) => ({ key, label, area: key.split(".")[0] })),
    };
  }),
);

adminContentRouter.post(
  "/roles",
  h(async (req) => {
    const u = requirePerm(req, "auction.roles.create");
    const { label } = parse(z.object({ label: z.string().trim().min(2, "Give the role a name").max(40) }), req.body);
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (!slug) throw bad("Give the role a name");
    const [same] = await db().select({ id: s.roles.id }).from(s.roles).where(eq(s.roles.slug, slug)).limit(1);
    if (same) throw conflict("A role by that name already exists");
    const [role] = await db().insert(s.roles).values({ slug, name: label, isSystem: false }).returning();
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "role.created", entity: "role", entityId: role!.id, summary: `${u.name} added the role ${label}` });
    return { id: role!.id, slug };
  }),
);

adminContentRouter.patch(
  "/roles/:id",
  h(async (req) => {
    const u = requirePerm(req, "auction.roles.rename");
    const { label } = parse(z.object({ label: z.string().trim().min(2, "A role needs a name").max(40) }), req.body);
    const [role] = await db().select().from(s.roles).where(eq(s.roles.id, String(req.params.id))).limit(1);
    if (!role) throw notFound("Role not found");
    if (role.isSystem) throw conflict("Built-in roles cannot be renamed");
    await db().update(s.roles).set({ name: label }).where(eq(s.roles.id, role.id));
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "role.renamed", entity: "role", entityId: role.id, summary: `${u.name} renamed ${role.name} to ${label}` });
    return { ok: true };
  }),
);

adminContentRouter.delete(
  "/roles/:id",
  h(async (req) => {
    const u = requirePerm(req, "auction.roles.delete");
    const [role] = await db().select().from(s.roles).where(eq(s.roles.id, String(req.params.id))).limit(1);
    if (!role) throw notFound("Role not found");
    if (role.isSystem) throw conflict("Built-in roles cannot be removed");
    const [c] = await db().select({ n: sql<number>`count(*)::int` }).from(s.users).where(eq(s.users.roleId, role.id));
    if ((c?.n ?? 0) > 0) throw conflict(`${role.name} is still held by ${c!.n} ${c!.n === 1 ? "person" : "people"}. Move them to another role first`);
    await db().transaction(async (tx) => {
      await tx.delete(s.rolePermissions).where(eq(s.rolePermissions.roleId, role.id));
      await tx.delete(s.roles).where(eq(s.roles.id, role.id));
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: "role.deleted", entity: "role", summary: `${u.name} removed the role ${role.name}` });
    });
    clearPermCache();
    return { ok: true };
  }),
);

adminContentRouter.put(
  "/roles/:id",
  h(async (req) => {
    const u = requirePerm(req, "auction.roles.permissions");
    const id = String(req.params.id);
    const [role] = await db().select().from(s.roles).where(eq(s.roles.id, id)).limit(1);
    if (!role) throw notFound("Role not found");
    // the Admin role always has everything, so nobody can lock the company out of its own system
    if (role.slug === "admin") throw forbidden("The Admin role always has every permission");
    const { perms } = parse(z.object({ perms: z.array(z.string().max(60)).max(200) }), req.body);
    const unknown = perms.filter((p) => !(p in PERMISSIONS));
    if (unknown.length) throw bad(`Unknown permission: ${unknown[0]}`);
    const unique = [...new Set(perms)];
    await db().transaction(async (tx) => {
      await tx.delete(s.rolePermissions).where(eq(s.rolePermissions.roleId, id));
      if (unique.length) await tx.insert(s.rolePermissions).values(unique.map((permissionKey) => ({ roleId: id, permissionKey })));
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: "role.updated", entity: "role", entityId: id, summary: `${u.name} changed the permissions of ${role.name} (${unique.length} now)` });
    });
    clearPermCache(); // the server checks permissions on every action: this takes effect on the next request
    return { ok: true, perms: unique };
  }),
);
