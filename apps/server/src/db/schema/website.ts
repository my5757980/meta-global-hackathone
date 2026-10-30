import { boolean, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { genId } from "../../lib/id";
import { users } from "./platform";

const id = () => text().primaryKey().$defaultFn(genId);
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const usd = () => numeric({ precision: 12, scale: 2, mode: "number" });

export const brands = pgTable("brands", {
  id: id(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  logoUrl: text(),
  sort: integer().notNull().default(0),
});

export const vehicleModels = pgTable(
  "vehicle_models",
  {
    id: id(),
    brandId: text()
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    name: text().notNull(),
    slug: text().notNull(),
  },
  (t) => [uniqueIndex("models_brand_slug_uq").on(t.brandId, t.slug)],
);

export const vehicles = pgTable(
  "vehicles",
  {
    id: id(),
    stockNo: text().notNull().unique(),
    refNo: text().notNull(),
    slug: text().notNull().unique(),
    title: text().notNull(),
    brandId: text()
      .notNull()
      .references(() => brands.id),
    modelId: text()
      .notNull()
      .references(() => vehicleModels.id),
    modelCode: text(),
    chassisNo: text(),
    year: integer().notNull(),
    month: integer(),
    priceUsd: usd().notNull(),
    discountPriceUsd: usd(),
    costJpy: integer(), // internal: never sent to customers
    mileageKm: integer().notNull(),
    fuel: text().notNull(),
    transmission: text().notNull(),
    bodyType: text().notNull(),
    engineCc: integer(),
    color: text().notNull(),
    steering: text().notNull().default("Right"),
    drive: text().notNull().default("2WD"),
    doors: integer(),
    seats: integer(),
    lengthMm: integer(),
    widthMm: integer(),
    heightMm: integer(),
    m3: numeric({ precision: 6, scale: 2, mode: "number" }),
    location: text().notNull().default("Yokohama"),
    originCountry: text().notNull().default("Japan"),
    features: text().array().notNull().default([]),
    tags: text().array().notNull().default([]),
    homeSections: text().array().notNull().default([]),
    featured: boolean().notNull().default(false),
    status: text().notNull().default("available"), // available | reserved | sold
    published: boolean().notNull().default(true),
    sort: integer().notNull().default(0),
    shortDesc: text(),
    description: text(),
    videoUrl: text(),
    seoTitle: text(),
    seoDescription: text(),
    seoKeywords: text(),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("veh_brand_idx").on(t.brandId, t.modelId),
    index("veh_price_idx").on(t.priceUsd),
    index("veh_status_idx").on(t.status, t.published),
  ],
);

export const vehicleImages = pgTable(
  "vehicle_images",
  {
    id: id(),
    vehicleId: text()
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    url: text().notNull(),
    sort: integer().notNull().default(0),
  },
  (t) => [index("vimg_vehicle_idx").on(t.vehicleId, t.sort)],
);

export const pages = pgTable("pages", {
  id: id(),
  slug: text().notNull().unique(),
  title: text().notNull(),
  body: text().notNull().default(""),
  seoTitle: text(),
  seoDescription: text(),
  published: boolean().notNull().default(true),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const blogPosts = pgTable("blog_posts", {
  id: id(),
  slug: text().notNull().unique(),
  title: text().notNull(),
  excerpt: text().notNull().default(""),
  body: text().notNull().default(""),
  coverUrl: text(),
  publishedAt: timestamp({ withTimezone: true }),
  seoTitle: text(),
  seoDescription: text(),
});

export const services = pgTable("services", {
  id: id(),
  title: text().notNull(),
  body: text().notNull(),
  icon: text(),
  sort: integer().notNull().default(0),
});

export const faqs = pgTable("faqs", {
  id: id(),
  question: text().notNull(),
  answer: text().notNull(),
  category: text().notNull().default("General"),
  sort: integer().notNull().default(0),
});

export const testimonials = pgTable("testimonials", {
  id: id(),
  name: text().notNull(),
  country: text(),
  text: text().notNull(),
  rating: integer().notNull().default(5),
  videoUrl: text(),
  sort: integer().notNull().default(0),
});

export const homeSections = pgTable("home_sections", {
  id: id(),
  key: text().notNull().unique(),
  title: text().notNull(),
  subtitle: text(),
  data: jsonb().notNull().default({}),
  sort: integer().notNull().default(0),
  enabled: boolean().notNull().default(true),
});

export const partners = pgTable("partners", {
  id: id(),
  name: text().notNull(),
  logoUrl: text(),
  url: text(),
  sort: integer().notNull().default(0),
});

export const locations = pgTable("locations", {
  id: id(),
  name: text().notNull(),
  address: text().notNull(),
  phone: text(),
  email: text(),
  mapUrl: text(),
  sort: integer().notNull().default(0),
});

export const contactMessages = pgTable("contact_messages", {
  id: id(),
  name: text().notNull(),
  email: text().notNull(),
  phone: text(),
  subject: text(),
  message: text().notNull(),
  handled: boolean().notNull().default(false),
  createdAt: createdAt(),
});

export const cartItems = pgTable(
  "cart_items",
  {
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    vehicleId: text()
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.vehicleId] })],
);

export const wishlistItems = pgTable(
  "wishlist_items",
  {
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    vehicleId: text()
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.vehicleId] })],
);

export const webOrders = pgTable("web_orders", {
  id: id(),
  orderNo: text().notNull().unique(),
  userId: text()
    .notNull()
    .references(() => users.id),
  status: text().notNull().default("pending"),
  paymentMethod: text().notNull().default("Order request"),
  totalUsd: usd().notNull(),
  notes: text(),
  createdAt: createdAt(),
});

export const webOrderItems = pgTable("web_order_items", {
  id: id(),
  orderId: text()
    .notNull()
    .references(() => webOrders.id, { onDelete: "cascade" }),
  vehicleId: text().references(() => vehicles.id),
  title: text().notNull(),
  priceUsd: usd().notNull(),
});
