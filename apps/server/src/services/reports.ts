import ExcelJS from "exceljs";
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "../db/client";
import * as s from "../db/schema";

const range = (from: string, to: string) => ({ start: new Date(`${from}T00:00:00Z`), end: new Date(new Date(`${to}T00:00:00Z`).getTime() + 86400_000) });

export async function reportData(from: string, to: string, opts: { allLeads?: boolean } = {}) {
  const { start, end } = range(from, to);
  const leads = await db()
    .select({ id: s.leads.id, customer: s.leads.customerName, contact: s.leads.contactPerson, country: s.leads.countryCode, status: s.leads.status, createdAt: s.leads.createdAt, agent: s.users.name, agentKind: s.users.kind, agentId: s.users.id })
    .from(s.leads)
    .leftJoin(s.users, eq(s.users.id, s.leads.ownerUserId))
    .where(and(gte(s.leads.createdAt, start), lt(s.leads.createdAt, end)))
    .orderBy(desc(s.leads.createdAt));
  const invoices = await db()
    .select({ id: s.invoices.id, number: s.invoices.number, consignee: s.invoices.consigneeName, status: s.invoices.status, total: s.invoices.totalCnfUsd, createdAt: s.invoices.createdAt, agent: s.users.name, agentKind: s.users.kind, agentId: s.users.id, vehicle: sql<string>`(select unit_label from invoice_vehicles v where v.invoice_id = ${s.invoices.id} order by position limit 1)`, chassis: sql<string>`(select chassis_no from invoice_vehicles v where v.invoice_id = ${s.invoices.id} order by position limit 1)` })
    .from(s.invoices)
    .leftJoin(s.users, eq(s.users.id, s.invoices.requestedBy))
    .where(and(gte(s.invoices.createdAt, start), lt(s.invoices.createdAt, end)))
    .orderBy(desc(s.invoices.createdAt));
  const units = await db()
    .select({ id: s.units.id, make: s.units.make, model: s.units.model, chassis: s.units.chassis, color: s.units.color, createdAt: s.units.createdAt, invoice: s.invoices.number, agentId: s.users.id, agent: s.users.name, agentKind: s.users.kind })
    .from(s.units)
    .innerJoin(s.invoices, eq(s.invoices.id, s.units.invoiceId))
    .leftJoin(s.users, eq(s.users.id, s.units.createdBy))
    .where(and(gte(s.units.createdAt, start), lt(s.units.createdAt, end)));
  const payments = await db()
    .select({ total: sql<number>`coalesce(sum(${s.payments.amountUsd}),0)::float` })
    .from(s.payments)
    .where(and(gte(s.payments.createdAt, start), lt(s.payments.createdAt, end)));
  const agents = new Map<string, { name: string; kind: string; leads: number; invoices: number; units: number; value: number }>();
  for (const l of leads) {
    if (!l.agentId) continue;
    const a = agents.get(l.agentId) ?? { name: l.agent ?? "", kind: l.agentKind ?? "staff", leads: 0, invoices: 0, units: 0, value: 0 };
    a.leads++;
    agents.set(l.agentId, a);
  }
  for (const i of invoices) {
    if (!i.agentId) continue;
    const a = agents.get(i.agentId) ?? { name: i.agent ?? "", kind: i.agentKind ?? "staff", leads: 0, invoices: 0, units: 0, value: 0 };
    a.invoices++;
    if (i.status !== "rejected") a.value += Number(i.total);
    agents.set(i.agentId, a);
  }
  for (const u of units) {
    if (!u.agentId) continue;
    const a = agents.get(u.agentId) ?? { name: u.agent ?? "", kind: u.agentKind ?? "staff", leads: 0, invoices: 0, units: 0, value: 0 };
    a.units++;
    agents.set(u.agentId, a);
  }
  return {
    from,
    to,
    totals: { leads: leads.length, invoices: invoices.length, units: units.length, invoicedValue: Math.round(invoices.filter((i) => i.status !== "rejected").reduce((x, i) => x + Number(i.total), 0) * 100) / 100, received: Math.round((payments[0]?.total ?? 0) * 100) / 100 },
    perAgent: [...agents.entries()].map(([id, a]) => ({ id, ...a, value: Math.round(a.value * 100) / 100 })).sort((x, y) => y.value - x.value),
    leads: opts.allLeads ? leads : leads.slice(0, 300),
    invoices,
    units,
  };
}

/** One agent's work in a period: what the drill-down opens. */
export async function reportDetail(userId: string, from: string, to: string) {
  const d = await reportData(from, to, { allLeads: true });
  return { leads: d.leads.filter((x) => x.agentId === userId), invoices: d.invoices.filter((x) => x.agentId === userId), units: d.units.filter((x) => x.agentId === userId) };
}

