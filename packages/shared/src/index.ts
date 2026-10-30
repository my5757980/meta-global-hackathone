// Shared vocabulary for server, web and app. Changing a value here changes it everywhere.
import { z } from "zod";

export const ROLE_SLUGS = ["admin", "manager", "supervisor", "agent", "accounts", "customer", "fte"] as const;
export type RoleSlug = (typeof ROLE_SLUGS)[number];

/** Display names used across the product (the CRM calls super-admin "Supervisor" and user "Agent"). */
export const ROLE_LABELS: Record<RoleSlug, string> = {
  admin: "Admin",
  manager: "Manager",
  supervisor: "Supervisor",
  agent: "Agent",
  accounts: "Accounts",
  customer: "Customer",
  fte: "Digital FTE",
};

export const USER_KINDS = ["staff", "customer", "visitor", "fte"] as const;
export type UserKind = (typeof USER_KINDS)[number];

/** Every permission in the platform. Roles get a ticked subset; the server checks them on every action. */
export const PERMISSIONS = {
  // website admin
  "website.admin": "Open the website admin",
  "website.vehicles.manage": "Manage vehicles, brands and models",
  "website.content.manage": "Manage pages, blog, FAQ, services, testimonials, home sections",
  "website.orders.manage": "Manage website orders",
  "website.customers.view": "See customers",
  "website.customers.view_all": "See all customers (not only own)",
  "website.customers.manage": "Create/edit customers, link CRM records, passwords",
  "website.settings.manage": "Change site settings and branding",
  // crm
  "crm.access": "Open the CRM",
  "crm.leads.create": "Create leads",
  "crm.leads.view_all": "See every lead (not only own)",
  "crm.leads.edit": "Edit lead details",
  "crm.leads.status": "Change lead status",
  "crm.leads.delete": "Delete leads",
  "crm.leads.upload": "Upload leads from Excel",
  "crm.leads.transfer": "Transfer leads between agents",
  "crm.invoices.request": "Request invoices",
  "crm.invoices.view_all": "See every invoice",
  "crm.invoices.approve": "Approve, reject, edit and send invoices",
  "crm.invoices.delete": "Delete invoices",
  "crm.invoices.download": "Download invoice PDF/Excel",
  "crm.payments.record": "Record payments",
  "crm.units.manage": "Manage units, documents and costing",
  "crm.progress.update": "Update vehicle progress",
  "crm.reports.view": "See reports",
  "crm.backup.download": "Download the full backup workbook",
  "crm.users.manage": "Manage CRM users",
  // auction
  "auction.access": "Open the auction portal",
  "auction.admin": "Open the auction admin",
  "auction.lots.view_sold": "See concluded lots (archive)",
  "auction.bids.place": "Place bids",
  "auction.bids.view": "See bids in admin",
  "auction.bids.view_all": "See everyone's bids",
  "auction.bids.manage": "Change bid status, notes, delete",
  "auction.bids.export": "Export bids to Excel",
  "auction.clients.view": "See auction clients",
  "auction.orders.manage": "Manage auction orders",
  "auction.enquiries.reply": "Reply to enquiries",
  "auction.staff.manage": "Manage staff",
  "auction.roles.manage": "Manage roles and permissions",
  // chat
  "chat.desk": "Work at the chat desk",
  "chat.view_all": "See every conversation",
  "chat.groups": "Create and manage staff groups",
  // fte
  "fte.console": "Open the FTE console",
  "fte.envelope.manage": "Change Sora's authority envelope",
  "fte.approvals.decide": "Decide Sora's approval requests",
  "fte.evals.run": "Run Sora's eval suite",
  // system
  "system.demo.reset": "Reset demo data",
  "system.mcp.tokens": "Issue MCP tokens",
} as const;
export type PermissionKey = keyof typeof PERMISSIONS;

export const LEAD_STATUSES = ["new", "in_progress", "invoice_requested", "invoiced", "closed"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  in_progress: "In progress",
  invoice_requested: "Invoice requested",
  invoiced: "Invoiced",
  closed: "Closed",
};

