import { readFileSync } from "node:fs";
import { getFile } from "../services/files";
import { chat } from "./model";

/**
 * Muse Spark Open reads the PICTURE. The result is kept per file, so the tool that acts next can compare what the FTE
 * claims with what the picture really says. A model's word alone never moves money.
 */
export interface SlipReading {
  is_payment_slip?: boolean;
  amount?: number;
  currency?: string;
  date?: string;
  reference?: string;
  invoice_number?: string;
  beneficiary_name?: string;
  beneficiary_account?: string;
  sender?: string;
  bank?: string;
  unreadable?: string[];
}
export interface DocReading {
  document_type?: string;
  chassis?: string;
  vessel?: string;
  date?: string;
  summary?: string;
  unreadable?: string[];
}

const SLIP_PROMPT = `You work in the accounts office of a car exporter. Read this picture of a bank transfer slip and report only what is written on it. Return ONLY a JSON object:
{"is_payment_slip":true,"amount":0,"currency":"USD","date":"YYYY-MM-DD","reference":"","invoice_number":"","beneficiary_name":"","beneficiary_account":"","sender":"","bank":"","unreadable":["anything you could not read"]}
A line saying SAMPLE or DEMO only marks this company's demo data: read the slip as usual. amount is the transferred amount as a number. reference is the bank's own transaction number. invoice_number is an invoice number written in the payment details, or "" if there is none. If the picture is not a bank transfer slip, set is_payment_slip to false.`;

const DOC_PROMPT = `You work in the shipping office of a car exporter. Read this picture and report only what it shows. Return ONLY a JSON object:
{"document_type":"","chassis":"","vessel":"","date":"YYYY-MM-DD","summary":"one short line","unreadable":["anything you could not read"]}
A line saying SAMPLE or DEMO only marks this company's demo data: read the document as usual.
document_type is one of: "Export Certificate", "Inspection Certificate", "Bill of Lading", "Courier Receipt", "Auction Details", "Yard Picture", "Other". A plain photograph of a car is "Yard Picture". chassis is the chassis number written on the document, exactly as written, or "" if there is none.`;

const slipCache = new Map<string, SlipReading>();
const docCache = new Map<string, DocReading>();
export const slipReadingOf = (fileId: string) => slipCache.get(fileId) ?? null;
export const docReadingOf = (fileId: string) => docCache.get(fileId) ?? null;

async function readPicture<T>(fileId: string, prompt: string, unreadable: T): Promise<T> {
  const f = await getFile(fileId);
  if (!f) return unreadable;
  if (!/^image\/(png|jpeg|webp)$/.test(f.mime)) return unreadable;
  const r = await chat({
    messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:${f.mime};base64,${readFileSync(f.abs).toString("base64")}` } }] as never }],
    effort: "low",
    maxTokens: 1500,
    hedgeMs: 12_000,
  });
  console.log(`[picture] read ${f.originalName ?? fileId} in ${(r.ms / 1000).toFixed(1)} s`);
  const text = r.message.content ?? "";
  try {
    return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as T;
  } catch {
    return unreadable;
  }
}

export async function readSlip(fileId: string): Promise<SlipReading> {
  const hit = slipCache.get(fileId);
  if (hit) return hit;
  const reading = await readPicture<SlipReading>(fileId, SLIP_PROMPT, { is_payment_slip: false, unreadable: ["The picture could not be read."] });
  slipCache.set(fileId, reading);
  return reading;
}

export async function readDocument(fileId: string): Promise<DocReading> {
  const hit = docCache.get(fileId);
  if (hit) return hit;
  const reading = await readPicture<DocReading>(fileId, DOC_PROMPT, { document_type: "Other", unreadable: ["The picture could not be read."] });
  docCache.set(fileId, reading);
  return reading;
}
