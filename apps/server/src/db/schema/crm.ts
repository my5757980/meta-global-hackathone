import { boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { genId } from "../../lib/id";
import { files, users } from "./platform";
import { vehicles } from "./website";

const id = () => text().primaryKey().$defaultFn(genId);
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const usd = () => numeric({ precision: 12, scale: 2, mode: "number" });

export const countries = pgTable("countries", {
  code: text().primaryKey(), // ISO-3166 alpha-2
  name: text().notNull(),
  region: text().notNull(),
  inspectionRequired: boolean().notNull().default(false),
  inspectionFeeUsd: usd().notNull().default(0),
  timezone: text().notNull().default("UTC"),
  rhdAllowed: boolean().notNull().default(true), // right-hand-drive imports allowed (demo data, verify locally)
  note: text(),
});

export const ports = pgTable(
  "ports",
  {
    id: id(),
    countryCode: text()
      .notNull()
      .references(() => countries.code),
    name: text().notNull(),
    freightUsdPerM3: usd().notNull(),
    transitDays: integer().notNull().default(30),
  },
  (t) => [index("ports_country_idx").on(t.countryCode)],
);

export const leads = pgTable(
  "leads",
  {
    id: id(),
    customerName: text().notNull(),
    contactPerson: text().notNull(),
    address: text(),
    phone: text().notNull(),
    email: text(),
    countryCode: text().references(() => countries.code),
    portId: text().references(() => ports.id),
    status: text().notNull().default("new"),
    isCustomer: boolean().notNull().default(false),
    ownerUserId: text().references(() => users.id),
    customerUserId: text().references(() => users.id),
    source: text().notNull().default("manual"),
    duplicateOf: text(),
    createdBy: text().references(() => users.id),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("leads_owner_idx").on(t.ownerUserId, t.createdAt),
    index("leads_status_idx").on(t.status),
    index("leads_phone_idx").on(t.phone),
    index("leads_email_idx").on(t.email),
  ],
);

export const leadNotes = pgTable(
  "lead_notes",
  {
    id: id(),
    leadId: text()
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    authorUserId: text().references(() => users.id),
    body: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("lead_notes_lead_idx").on(t.leadId, t.createdAt)],
);

export const quotes = pgTable("quotes", {
  id: id(),
  conversationId: text(),
  leadId: text(),
  vehicleId: text(),
  auctionLotId: text(),
  portId: text().references(() => ports.id),
  title: text().notNull(),
  lines: jsonb().notNull(),
  totalCnfUsd: usd().notNull(),
  pushUsd: usd().notNull(),
  discountPct: numeric({ precision: 5, scale: 2, mode: "number" }).notNull().default(0),
  fxJpyPerUsd: numeric({ precision: 8, scale: 3, mode: "number" }).notNull(),
  m3: numeric({ precision: 6, scale: 2, mode: "number" }),
  createdBy: text(),
  createdAt: createdAt(),
  expiresAt: timestamp({ withTimezone: true }),
});

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    number: text().notNull().unique(),
    leadId: text()
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    requestedBy: text().references(() => users.id),
    approvedBy: text().references(() => users.id),
    status: text().notNull().default("pending"),
    consigneeName: text().notNull(),
    consigneeAddress: text(),
    consigneePhone: text().notNull(),
    consigneeEmail: text(),
    consigneeCountryCode: text().references(() => countries.code),
    consigneePortId: text().references(() => ports.id),
    notifyParty: text(),
    salesperson: text(),
    m3Rate: usd(),
    exchangeRate: numeric({ precision: 8, scale: 3, mode: "number" }),
    totalPushUsd: usd().notNull().default(0),
    totalCnfUsd: usd().notNull().default(0),
    advancePercent: integer().notNull().default(50),
    discountUsd: usd().notNull().default(0),
    rejectionNote: text(),
    finalPdfFileId: text().references(() => files.id),
    quoteId: text(),
    createdAt: createdAt(),
    approvedAt: timestamp({ withTimezone: true }),
    sentAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("inv_lead_idx").on(t.leadId), index("inv_status_idx").on(t.status, t.createdAt)],
);

export const invoiceVehicles = pgTable(
  "invoice_vehicles",
  {
    id: id(),
    invoiceId: text()
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    vehicleId: text().references(() => vehicles.id),
    auctionLotId: text(),
    unitLabel: text().notNull(),
    year: integer(),
    color: text(),
    chassisNo: text(),
    engine: text(),
    transmission: text(),
    fuel: text(),
    pushUsd: usd().notNull().default(0),
    cnfUsd: usd().notNull().default(0),
  },
  (t) => [index("invveh_inv_idx").on(t.invoiceId, t.position)],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    invoiceId: text()
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    sellingPriceUsd: usd(),
    amountUsd: usd().notNull(),
    receivedDate: date({ mode: "string" }).notNull(),
    fxRate: numeric({ precision: 8, scale: 3, mode: "number" }),
    yenAmount: integer(),
    receiptFileId: text().references(() => files.id),
    recordedBy: text().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("pay_inv_idx").on(t.invoiceId)],
);

export const units = pgTable(
  "units",
  {
    id: id(),
    invoiceId: text()
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    invoiceVehicleId: text().references(() => invoiceVehicles.id, { onDelete: "set null" }),
    make: text().notNull(),
    model: text().notNull(),
    year: integer(),
    color: text(),
    chassis: text(),
    engineCc: integer(),
    drive: text(),
    fuel: text(),
    mileageKm: integer(),
    transmission: text(),
    steering: text(),
    doors: integer(),
    seats: integer(),
    location: text(),
    createdBy: text().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("units_inv_idx").on(t.invoiceId), uniqueIndex("units_invveh_uq").on(t.invoiceVehicleId)],
);

export const unitFinancials = pgTable("unit_financials", {
  unitId: text()
    .primaryKey()
    .references(() => units.id, { onDelete: "cascade" }),
  lotNo: text(),
  auctionName: text(),
  buyingJpy: integer().notNull().default(0),
  domesticJpy: integer().notNull().default(0),
  storageJpy: integer().notNull().default(0),
  inspectJpy: integer().notNull().default(0),
  repairsJpy: integer().notNull().default(0),
  miscJpy: integer().notNull().default(0),
  agencyFeeJpy: integer().notNull().default(0),
  freightJpy: integer().notNull().default(0),
  dhlJpy: integer().notNull().default(0),
  auctionFeeJpy: integer().notNull().default(0),
  partsJpy: integer().notNull().default(0),
  vanningJpy: integer().notNull().default(0),
  docJpy: integer().notNull().default(0),
  fxRate: numeric({ precision: 8, scale: 3, mode: "number" }),
  sellingPriceUsd: usd(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const unitDocuments = pgTable(
  "unit_documents",
  {
    id: id(),
    unitId: text()
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    folder: text().notNull(),
    fileId: text()
      .notNull()
      .references(() => files.id),
    createdAt: createdAt(),
  },
  (t) => [index("unitdoc_unit_idx").on(t.unitId, t.folder)],
);

export const vehicleProgress = pgTable(
  "vehicle_progress",
  {
    id: id(),
    invoiceVehicleId: text()
      .notNull()
      .references(() => invoiceVehicles.id, { onDelete: "cascade" }),
    stage: text().notNull(),
    stageDate: date({ mode: "string" }).notNull(),
    note: text(),
    createdBy: text().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("vprog_iv_idx").on(t.invoiceVehicleId, t.createdAt)],
);
