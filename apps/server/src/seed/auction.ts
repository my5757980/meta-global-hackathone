/**
 * Demo auction data: fictional halls, upcoming sale days with lots (grades, damage marks, equipment),
 * a short archive of concluded lots, and ~90 days of past results for the Statistics pages.
 * No real auction-house or supplier data is used.
 */
import { sql } from "drizzle-orm";
import type { DB } from "../db/client";
import * as s from "../db/schema";
import { genId } from "../lib/id";
import { CATALOG, COLORS, type ModelSpec } from "./catalog";
import { MODEL_PHOTOS } from "./photos";
import { Rng } from "./rng";
import { addDays, chunkInsert, isoDate } from "./util";

export const HALLS = [
  { name: "Kanto Auto Auction", code: "KAA", region: "Kanto" },
  { name: "Yokohama Bay Auction", code: "YBA", region: "Kanto" },
  { name: "Saitama Auto Hub", code: "SAH", region: "Kanto" },
  { name: "Chiba Port Auction", code: "CPA", region: "Kanto" },
  { name: "Chubu Motor Auction", code: "CMA", region: "Chubu" },
  { name: "Nagoya Central Auction", code: "NCA", region: "Chubu" },
  { name: "Kansai Car Auction", code: "KCA", region: "Kansai" },
  { name: "Osaka Bayside Auction", code: "OBA", region: "Kansai" },
  { name: "Hiroshima Car Market", code: "HCM", region: "Chugoku" },
  { name: "Kyushu Auto Exchange", code: "KAX", region: "Kyushu" },
  { name: "Tohoku Auction Hall", code: "TAH", region: "Tohoku" },
  { name: "Hokkaido Motor Market", code: "HMM", region: "Hokkaido" },
];

const GRADES = [
  ["6", 2],
  ["5", 6],
  ["4.5", 22],
  ["4", 30],
  ["3.5", 20],
  ["3", 9],
  ["R", 5],
  ["RA", 4],
  ["2", 2],
] as const;
const GRADE_FACTOR: Record<string, number> = { "6": 1.15, "5": 1.08, "4.5": 1.03, "4": 1, "3.5": 0.92, "3": 0.85, R: 0.7, RA: 0.8, "2": 0.6 };
const MARKS_BY_GRADE: Record<string, [number, number]> = { "6": [0, 0], "5": [0, 1], "4.5": [1, 2], "4": [2, 4], "3.5": [3, 6], "3": [5, 8], R: [3, 6], RA: [2, 5], "2": [6, 10] };

/** Panels on the auction-sheet car map (keys are used by the sheet renderer). */
export const PANELS = [
  "front bumper", "bonnet", "windscreen", "roof", "left front fender", "right front fender", "left front door", "right front door",
  "left rear door", "right rear door", "left rear quarter", "right rear quarter", "tailgate/boot", "rear bumper", "left sill", "right sill",
] as const;

const CODES_LIGHT = [["A1", 30], ["A2", 18], ["U1", 14], ["U2", 8], ["B1", 6], ["W1", 8], ["G", 6], ["S1", 4], ["P", 4]] as const;
const CODES_HEAVY = [["A2", 14], ["A3", 10], ["U2", 12], ["U3", 8], ["B2", 8], ["W2", 10], ["S2", 6], ["C1", 6], ["X", 4], ["XX", 6], ["Y1", 6]] as const;

const EQUIP = ["AC", "PS", "PW", "AB", "ABS", "NAVI", "TV", "BC", "SR", "LEATHER", "AW", "ETC", "SMART KEY", "LED", "CRUISE", "360CAM", "DVD"];

export function lotValueJpy(spec: ModelSpec, year: number, km: number, grade: string): number {
  const v = spec.baseUsd * 150 * 0.7 * Math.pow(1.085, year - 2018) * (1 + (60000 - km) / 450000) * (GRADE_FACTOR[grade] ?? 1);
  return Math.max(150_000, Math.round(v / 1000) * 1000);
}

function businessDays(from: Date, count: number, dir: 1 | -1): string[] {
  const out: string[] = [];
  let d = new Date(from);
  while (out.length < count) {
    d = addDays(d, dir);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(isoDate(d));
  }
  return out;
}

