import { eq } from "drizzle-orm";
import type { WorkerKey } from "@autofte/shared";
import { db } from "../db/client";
import * as s from "../db/schema";
import { env } from "../env";
import { modelConfigured } from "./model";

/**
 * The roster: every seat in the business is held by its own Digital FTE. A role card says what it owns, what it does
 * not own, its tools, how its work is checked and when it stops. The instructions themselves live in a skill file.
 */
export interface WorkerTask {
  key: string;
  label: string;
  level: number; // the default autonomy level
  levels: number[]; // the levels this task can be set to
}
export interface WorkerDef {
  key: WorkerKey;
  username: string;
  skill: string | null; // the skill file holding the role's instructions; the sales FTE has its own prompt
  owns: string[];
  doesNotOwn: string[];
  checkedBy: string;
  stopsWhen: string;
  tools: string[];
  tasks: WorkerTask[];
}

const MONEY = [0, 1, 3]; // a person can review every action, or none inside the limits
const PLAIN = [0, 4]; // no money moves: it does the job, or a person does

export const WORKERS: WorkerDef[] = [
  {
    key: "sales",
    username: "sora",
    skill: null,
    owns: ["Chat with buyers, day and night, in their language", "Finding cars in stock and at auction", "Prices to the port", "Leads and invoice requests", "Bids inside its limit", "Follow-ups and telling buyers what happened"],
    doesNotOwn: ["Approving an invoice", "Recording a payment", "Anything above its discount or bid limit"],
    checkedBy: "Mei checks every invoice it asks for. Prices come from the price engine, never from the model.",
    stopsWhen: "A buyer is angry, asks for a refund or a person, or asks for more than its limits allow.",
    tools: ["search_stock", "get_vehicle", "list_ports", "quote_cnf", "find_or_create_lead", "add_lead_note", "request_invoice", "request_approval", "handover_to_human", "get_customer_record", "update_buyer_profile", "load_skill", "search_auction_lots", "get_auction_lot", "read_auction_sheet", "get_price_history", "place_bid", "schedule_follow_up", "save_buyer_request", "hand_payment_slip", "continue_web_order", "ask_invoice_correction", "update_lead_status"],
    tasks: [{ key: "sales.chat", label: "Answer buyers in the chat", level: 4, levels: PLAIN }],
  },
  {
    key: "invoices",
    username: "mei",
    skill: "invoice-desk",
    owns: ["Checking each invoice request against the rubric", "Pricing an unpriced invoice from the price engine", "Approving or rejecting", "The final PDF and marking it sent", "Correcting a name, phone, e-mail or address on an invoice"],
    doesNotOwn: ["Talking to the buyer", "Recording payments", "Any invoice above her limit"],
    checkedBy: "The rubric runs in code and again inside approve_invoice: a fail cannot be approved. Every decision goes in the signed ledger.",
    stopsWhen: "The invoice is above her limit, or a check fails in a way she cannot fix.",
    tools: ["review_invoice", "price_invoice", "approve_invoice", "reject_invoice", "correct_invoice", "tell_buyer_through_sales", "escalate_to_chief"],
    tasks: [{ key: "invoice.review", label: "Check, approve and send invoices", level: 3, levels: MONEY }],
  },
  {
    key: "accounts",
    username: "ren",
    skill: "accounts-desk",
    owns: ["Reading bank slips", "Matching them to invoices", "Recording payments and the balance", "Filling each unit's costing"],
    doesNotOwn: ["Refunds", "Changing an invoice's price", "Payments above his limit"],
    checkedBy: "record_payment compares his arguments with what the slip really says, checks the company's account on it, and refuses a repeated slip.",
    stopsWhen: "The slip does not show the company's account, the amount does not fit the balance, or it is above his limit.",
    tools: ["read_payment_slip", "find_invoice", "record_payment", "tell_buyer_through_sales", "escalate_to_chief"],
    tasks: [{ key: "payment.record", label: "Read slips and record payments", level: 3, levels: MONEY }],
  },
  {
    key: "operations",
    username: "aoi",
    skill: "operations-desk",
    owns: ["Making a unit for each car once it is paid for", "Reading documents and filing them in the six folders", "Shipping progress stage by stage"],
    doesNotOwn: ["Money", "Talking to the buyer"],
    checkedBy: "file_document refuses a document whose chassis number is for another car. History is append-only.",
    stopsWhen: "A document's chassis does not match any car on the invoice, or it cannot be read.",
    tools: ["get_unit_work", "read_document", "file_document", "update_shipping_progress", "escalate_to_chief"],
    tasks: [
      { key: "ops.units", label: "Units and shipping progress", level: 4, levels: PLAIN },
      { key: "ops.documents", label: "Read and file documents", level: 4, levels: PLAIN },
    ],
  },
  {
    key: "auction",
    username: "kaito",
    skill: "auction-desk",
    owns: ["Answering enquiries about lots from the lot's own record and sheet", "Accepting or declining orders on lots", "Settling orders after a sale"],
    doesNotOwn: ["Placing bids for buyers", "Prices to a port"],
    checkedBy: "Every answer comes from the lot's record, its sheet or past prices. Order moves follow the fixed order of stages.",
    stopsWhen: "An enquiry is about money owed, a dispute, or something the lot's record cannot answer.",
    tools: ["get_auction_enquiry", "answer_enquiry", "review_auction_order", "update_auction_order", "get_auction_lot", "read_auction_sheet", "get_price_history", "escalate_to_chief"],
    tasks: [
      { key: "auction.enquiry", label: "Answer enquiries", level: 4, levels: PLAIN },
      { key: "auction.order", label: "Handle orders", level: 4, levels: PLAIN },
    ],
  },
  {
    key: "crm",
    username: "yuki",
    skill: "crm-desk",
    owns: ["Taking imported leads, giving them an owner and writing to them first", "Reading contact messages, making a lead and answering"],
    doesNotOwn: ["Quoting prices", "Invoices"],
    checkedBy: "Duplicate leads are refused by the server. Answers carry no price.",
    stopsWhen: "A message is a complaint or a legal matter.",
    tools: ["get_contact_message", "reply_contact_message", "find_or_create_lead", "add_lead_note", "first_contact_lead", "reassign_lead", "escalate_to_chief"],
    tasks: [
      { key: "crm.leads", label: "Imported leads", level: 4, levels: PLAIN },
      { key: "crm.contact", label: "Contact messages", level: 4, levels: PLAIN },
    ],
  },
  {
    key: "website",
    username: "hana",
    skill: "website-desk",
    owns: ["Website orders: checking the cars and turning an order into an invoice request", "Writing car listings"],
    doesNotOwn: ["Approving invoices", "Changing prices"],
    checkedBy: "Prices come from the price engine. A listing cannot change a car's price or stock number.",
    stopsWhen: "No car on an order is available any more, or the buyer's port is unknown and Sora cannot ask.",
    tools: ["review_web_order", "update_web_order", "order_to_invoice", "write_listing", "list_ports", "tell_buyer_through_sales", "escalate_to_chief"],
    tasks: [
      { key: "website.order", label: "Website orders", level: 4, levels: PLAIN },
      { key: "website.listing", label: "Car listings", level: 4, levels: PLAIN },
    ],
  },
  {
    key: "chief",
    username: "tomo",
    skill: "chief-of-staff",
    owns: ["The approval queue: everything above another FTE's limit", "Deciding inside his mandate and signing each decision", "Passing the rest to the owner with his opinion", "The daily report"],
    doesNotOwn: ["The limits themselves: the owner sets them", "Refunds, legal matters and disputes: always the owner's"],
    checkedBy: "decide_approval refuses anything above his mandate. Every decision is in the signed ledger, and the owner can overrule it; he reads those overrules before deciding again.",
    stopsWhen: "Something is above his mandate, or it is a kind only the owner decides.",
    tools: ["list_pending_approvals", "get_approval", "decide_approval", "escalate_to_owner"],
    tasks: [{ key: "chief.approvals", label: "Clear the approval queue", level: 3, levels: [0, 3] }],
  },
];

