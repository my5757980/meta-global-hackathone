/** Printable invoice documents in the company's own layout (demo brand): PDF (pdfkit) and Excel (exceljs). */
import ExcelJS from "exceljs";
import { renderPdf } from "./pdf";
import { amountInWords } from "./pricing";
import { siteSettings } from "./settings";
import type { getInvoiceFull } from "./crm";

type Full = NonNullable<Awaited<ReturnType<typeof getInvoiceFull>>>;
const money = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "");

export async function invoicePdf(f: Full): Promise<Buffer> {
  const site = await siteSettings();
  const inv = f.invoice;
  return renderPdf((doc) => {
    const W = doc.page.width;
    const brand = site.primaryColor || "#0f4c81";
    doc.rect(0, 0, W, 92).fill(brand);
    doc.fillColor("#ffffff").fontSize(22).font("Helvetica-Bold").text(site.companyName.toUpperCase(), 48, 28);
    doc.fontSize(9).font("Helvetica").text(`${site.address}  ·  ${site.phone}  ·  ${site.email}`, 48, 58, { width: W - 96 });
    doc.fillColor("#111").font("Helvetica-Bold").fontSize(18).text("INVOICE", 48, 112);
    doc.font("Helvetica").fontSize(10).fillColor("#333");
    doc.text(`Invoice no.: ${inv.number}`, W - 248, 112, { width: 200, align: "right" });
    doc.text(`Date: ${day(inv.approvedAt ?? inv.createdAt)}`, W - 248, 127, { width: 200, align: "right" });
    doc.text(`Status: ${inv.status.toUpperCase()}`, W - 248, 142, { width: 200, align: "right" });

    doc.font("Helvetica-Bold").fontSize(10).fillColor(brand).text("CONSIGNEE", 48, 170);
    doc.font("Helvetica").fillColor("#111").fontSize(10);
    doc.text(inv.consigneeName, 48, 185);
    doc.text(inv.consigneeAddress ?? "", 48, 199, { width: 250 });
    doc.text(`Tel: ${inv.consigneePhone}${inv.consigneeEmail ? `   ${inv.consigneeEmail}` : ""}`, 48, 213, { width: 260 });
    doc.font("Helvetica-Bold").fillColor(brand).text("SHIPMENT", 330, 170);
    doc.font("Helvetica").fillColor("#111");
    doc.text("Port of loading: Yokohama, Japan", 330, 185);
    doc.text(`Port of discharge: ${f.port?.name ?? "-"}${f.country ? `, ${f.country.name}` : ""}`, 330, 199, { width: 220 });
    doc.text(`Terms: C&F · Salesperson: ${inv.salesperson ?? "-"}`, 330, 213, { width: 220 });

    // vehicles table
    let y = 248;
    const cols = [48, 78, 268, 380, 460];
    doc.rect(48, y, W - 96, 22).fill("#eef2f7");
    doc.fillColor("#334").font("Helvetica-Bold").fontSize(9);
    ["#", "Description", "Chassis / colour", "Year", "C&F (USD)"].forEach((h, i) => doc.text(h, cols[i]! + 4, y + 7, { width: i === 4 ? W - 96 - (cols[4]! - 48) - 8 : (cols[i + 1] ?? W) - cols[i]! - 8, align: i === 4 ? "right" : "left" }));
    y += 22;
    doc.font("Helvetica").fontSize(9).fillColor("#111");
    f.vehicles.forEach((v, i) => {
      const h = 34;
      if (y + h > doc.page.height - 200) {
        doc.addPage();
        y = 60;
      }
      doc.rect(48, y, W - 96, h).strokeColor("#e5e7eb").lineWidth(0.5).stroke();
      doc.text(String(i + 1), cols[0]! + 4, y + 8);
      doc.text(`${v.unitLabel}`, cols[1]! + 4, y + 6, { width: cols[2]! - cols[1]! - 8 });
      doc.fillColor("#555").text(`${v.engine ?? ""} ${v.transmission ?? ""} ${v.fuel ?? ""}`.trim(), cols[1]! + 4, y + 19, { width: cols[2]! - cols[1]! - 8 }).fillColor("#111");
      doc.text(`${v.chassisNo ?? "-"}`, cols[2]! + 4, y + 6, { width: cols[3]! - cols[2]! - 8 });
      doc.fillColor("#555").text(`${v.color ?? ""}`, cols[2]! + 4, y + 19).fillColor("#111");
      doc.text(String(v.year ?? ""), cols[3]! + 4, y + 8);
      doc.text(money(Number(v.cnfUsd)), cols[4]! + 4, y + 8, { width: W - 96 - (cols[4]! - 48) - 8, align: "right" });
      y += h;
    });
    y += 12;
    const line = (label: string, val: string, bold = false) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10).fillColor("#111");
      doc.text(label, W - 300, y, { width: 150 });
      doc.text(val, W - 150, y, { width: 102, align: "right" });
      y += 16;
    };
    line("Total C&F", money(f.totals.total), true);
    line(`Advance (${inv.advancePercent}%)`, money(f.totals.advance));
    if (f.totals.paid > 0) line("Received", money(f.totals.paid));
    line("Balance", money(f.totals.balance), true);
    y += 6;
    doc.font("Helvetica-Oblique").fontSize(9).fillColor("#333").text(`Amount in words: ${amountInWords(f.totals.total)} only.`, 48, y, { width: W - 96 });
    y += 30;
    doc.font("Helvetica-Bold").fontSize(10).fillColor(brand).text("BANK DETAILS (pay only to this company account)", 48, y);
    y += 15;
    doc.font("Helvetica").fontSize(9.5).fillColor("#111");
    doc.text(`${site.bank.bankName}, ${site.bank.branch}  ·  SWIFT: ${site.bank.swift}`, 48, y);
    doc.text(`Account name: ${site.bank.accountName}  ·  Account no.: ${site.bank.accountNo}  ·  Reference: ${inv.number}`, 48, y + 13, { width: W - 96 });
    y += 44;
    doc.fontSize(8.5).fillColor("#555").text("Prices are C&F to the port of discharge. Import duty, port charges and clearing at destination are paid by the buyer. The vehicle is reserved for 7 days after the advance payment is received.", 48, y, { width: W - 96 });
    // approval block
    doc.roundedRect(W - 220, doc.page.height - 150, 172, 70, 8).strokeColor(brand).lineWidth(1.2).stroke();
    doc.fillColor(brand).font("Helvetica-Bold").fontSize(9).text(inv.status === "pending" ? "AWAITING APPROVAL" : "APPROVED", W - 212, doc.page.height - 140, { width: 156, align: "center" });
    doc.fillColor("#111").font("Helvetica").fontSize(9).text(f.approvedBy?.name ?? "", W - 212, doc.page.height - 120, { width: 156, align: "center" });
    doc.text("Sales Supervisor", W - 212, doc.page.height - 106, { width: 156, align: "center" });
    doc.fontSize(7.5).fillColor("#999").text("Demo invoice generated by AutoFTE (fictional company)", 48, doc.page.height - 60);
  });
}