const TRIMS = ["Standard", "G", "X", "S", "GL", "Z", "Limited", "Premium", "Sport", "Luxury"];

/** Sale time, power, trim and feed. Their own random stream, so adding them changed no other demo figure. */
function lotExtras(saleDate: string, hallId: string, lotNo: number, engineCc: number) {
  const r = new Rng(lotNo * 7919 + saleDate.charCodeAt(9) * 31 + hallId.charCodeAt(0));
  const minutes = 9 * 60 + Math.floor((lotNo % 9999) / 9999 * 360);
  const saleTime = r.chance(0.15) ? null : `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`; // some halls publish no time
  return { saleTime, engineHp: Math.round(engineCc * (0.065 + r.next() * 0.035)), modelGrade: r.pick(TRIMS), feed: r.chance(0.68) ? "A" : "B" };
}

export function makeLotRow(rng: Rng, saleDate: string, hallId: string, lotNo: number, status: "upcoming" | "past") {
  const spec = rng.pick(CATALOG);
  const year = rng.int(Math.max(2012, spec.years[0] - 2), spec.years[1]);
  const km = rng.round(Math.max(3000, rng.int(10000, 160000) - (year - 2015) * 5000), 1000);
  const grade = rng.weighted(GRADES);
  const fuel = rng.pick(spec.fuel);
  const engine = spec.engineCc[Math.min(spec.engineCc.length - 1, spec.fuel.indexOf(fuel))] ?? spec.engineCc[0]!;
  const value = lotValueJpy(spec, year, km, grade);
  const [mn, mx] = MARKS_BY_GRADE[grade] ?? [1, 3];
  const nMarks = rng.int(mn, mx);
  const heavy = ["3", "2", "R", "RA"].includes(grade);
  const usedPanels = new Set<string>();
  const damage: { code: string; part: string }[] = [];
  for (let i = 0; i < nMarks; i++) {
    const part = rng.pick(PANELS);
    if (usedPanels.has(part)) continue;
    usedPanels.add(part);
    const code = part === "windscreen" ? rng.pick(["G", "Y1", "A1"]) : rng.weighted(heavy && rng.chance(0.6) ? CODES_HEAVY : CODES_LIGHT);
    damage.push({ code, part });
  }
  if ((grade === "R" || grade === "RA") && !damage.some((d) => d.code === "XX")) {
    damage.push({ code: "XX", part: rng.pick(["bonnet", "front bumper", "right front fender", "left front fender", "tailgate/boot"]) });
  }
  const interior = rng.weighted([["A", 18], ["B", 52], ["C", 25], ["D", 5]] as const);
  const equipment = rng.shuffle([...EQUIP]).slice(0, rng.int(4, 9)).join(" ");
  const notes: string[] = [];
  if (damage.length === 0) notes.push("Very clean condition");
  if (damage.some((d) => d.code.startsWith("S") || d.code.startsWith("C"))) notes.push("Some rust underneath");
  if (damage.some((d) => d.code === "XX")) notes.push("Panel replaced");
  if (interior === "C" || interior === "D") notes.push(rng.pick(["Seat wear", "Interior stains", "Steering wheel worn"]));
  if (rng.chance(0.25)) notes.push(rng.pick(["Engine sound OK", "Oil leak slight", "Tyres 50%", "Non-smoker", "Aftermarket wheels", "Navigation not working"]));
  const start = rng.round(value * (0.5 + rng.next() * 0.25), 1000);
  const avg = rng.round(value * (0.95 + rng.next() * 0.06), 1000);
  const base = {
    hallId,
    saleDate,
    lotNo,
    make: spec.brand,
    model: spec.model,
    modelCode: rng.pick(spec.codes),
    bodyType: spec.body,
    grade,
    interiorGrade: interior,
    year,
    color: ((any) => {
      const photos = MODEL_PHOTOS[`${spec.brand}|${spec.model}`]; // a lot takes the colour of its picture
      return photos?.length ? photos[lotNo % photos.length]!.color : any;
    })(rng.weighted(COLORS.map((c) => [c.name, c.weight] as const))),
    transmission: rng.pick(spec.transmission),
    fuel,
    drive: rng.pick(spec.drive),
    mileageKm: km,
    engineCc: engine,
    equipment,
    startPriceJpy: start,
    avgPriceJpy: avg,
    photoCount: rng.int(6, 12),
    damage,
    sheetNotes: notes.join(". "),
    ...lotExtras(saleDate, hallId, lotNo, engine),
  };
  if (status === "upcoming") return { id: genId(), ...base, status: "upcoming" as const, resultPriceJpy: null, highBidJpy: null };
  const sold = rng.chance(0.72);
  const price = rng.round(value * (sold ? 0.9 + rng.next() * 0.2 : 0.65 + rng.next() * 0.2), 1000);
  return { id: genId(), ...base, status: sold ? ("sold" as const) : ("unsold" as const), resultPriceJpy: sold ? price : null, highBidJpy: price };
}

