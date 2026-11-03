import { randomBytes } from "node:crypto";
import { ensureCustomerConversation, postMessage } from "./chat";
import type { getInvoiceFull } from "./crm";
import { emit } from "./events";
import { saveFile } from "./files";
import { slipPng } from "./ops";
import { now, siteSettings } from "./settings";

type Full = NonNullable<Awaited<ReturnType<typeof getInvoiceFull>>>;

/** The buyer's slip lands in their chat, where staff can see it too, and on the accounts desk. */
export async function receiveSlip(userId: string, invoice: { id: string; number: string }, buf: Buffer, mime: string, name: string) {
  const f = await saveFile(buf, { kind: "chat-image", mime, originalName: name, ownerUserId: userId });
  const conv = await ensureCustomerConversation(userId, "web");
  await postMessage({ conversationId: conv.id, senderUserId: userId, kind: "image", body: `Payment slip for invoice ${invoice.number}`, fileIds: [f.id], meta: { slip: true } });
  await emit("payment.slip", { fileId: f.id, buyerUserId: userId, invoiceId: invoice.id });
  return { ok: true, message: "Accounts are checking your slip. You will hear in your chat." };
}

/** The demo has no bank: this prints the slip a buyer would photograph, with this invoice's real figures. */
export async function sampleSlip(full: Full, part: "advance" | "balance") {
  const owed = part === "advance" ? Math.min(full.totals.advance, full.totals.balance) : full.totals.balance;
  if (!(owed > 0)) return null;
  const site = await siteSettings();
  const t = await now();
  return slipPng({ amountUsd: owed, date: t.toISOString().slice(0, 10), reference: `TT${t.toISOString().slice(2, 10).replace(/-/g, "")}${randomBytes(3).toString("hex").toUpperCase()}`, invoiceNumber: full.invoice.number, beneficiaryName: site.bank.accountName, beneficiaryAccount: site.bank.accountNo, bank: site.bank.bankName, sender: full.invoice.consigneeName });
}
