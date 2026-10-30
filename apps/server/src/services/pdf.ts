import PDFDocument from "pdfkit";

export type PdfDoc = InstanceType<typeof PDFDocument>;

/** Build a PDF in memory with pdfkit and return its bytes. */
export function renderPdf(draw: (doc: PdfDoc) => void, opts: { layout?: "portrait" | "landscape" } = {}): Promise<Buffer> {
  return new Promise((resolveP, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, layout: opts.layout ?? "portrait", info: { Producer: "AutoFTE", Creator: "AutoFTE" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolveP(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      draw(doc);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

/** A simple certificate-style demo document (used for seeded shipping documents). */
export function demoCertificate(title: string, rows: [string, string][], footer: string): Promise<Buffer> {
  return renderPdf((doc) => {
    doc.rect(36, 36, doc.page.width - 72, doc.page.height - 72).lineWidth(1.5).stroke("#0f4c81");
    doc.fillColor("#0f4c81").fontSize(10).text("HIKARI MOTORS CO., LTD. (DEMO COMPANY)", 56, 56);
    doc.fillColor("#111").fontSize(22).text(title, 56, 90, { align: "center", width: doc.page.width - 112 });
    doc.moveDown(0.4).fontSize(9).fillColor("#b91c1c").text("DEMO DOCUMENT — generated for the AutoFTE hackathon demo, not a real certificate", { align: "center" });
    let y = 170;
    for (const [k, v] of rows) {
      doc.fillColor("#555").fontSize(10).text(k, 70, y, { width: 170 });
      doc.fillColor("#111").fontSize(11).text(v, 250, y, { width: doc.page.width - 320 });
      y += 26;
    }
    doc.fillColor("#555").fontSize(9).text(footer, 70, doc.page.height - 120, { width: doc.page.width - 140 });
  });
}
