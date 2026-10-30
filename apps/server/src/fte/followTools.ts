import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import * as s from "../db/schema";
import { audit } from "../services/audit";
import { emit } from "../services/events";
import { now } from "../services/settings";
import { ToolError } from "./errors";
import type { ToolDef } from "./tools";

/** Sora keeps its own promises: follow-ups at a time it chose, and buyer wishes it remembers until stock arrives. */
export const FOLLOW_TOOLS: ToolDef[] = [
  {
    name: "schedule_follow_up",
    description:
      "Schedule yourself to message this buyer again later — when they say 'next week', 'after payday', 'after I talk to my partner', or you promised to check back. You will be woken at that time with your reason. Max 3 pending per buyer.",
    input: {
      in_hours: z.number().min(1).max(720).describe("How many hours from now (24 = tomorrow, 168 = next week)"),
      reason: z.string().min(5).max(300).describe("What to do then, e.g. 'ask if he decided on HK-10021 after talking to his partner'"),
    },
    async run(a, ctx) {
      if (!ctx.conversationId) throw new ToolError("No conversation to follow up");
      const [{ n }] = (await db()
        .select({ n: sql<number>`count(*)::int` })
        .from(s.events)
        .where(and(eq(s.events.type, "sora.followup"), eq(s.events.status, "pending"), sql`${s.events.payload}->>'conversationId' = ${ctx.conversationId}`))) as [{ n: number }];
      if (n >= 3) throw new ToolError("Three follow-ups are already scheduled for this buyer");
      const due = new Date((await now()).getTime() + Number(a.in_hours) * 3600_000);
      await emit("sora.followup", { conversationId: ctx.conversationId, reason: String(a.reason) }, { dueAt: due });
      await audit(db(), { actorUserId: ctx.principalUserId, actorKind: ctx.principalKind, action: "followup.scheduled", entity: "conversation", entityId: ctx.conversationId, summary: `Follow-up in ${a.in_hours} h: ${String(a.reason).slice(0, 140)}`, conversationId: ctx.conversationId, fteRunId: ctx.runId });
      return { scheduled_for: due.toISOString(), message: "Tell the buyer when you will get back to them." };
    },
  },
  {
    name: "save_buyer_request",
    description:
      "Remember what the buyer wants when no car in stock fits (model, budget, year, fuel, body type). When a matching car arrives in stock you will be told, so you can message them first. Use after search_stock found nothing suitable.",
    input: {
      make: z.string().max(40).optional(),
      model: z.string().max(40).optional(),
      body_type: z.string().max(30).optional(),
      fuel: z.string().max(20).optional(),
      max_price_usd: z.number().positive().optional().describe("FOB budget in USD"),
      min_year: z.number().int().min(1990).max(2030).optional(),
      note: z.string().max(300).optional().describe("Anything else, in the buyer's words"),
    },
    async run(a, ctx) {
      if (!ctx.buyerUserId) throw new ToolError("No buyer in this conversation");
      const criteria = Object.fromEntries(Object.entries({ make: a.make, model: a.model, bodyType: a.body_type, fuel: a.fuel, maxPriceUsd: a.max_price_usd, minYear: a.min_year, note: a.note }).filter(([, v]) => v !== undefined && v !== ""));
      if (!criteria.make && !criteria.model && !criteria.bodyType && !criteria.maxPriceUsd) throw new ToolError("Give at least a make, model, body type or budget");
      const [row] = await db().insert(s.buyerRequests).values({ customerUserId: ctx.buyerUserId, conversationId: ctx.conversationId ?? null, criteria }).returning();
      const what = [criteria.make, criteria.model, criteria.bodyType, criteria.fuel, criteria.minYear ? `${criteria.minYear}+` : "", criteria.maxPriceUsd ? `≤ $${criteria.maxPriceUsd}` : ""].filter(Boolean).join(" ");
      await audit(db(), { actorUserId: ctx.principalUserId, actorKind: ctx.principalKind, action: "buyer_request.saved", entity: "buyer_request", entityId: row!.id, summary: `Saved the buyer's wish: ${what}`, conversationId: ctx.conversationId ?? null, fteRunId: ctx.runId });
      return { request_id: row!.id, watching: what, message: "Tell the buyer you will message them as soon as a matching car arrives." };
    },
  },
];

/** A car became available: wake Sora for every saved wish it fits (once per wish per car). */
export async function matchBuyerRequests(vehicleId: string) {
  const [row] = await db()
    .select({ v: s.vehicles, brand: s.brands.name, model: s.vehicleModels.name })
    .from(s.vehicles)
    .leftJoin(s.brands, eq(s.brands.id, s.vehicles.brandId))
    .leftJoin(s.vehicleModels, eq(s.vehicleModels.id, s.vehicles.modelId))
    .where(eq(s.vehicles.id, vehicleId))
    .limit(1);
  if (!row || row.v.status !== "available") return 0;
  const v = { ...row.v, brand: row.brand ?? row.v.title, model: row.model ?? row.v.title };
  const price = Number(v.discountPriceUsd ?? v.priceUsd);
  const lc = (x: unknown) => String(x ?? "").toLowerCase();
  const reqs = await db().select().from(s.buyerRequests).where(eq(s.buyerRequests.active, true));
  let n = 0;
  for (const r of reqs) {
    const c = r.criteria as { make?: string; model?: string; bodyType?: string; fuel?: string; maxPriceUsd?: number; minYear?: number };
    const fits =
      (!c.make || lc(v.brand).includes(lc(c.make))) &&
      (!c.model || lc(v.model).includes(lc(c.model))) &&
      (!c.bodyType || lc(v.bodyType).includes(lc(c.bodyType))) &&
      (!c.fuel || lc(v.fuel).includes(lc(c.fuel))) &&
      (!c.maxPriceUsd || price <= c.maxPriceUsd * 1.05) &&
      (!c.minYear || v.year >= c.minYear);
    if (!fits) continue;
    await emit("stock.match", { requestId: r.id, vehicleId: v.id });
    n++;
  }
  return n;
}
