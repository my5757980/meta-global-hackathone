/**
 * Auction-sheet reading with Muse Spark Open's vision. The model reads the IMAGE (never the database),
 * returns structured JSON, and the result is cached per lot. The eval suite compares this reading with
 * the lot's true damage list to measure accuracy.
 */
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import * as s from "../db/schema";
import { getLot, toSheetLot } from "../services/auction";
import { sheetPng } from "../services/sheets";
import { chat } from "./model";

export interface SheetReading {
  lot_no?: string | number;
  make_model?: string;
  model_code?: string;
  year?: string | number;
  mileage_km?: number | string;
  grade?: string;
  interior_grade?: string;
  equipment?: string[];
  damage?: { code: string; panel: string; meaning: string }[];
  remarks?: string[];
  verdict?: "good" | "caution" | "avoid";
  reasons?: string[];
  unreadable?: string[];
}

const PROMPT = `You are an expert Japanese used-car auction-sheet inspector working for an exporter.
Read the auction sheet IMAGE carefully and report only what is written on it.
Return ONLY a JSON object with these keys:
{"lot_no":"", "make_model":"", "model_code":"", "year":"", "mileage_km":0, "grade":"", "interior_grade":"",
 "equipment":["circled items only"],
 "damage":[{"code":"A2","panel":"front bumper","meaning":"medium scratch"}],
 "remarks":["inspector's handwritten remarks"],
 "verdict":"good|caution|avoid", "reasons":["short reasons a buyer understands"], "unreadable":["anything you could not read"]}
Damage codes: A scratch, U dent, B dent with scratch, W repaint/wave, S rust, C corrosion, X needs replacing, XX replaced, Y crack/hole, G windscreen stone chip, P paint mark; number 1 small – 3 large.
The car map is a top view: top = front, left side = L, right side = R. List EVERY code written on the map with its panel.
Verdict guide: grade 4.5+ with only minor marks = good; grade 3.5–4 or several marks, repaint or rust = caution; grade R/RA (accident repair), 3 or below, X/XX on structural panels, heavy rust or corrosion = avoid (or caution with clear reasons).`;

export async function readSheet(lotId: string, opts: { fresh?: boolean } = {}): Promise<{ reading: SheetReading; cached: boolean; ms: number }> {
  if (!opts.fresh) {
    const [hit] = await db().select().from(s.sheetReadings).where(eq(s.sheetReadings.lotId, lotId)).limit(1);
    if (hit) return { reading: hit.result as SheetReading, cached: true, ms: 0 };
  }
  const lot = await getLot(lotId);
  if (!lot) throw new Error("Lot not found");
  const png = sheetPng(toSheetLot(lot));
  const t0 = Date.now();
  const r = await chat({
    messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url: `data:image/png;base64,${png.toString("base64")}` } }] as never }],
    effort: "medium",
    maxTokens: 3500,
  });
  const text = r.message.content ?? "";
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let reading: SheetReading;
  try {
    reading = JSON.parse(json);
  } catch {
    reading = { unreadable: ["The sheet could not be read clearly — ask for a clearer photo or a human check."], verdict: "caution", reasons: ["Sheet unreadable"] };
  }
  await db()
    .insert(s.sheetReadings)
    .values({ lotId, result: reading as never, model: r.model })
    .onConflictDoUpdate({ target: s.sheetReadings.lotId, set: { result: reading as never, model: r.model, createdAt: new Date() } });
  return { reading, cached: false, ms: Date.now() - t0 };
}

/** Accuracy of a reading against the lot's true damage list (used by evals). */
export function scoreReading(truth: { code: string; part: string }[], reading: SheetReading, trueGrade: string): { codesFound: number; codesTotal: number; gradeOk: boolean } {
  const got = (reading.damage ?? []).map((d) => String(d.code).toUpperCase().trim());
  let found = 0;
  const pool = [...got];
  for (const t of truth) {
    const i = pool.indexOf(t.code.toUpperCase());
    if (i >= 0) {
      found++;
      pool.splice(i, 1);
    }
  }
  return { codesFound: found, codesTotal: truth.length, gradeOk: String(reading.grade ?? "").replace(/\s/g, "").toUpperCase() === trueGrade.toUpperCase() };
}