export async function invoiceXlsx(f: Full): Promise<Buffer> {
  const site = await siteSettings();
  const inv = f.invoice;
  const wb = new ExcelJS.Workbook();
  wb.creator = "AutoFTE";
  const ws = wb.addWorksheet("Invoice", { pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } } });
  ws.columns = [{ width: 5 }, { width: 34 }, { width: 22 }, { width: 14 }, { width: 8 }, { width: 16 }];
  ws.mergeCells("A1:F1");
  ws.getCell("A1").value = site.companyName.toUpperCase();
  ws.getCell("A1").font = { bold: true, size: 18, color: { argb: "FFFFFFFF" } };
  ws.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + (site.primaryColor || "#0f4c81").replace("#", "").toUpperCase() } };
  ws.getRow(1).height = 30;
  ws.mergeCells("A2:F2");
  ws.getCell("A2").value = `${site.address} · ${site.phone} · ${site.email}`;
  ws.getCell("A2").font = { size: 9, color: { argb: "FF555555" } };
  ws.addRow([]);
  ws.addRow(["", "INVOICE", "", "Invoice no.", "", inv.number]).font = { bold: true };
  ws.addRow(["", "", "", "Date", "", day(inv.approvedAt ?? inv.createdAt)]);
  ws.addRow(["", "Consignee", inv.consigneeName, "Port", "", f.port?.name ?? ""]);
  ws.addRow(["", "Phone / e-mail", `${inv.consigneePhone} ${inv.consigneeEmail ?? ""}`, "Country", "", f.country?.name ?? ""]);
  ws.addRow([]);
  const head = ws.addRow(["#", "Description", "Chassis no.", "Colour", "Year", "C&F (USD)"]);
  head.font = { bold: true };
  head.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F7" } }));
  f.vehicles.forEach((v, i) => {
    const r = ws.addRow([i + 1, `${v.unitLabel} ${v.engine ?? ""} ${v.transmission ?? ""}`.trim(), v.chassisNo ?? "", v.color ?? "", v.year ?? "", Number(v.cnfUsd)]);
    r.getCell(6).numFmt = '"$"#,##0.00';
  });
  ws.addRow([]);
  const t = (label: string, val: number, bold = false) => {
    const r = ws.addRow(["", "", "", label, "", val]);
    r.getCell(6).numFmt = '"$"#,##0.00';
    if (bold) r.font = { bold: true };
  };
  t("Total C&F", f.totals.total, true);
  t(`Advance (${inv.advancePercent}%)`, f.totals.advance);
  if (f.totals.paid > 0) t("Received", f.totals.paid);
  t("Balance", f.totals.balance, true);
  ws.addRow([]);
  const words = ws.addRow(["", `Amount in words: ${amountInWords(f.totals.total)} only.`]);
  ws.mergeCells(`B${words.number}:F${words.number}`);
  words.font = { italic: true, size: 9 };
  ws.addRow([]);
  ws.addRow(["", "BANK DETAILS"]).font = { bold: true };
  ws.addRow(["", `${site.bank.bankName}, ${site.bank.branch} · SWIFT ${site.bank.swift}`]);
  ws.addRow(["", `${site.bank.accountName} · ${site.bank.accountNo} · Reference ${inv.number}`]);
  ws.addRow([]);
  ws.addRow(["", `Approved by: ${f.approvedBy?.name ?? "(awaiting approval)"} — Sales Supervisor`]);
  ws.addRow(["", "Demo invoice generated by AutoFTE (fictional company)"]).font = { size: 8, color: { argb: "FF999999" } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
