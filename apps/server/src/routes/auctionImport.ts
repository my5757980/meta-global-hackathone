import { Router } from "express";
import multer from "multer";
import { eq, inArray, sql } from "drizzle-orm";
import { BODY_TYPES, DRIVES, FUELS, TRANSMISSIONS } from "@autofte/shared";
import { requirePerm } from "../auth/session";
import { db } from "../db/client";
import * as s from "../db/schema";
import { cellText } from "../lib/excel";
import { bad, h } from "../lib/http";
import { today } from "../services/auction";
import { audit } from "../services/audit";
import { isPublicImageUrl } from "../services/lotImages";

/**
 * A real exporter's lots come from wherever it buys its auction data: this is the door they come in by. One Excel file, checked
 * row by row before anything is saved. A lot already held (same day, hall and number) is updated, unless it has been settled.
 */
export const auctionImportRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });

const MAX_ROWS = 5000;
const COLUMNS = ["Sale date", "Auction hall", "Lot no", "Make", "Model", "Model code", "Body type", "Grade", "Interior", "Year", "Colour", "Gearbox", "Fuel", "Drive", "Mileage km", "Engine cc", "Start price JPY", "Average price JPY", "Equipment", "Notes", "Sheet image URL", "Photo URLs"];
const WIDTHS = [12, 24, 8, 12, 18, 12, 11, 7, 8, 7, 12, 11, 9, 7, 11, 10, 15, 16, 28, 24, 36, 36];

