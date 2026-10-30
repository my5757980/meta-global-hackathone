/** Demo shipping documents + yard pictures for the showcase customer's paid unit(s). All clearly marked DEMO. */
import { eq } from "drizzle-orm";
import type { DB } from "../db/client";
import * as s from "../db/schema";
import { saveFile } from "../services/files";
import { demoCertificate } from "../services/pdf";
import { carSvg } from "../services/carArt";
import { colorHex } from "./catalog";

export async function seedDocuments(db: DB, unitIds: string[], uploaderId: string): Promise<number> {
  let n = 0;
  for (const unitId of unitIds) {
    const [u] = await db.select().from(s.units).where(eq(s.units.id, unitId)).limit(1);
    if (!u) continue;
    const label = `${u.year ?? ""} ${u.make} ${u.model}`.trim();
    const common: [string, string][] = [
      ["Vehicle", label],
      ["Chassis No.", u.chassis ?? "-"],
      ["Engine", u.engineCc ? `${u.engineCc} cc` : "EV"],
      ["Colour", u.color ?? "-"],
      ["Mileage", u.mileageKm ? `${u.mileageKm.toLocaleString("en-US")} km` : "-"],
    ];
    const docs: { folder: string; name: string; buf: Buffer; mime: string }[] = [
      {
        folder: "Export Certificate",
        name: "export-certificate.pdf",
        mime: "application/pdf",
        buf: await demoCertificate("EXPORT CERTIFICATE (DEMO)", [...common, ["Exporter", "Hikari Motors Co., Ltd. (demo)"], ["Certificate No.", `EC-DEMO-${unitId.slice(-6).toUpperCase()}`]], "Issued for demonstration only. In a real export this document is issued by the Japanese transport bureau after de-registration."),
      },
      {
        folder: "Inspection Certificate",
        name: "inspection-certificate.pdf",
        mime: "application/pdf",
        buf: await demoCertificate("PRE-SHIPMENT INSPECTION CERTIFICATE (DEMO)", [...common, ["Result", "PASSED — roadworthy, radiation check clear"], ["Inspector", "Kaigan Inspection Services (demo)"]], "Demo inspection certificate for the AutoFTE demo."),
      },
      {
        folder: "BL / Surrender",
        name: "bill-of-lading.pdf",
        mime: "application/pdf",
        buf: await demoCertificate("BILL OF LADING (DEMO)", [...common, ["Vessel", "Pacific Star (demo) V.026"], ["Port of loading", "Yokohama, Japan"], ["Port of discharge", "Mombasa, Kenya"], ["B/L No.", `BWRL-DEMO-${unitId.slice(-5).toUpperCase()}`], ["Release", "Telex release (surrendered)"]], "Demo B/L issued by BlueWave RoRo Lines (demo)."),
      },
      {
        folder: "DHL",
        name: "courier-receipt.pdf",
        mime: "application/pdf",
        buf: await demoCertificate("COURIER RECEIPT (DEMO)", [["Courier", "Harbor Express Courier (demo)"], ["Tracking No.", `HX${unitId.slice(-8).toUpperCase()}`], ["Contents", "Original export certificate + commercial invoice"], ["Vehicle", label]], "Demo courier receipt."),
      },
    ];
    const body = u.model.match(/Hilux/i) ? "Pickup" : u.model.match(/Hiace|Caravan|Every/i) ? "Van" : "SUV";
    for (const view of ["side", "front", "rear"] as const) {
      docs.push({ folder: "Yard Pictures", name: `yard-${view}.svg`, mime: "image/svg+xml", buf: Buffer.from(carSvg({ body, color: colorHex(u.color ?? "Silver"), view }), "utf8") });
    }
    for (const d of docs) {
      const f = await saveFile(d.buf, { kind: "unit-docs", mime: d.mime, originalName: d.name, ownerUserId: uploaderId }, db);
      await db.insert(s.unitDocuments).values({ unitId, folder: d.folder, fileId: f.id });
      n++;
    }
  }
  return n;
}
