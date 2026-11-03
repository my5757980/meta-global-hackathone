import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "../db/client";
import * as s from "../db/schema";
import { ensureCustomerConversation, postMessage } from "../services/chat";
import { getInvoiceFull } from "../services/crm";
import { sampleSlip, receiveSlip } from "../services/slips";
import { triggerSora } from "./agent";

/**
 * One whole sale, played for someone watching: the buyer's words and the outside world (a bank, a yard, a shipping line)
 * are scripted; everything the business does in reply is the real FTEs on the live model, with no shortcut.
 * The yard's days are skipped by bringing its next signal forward, so the demo clock and the auction calendar are left alone.
 */
export interface SaleStep {
  at: string;
  who: string;
  kind: "buyer" | "world";
  text: string;
}
export interface DemoSale {
  id: string;
  status: "running" | "done" | "failed";
  startedAt: string;
  finishedAt: string | null;
  buyer: string;
  stage: string;
  steps: SaleStep[];
  conversationId: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  error: string | null;
}

let sale: DemoSale | null = null;
export const currentSale = () => sale;

const NAMES = [["Amani Otieno", "Otieno Auto Traders"], ["Neema Mushi", "Mushi Motors"], ["Grace Banda", "Banda Car Imports"], ["Brian Kamau", "Kamau Fleet Services"]] as const;
const WAIT_MS = 300_000;

async function until<T>(what: string, check: () => Promise<T | null | undefined | false>, ms = WAIT_MS): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await check();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Waited too long for: ${what}`);
    await new Promise((r) => setTimeout(r, 1500));
  }
}

export function startSale(): DemoSale {
  if (sale?.status === "running") return sale;
  const [name, company] = NAMES[Math.floor(Math.random() * NAMES.length)]!;
  const started: DemoSale = { id: randomBytes(6).toString("hex"), status: "running", startedAt: new Date().toISOString(), finishedAt: null, buyer: name, stage: "Starting", steps: [], conversationId: null, invoiceId: null, invoiceNumber: null, error: null };
  sale = started;
  void play(started, name, company).then(
    () => {
      started.status = "done";
      started.stage = "Delivered";
      started.finishedAt = new Date().toISOString();
    },
    (e) => {
      console.error("[demo sale]", e);
      started.status = "failed";
      started.error = String((e as Error)?.message ?? e).slice(0, 300);
      started.finishedAt = new Date().toISOString();
    },
  );
  return started;
}

async function play(sl: DemoSale, name: string, company: string) {
  const step = (kind: SaleStep["kind"], who: string, text: string) => sl.steps.push({ at: new Date().toISOString(), who, kind, text });
  const [role] = await db().select({ id: s.roles.id }).from(s.roles).where(eq(s.roles.slug, "customer")).limit(1);
  const phone = `+2547${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  const [buyer] = await db().insert(s.users).values({ kind: "customer", name, email: `demo-buyer-${randomBytes(4).toString("hex")}@example.com`, phone, company, countryCode: "KE", roleId: role!.id }).returning();
  const conv = await ensureCustomerConversation(buyer!.id, "web");
  sl.conversationId = conv.id;

  const say = async (body: string) => {
    step("buyer", name, body);
    await postMessage({ conversationId: conv.id, senderUserId: buyer!.id, body });
    triggerSora(conv.id, { kind: "message" });
  };
  const [car] = await db()
    .select()
    .from(s.vehicles)
    .where(and(eq(s.vehicles.status, "available"), eq(s.vehicles.published, true), eq(s.vehicles.steering, "Right"), gte(s.vehicles.priceUsd, 6000), lte(s.vehicles.priceUsd, 30000)))
    .orderBy(sql`random()`)
    .limit(1);
  if (!car) throw new Error("No car left to sell: reset the demo");

  // ---- the sale ----
  sl.stage = "Sales";
  await say(`Hello. I want stock car ${car.stockNo} shipped to Mombasa, Kenya. What is the landed price? My name is ${name}, my company is ${company}, phone ${phone}.`);
  await until("the sales FTE's quote", async () => (await db().select({ id: s.quotes.id }).from(s.quotes).where(eq(s.quotes.conversationId, conv.id)).limit(1))[0]);
  await until("the sales FTE to finish writing", async () => (await db().select({ id: s.fteRuns.id }).from(s.fteRuns).where(and(eq(s.fteRuns.conversationId, conv.id), eq(s.fteRuns.status, "running"))).limit(1)).length === 0);
  await say("Yes, I accept this price. Please go ahead and send the invoice.");

  sl.stage = "Invoice";
  const inv = await until("the invoice request", async () => (await db().select({ id: s.invoices.id, number: s.invoices.number }).from(s.invoices).innerJoin(s.leads, eq(s.leads.id, s.invoices.leadId)).where(eq(s.leads.customerUserId, buyer!.id)).orderBy(desc(s.invoices.createdAt)).limit(1))[0]);
  sl.invoiceId = inv.id;
  sl.invoiceNumber = inv.number;
  await until("the invoice desk to send it", async () => (await db().select({ st: s.invoices.status }).from(s.invoices).where(eq(s.invoices.id, inv.id)).limit(1))[0]?.st === "sent");

  // ---- the first payment ----
  sl.stage = "Accounts";
  const full = (await getInvoiceFull(inv.id))!;
  step("world", "Buyer's bank", `The buyer pays the advance and sends a photo of the slip (printed here, because a demo has no bank).`);
  await receiveSlip(buyer!.id, { id: inv.id, number: inv.number }, (await sampleSlip(full, "advance"))!, "image/png", `slip-${inv.number}.png`);
  await until("the accounts desk to record the advance", async () => (await paid(inv.id)) > 0);

  // ---- the yard ----
  sl.stage = "Operations";
  const cars = await db().select({ id: s.invoiceVehicles.id }).from(s.invoiceVehicles).where(eq(s.invoiceVehicles.invoiceId, inv.id));
  const ivId = cars[0]!.id;
  await nextYardDay(step, ivId, "Car Booked", "Auction Details/Pics");
  await nextYardDay(step, ivId, "Inspection/Yard", "Inspection Certificate");
  await nextYardDay(step, ivId, "In Yard", "Yard Pictures");

  // ---- the balance ----
  sl.stage = "Accounts";
  const later = (await getInvoiceFull(inv.id))!;
  await new Promise((r) => setTimeout(r, 4000)); // the buyer reads the reminder
  step("world", "Buyer's bank", "The buyer pays the balance and sends the slip.");
  await receiveSlip(buyer!.id, { id: inv.id, number: inv.number }, (await sampleSlip(later, "balance"))!, "image/png", `slip-balance-${inv.number}.png`);
  await until("the accounts desk to record the balance", async () => (await paid(inv.id)) >= Number(later.totals.total) - 0.01);

  // ---- shipping ----
  sl.stage = "Shipping";
  await nextYardDay(step, ivId, "Shipped", "BL / Surrender");
  await until("the export certificate to be filed", async () => hasDoc(ivId, "Export Certificate"));
  await nextYardDay(step, ivId, "Delivered to port", "DHL");
}