auctionImportRouter.get(
  "/lots/template.xlsx",
  h(async (req, res) => {
    requirePerm(req, "auction.lots.import");
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Lots");
    ws.columns = COLUMNS.map((header, i) => ({ header, key: `c${i}`, width: WIDTHS[i] }));
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
    const halls = await db().select({ name: s.auctionHalls.name }).from(s.auctionHalls).orderBy(s.auctionHalls.name);
    const ex = ws.addRow([new Date(Date.parse(await today()) + 7 * 86_400_000).toISOString().slice(0, 10), halls[0]?.name ?? "Yokohama Bay Auction", 4522, "Toyota", "Hilux", "GUN125", "Pickup", "4.5", "B", 2019, "White", "Automatic", "Diesel", "4WD", 62000, 2400, 1450000, 1720000, "AC, PS, PW, ABS, navigation", "Example row - replace it", "https://example.com/sheets/4522.jpg", "https://example.com/4522-1.jpg, https://example.com/4522-2.jpg"]);
    ex.font = { italic: true, color: { argb: "FF64748B" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    const ref = wb.addWorksheet("Allowed values");
    ref.columns = [
      { header: "Auction halls (a new name makes a new hall)", key: "a", width: 42 },
      { header: "Body type", key: "b", width: 12 },
      { header: "Gearbox", key: "c", width: 12 },
      { header: "Fuel", key: "d", width: 10 },
      { header: "Drive", key: "e", width: 8 },
    ];
    ref.getRow(1).font = { bold: true };
    for (let i = 0; i < Math.max(halls.length, BODY_TYPES.length); i++) ref.addRow([halls[i]?.name ?? "", BODY_TYPES[i] ?? "", TRANSMISSIONS[i] ?? "", FUELS[i] ?? "", DRIVES[i] ?? ""]);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="auction-lots-template.xlsx"');
    res.send(Buffer.from(await wb.xlsx.writeBuffer()));
    return undefined;
  }),
);

const number = (t: string) => {
  const n = Number(t.replace(/[,\s¥]/g, ""));
  return t.trim() && Number.isFinite(n) ? n : null;
};
const pick = <T extends string>(allowed: readonly T[], t: string) => allowed.find((x) => x.toLowerCase() === t.toLowerCase());

interface RowResult {
  row: number;
  saleDate: string;
  hall: string;
  lotNo: string;
  car: string;
  status: "ok" | "update" | "duplicate" | "error";
  note: string;
  values?: Omit<typeof s.auctionLots.$inferInsert, "hallId">;
  id?: string;
}

/** Check (dryRun=1) or import. Rows with errors are left out and reported; the rest go in together or not at all. */
auctionImportRouter.post(
  "/lots/import",
  upload.single("file"),
  h(async (req) => {
    const u = requirePerm(req, "auction.lots.import");
    const f = req.file;
    if (!f) throw bad("Attach the Excel file");
    const dry = String(req.query.dryRun ?? "") === "1";
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(f.buffer as unknown as ArrayBuffer);
    } catch {
      throw bad("This is not an Excel .xlsx file - download the template and fill it in");
    }
    const ws = wb.worksheets[0];
    if (!ws) throw bad("The file has no sheet");
    const header = (ws.getRow(1).values as unknown[]).map((v) => cellText(v).trim().toLowerCase());
    const col = (re: RegExp) => header.findIndex((x, i) => i > 0 && re.test(x));
    const ci = {
      date: col(/sale|date/), hall: col(/hall/), lot: col(/^lot/), make: col(/make|brand/), model: col(/^model$/), code: col(/model code|chassis/), body: col(/body/), grade: col(/^grade/), interior: col(/interior/), year: col(/year/), color: col(/colou?r/), gear: col(/gear|transmission/), fuel: col(/fuel/), drive: col(/drive/), km: col(/mileage|\bkm\b/), cc: col(/engine|\bcc\b/), start: col(/start/), avg: col(/average|avg/), equipment: col(/equipment/), notes: col(/note|remark/), sheet: col(/sheet/), photos: col(/photo/),
    };
    const required: [keyof typeof ci, string][] = [["date", "Sale date"], ["hall", "Auction hall"], ["lot", "Lot no"], ["make", "Make"], ["model", "Model"], ["body", "Body type"], ["grade", "Grade"], ["year", "Year"], ["color", "Colour"], ["gear", "Gearbox"], ["km", "Mileage km"], ["start", "Start price JPY"]];
    const missing = required.filter(([k]) => ci[k] < 0).map(([, name]) => name);
    if (missing.length) throw bad(`Use the template: these columns are missing: ${missing.join(", ")}`);
    const raw: { n: number; v: unknown[] }[] = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n > 1) raw.push({ n, v: row.values as unknown[] });
    });
    if (raw.length > MAX_ROWS + 1) throw bad(`Up to ${MAX_ROWS.toLocaleString("en-US")} rows per file`);

    const day = await today();
    const halls = await db().select().from(s.auctionHalls);
    const hallByName = new Map(halls.flatMap((x) => [[x.name.toLowerCase(), x], [x.code.toLowerCase(), x]] as const));
    const newHalls = new Map<string, string>(); // lower-case name -> name as written
    const seen = new Set<string>();
    const rows: RowResult[] = [];
    for (const r of raw) {
      const get = (i: number) => (i > 0 ? cellText(r.v[i]).trim() : "");
      if (/example row/i.test(get(ci.notes))) continue; // the template's sample line
      if (!get(ci.lot) && !get(ci.make) && !get(ci.model)) continue;
      const errs: string[] = [];
      const saleDate = get(ci.date);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) errs.push(saleDate ? `sale date "${saleDate}" must look like 2026-11-20` : "sale date missing");
      else if (saleDate < day) errs.push("this sale date has passed");
      const hallName = get(ci.hall);
      if (hallName.length < 3) errs.push("auction hall missing");
      const lotNo = number(get(ci.lot));
      if (lotNo === null || !Number.isInteger(lotNo) || lotNo < 1 || lotNo > 999999) errs.push("lot number must be a whole number");
      const make = get(ci.make);
      const model = get(ci.model);
      if (!make) errs.push("make missing");
      if (!model) errs.push("model missing");
      const bodyType = pick(BODY_TYPES, get(ci.body));
      if (!bodyType) errs.push(`body type must be one of ${BODY_TYPES.join(", ")}`);
      const grade = get(ci.grade);
      if (!grade) errs.push("grade missing");
      const year = number(get(ci.year));
      if (year === null || !Number.isInteger(year) || year < 1970 || year > Number(day.slice(0, 4)) + 1) errs.push("year looks wrong");
      const color = get(ci.color);
      if (!color) errs.push("colour missing");
      const transmission = pick(TRANSMISSIONS, get(ci.gear));
      if (!transmission) errs.push(`gearbox must be one of ${TRANSMISSIONS.join(", ")}`);
      const fuel = get(ci.fuel) ? pick(FUELS, get(ci.fuel)) : "Petrol";
      if (!fuel) errs.push(`fuel must be one of ${FUELS.join(", ")}`);
      const drive = get(ci.drive) ? pick(DRIVES, get(ci.drive)) : "2WD";
      if (!drive) errs.push(`drive must be one of ${DRIVES.join(", ")}`);
      const km = number(get(ci.km));
      if (km === null || km < 0 || !Number.isInteger(km)) errs.push("mileage must be a whole number of km");
      const cc = get(ci.cc) ? number(get(ci.cc)) : 0;
      if (cc === null || cc < 0 || !Number.isInteger(cc)) errs.push("engine cc must be a whole number");
      const start = number(get(ci.start));
      if (start === null || start <= 0 || !Number.isInteger(start)) errs.push("start price must be a whole number of yen");
      const avg = get(ci.avg) ? number(get(ci.avg)) : null;
      if (get(ci.avg) && (avg === null || avg <= 0 || !Number.isInteger(avg))) errs.push("average price must be a whole number of yen");
      const sheetUrl = get(ci.sheet);
      if (sheetUrl && !isPublicImageUrl(sheetUrl)) errs.push("sheet image URL must be a public http(s) address");
      const photoUrls = get(ci.photos).split(/[\s,]+/).filter(Boolean);
      if (photoUrls.length > 12) errs.push("at most 12 photos");
      if (photoUrls.some((p) => !isPublicImageUrl(p))) errs.push("every photo URL must be a public http(s) address");

      const base = { row: r.n, saleDate, hall: hallName, lotNo: get(ci.lot), car: [year, make, model].filter(Boolean).join(" ") };
      if (errs.length) {
        rows.push({ ...base, status: "error", note: errs.join("; ") });
        continue;
      }
      const key = `${saleDate}|${hallName.toLowerCase()}|${lotNo}`;
      if (seen.has(key)) {
        rows.push({ ...base, status: "duplicate", note: "repeated in this file" });
        continue;
      }
      seen.add(key);
      if (!hallByName.has(hallName.toLowerCase())) newHalls.set(hallName.toLowerCase(), hallName);
      rows.push({
        ...base,
        status: "ok",
        note: hallByName.has(hallName.toLowerCase()) ? "" : "new auction hall",
        values: { saleDate, lotNo: lotNo!, make, model, modelCode: get(ci.code), bodyType: bodyType!, grade, interiorGrade: get(ci.interior) || "-", year: year!, color, transmission: transmission!, fuel: fuel!, drive: drive!, mileageKm: km!, engineCc: cc!, equipment: get(ci.equipment), startPriceJpy: start!, avgPriceJpy: avg, sheetNotes: get(ci.notes) || null, sheetUrl, photoUrls, photoCount: photoUrls.length, status: "upcoming" },
      });
    }

    // a lot already held is updated, unless it has been settled
    const held = new Map<string, { id: string; status: string }>();
    const dates = [...new Set(rows.filter((x) => x.values).map((x) => x.saleDate))];
    if (dates.length) {
      for (const l of await db().select({ id: s.auctionLots.id, saleDate: s.auctionLots.saleDate, hallId: s.auctionLots.hallId, lotNo: s.auctionLots.lotNo, status: s.auctionLots.status }).from(s.auctionLots).where(inArray(s.auctionLots.saleDate, dates))) {
        held.set(`${l.saleDate}|${l.hallId}|${l.lotNo}`, l);
      }
    }
    for (const x of rows) {
      if (!x.values) continue;
      const hall = hallByName.get(x.hall.toLowerCase());
      const had = hall ? held.get(`${x.saleDate}|${hall.id}|${x.values.lotNo}`) : undefined;
      if (!had) continue;
      if (had.status !== "upcoming") {
        x.status = "error";
        x.note = `this lot is already ${had.status}`;
        delete x.values;
      } else {
        x.status = "update";
        x.note = "already held: it will be updated";
        x.id = had.id;
      }
    }

    const good = rows.filter((x) => x.values);
    let imported = 0;
    if (!dry && good.length) {
      await db().transaction(async (tx) => {
        const ids = new Map(halls.flatMap((x) => [[x.name.toLowerCase(), x.id], [x.code.toLowerCase(), x.id]] as const));
        const codes = new Set(halls.map((x) => x.code));
        for (const [lower, name] of newHalls) {
          if (!good.some((x) => x.hall.toLowerCase() === lower)) continue;
          const initials = name.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 4) || "HALL";
          let code = initials;
          for (let i = 2; codes.has(code); i++) code = `${initials}${i}`;
          codes.add(code);
          const [made] = await tx.insert(s.auctionHalls).values({ name, code, region: "Imported" }).returning();
          ids.set(lower, made!.id);
        }
        const excluded = (c: string) => sql.raw(`excluded."${c}"`);
        for (let i = 0; i < good.length; i += 200) {
          const chunk = good.slice(i, i + 200).map((x) => ({ ...x.values!, hallId: ids.get(x.hall.toLowerCase())! }));
          await tx
            .insert(s.auctionLots)
            .values(chunk)
            .onConflictDoUpdate({
              target: [s.auctionLots.saleDate, s.auctionLots.hallId, s.auctionLots.lotNo],
              set: { make: excluded("make"), model: excluded("model"), modelCode: excluded("model_code"), bodyType: excluded("body_type"), grade: excluded("grade"), interiorGrade: excluded("interior_grade"), year: excluded("year"), color: excluded("color"), transmission: excluded("transmission"), fuel: excluded("fuel"), drive: excluded("drive"), mileageKm: excluded("mileage_km"), engineCc: excluded("engine_cc"), equipment: excluded("equipment"), startPriceJpy: excluded("start_price_jpy"), avgPriceJpy: excluded("avg_price_jpy"), sheetNotes: excluded("sheet_notes"), sheetUrl: excluded("sheet_url"), photoUrls: excluded("photo_urls"), photoCount: excluded("photo_count") },
            });
        }
        // an updated lot may have a new sheet: an old reading must not stand for it
        const updated = good.filter((x) => x.id).map((x) => x.id!);
        if (updated.length) await tx.delete(s.sheetReadings).where(inArray(s.sheetReadings.lotId, updated));
      });
      imported = good.length;
      const made = good.filter((x) => x.status === "ok").length;
      await audit(db(), { actorUserId: u.id, actorKind: "human", action: "auction.lots.imported", entity: "lot", summary: `${u.name} imported auction lots from Excel: ${made} new, ${good.length - made} updated` });
    }
    const counts = { total: rows.length, ok: rows.filter((x) => x.status === "ok").length, updates: rows.filter((x) => x.status === "update").length, duplicates: rows.filter((x) => x.status === "duplicate").length, errors: rows.filter((x) => x.status === "error").length };
    const order = { error: 0, duplicate: 1, update: 2, ok: 3 } as const;
    return { dryRun: dry, ...counts, imported, rows: [...rows].sort((a, b) => order[a.status] - order[b.status] || a.row - b.row).slice(0, 300).map(({ values: _v, id: _i, ...rest }) => rest) };
  }),
);
