/**
 * The small facts around a lot: the company's fee sheet for an FOB estimate, the production-year lookup from a chassis
 * number, the meaning of the sheet's marks, and when a lot's sale happens. Demo figures, labelled as such on the page.
 */
import { and, asc, desc, eq, gte, ilike, sql } from "drizzle-orm";
import { db } from "../db/client";
import * as s from "../db/schema";
import { Rng } from "../seed/rng";
import { today } from "./auction";

export const AUCTION_FEES = {
  transportCarJpy: 14000,
  transportTruckJpy: 26000,
  clearanceJpy: 18000,
  radiationJpy: 1800,
  handlingJpy: 19000,
  serviceJpy: 22000,
  lcJpy: 9000,
  vanningJpy: 13000,
  inspection: { None: 0, JAAI: 16000, JEVIC: 21000 } as Record<string, number>,
};

export interface FobInput {
  bidJpy: number;
  kind?: "car" | "truck";
  inspection?: string;
  lc?: boolean;
  vanning?: boolean;
}

/** One sum, on the server and on the page. A buyer can change only the bid, the inspection body, L/C and vanning. */
export function fobEstimate(i: FobInput) {
  const f = AUCTION_FEES;
  const lines: { label: string; jpy: number }[] = [
    { label: "Your bidding amount", jpy: Math.max(0, Math.round(i.bidJpy)) },
    { label: "Domestic transport", jpy: i.kind === "truck" ? f.transportTruckJpy : f.transportCarJpy },
    { label: "Customs clearance", jpy: f.clearanceJpy },
    { label: `Inspection${i.inspection && i.inspection !== "None" ? ` (${i.inspection})` : ""}`, jpy: f.inspection[i.inspection ?? "None"] ?? 0 },
    { label: "L/C", jpy: i.lc ? f.lcJpy : 0 },
    { label: "Vanning", jpy: i.vanning ? f.vanningJpy : 0 },
    { label: "Radiation check", jpy: f.radiationJpy },
    { label: "Yard handling", jpy: f.handlingJpy },
  ];
  return { lines, totalJpy: lines.reduce((a, l) => a + l.jpy, 0), note: "An estimate. Auction charges are quoted by our desk on the day." };
}

/** What each mark on an auction sheet means. */
export const SHEET_MARKS: [string, string][] = [
  ["A1", "Small scratch"],
  ["A2", "Scratch"],
  ["A3", "Big scratch"],
  ["E1", "A few dimples"],
  ["E2", "Several dimples"],
  ["E3", "Many dimples"],
  ["U1", "Small dent"],
  ["U2", "Dent"],
  ["U3", "Big dent"],
  ["B1", "Small dent with a scratch, about a thumb"],
  ["B2", "Dent with a scratch, about a palm"],
  ["B3", "Big dent with a scratch, about an elbow"],
  ["W1", "Repair mark, hard to see"],
  ["W2", "Repair mark"],
  ["W3", "Obvious repair mark, wants repainting"],
  ["S1", "Rust"],
  ["S2", "Heavy rust"],
  ["C1", "Corrosion"],
  ["C2", "Heavy corrosion"],
  ["P", "Paint marked"],
  ["H", "Paint faded"],
  ["X", "Needs replacing"],
  ["XX", "Replaced"],
  ["Y1", "Small hole or crack"],
  ["Y2", "Hole or crack"],
  ["Y3", "Big hole or crack"],
  ["X1", "Small windscreen crack, about 1 cm"],
  ["R", "Repaired windscreen crack"],
  ["RX", "Repaired windscreen crack, needs replacing"],
  ["G", "Stone chip in the glass"],
];

/** The lot's hammer time as an instant. Halls sell on Tokyo time; a hall that publishes no time gives null. */
export function lotEndsAt(saleDate: string, saleTime: string | null | undefined): string | null {
  if (!saleTime || !/^\d{1,2}:\d{2}$/.test(saleTime)) return null;
  const [h, m] = saleTime.split(":");
  return new Date(`${saleDate}T${h!.padStart(2, "0")}:${m}:00+09:00`).toISOString();
}

/** The sale may already have happened: the lot's time has passed, or its hall gives no time and today is the day. */
export function saleMayHaveRun(saleDate: string, saleTime: string | null | undefined, todayIso: string, now: Date): boolean {
  if (saleDate !== todayIso) return false;
  const ends = lotEndsAt(saleDate, saleTime);
  return ends ? new Date(ends) <= now : true;
}

const MAKERS = ["DAIHATSU", "HONDA", "ISUZU", "MAZDA", "MITSUBISHI", "NISSAN", "SUBARU", "SUZUKI", "TOYOTA"];
export const lookupMakers = () => MAKERS;

