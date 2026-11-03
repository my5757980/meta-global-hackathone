import { createHmac } from "node:crypto";
import { asc, desc } from "drizzle-orm";
import type { DBorTx } from "../db/client";
import { db } from "../db/client";
import * as s from "../db/schema";
import { env } from "../env";

/**
 * The decision ledger. Every authority decision an FTE takes is one signed row; each signature covers the row and the
 * signature before it, so a row changed or removed later breaks the chain and shows.
 */
export interface LedgerEntry {
  workerKey: string;
  task: string;
  entity: string;
  entityId: string | null;
  decision: string;
  reason: string;
  createdAt?: Date;
}

let off = false;
/** While the eval suite runs: its test decisions are removed afterwards, and a signed chain cannot lose a row. */
export const pauseLedger = (v: boolean) => {
  off = v;
};

const sign = (prev: string, seq: number, e: LedgerEntry) => createHmac("sha256", env.SESSION_SECRET).update(JSON.stringify([prev, seq, e.workerKey, e.task, e.entity, e.entityId, e.decision, e.reason])).digest("hex");

export async function recordDecision(e: LedgerEntry, tx: DBorTx = db()) {
  if (off) return null;
  const [last] = await tx.select({ seq: s.fteDecisions.seq, signature: s.fteDecisions.signature }).from(s.fteDecisions).orderBy(desc(s.fteDecisions.seq)).limit(1);
  const seq = (last?.seq ?? 0) + 1;
  const reason = e.reason.slice(0, 600);
  const [row] = await tx.insert(s.fteDecisions).values({ ...e, reason, seq, signature: sign(last?.signature ?? "", seq, { ...e, reason }) }).returning();
  return row!;
}

/** Walks the whole chain. Returns the first row that does not check out, if any. */
export async function verifyLedger(): Promise<{ ok: boolean; rows: number; brokenAt: number | null }> {
  const rows = await db().select().from(s.fteDecisions).orderBy(asc(s.fteDecisions.seq));
  let prev = "";
  for (const r of rows) {
    if (sign(prev, r.seq, r) !== r.signature) return { ok: false, rows: rows.length, brokenAt: r.seq };
    prev = r.signature;
  }
  return { ok: true, rows: rows.length, brokenAt: null };
}