export const workerDef = (key: WorkerKey) => WORKERS.find((w) => w.key === key)!;
export const toolsOf = (key: WorkerKey | undefined) => workerDef(key ?? "sales").tools;

/** Sora's account: the FTE the site's AI name belongs to. */
export async function workerUser(key: WorkerKey) {
  const [row] = await db().select({ user: s.users }).from(s.fteWorkers).innerJoin(s.users, eq(s.users.id, s.fteWorkers.userId)).where(eq(s.fteWorkers.key, key)).limit(1);
  return row?.user ?? null;
}

export async function workerRow(key: WorkerKey) {
  const [row] = await db().select().from(s.fteWorkers).where(eq(s.fteWorkers.key, key)).limit(1);
  return row ?? null;
}

/** True when people do this job: then, and only then, they are told each time one comes in. An owner's attention is not free. */
export async function deskManual(key: WorkerKey, task: string) {
  if (!env.WORKFORCE_ENABLED || !env.FTE_ENABLED || !modelConfigured()) return true;
  const row = await workerRow(key);
  return !row?.enabled || (await levelOf(key, task)) === 0;
}

/** The task's autonomy level right now. */
export async function levelOf(key: WorkerKey, task: string): Promise<number> {
  const row = await workerRow(key);
  const set = (row?.levels ?? {}) as Record<string, number>;
  if (typeof set[task] === "number") return set[task]!;
  return workerDef(key).tasks.find((t) => t.key === task)?.level ?? 0;
}