const csvCell = (v: unknown) => {
  const t = v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  // a cell starting with these opens as a formula in a spreadsheet
  const safe = /^[=+\-@]/.test(t) ? `'${t}` : t;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const csvRows = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

/** The period as CSV: everyone's totals, or one agent's leads, invoices and units. */
export async function reportCsv(from: string, to: string, userId?: string) {
  const d = await reportData(from, to);
  if (!userId) {
    const rows: unknown[][] = [["Agent", "Leads", "Invoices", "Units", "Value (C&F USD)"]];
    for (const a of d.perAgent) rows.push([a.name, a.leads, a.invoices, a.units, a.value]);
    rows.push(["Total", d.totals.leads, d.totals.invoices, d.totals.units, d.totals.invoicedValue]);
    return `\ufeff${csvRows(rows)}`;
  }
  const one = await reportDetail(userId, from, to);
  const rows: unknown[][] = [["Kind", "Reference", "Customer or vehicle", "Status", "Value (USD)", "Date"]];
  for (const l of one.leads) rows.push(["Lead", "", l.customer, l.status, "", l.createdAt]);
  for (const i of one.invoices) rows.push(["Invoice", i.number, i.consignee, i.status, i.total, i.createdAt]);
  for (const u of one.units) rows.push(["Unit", u.chassis ?? "", `${u.make} ${u.model}`, "", "", u.createdAt]);
  return `\ufeff${csvRows(rows)}`;
}

function sheet(wb: ExcelJS.Workbook, name: string, cols: { header: string; key: string; width?: number }[], rows: Record<string, unknown>[]) {
  const ws = wb.addWorksheet(name);
  ws.columns = cols.map((c) => ({ ...c, width: c.width ?? 18 }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F7" } };
  rows.forEach((r) => ws.addRow(r));
  return ws;
}

export async function reportXlsx(from: string, to: string): Promise<Buffer> {
  const d = await reportData(from, to);
  const wb = new ExcelJS.Workbook();
  sheet(wb, "Summary", [{ header: "Metric", key: "k", width: 28 }, { header: "Value", key: "v", width: 18 }], [
    { k: "Period", v: `${from} → ${to}` },
    { k: "Leads", v: d.totals.leads },
    { k: "Invoices", v: d.totals.invoices },
    { k: "Units", v: d.totals.units },
    { k: "Invoiced value (USD)", v: d.totals.invoicedValue },
    { k: "Payments received (USD)", v: d.totals.received },
  ]);
  sheet(wb, "Per agent", [{ header: "Agent", key: "name", width: 24 }, { header: "Leads", key: "leads" }, { header: "Invoices", key: "invoices" }, { header: "Value (USD)", key: "value" }], d.perAgent.map((a) => ({ ...a, name: a.kind === "fte" ? `${a.name} (Digital FTE)` : a.name })));
  sheet(wb, "Leads", [{ header: "Customer", key: "customer", width: 28 }, { header: "Contact", key: "contact", width: 22 }, { header: "Country", key: "country", width: 10 }, { header: "Status", key: "status" }, { header: "Agent", key: "agent", width: 20 }, { header: "Created", key: "createdAt", width: 22 }], d.leads);
  sheet(wb, "Invoices", [{ header: "Invoice", key: "number" }, { header: "Consignee", key: "consignee", width: 28 }, { header: "Vehicle", key: "vehicle", width: 28 }, { header: "Chassis", key: "chassis" }, { header: "C&F (USD)", key: "total" }, { header: "Status", key: "status" }, { header: "Agent", key: "agent", width: 20 }, { header: "Created", key: "createdAt", width: 22 }], d.invoices);
  sheet(wb, "Units", [{ header: "Invoice", key: "invoice" }, { header: "Make", key: "make" }, { header: "Model", key: "model", width: 22 }, { header: "Chassis", key: "chassis" }, { header: "Colour", key: "color" }, { header: "Added", key: "createdAt", width: 22 }], d.units);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** The same report as a Word document. */
export async function reportDocx(from: string, to: string): Promise<Buffer> {
  const d = await reportData(from, to);
  const when = (v: unknown) => (v ? new Date(String(v)).toISOString().slice(0, 10) : "");
  const table = (head: string[], rows: (string | number | null | undefined)[][]) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [head, ...rows].map(
        (cells, r) =>
          new TableRow({
            tableHeader: r === 0,
            children: cells.map((c) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(c ?? ""), bold: r === 0, size: 18 })] })] })),
          }),
      ),
    });
  const heading = (text: string) => new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 100 } });
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: "Sales report", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: `${from} to ${to}`, spacing: { after: 200 } }),
          table(["Leads", "Invoices", "Units", "Invoiced value (USD)", "Payments received (USD)"], [[d.totals.leads, d.totals.invoices, d.totals.units, d.totals.invoicedValue, d.totals.received]]),
          heading("Per agent"),
          table(["Agent", "Leads", "Invoices", "Value (USD)"], d.perAgent.map((a) => [a.kind === "fte" ? `${a.name} (Digital FTE)` : a.name, a.leads, a.invoices, a.value])),
          heading("Leads"),
          table(["Customer", "Contact", "Country", "Status", "Agent", "Created"], d.leads.map((l) => [l.customer, l.contact, l.country, l.status, l.agent, when(l.createdAt)])),
          heading("Invoices"),
          table(["Invoice", "Consignee", "Vehicle", "Chassis", "C&F (USD)", "Status", "Agent", "Created"], d.invoices.map((i) => [i.number, i.consignee, i.vehicle, i.chassis, Number(i.total), i.status, i.agent, when(i.createdAt)])),
          heading("Units"),
          table(["Invoice", "Make", "Model", "Chassis", "Colour", "Added"], d.units.map((u) => [u.invoice, u.make, u.model, u.chassis, u.color, when(u.createdAt)])),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

/** Manager's full backup: every CRM table in one workbook. */
export async function backupXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const leads = await db().select().from(s.leads);
  const invoices = await db().select().from(s.invoices);
  const ivs = await db().select().from(s.invoiceVehicles);
  const payments = await db().select().from(s.payments);
  const units = await db().select().from(s.units);
  const fin = await db().select().from(s.unitFinancials);
  const toCols = (row?: Record<string, unknown>) => Object.keys(row ?? {}).map((k) => ({ header: k, key: k, width: 18 }));
  sheet(wb, "Leads", toCols(leads[0]), leads);
  sheet(wb, "Invoices", toCols(invoices[0]), invoices);
  sheet(wb, "Invoice Vehicles", toCols(ivs[0]), ivs);
  sheet(wb, "Payments", toCols(payments[0]), payments);
  sheet(wb, "Units", toCols(units[0]), units);
  sheet(wb, "Financial", toCols(fin[0]), fin);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
