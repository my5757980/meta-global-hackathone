import { eq } from "drizzle-orm";
import type { Tx } from "../db/client";
import * as s from "../db/schema";

/**
 * White-label (FR-074): a new company or AI-employee name reaches the words already written, and the AI's own account.
 * Whole words only: renaming "Sora" leaves "Soraya" alone. Chats, invoices and the audit log are history and keep the
 * name they were written under.
 */
const WRITTEN = [
  [s.homeSections, ["title", "subtitle", "data"]],
  [s.pages, ["title", "body", "seoTitle", "seoDescription"]],
  [s.blogPosts, ["title", "excerpt", "body", "seoTitle", "seoDescription"]],
  [s.services, ["title", "body"]],
  [s.faqs, ["question", "answer"]],
  [s.testimonials, ["text"]],
  [s.locations, ["name"]],
  [s.vehicles, ["description", "seoTitle", "seoDescription"]],
] as const;

const wholeName = (name: string) => new RegExp(`(?<![\\p{L}\\p{N}_])${name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(?![\\p{L}\\p{N}_])`, "gu");

/** Every string inside a value, however deep: a home section's cards are JSON. */
function mapStrings(v: unknown, fn: (t: string) => string): unknown {
  if (typeof v === "string") return fn(v);
  if (Array.isArray(v)) return v.map((x) => mapStrings(x, fn));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapStrings(x, fn)]));
  return v;
}

export async function renameInContent(tx: Tx, names: { company: [string, string]; fte: [string, string] }) {
  const swaps = [names.company, names.fte].filter(([from, to]) => from !== to).map(([from, to]) => [wholeName(from), to] as const);
  if (!swaps.length) return;
  const swap = (t: string) => swaps.reduce((acc, [re, to]) => acc.replace(re, () => to), t);
  for (const [table, cols] of WRITTEN) {
    const t = table as typeof s.pages;
    const rows = (await tx.select().from(t)) as unknown as (Record<string, unknown> & { id: string })[];
    for (const row of rows) {
      const set: Record<string, unknown> = {};
      for (const c of cols) {
        const next = mapStrings(row[c], swap);
        if (JSON.stringify(next) !== JSON.stringify(row[c])) set[c] = next;
      }
      if (Object.keys(set).length) await tx.update(t).set(set).where(eq(t.id, row.id));
    }
  }
  if (names.fte[0] !== names.fte[1]) await tx.update(s.users).set({ name: names.fte[1] }).where(eq(s.users.username, "sora")); // only the sales FTE carries the site's AI name
}