function resultExtras(lotNo: number) {
  const r = new Rng(lotNo * 104729);
  return { modelGrade: r.pick(TRIMS), equipment: r.shuffle([...EQUIP]).slice(0, r.int(3, 6)).join(" ") };
}

export async function seedAuction(db: DB, rng: Rng, now: Date, userIds: Record<string, string>, log: (m: string) => void) {
  const hallIds: string[] = [];
  await db.insert(s.auctionHalls).values(
    HALLS.map((h) => {
      const id = genId();
      hallIds.push(id);
      return { id, ...h };
    }),
  );

  const makeLot = (saleDate: string, hallId: string, lotNo: number, status: "upcoming" | "past") => makeLotRow(rng, saleDate, hallId, lotNo, status);

  const upcomingDays = businessDays(now, 6, 1);
  const pastDays = businessDays(now, 6, -1);
  const lots: ReturnType<typeof makeLot>[] = [];
  const usedLot = new Set<string>();
  const nextLotNo = (day: string, hallId: string) => {
    for (;;) {
      const n = rng.int(1, 9999);
      const k = `${day}|${hallId}|${n}`;
      if (!usedLot.has(k)) {
        usedLot.add(k);
        return n;
      }
    }
  };
  for (const day of upcomingDays) {
    const hallsToday = rng.shuffle([...hallIds]).slice(0, 7);
    for (let i = 0; i < 290; i++) {
      const hall = rng.pick(hallsToday);
      lots.push(makeLot(day, hall, nextLotNo(day, hall), "upcoming"));
    }
  }
  for (const day of pastDays) {
    const hallsToday = rng.shuffle([...hallIds]).slice(0, 6);
    for (let i = 0; i < 140; i++) {
      const hall = rng.pick(hallsToday);
      lots.push(makeLot(day, hall, nextLotNo(day, hall), "past"));
    }
  }
  await chunkInsert(db, s.auctionLots, lots, 300);
  log(`auction lots ${lots.length} (${upcomingDays.length} upcoming days, ${pastDays.length} past days)`);

  // ~90 days of past results for Statistics (separate table; never mixed into the live list)
  const resultDays = businessDays(now, 64, -1);
  const results: (typeof s.auctionResults.$inferInsert)[] = [];
  const usedRes = new Set<string>();
  for (const day of resultDays) {
    const hallsToday = rng.shuffle([...hallIds]).slice(0, 6);
    for (let i = 0; i < 300; i++) {
      const spec = rng.pick(CATALOG);
      const hall = rng.pick(hallsToday);
      let lotNo = rng.int(1, 9999);
      while (usedRes.has(`${day}|${hall}|${lotNo}`)) lotNo = rng.int(1, 9999);
      usedRes.add(`${day}|${hall}|${lotNo}`);
      const year = rng.int(Math.max(2012, spec.years[0] - 2), spec.years[1]);
      const km = rng.round(Math.max(3000, rng.int(10000, 160000) - (year - 2015) * 5000), 1000);
      const grade = rng.weighted(GRADES);
      const value = lotValueJpy(spec, year, km, grade);
      const sold = rng.chance(0.72);
      results.push({
        hallId: hall,
        saleDate: day,
        lotNo,
        make: spec.brand,
        model: spec.model,
        modelCode: rng.pick(spec.codes),
        year,
        engineCc: spec.engineCc[0]!,
        mileageKm: km,
        grade,
        color: rng.pick(COLORS).name,
        transmission: rng.pick(spec.transmission),
        startPriceJpy: rng.round(value * (0.5 + rng.next() * 0.25), 1000),
        finalPriceJpy: rng.round(value * (sold ? 0.9 + rng.next() * 0.2 : 0.65 + rng.next() * 0.2), 1000),
        sold: sold ? 1 : 0,
        ...resultExtras(lotNo),
      });
    }
  }
  await chunkInsert(db, s.auctionResults, results, 500);
  log(`auction results ${results.length}`);

  // some customer activity
  const upcoming = lots.filter((l) => l.status === "upcoming");
  const customerKeys = Object.keys(userIds).filter((k) => k === "customer" || /^c\d+$/.test(k));
  const bids: (typeof s.auctionBids.$inferInsert)[] = [];
  for (let i = 0; i < 46; i++) {
    const lot = rng.pick(upcoming);
    const who = rng.chance(0.85) ? userIds[rng.pick(customerKeys)]! : userIds[rng.pick(["agent", "agent2"])]!;
    const amountJpy = rng.round(lot.startPriceJpy * (1.1 + rng.next() * 0.4), 1000);
    const state = ["placed", "placed", "under review", "accepted", "accepted", "rejected"][i % 6]!;
    bids.push({ lotId: lot.id, userId: who, bidNo: `BID-${now.getUTCFullYear()}-${String(300001 + i)}`, amountJpy, overBidJpy: i % 4 === 0 ? 10000 : null, message: i % 5 === 0 ? "Please confirm the inspection before bidding." : null, note: state === "accepted" ? "Within the market. On the sheet." : state === "rejected" ? "Too far under recent prices for this grade." : null, status: state, createdAt: (() => {
      const back = rng.int(1, 13);
      return addDays(now, i % 3 === 0 ? 0 : -back); // a third today, so the desk's day opens with work on it
    })() });
  }
  await chunkInsert(db, s.auctionBids, bids);
  const year = now.getUTCFullYear();
  const orders = Array.from({ length: 7 }, (_, i) => {
    const lot = rng.pick(lots.filter((l) => l.status === "sold"));
    return {
      orderNo: `ORD-${year}-${String(100001 + i).padStart(6, "0")}`,
      lotId: lot.id,
      userId: userIds[rng.pick(customerKeys)]!,
      status: rng.pick(["pending", "approved", "confirmed", "paid", "shipped"]),
      priceJpy: lot.resultPriceJpy,
      createdAt: addDays(now, -rng.int(1, 6)),
    };
  });
  await db.insert(s.auctionOrders).values(orders);
  const enquiries = Array.from({ length: 9 }, (_, i) => {
    const lot = rng.pick(upcoming);
    const answered = i < 5;
    return {
      enqNo: `INQ-${year}-${String(200001 + i).padStart(6, "0")}`,
      lotId: lot.id,
      userId: userIds[rng.pick(customerKeys)]!,
      message: rng.pick([
        "Is the engine in good condition? Any smoke on start?",
        "Can you confirm the mileage is genuine?",
        "What would be the C&F price to my port if I win at the start price?",
        "Does this car have the navigation in English?",
        "Please check if the rust is serious.",
      ]),
      reply: answered ? "Checked with the auction inspector: no major issues reported beyond the sheet. We can bid up to your limit." : null,
      repliedBy: answered ? userIds.agent! : null,
      status: answered ? (i === 0 ? "closed" : "answered") : i % 2 ? "open" : "new",
      createdAt: addDays(now, -rng.int(0, 20)),
      repliedAt: answered ? addDays(now, -rng.int(0, 1)) : null,
    };
  });
  await db.insert(s.auctionEnquiries).values(enquiries);
  // buyers joined over the last two months, not all in the second the demo was made
  await db.execute(sql`update users set created_at = now() - ((('x' || substr(id, 1, 6))::bit(24)::int % 55) || ' days')::interval where kind = 'customer'`);
  return { auctionLots: lots.length, auctionResults: results.length, bids: bids.length };
}