const paid = async (invoiceId: string) => (await db().select({ a: s.payments.amountUsd }).from(s.payments).where(eq(s.payments.invoiceId, invoiceId))).reduce((t, p) => t + Number(p.a), 0);

async function hasDoc(invoiceVehicleId: string, folder: string) {
  const [d] = await db().select({ id: s.unitDocuments.id }).from(s.unitDocuments).innerJoin(s.units, eq(s.units.id, s.unitDocuments.unitId)).where(and(eq(s.units.invoiceVehicleId, invoiceVehicleId), eq(s.unitDocuments.folder, folder))).limit(1);
  return !!d;
}

/** Brings the yard's or the shipping line's next signal forward, then waits for the desks to deal with it. */
async function nextYardDay(step: (k: SaleStep["kind"], who: string, text: string) => void, invoiceVehicleId: string, stage: string, folder: string) {
  const pendingSignal = () => db().select({ id: s.events.id }).from(s.events).where(and(eq(s.events.type, "ops.signal"), eq(s.events.status, "pending"), sql`${s.events.payload}->>'invoiceVehicleId' = ${invoiceVehicleId}`, sql`${s.events.payload}->>'stage' = ${stage}`)).limit(1);
  const [signal] = await until(`the signal for ${stage}`, async () => {
    const rows = await pendingSignal();
    return rows.length ? rows : null;
  });
  step("world", stage === "Shipped" || stage === "Delivered to port" ? "Shipping line" : "Yard", stage === "Delivered to port" ? "Weeks later: the ship reaches the port, and the courier sends the papers. (The demo skips the days.)" : `The next day: "${stage}", with its paperwork. (The demo skips the wait.)`);
  await db().update(s.events).set({ dueAt: new Date(0) }).where(eq(s.events.id, signal!.id));
  await until(`the stage ${stage}`, async () => (await db().select({ id: s.vehicleProgress.id }).from(s.vehicleProgress).where(and(eq(s.vehicleProgress.invoiceVehicleId, invoiceVehicleId), eq(s.vehicleProgress.stage, stage))).limit(1)).length > 0);
  await until(`the document for ${stage}`, () => hasDoc(invoiceVehicleId, folder));
}

/** What to show: the script's lines and the FTEs' real actions, in order. */
export async function saleTimeline(sl: DemoSale) {
  const ids = [sl.invoiceId].filter(Boolean) as string[];
  if (sl.invoiceId) {
    const [inv] = await db().select({ leadId: s.invoices.leadId }).from(s.invoices).where(eq(s.invoices.id, sl.invoiceId)).limit(1);
    if (inv?.leadId) ids.push(inv.leadId);
    const units = await db().select({ id: s.units.id }).from(s.units).where(eq(s.units.invoiceId, sl.invoiceId));
    ids.push(...units.map((u) => u.id));
  }
  const rows = ids.length
    ? await db().select({ at: s.auditLog.createdAt, summary: s.auditLog.summary, who: s.users.name, whoKind: s.users.kind }).from(s.auditLog).leftJoin(s.users, eq(s.users.id, s.auditLog.actorUserId)).where(inArray(s.auditLog.entityId, ids)).orderBy(asc(s.auditLog.createdAt))
    : [];
  const said = sl.conversationId ? await db().select({ at: s.chatMessages.createdAt, body: s.chatMessages.body, who: s.users.name }).from(s.chatMessages).innerJoin(s.users, eq(s.users.id, s.chatMessages.senderUserId)).where(and(eq(s.chatMessages.conversationId, sl.conversationId), eq(s.users.kind, "fte"))).orderBy(asc(s.chatMessages.createdAt)) : [];
  const actions = rows.map((r) => ({ at: new Date(r.at).toISOString(), who: r.who ?? "System", kind: r.whoKind === "fte" ? ("fte" as const) : r.whoKind === "staff" ? ("person" as const) : ("system" as const), text: r.summary }));
  const words = said.filter((m) => m.body?.trim()).map((m) => ({ at: new Date(m.at).toISOString(), who: m.who, kind: "fte-chat" as const, text: `Tells the buyer: ${m.body.trim().replace(/\s+/g, " ").slice(0, 200)}` }));
  const timeline = [...sl.steps, ...actions, ...words].sort((a, b) => a.at.localeCompare(b.at));
  return { timeline, fteSteps: actions.filter((x) => x.kind === "fte").length, personSteps: actions.filter((x) => x.kind === "person").length };
}