/** Splits "GDJ150W-1234567" (or the same with no dash) into its model code and its number. */
export function chassisParts(input: string): { code: string; number: string } {
  const t = input.trim().toUpperCase().replace(/\s+/g, "");
  const dash = t.indexOf("-");
  if (dash > 0) return { code: t.slice(0, dash), number: t.slice(dash + 1) };
  const m = /^([A-Z0-9]*[A-Z])(\d{4,8})$/.exec(t);
  return m ? { code: m[1]!, number: m[2]! } : { code: t, number: "" };
}

/**
 * Year of manufacture from a chassis number. The demo has no maker's register, so the answer is worked out from what the
 * lots of that model say, and the same chassis always gets the same answer. It says so: `demo: true`.
 */
export async function chassisLookup(codeIn: string, number: string, maker?: string) {
  const code = chassisParts(codeIn).code;
  if (!code) return { found: false as const, message: "Enter the model code, for example GDJ150W." };
  const [row] = (await db()
    .select({ make: s.auctionLots.make, model: s.auctionLots.model, minYear: sql<number>`min(${s.auctionLots.year})::int`, maxYear: sql<number>`max(${s.auctionLots.year})::int`, body: sql<string>`min(${s.auctionLots.bodyType})`, drive: sql<string>`min(${s.auctionLots.drive})`, cc: sql<number>`max(${s.auctionLots.engineCc})::int`, grade: sql<string>`min(${s.auctionLots.modelGrade})` })
    .from(s.auctionLots)
    .where(ilike(s.auctionLots.modelCode, code))
    .groupBy(s.auctionLots.make, s.auctionLots.model)
    .limit(1)) as [{ make: string; model: string; minYear: number; maxYear: number; body: string; drive: string; cc: number; grade: string | null }?];
  if (!row) return { found: false as const, message: `We have no record of the chassis code ${code}.` };
  if (maker && row.make.toUpperCase() !== maker.toUpperCase()) return { found: false as const, message: `${code} is a ${row.make} code, not ${maker}.` };
  const digits = number.replace(/\D/g, "") || "0";
  const rng = new Rng(Number(digits.slice(-8)) + code.length * 104729);
  const span = Math.max(0, row.maxYear - row.minYear);
  const year = row.minYear + Math.floor(rng.next() * (span + 1));
  const month = rng.int(1, 12);
  const seats = /van|bus/i.test(row.body) ? 8 : /pickup/i.test(row.body) ? 5 : /suv/i.test(row.body) ? 7 : 5;
  return {
    found: true as const,
    demo: true,
    code,
    number: digits === "0" ? "" : digits,
    maker: row.make,
    yearMonth: `${year}/${String(month).padStart(2, "0")}`,
    modelName: row.model,
    gradeCode: `${code.slice(0, 3)}-${rng.pick(["AEPDK", "AGRFK", "ANPXK", "BEPSK", "AHRXK"])}`,
    seats,
    engineNo: `${code.slice(0, 2)}${rng.int(100000, 999999)}`,
    grade: row.grade ?? "Standard",
    paintCode: rng.pick(["070", "1F7", "218", "4R3", "8W9", "202"]),
    trimCode: rng.pick(["FA20", "FB11", "LA10", "EB40"]),
    body: row.body,
    drive: row.drive,
    catalogNo: String(rng.int(100000, 999999)),
  };
}

/** Our own lots of a model code, soonest first: what joins a buyer's document to this week's sale. */
export async function ourStock(codeIn: string, limit = 12) {
  const code = chassisParts(codeIn).code;
  if (!code) return [];
  const t = await today();
  return db()
    .select({ id: s.auctionLots.id, lotNo: s.auctionLots.lotNo, saleDate: s.auctionLots.saleDate, make: s.auctionLots.make, model: s.auctionLots.model, year: s.auctionLots.year, grade: s.auctionLots.grade, mileageKm: s.auctionLots.mileageKm, startPriceJpy: s.auctionLots.startPriceJpy, hall: s.auctionHalls.name })
    .from(s.auctionLots)
    .innerJoin(s.auctionHalls, eq(s.auctionHalls.id, s.auctionLots.hallId))
    .where(and(ilike(s.auctionLots.modelCode, `${code}%`), eq(s.auctionLots.status, "upcoming"), gte(s.auctionLots.saleDate, t)))
    .orderBy(asc(s.auctionLots.saleDate), asc(s.auctionLots.lotNo))
    .limit(limit);
}

void desc;
