/**
 * Our own auction-sheet generator: a realistic inspection-sheet layout filled from the lot's data
 * (grade, interior, mileage, equipment, damage codes marked on a car map, inspector's notes),
 * rendered to PNG with resvg. Sora reads THE IMAGE with Muse Spark Open's vision — the database
 * truth is used only to score that reading in the evals.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { filesDir } from "../env";

export interface SheetLot {
  id: string;
  hallName: string;
  hallCode: string;
  saleDate: string;
  lotNo: number;
  make: string;
  model: string;
  modelCode: string;
  year: number;
  engineCc: number;
  transmission: string;
  fuel: string;
  drive: string;
  mileageKm: number;
  color: string;
  grade: string;
  interiorGrade: string;
  equipment: string;
  damage: { code: string; part: string }[];
  sheetNotes: string | null;
  startPriceJpy: number;
}

const POS: Record<string, [number, number]> = {
  "front bumper": [500, 318],
  bonnet: [500, 410],
  windscreen: [500, 492],
  roof: [500, 630],
  "left front fender": [352, 420],
  "right front fender": [648, 420],
  "left front door": [342, 575],
  "right front door": [658, 575],
  "left rear door": [342, 705],
  "right rear door": [658, 705],
  "left rear quarter": [352, 830],
  "right rear quarter": [648, 830],
  "tailgate/boot": [500, 880],
  "rear bumper": [500, 958],
  "left sill": [292, 640],
  "right sill": [708, 640],
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function sheetSvg(l: SheetLot): string {
  const seed = hash(l.id);
  const jitter = (n: number) => ((seed >> n) % 9) - 4;
  const box = (x: number, y: number, w: number, h: number, label: string, value: string, big = false) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="#3b3b3b" stroke-width="1.5"/>` +
    `<text x="${x + 8}" y="${y + 18}" font-size="13" fill="#555" font-family="Arial, Helvetica, sans-serif">${esc(label)}</text>` +
    `<text x="${x + w / 2}" y="${y + h - (big ? 18 : 14)}" font-size="${big ? 40 : 22}" text-anchor="middle" fill="#1a2b6d" font-family="Georgia, 'Times New Roman', serif" font-style="italic">${esc(value)}</text>`;
  const equip = l.equipment.split(/\s+/).filter(Boolean);
  const allEquip = ["AC", "PS", "PW", "AB", "ABS", "NAVI", "TV", "BC", "SR", "LEATHER", "AW", "ETC", "SMART KEY", "LED", "CRUISE", "360CAM", "DVD"];
  const marks = l.damage
    .map((d, i) => {
      const p = POS[d.part];
      if (!p) return "";
      const [x, y] = p;
      return `<text x="${x + jitter(i % 20)}" y="${y + jitter((i + 3) % 20)}" font-size="30" font-weight="bold" fill="#c81e1e" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-style="italic" transform="rotate(${jitter(i + 5)} ${x} ${y})">${esc(d.code)}</text>`;
    })
    .join("");
  const notes = (l.sheetNotes || "No remarks").split(/\.\s*/).filter(Boolean);
  const gradeCircle = `<ellipse cx="900" cy="235" rx="62" ry="48" fill="none" stroke="#c81e1e" stroke-width="4" transform="rotate(-8 900 235)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1400" viewBox="0 0 1000 1400">
  <rect width="1000" height="1400" fill="#fbf8ef"/>
  <rect x="20" y="20" width="960" height="1360" fill="none" stroke="#3b3b3b" stroke-width="3"/>
  <rect x="20" y="20" width="960" height="70" fill="#e9e3cf" stroke="#3b3b3b" stroke-width="2"/>
  <text x="40" y="65" font-size="30" font-weight="bold" fill="#222" font-family="Arial, Helvetica, sans-serif">AUCTION INSPECTION SHEET</text>
  <text x="960" y="50" font-size="16" text-anchor="end" fill="#333" font-family="Arial, Helvetica, sans-serif">${esc(l.hallName)} (${esc(l.hallCode)})</text>
  <text x="960" y="75" font-size="16" text-anchor="end" fill="#333" font-family="Arial, Helvetica, sans-serif">Sale date ${esc(l.saleDate)}</text>
  ${box(40, 110, 200, 70, "LOT No.", String(l.lotNo))}
  ${box(250, 110, 330, 70, "MAKE / MODEL", `${l.make} ${l.model}`)}
  ${box(590, 110, 210, 70, "MODEL CODE", l.modelCode)}
  ${box(40, 190, 140, 70, "YEAR", String(l.year))}
  ${box(190, 190, 150, 70, "ENGINE cc", l.engineCc ? String(l.engineCc) : "EV")}
  ${box(350, 190, 130, 70, "TRANS.", l.transmission === "Automatic" ? "AT" : l.transmission === "Manual" ? "MT" : "CVT")}
  ${box(490, 190, 130, 70, "FUEL", l.fuel)}
  ${box(630, 190, 170, 70, "COLOUR", l.color)}
  <rect x="810" y="110" width="170" height="190" fill="#fff" stroke="#3b3b3b" stroke-width="1.5"/>
  <text x="818" y="128" font-size="13" fill="#555" font-family="Arial, Helvetica, sans-serif">OVERALL GRADE</text>
  <text x="900" y="252" font-size="72" text-anchor="middle" fill="#1a2b6d" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-weight="bold">${esc(l.grade)}</text>
  ${gradeCircle}
  ${box(40, 270, 250, 70, "MILEAGE (km)", l.mileageKm.toLocaleString("en-US"))}
  ${box(300, 270, 160, 70, "INTERIOR", l.interiorGrade)}
  ${box(470, 270, 160, 70, "DRIVE", l.drive)}
  ${box(640, 270, 160, 70, "START ¥", (l.startPriceJpy / 1000).toLocaleString("en-US") + "k")}
  <text x="40" y="380" font-size="15" fill="#555" font-family="Arial, Helvetica, sans-serif">EQUIPMENT</text>
  ${allEquip
    .map((e, i) => {
      const x = 40 + (i % 9) * 104;
      const y = 410 + Math.floor(i / 9) * 34;
      const on = equip.includes(e);
      return `<text x="${x}" y="${y}" font-size="16" fill="${on ? "#111" : "#aaa"}" font-family="Arial, Helvetica, sans-serif">${esc(e)}</text>${on ? `<ellipse cx="${x + e.length * 5}" cy="${y - 6}" rx="${e.length * 6 + 10}" ry="15" fill="none" stroke="#c81e1e" stroke-width="2"/>` : ""}`;
    })
    .join("")}
  <g transform="translate(0,182)">
    <rect x="230" y="300" width="540" height="700" fill="none" stroke="#999" stroke-width="1" stroke-dasharray="6 4"/>
    <rect x="370" y="300" width="260" height="680" rx="70" fill="#fff" stroke="#222" stroke-width="3"/>
    <path d="M392,470 L608,470 L585,535 L415,535 Z" fill="none" stroke="#222" stroke-width="2"/>
    <rect x="415" y="545" width="170" height="200" rx="16" fill="none" stroke="#222" stroke-width="2"/>
    <path d="M415,760 L585,760 L600,820 L400,820 Z" fill="none" stroke="#222" stroke-width="2"/>
    <rect x="345" y="380" width="22" height="70" rx="6" fill="#222"/><rect x="633" y="380" width="22" height="70" rx="6" fill="#222"/>
    <rect x="345" y="790" width="22" height="70" rx="6" fill="#222"/><rect x="633" y="790" width="22" height="70" rx="6" fill="#222"/>
    <line x1="370" y1="640" x2="630" y2="640" stroke="#bbb" stroke-width="1"/>
    <text x="500" y="295" font-size="13" text-anchor="middle" fill="#777" font-family="Arial, Helvetica, sans-serif">FRONT</text>
    <text x="500" y="1018" font-size="13" text-anchor="middle" fill="#777" font-family="Arial, Helvetica, sans-serif">REAR</text>
    <text x="250" y="650" font-size="13" fill="#777" font-family="Arial, Helvetica, sans-serif">L</text>
    <text x="740" y="650" font-size="13" fill="#777" font-family="Arial, Helvetica, sans-serif">R</text>
    ${marks}
  </g>
  <text x="40" y="1200" font-size="13" fill="#555" font-family="Arial, Helvetica, sans-serif">KEY: A scratch · U dent · B dent+scratch · W repaint/wave · S rust · C corrosion · X replace · XX replaced · Y crack · G stone chip · P paint mark (1 small – 3 large)</text>
  <rect x="40" y="1212" width="920" height="140" fill="#fff" stroke="#3b3b3b" stroke-width="1.5"/>
  <text x="50" y="1234" font-size="13" fill="#555" font-family="Arial, Helvetica, sans-serif">INSPECTOR'S REMARKS</text>
  ${notes.map((n, i) => `<text x="${70 + jitter(i)}" y="${1268 + i * 28}" font-size="24" fill="#1a2b6d" font-family="Georgia, 'Times New Roman', serif" font-style="italic" transform="rotate(${jitter(i + 1) / 3} 70 ${1268 + i * 28})">${esc(n)}.</text>`).join("")}
  <circle cx="900" cy="1300" r="38" fill="none" stroke="#c81e1e" stroke-width="3"/><text x="900" y="1306" font-size="14" text-anchor="middle" fill="#c81e1e" font-family="Arial, Helvetica, sans-serif">INSP ${10 + (seed % 80)}</text>
  <text x="980" y="1372" font-size="11" text-anchor="end" fill="#999" font-family="Arial, Helvetica, sans-serif">Generated demo sheet · AutoFTE · fictional auction</text>
</svg>`;
}

const sheetsDir = resolve(filesDir, "sheets");

export function sheetPath(lotId: string): string {
  return resolve(sheetsDir, `${lotId}.png`);
}

/** Render (once) and return the PNG bytes. */
export function sheetPng(l: SheetLot): Buffer {
  const p = sheetPath(l.id);
  if (existsSync(p)) return readFileSync(p);
  mkdirSync(sheetsDir, { recursive: true });
  const png = new Resvg(sheetSvg(l), { fitTo: { mode: "width", value: 1000 }, font: { loadSystemFonts: true, defaultFontFamily: "Arial" } }).render().asPng();
  writeFileSync(p, png);
  return png;
}
