export interface Site {
  companyName: string;
  logoUrl?: string;
  tagline: string;
  ftEName: string;
  primaryColor: string;
  accentColor: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  bank: { bankName: string; branch: string; swift: string; accountName: string; accountNo: string };
}

export interface Me {
  id: string;
  kind: "staff" | "customer" | "visitor" | "fte";
  name: string;
  email: string | null;
  phone: string | null;
  countryCode: string | null;
  perms: string[];
}

export interface VehicleCard {
  id: string;
  slug: string;
  stockNo: string;
  title: string;
  brand: string;
  model: string;
  year: number;
  mileageKm: number;
  priceUsd: number;
  discountPriceUsd: number | null;
  fuel: string;
  transmission: string;
  bodyType: string;
  engineCc: number | null;
  color: string;
  drive: string;
  status: string;
  image: string | null;
  location?: string;
}

export interface VehicleDetail extends VehicleCard {
  refNo: string;
  grade?: string | null;
  videoUrl?: string | null;
  modelCode: string | null;
  month: number | null;
  steering: string;
  doors: number | null;
  seats: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  m3: number | null;
  features: string[];
  shortDesc: string | null;
  description: string | null;
  images: string[];
}

export type ChatCard =
  | { type: "vehicles"; items: { kind: "stock" | "lot"; id: string; title: string; priceLabel: string; image: string; link: string; facts: string[] }[] }
  | { type: "quote"; quoteId: string; title: string; lines: { label: string; usd: number }[]; totalUsd: number; port: string }
  | { type: "invoice"; invoiceId: string; number: string; status: string; totalUsd: number; advanceUsd: number; link: string }
  | { type: "sheet"; lotId: string; verdict: "good" | "caution" | "avoid"; grade: string; summary: string };

export interface ChatMsg {
  id: string;
  conversationId: string;
  senderUserId: string | null;
  kind: string;
  body: string;
  fileIds: string[];
  meta: { cards?: ChatCard[]; transcript?: string; language?: string; secs?: number } | null;
  createdAt: string;
  sender: { id: string; name: string; kind: string; title?: string | null } | null;
}

export interface CartData {
  items: VehicleCard[];
  totalUsd: number;
  readyCount: number;
}

export interface WebOrder {
  id: string;
  orderNo: string;
  status: string;
  paymentMethod?: string;
  paymentRef?: string | null;
  paidAt?: string | null;
  totalUsd: number;
  notes: string | null;
  createdAt: string;
  items: { vehicleId: string | null; title: string; priceUsd: number; slug: string | null }[];
}

export interface CustomerInvoice {
  demoSlips?: boolean;
  id: string;
  number: string;
  status: string;
  createdAt: string;
  consigneeName: string;
  port: string | null;
  advancePercent: number;
  totals: { total: number; advance: number; paid: number; balance: number };
  payments: { date: string; amountUsd: number }[];
  vehicles: { id: string; label: string; color: string; chassisNo: string; cnfUsd: number; progress: { stage: string; date: string; note: string | null }[]; documents: { id: string; folder: string; fileId: string; mime?: string; name: string }[] }[];
}

export const effectivePrice = (v: { priceUsd: number; discountPriceUsd: number | null }) => Number(v.discountPriceUsd ?? v.priceUsd);