export const INVOICE_STATUSES = ["pending", "approved", "rejected", "sent"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const UNIT_FOLDERS = [
  "Auction Details/Pics",
  "Export Certificate",
  "Yard Pictures",
  "Inspection Certificate",
  "BL / Surrender",
  "DHL",
] as const;
export type UnitFolder = (typeof UNIT_FOLDERS)[number];

export const PROGRESS_STAGES = [
  "Not started",
  "Vehicle Reserved",
  "Invoice Generated",
  "First Payment Received",
  "Car Booked",
  "Inspection/Yard",
  "In Yard",
  "Final Payment",
  "Shipped",
  "Delivered to port",
] as const;
export type ProgressStage = (typeof PROGRESS_STAGES)[number];

export const AUCTION_ORDER_STATUSES = ["pending", "approved", "confirmed", "paid", "shipped", "delivered", "cancelled"] as const;
export const ENQUIRY_STATUSES = ["open", "answered", "closed"] as const;
export const LOT_STATUSES = ["upcoming", "sold", "unsold", "withdrawn"] as const;

export const BODY_TYPES = ["Sedan", "SUV", "Hatchback", "Pickup", "Van", "Wagon", "Truck", "Coupe", "Minivan", "Bus"] as const;
export const FUELS = ["Petrol", "Diesel", "Hybrid", "Electric", "LPG"] as const;
export const TRANSMISSIONS = ["Automatic", "Manual", "CVT"] as const;
export const STEERINGS = ["Right", "Left"] as const;
export const DRIVES = ["2WD", "4WD", "AWD"] as const;

export const CONVERSATION_HOLDERS = ["fte", "human"] as const;
export type ConversationHolder = (typeof CONVERSATION_HOLDERS)[number];

export const MESSAGE_KINDS = ["text", "image", "voice", "call", "system", "card"] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

/** Cards Sora (or staff) can put in a chat. */
export type ChatCard =
  | { type: "vehicles"; items: VehicleCardItem[] }
  | { type: "quote"; quoteId: string; title: string; lines: QuoteLine[]; totalUsd: number; port: string }
  | { type: "invoice"; invoiceId: string; number: string; status: string; totalUsd: number; advanceUsd: number; link: string }
  | { type: "sheet"; lotId: string; verdict: "good" | "caution" | "avoid"; grade: string; summary: string };

export interface VehicleCardItem {
  kind: "stock" | "lot";
  id: string;
  title: string;
  priceLabel: string;
  image: string;
  link: string;
  facts: string[];
}

export interface QuoteLine {
  label: string;
  usd: number;
}

export const EnvelopeSchema = z.object({
  maxDiscountPct: z.number().min(0).max(50).default(3),
  maxBidJpy: z.number().int().min(0).default(1_500_000),
  proactivePerBuyerPerDay: z.number().int().min(0).max(20).default(2),
  workingHourStart: z.number().int().min(0).max(23).default(9),
  workingHourEnd: z.number().int().min(1).max(24).default(20),
  escalateTopics: z.array(z.string()).default(["complaint", "refund", "legal", "payment dispute"]),
  followUpAfterHours: z.number().int().min(1).max(720).default(24),
  advanceReminderDays: z.number().int().min(1).max(60).default(5),
});
export type Envelope = z.infer<typeof EnvelopeSchema>;

export const PricingPolicySchema = z.object({
  fxJpyPerUsd: z.number().positive().default(150),
  marginPct: z.number().min(0).max(100).default(6),
  auctionFeeJpy: z.number().int().min(0).default(25_000),
  inlandTransportJpy: z.number().int().min(0).default(20_000),
  insurancePct: z.number().min(0).max(10).default(1.5),
  defaultFreightUsdPerM3: z.number().positive().default(85),
  advancePercent: z.number().min(1).max(100).default(50),
});
export type PricingPolicy = z.infer<typeof PricingPolicySchema>;

export const SiteSettingsSchema = z.object({
  companyName: z.string().default("Hikari Motors"),
  tagline: z.string().default("Quality used cars from Japan, delivered to your port"),
  ftEName: z.string().default("Sora"),
  primaryColor: z.string().default("#0f4c81"),
  accentColor: z.string().default("#f59e0b"),
  phone: z.string().default("+81 3 0000 0000"),
  whatsapp: z.string().default("+81 90 0000 0000"),
  email: z.string().default("sales@hikari-motors.example"),
  address: z.string().default("1-2-3 Minato, Yokohama, Kanagawa, Japan (demo address)"),
  invoicePrefix: z.string().default("HK"),
  bank: z
    .object({
      bankName: z.string(),
      branch: z.string(),
      swift: z.string(),
      accountName: z.string(),
      accountNo: z.string(),
    })
    .default({
      bankName: "Demo Bank of Japan",
      branch: "Yokohama Main Branch",
      swift: "DEMOJPJT",
      accountName: "Hikari Motors Co., Ltd. (demo)",
      accountNo: "000-0000000",
    }),
});
export type SiteSettings = z.infer<typeof SiteSettingsSchema>;

export function formatUsd(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
export function formatJpy(n: number): string {
  return "¥" + Math.round(n).toLocaleString("en-US");
}
