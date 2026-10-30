import { date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { genId } from "../../lib/id";
import { users } from "./platform";

const id = () => text().primaryKey().$defaultFn(genId);
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

export const auctionHalls = pgTable("auction_halls", {
  id: id(),
  name: text().notNull(),
  code: text().notNull().unique(),
  region: text().notNull(),
});

export const auctionLots = pgTable(
  "auction_lots",
  {
    id: id(),
    hallId: text()
      .notNull()
      .references(() => auctionHalls.id),
    saleDate: date({ mode: "string" }).notNull(),
    lotNo: integer().notNull(),
    make: text().notNull(),
    model: text().notNull(),
    modelCode: text().notNull(),
    bodyType: text().notNull(),
    grade: text().notNull(),
    interiorGrade: text().notNull(),
    year: integer().notNull(),
    color: text().notNull(),
    transmission: text().notNull(),
    fuel: text().notNull(),
    drive: text().notNull(),
    mileageKm: integer().notNull(),
    engineCc: integer().notNull(),
    equipment: text().notNull().default(""),
    startPriceJpy: integer().notNull(),
    avgPriceJpy: integer(),
    status: text().notNull().default("upcoming"), // upcoming | sold | unsold | withdrawn
    resultPriceJpy: integer(),
    highBidJpy: integer(),
    photoCount: integer().notNull().default(6),
    damage: jsonb().notNull().default([]), // [{code:"A1", part:"front bumper"}]
    sheetNotes: text(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("lots_identity_uq").on(t.saleDate, t.hallId, t.lotNo),
    index("lots_make_model_idx").on(t.make, t.model, t.saleDate),
    index("lots_status_idx").on(t.status, t.saleDate),
    index("lots_lotno_idx").on(t.lotNo),
    index("lots_modelcode_idx").on(t.modelCode),
  ],
);

export const auctionBids = pgTable(
  "auction_bids",
  {
    id: id(),
    lotId: text()
      .notNull()
      .references(() => auctionLots.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => users.id),
    amountJpy: integer().notNull(),
    status: text().notNull().default("active"), // active | won | lost | cancelled
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [index("bids_lot_idx").on(t.lotId), index("bids_user_idx").on(t.userId, t.createdAt)],
);

export const auctionOrders = pgTable("auction_orders", {
  id: id(),
  orderNo: text().notNull().unique(),
  lotId: text()
    .notNull()
    .references(() => auctionLots.id),
  userId: text()
    .notNull()
    .references(() => users.id),
  status: text().notNull().default("pending"),
  priceJpy: integer(),
  note: text(),
  createdAt: createdAt(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const auctionEnquiries = pgTable("auction_enquiries", {
  id: id(),
  enqNo: text().notNull().unique(),
  lotId: text()
    .notNull()
    .references(() => auctionLots.id),
  userId: text()
    .notNull()
    .references(() => users.id),
  message: text().notNull(),
  reply: text(),
  repliedBy: text().references(() => users.id),
  status: text().notNull().default("open"),
  createdAt: createdAt(),
  repliedAt: timestamp({ withTimezone: true }),
});

export const auctionResults = pgTable(
  "auction_results",
  {
    id: id(),
    hallId: text()
      .notNull()
      .references(() => auctionHalls.id),
    saleDate: date({ mode: "string" }).notNull(),
    lotNo: integer().notNull(),
    make: text().notNull(),
    model: text().notNull(),
    modelCode: text().notNull(),
    year: integer().notNull(),
    engineCc: integer().notNull(),
    mileageKm: integer().notNull(),
    grade: text().notNull(),
    color: text().notNull(),
    transmission: text().notNull(),
    startPriceJpy: integer().notNull(),
    finalPriceJpy: integer().notNull(), // sold price, or highest bid when unsold
    sold: integer().notNull(), // 1 sold, 0 unsold
  },
  (t) => [
    uniqueIndex("results_identity_uq").on(t.saleDate, t.hallId, t.lotNo),
    index("results_make_model_idx").on(t.make, t.model, t.saleDate),
  ],
);

export const sheetReadings = pgTable("sheet_readings", {
  lotId: text()
    .primaryKey()
    .references(() => auctionLots.id, { onDelete: "cascade" }),
  result: jsonb().notNull(),
  model: text().notNull(),
  createdAt: createdAt(),
});
