/**
 * Sora's tools — the ONLY way Sora touches the business. Each tool has a typed input (zod), enforces
 * roles and the authority envelope on the server, and writes its audit row in the same transaction as
 * the change. The same registry is served over MCP (see mcp-server.ts) to Sora and to any authorised
 * external agent.
 */
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import * as s from "../db/schema";
import { audit } from "../services/audit";
import { addLeadNote, findOrCreateLead, requestInvoice, type Actor } from "../services/crm";
import { listVehicles, getVehicleBySlugOrId } from "../services/website";
import { quote } from "../services/pricing";
import { envelope, pricingPolicy, siteSettings } from "../services/settings";
import { setHolder, postMessage } from "../services/chat";
import { notify, usersWithPerm } from "../services/notify";
import { getSkill, loadSkills } from "./skills";

export interface ToolCtx {
  principalUserId: string;
  principalName: string;
  principalKind: "fte" | "human";
  conversationId?: string | null;
  buyerUserId?: string | null;
  runId?: string | null;
}

export interface ToolDef {
  name: string;
  description: string;
  input: z.ZodRawShape;
  run: (args: Record<string, unknown>, ctx: ToolCtx) => Promise<unknown>;
}

const actorOf = (ctx: ToolCtx): Actor => ({ userId: ctx.principalUserId, kind: ctx.principalKind, name: ctx.principalName, conversationId: ctx.conversationId ?? null, fteRunId: ctx.runId ?? null });

import { ToolError } from "./errors";
export { ToolError };
import { AUCTION_TOOLS, lotRef, resolveLot } from "./auctionTools";
import { getLot } from "../services/auction";

const money = (n: number | null | undefined) => (n == null ? null : Math.round(Number(n) * 100) / 100);

async function resolvePort(portId?: string, country?: string, portName?: string) {
  if (portId) {
    const [p] = await db().select().from(s.ports).where(eq(s.ports.id, portId)).limit(1);
    if (p) return p;
  }
  if (country) {
    const [c] = await db().select().from(s.countries).where(or(eq(s.countries.code, country.toUpperCase()), ilike(s.countries.name, country))).limit(1);
    if (c) {
      const ps = await db().select().from(s.ports).where(eq(s.ports.countryCode, c.code));
      const p = portName ? ps.find((x) => x.name.toLowerCase().includes(portName.toLowerCase())) : ps.length === 1 ? ps[0] : undefined;
      if (p) return p;
    }
  }
  return null;
}

const BASE_TOOLS: ToolDef[] = [
  {
    name: "search_stock",
    description:
      "Search the company's cars in stock (ready to ship from Japan). Use it for any request to find, recommend or compare stock cars. Returns real stock numbers and USD FOB prices. Never recommend a car that is not in a result.",
    input: {
      query: z.string().max(80).optional().describe("Free text: model name, chassis code or stock number"),
      make: z.string().max(40).optional().describe("Brand, e.g. Toyota"),
      model: z.string().max(40).optional().describe("Model, e.g. Hilux"),
      body_type: z.string().max(20).optional().describe("SUV, Sedan, Hatchback, Pickup, Van, Wagon, Minivan, Truck"),
      max_price_usd: z.number().positive().optional(),
      min_price_usd: z.number().positive().optional(),
      min_year: z.number().int().optional(),
      max_mileage_km: z.number().int().optional(),
      fuel: z.string().max(20).optional(),
      transmission: z.string().max(20).optional(),
      drive: z.string().max(10).optional().describe("2WD, 4WD or AWD"),
      sort: z.enum(["price_asc", "price_desc", "year_desc", "mileage_asc", "newest"]).optional(),
      limit: z.number().int().min(1).max(6).optional(),
    },
    async run(a) {
      const r = await listVehicles({
        q: a.query as string,
        brand: a.make as string,
        model: a.model as string,
        body: a.body_type as string,
        priceMax: a.max_price_usd as number,
        priceMin: a.min_price_usd as number,
        yearMin: a.min_year as number,
        mileageMax: a.max_mileage_km as number,
        fuel: a.fuel as string,
        transmission: a.transmission as string,
        drive: a.drive as string,
        sort: (a.sort as never) ?? "price_asc",
        limit: (a.limit as number) ?? 4,
      });
      return {
        total_matches: r.total,
        results: r.items.map((v) => ({
          stock_no: v.stockNo,
          title: v.title,
          price_usd: money(v.discountPriceUsd ?? v.priceUsd),
          list_price_usd: v.discountPriceUsd ? money(v.priceUsd) : undefined,
          year: v.year,
          mileage_km: v.mileageKm,
          fuel: v.fuel,
          transmission: v.transmission,
          drive: v.drive,
          body_type: v.bodyType,
          color: v.color,
          status: v.status,
          link: `/vehicles/${v.slug}`,
          image: v.image,
        })),
      };
    },
  },
  {
    name: "get_vehicle",
    description: "Full details of one stock car by stock number (e.g. HK-10021): specs, features, price, status, location and size for freight.",
    input: { stock_no: z.string().min(3).max(40) },
    async run(a) {
      const v = await getVehicleBySlugOrId(String(a.stock_no));
      if (!v || !v.published) throw new ToolError(`No stock car ${a.stock_no}`);
      return {
        stock_no: v.stockNo,
        title: v.title,
        status: v.status,
        price_usd: money(v.discountPriceUsd ?? v.priceUsd),
        list_price_usd: v.discountPriceUsd ? money(v.priceUsd) : undefined,
        year: v.year,
        month: v.month,
        mileage_km: v.mileageKm,
        engine_cc: v.engineCc,
        fuel: v.fuel,
        transmission: v.transmission,
        drive: v.drive,
        steering: v.steering,
        color: v.color,
        seats: v.seats,
        doors: v.doors,
        chassis_code: v.modelCode,
        size_m3: v.m3,
        location: v.location,
        features: v.features,
        description: v.description,
        link: `/vehicles/${v.slug}`,
        image: v.images[0],
      };
    },
  },
  {
    name: "list_ports",
    description: "Look up a destination country: its ports (with port_id), freight rate per m³, transit days, whether pre-shipment inspection is required and whether right-hand-drive imports are allowed. Call before quoting.",
    input: { country: z.string().min(2).max(60).describe("Country name or ISO code, e.g. Kenya or KE") },
    async run(a) {
      const q = String(a.country).trim();
      const [c] = await db().select().from(s.countries).where(or(eq(s.countries.code, q.toUpperCase()), ilike(s.countries.name, q))).limit(1);
      if (!c || c.code === "JP") {
        const like = await db().select({ name: s.countries.name, code: s.countries.code }).from(s.countries).where(ilike(s.countries.name, `%${q.slice(0, 4)}%`)).limit(5);
        throw new ToolError(`Unknown destination "${q}". Similar: ${like.map((x) => `${x.name} (${x.code})`).join(", ") || "none"}`);
      }
      const ps = await db().select().from(s.ports).where(eq(s.ports.countryCode, c.code));
      return {
        country: { code: c.code, name: c.name, region: c.region, inspection_required: c.inspectionRequired, inspection_fee_usd: money(c.inspectionFeeUsd), rhd_allowed: c.rhdAllowed, note: c.rhdAllowed ? undefined : "Right-hand-drive imports may not be allowed here — warn the buyer before quoting." },
        ports: ps.map((p) => ({ port_id: p.id, name: p.name, freight_usd_per_m3: money(p.freightUsdPerM3), transit_days: p.transitDays })),
      };
    },
  },
  {
    name: "quote_cnf",
    description:
      "Compute the exact landed price to a port using the company's price policy: vehicle FOB, discount, inspection, freight, C&F, insurance and CIF. Works for a stock car (stock_no) or an auction lot (lot_id, with the bid amount; default = recent average). Always use this for prices — never calculate yourself. A discount above your envelope is refused unless a supervisor approved it (then use request_approval).",
    input: {
      stock_no: z.string().min(3).max(40).optional().describe("Stock number of a car in stock"),
      lot_id: lotRef.optional(),
      bid_jpy: z.number().int().positive().optional().describe("For a lot: the hammer price to assume (default: recent average)"),
      port_id: z.string().min(8).max(40).describe("port_id from list_ports"),
      discount_pct: z.number().min(0).max(50).optional(),
    },
    async run(a, ctx) {
      if (!a.stock_no && !a.lot_id) throw new ToolError("Give stock_no (stock car) or lot_id (auction lot)");
      const port = await resolvePort(String(a.port_id));
      if (!port) throw new ToolError("Unknown port_id — call list_ports first");
      const [country] = await db().select().from(s.countries).where(eq(s.countries.code, port.countryCode)).limit(1);
      const env = await envelope();
      const discountPct = Number(a.discount_pct ?? 0);
      if (discountPct > env.maxDiscountPct) {
        const approved = ctx.conversationId
          ? await db()
              .select()
              .from(s.approvals)
              .where(and(eq(s.approvals.kind, "discount"), eq(s.approvals.status, "approved"), eq(s.approvals.conversationId, ctx.conversationId), sql`(${s.approvals.payload}->>'discountPct')::float >= ${discountPct}`))
              .limit(1)
          : [];
        if (!approved.length) return { needs_approval: true, max_discount_pct: env.maxDiscountPct, message: `A ${discountPct}% discount is above your limit of ${env.maxDiscountPct}%. Call request_approval to ask the Supervisor, and tell the buyer you are asking.` };
      }
      const policy = await pricingPolicy();
      let title = "";
      let m3 = 0;
      let basis: { kind: "stock"; priceUsd: number } | { kind: "lot"; bidJpy: number };
      let vehicleId: string | null = null;
      let lotId: string | null = null;
      let label = "";
      if (a.stock_no) {
        const v = await getVehicleBySlugOrId(String(a.stock_no));
        if (!v) throw new ToolError(`No stock car ${a.stock_no}`);
        if (v.status === "sold") throw new ToolError(`${v.stockNo} is already sold — offer another car`);
        title = v.title;
        m3 = Number(v.m3);
        basis = { kind: "stock", priceUsd: Number(v.discountPriceUsd ?? v.priceUsd) };
        vehicleId = v.id;
        label = v.stockNo;
      } else {
        const l = await resolveLot(a.lot_id);
        const bid = Number(a.bid_jpy ?? l.avgPriceJpy ?? l.startPriceJpy);
        title = `${l.year} ${l.make} ${l.model} — auction lot ${l.lotNo} (${l.hall})`;
        const [spec] = await db()
          .select({ l: s.vehicles.lengthMm, w: s.vehicles.widthMm, h: s.vehicles.heightMm })
          .from(s.vehicles)
          .innerJoin(s.vehicleModels, eq(s.vehicleModels.id, s.vehicles.modelId))
          .where(ilike(s.vehicleModels.name, l.model))
          .limit(1);
        m3 = spec?.l && spec.w && spec.h ? Math.round(((spec.l * spec.w * spec.h) / 1e9) * 100) / 100 : 12;
        basis = { kind: "lot", bidJpy: bid };
        lotId = l.id;
        label = `lot ${l.lotNo}`;
      }
      const q = quote({ basis, m3, port: { name: port.name, freightUsdPerM3: Number(port.freightUsdPerM3) }, country: { name: country!.name, inspectionRequired: country!.inspectionRequired, inspectionFeeUsd: Number(country!.inspectionFeeUsd) }, policy, discountPct });
      const saved = await db().transaction(async (tx) => {
        const [row] = await tx
          .insert(s.quotes)
          .values({ conversationId: ctx.conversationId ?? null, vehicleId, auctionLotId: lotId, portId: port.id, title, lines: q.lines as never, totalCnfUsd: q.cnfUsd, pushUsd: q.fobUsd, discountPct, fxJpyPerUsd: policy.fxJpyPerUsd, m3, createdBy: ctx.principalUserId, expiresAt: new Date(Date.now() + 7 * 86400_000) })
          .returning();
        await audit(tx, { actorUserId: ctx.principalUserId, actorKind: ctx.principalKind, action: "quote.created", entity: "quote", entityId: row!.id, summary: `Quoted ${label} to ${port.name}: C&F $${q.cnfUsd.toLocaleString("en-US")}${discountPct ? ` (${discountPct}% discount)` : ""}`, data: { cnf: q.cnfUsd, cif: q.cifUsd }, conversationId: ctx.conversationId, fteRunId: ctx.runId });
        return row!;
      });
      if (ctx.conversationId && ctx.principalKind === "fte") {
        const { scheduleQuoteFollowUp } = await import("./handlers");
        await scheduleQuoteFollowUp(ctx.conversationId, saved.id).catch(() => {});
      }
      return {
        quote_id: saved.id,
        stock_no: a.stock_no ?? undefined,
        lot_id: lotId ?? undefined,
        title,
        port: port.name,
        country: country!.name,
        lines: q.lines,
        cnf_usd: q.cnfUsd,
        cif_usd: q.cifUsd,
        advance_usd: q.advanceUsd,
        advance_percent: policy.advancePercent,
        valid_days: 7,
        note: lotId ? "Auction prices are estimates until the hammer falls; the final invoice uses the actual price." : undefined,
        rhd_note: country!.rhdAllowed ? undefined : "Warn the buyer: right-hand-drive imports may not be allowed in this country.",
      };
    },
  },
  {
    name: "find_or_create_lead",
    description: "Record the buyer in the CRM (matches an existing customer by phone or e-mail, never duplicates). Needed before request_invoice.",
    input: {
      customer_name: z.string().min(2).max(120).describe("Company or person buying"),
      contact_person: z.string().max(80).optional(),
      phone: z.string().min(6).max(30),
      email: z.string().email().max(120).optional(),
      country_code: z.string().length(2).describe("ISO country code of the destination"),
      port_id: z.string().max(40).optional(),
    },
    async run(a, ctx) {
      const [c] = await db().select().from(s.countries).where(eq(s.countries.code, String(a.country_code).toUpperCase())).limit(1);
      if (!c) throw new ToolError("Unknown country_code");
      const r = await findOrCreateLead(
        { customerName: String(a.customer_name), contactPerson: a.contact_person as string, phone: String(a.phone), email: (a.email as string) ?? null, countryCode: c.code, portId: (a.port_id as string) ?? null, ownerUserId: ctx.principalUserId, customerUserId: ctx.buyerUserId ?? null, source: "web_chat" },
        actorOf(ctx),
      );
      return { lead_id: r.lead.id, status: r.lead.status, matched_existing: !r.created };
    },
  },
  {
    name: "add_lead_note",
    description: "Add a short note to the lead's CRM notes (what the buyer wants, what was quoted, next step). Keep it factual.",
    input: { lead_id: z.string().min(8).max(40), note: z.string().min(3).max(1500) },
    async run(a, ctx) {
      await addLeadNote(String(a.lead_id), String(a.note), actorOf(ctx));
      return { ok: true };
    },
  },
  {
    name: "request_invoice",
    description:
      "Ask the Supervisor to issue an invoice for quoted car(s). You never issue invoices yourself — this creates a pending request in the CRM. Needs the lead_id and the quote_id(s) the buyer accepted.",
    input: {
      lead_id: z.string().min(8).max(40),
      quote_ids: z.array(z.string().min(8).max(40)).min(1).max(10),
      consignee_name: z.string().max(120).optional(),
      consignee_phone: z.string().max(30).optional(),
      consignee_email: z.string().email().max(120).optional(),
      consignee_address: z.string().max(200).optional(),
    },
    async run(a, ctx) {
      const [lead] = await db().select().from(s.leads).where(eq(s.leads.id, String(a.lead_id))).limit(1);
      if (!lead) throw new ToolError("Unknown lead_id");
      const qs = await db().select().from(s.quotes).where(inArray(s.quotes.id, a.quote_ids as string[]));
      if (qs.length !== (a.quote_ids as string[]).length) throw new ToolError("One of the quote_ids does not exist — quote again");
      const vIds = qs.map((q) => q.vehicleId).filter(Boolean) as string[];
      const vehicleRows = vIds.length ? await db().select().from(s.vehicles).where(inArray(s.vehicles.id, vIds)) : [];
      for (const v of vehicleRows) if (v.status === "sold") throw new ToolError(`${v.stockNo} was sold meanwhile — offer another car`);
      const port = qs[0]!.portId ? (await db().select().from(s.ports).where(eq(s.ports.id, qs[0]!.portId!)).limit(1))[0] : null;
      const inv = await requestInvoice(
        {
          leadId: lead.id,
          consigneeName: (a.consignee_name as string) || lead.customerName,
          consigneePhone: (a.consignee_phone as string) || lead.phone,
          consigneeEmail: (a.consignee_email as string) || lead.email,
          consigneeAddress: (a.consignee_address as string) || lead.address,
          consigneeCountryCode: port?.countryCode ?? lead.countryCode ?? "KE",
          consigneePortId: port?.id ?? lead.portId,
          m3Rate: port ? Number(port.freightUsdPerM3) : null,
          exchangeRate: Number(qs[0]!.fxJpyPerUsd),
          quoteId: qs[0]!.id,
          vehicles: qs.map((q) => {
            const v = vehicleRows.find((x) => x.id === q.vehicleId);
            if (!v && q.auctionLotId) {
              return { vehicleId: null, auctionLotId: q.auctionLotId, unitLabel: q.title.replace(/^\d{4}\s+/, ""), year: Number(q.title.slice(0, 4)) || null, color: null, chassisNo: null, engine: null, transmission: null, fuel: null, pushUsd: Number(q.pushUsd), cnfUsd: Number(q.totalCnfUsd) };
            }
            return {
              vehicleId: q.vehicleId,
              auctionLotId: q.auctionLotId,
              unitLabel: v ? v.title.replace(/^\d{4}\s+/, "") : q.title,
              year: v?.year ?? null,
              color: v?.color ?? null,
              chassisNo: v?.chassisNo ?? null,
              engine: v?.engineCc ? `${v.engineCc} cc` : null,
              transmission: v?.transmission ?? null,
              fuel: v?.fuel ?? null,
              pushUsd: Number(q.pushUsd),
              cnfUsd: Number(q.totalCnfUsd),
            };
          }),
        },
        actorOf(ctx),
      );
      return { invoice_id: inv.id, number: inv.number, status: "pending", total_cnf_usd: money(inv.totalCnfUsd), advance_percent: inv.advancePercent, message: "Waiting for the Supervisor's approval. Tell the buyer they will receive the invoice here as soon as it is approved." };
    },
  },
  {
    name: "request_approval",
    description: "Ask the Supervisor to approve something beyond your envelope (a larger discount, a special term). Creates a pending approval; you will be told the decision.",
    input: {
      kind: z.enum(["discount", "bid", "other"]),
      reason: z.string().min(5).max(600),
      quote_id: z.string().max(40).optional(),
      discount_pct: z.number().min(0).max(50).optional(),
      lot_id: lotRef.optional(),
      amount_jpy: z.number().int().positive().optional(),
    },
    async run(a, ctx) {
      const row = await db().transaction(async (tx) => {
        const [ap] = await tx
          .insert(s.approvals)
          .values({ kind: String(a.kind), requestedBy: ctx.principalUserId, conversationId: ctx.conversationId ?? null, quoteId: (a.quote_id as string) ?? null, lotId: a.lot_id ? (await resolveLot(a.lot_id)).id : null, payload: { discountPct: a.discount_pct ?? null, amountJpy: a.amount_jpy ?? null }, reason: String(a.reason) })
          .returning();
        await audit(tx, { actorUserId: ctx.principalUserId, actorKind: ctx.principalKind, action: "approval.requested", entity: "approval", entityId: ap!.id, summary: `Asked approval (${a.kind}${a.discount_pct ? ` ${a.discount_pct}%` : ""}): ${String(a.reason).slice(0, 120)}`, conversationId: ctx.conversationId, fteRunId: ctx.runId });
        return ap!;
      });
      await notify(await usersWithPerm("fte.approvals.decide"), { type: "approval", title: `Sora asks approval: ${a.kind}${a.discount_pct ? ` ${a.discount_pct}%` : ""}`, body: String(a.reason).slice(0, 140), link: `/fte/approvals`, data: { approvalId: row.id } });
      return { approval_id: row.id, status: "pending", message: "Tell the buyer a supervisor is reviewing the request." };
    },
  },
  {
    name: "handover_to_human",
    description: "Hand this conversation to a human team member with a short summary. Use for complaints, refunds, legal or payment disputes, anything outside policy, or when the buyer asks for a person. After this you stop replying here.",
    input: { reason: z.string().min(3).max(300), summary: z.string().min(10).max(1500) },
    async run(a, ctx) {
      if (!ctx.conversationId) throw new ToolError("No conversation to hand over");
      await db().transaction(async (tx) => {
        await tx.update(s.chatConversations).set({ fteSummary: String(a.summary) }).where(eq(s.chatConversations.id, ctx.conversationId!));
        await audit(tx, { actorUserId: ctx.principalUserId, actorKind: ctx.principalKind, action: "chat.handover", entity: "conversation", entityId: ctx.conversationId, summary: `Handed to a human: ${a.reason}`, conversationId: ctx.conversationId, fteRunId: ctx.runId });
      });
      await setHolder(ctx.conversationId, "human", null, `Sora asked a team member to help (${a.reason})`);
      const desk = (await usersWithPerm("chat.desk")).filter((x) => x !== ctx.principalUserId);
      await notify(desk, { type: "handover", title: "A buyer needs a person", body: `${a.reason} — ${String(a.summary).slice(0, 120)}`, link: `/desk?c=${ctx.conversationId}` });
      return { ok: true, message: "A team member has been asked to join. Tell the buyer politely in one short sentence." };
    },
  },
  {
    name: "get_customer_record",
    description: "The current buyer's own records: invoices, vehicles, payments, balance and shipping progress. Use for questions like 'where is my car' or 'how much do I still owe'. Only works for a signed-in customer.",
    input: {},
    async run(_a, ctx) {
      if (!ctx.buyerUserId) throw new ToolError("No buyer in this conversation");
      const [buyer] = await db().select().from(s.users).where(eq(s.users.id, ctx.buyerUserId)).limit(1);
      if (!buyer || buyer.kind !== "customer") return { signed_in: false, message: "The buyer is a visitor. Ask them to sign in to see their invoices." };
      const leads = await db()
        .select()
        .from(s.leads)
        .where(or(eq(s.leads.customerUserId, buyer.id), buyer.email ? sql`lower(${s.leads.email}) = lower(${buyer.email})` : sql`false`));
      const invs = leads.length ? await db().select().from(s.invoices).where(and(inArray(s.invoices.leadId, leads.map((l) => l.id)), inArray(s.invoices.status, ["approved", "sent", "pending"]))).orderBy(desc(s.invoices.createdAt)) : [];
      const out = [];
      for (const inv of invs) {
        const vs = await db().select().from(s.invoiceVehicles).where(eq(s.invoiceVehicles.invoiceId, inv.id));
        const pays = await db().select().from(s.payments).where(eq(s.payments.invoiceId, inv.id));
        const paid = pays.reduce((x, p) => x + Number(p.amountUsd), 0);
        const vehicles = [];
        for (const v of vs) {
          const [last] = await db().select().from(s.vehicleProgress).where(eq(s.vehicleProgress.invoiceVehicleId, v.id)).orderBy(desc(s.vehicleProgress.createdAt)).limit(1);
          vehicles.push({ vehicle: `${v.year ?? ""} ${v.unitLabel}`.trim(), chassis: v.chassisNo, cnf_usd: money(v.cnfUsd), current_stage: last?.stage ?? "Not started", stage_date: last?.stageDate ?? null, stage_note: last?.note ?? null });
        }
        out.push({ invoice: inv.number, status: inv.status, total_cnf_usd: money(inv.totalCnfUsd), paid_usd: money(paid), balance_usd: money(Number(inv.totalCnfUsd) - paid), advance_percent: inv.advancePercent, vehicles, payments: pays.map((p) => ({ date: p.receivedDate, amount_usd: money(p.amountUsd) })) });
      }
      await audit(db(), { actorUserId: ctx.principalUserId, actorKind: ctx.principalKind, action: "customer.record.read", entity: "user", entityId: buyer.id, summary: `Read ${buyer.name}'s invoices for the chat`, conversationId: ctx.conversationId, fteRunId: ctx.runId });
      return { signed_in: true, name: buyer.name, invoices: out, account_link: "/account/invoices" };
    },
  },
  {
    name: "update_buyer_profile",
    description: "Save details the buyer told you (name, company, phone, e-mail, destination country) on their profile so nobody asks again.",
    input: {
      name: z.string().min(2).max(80).optional(),
      company: z.string().max(120).optional(),
      phone: z.string().min(6).max(30).optional(),
      email: z.string().email().max(120).optional(),
      country_code: z.string().length(2).optional(),
    },
    async run(a, ctx) {
      if (!ctx.buyerUserId) throw new ToolError("No buyer in this conversation");
      const patch: Partial<typeof s.users.$inferInsert> = { updatedAt: new Date() };
      if (a.name) patch.name = String(a.name);
      if (a.company) patch.company = String(a.company);
      if (a.phone) patch.phone = String(a.phone);
      if (a.country_code) patch.countryCode = String(a.country_code).toUpperCase();
      if (a.email) {
        const [other] = await db().select({ id: s.users.id }).from(s.users).where(and(sql`lower(${s.users.email}) = lower(${String(a.email)})`, sql`${s.users.id} <> ${ctx.buyerUserId}`)).limit(1);
        if (other) throw new ToolError("That e-mail belongs to a registered account — ask the buyer to sign in with it");
        patch.email = String(a.email);
      }
      await db().transaction(async (tx) => {
        await tx.update(s.users).set(patch).where(eq(s.users.id, ctx.buyerUserId!));
        await audit(tx, { actorUserId: ctx.principalUserId, actorKind: ctx.principalKind, action: "buyer.profile", entity: "user", entityId: ctx.buyerUserId, summary: `Saved buyer details: ${Object.keys(patch).filter((k) => k !== "updatedAt").join(", ")}`, conversationId: ctx.conversationId, fteRunId: ctx.runId });
      });
      return { ok: true };
    },
  },
  {
    name: "load_skill",
    description: "Load the full procedure of one of your skills (see the skill list in your instructions) before doing that kind of task.",
    input: { name: z.string().min(2).max(60) },
    async run(a) {
      const sk = getSkill(String(a.name));
      if (!sk) throw new ToolError(`No skill "${a.name}". Available: ${loadSkills().map((x) => x.name).join(", ")}`);
      return { name: sk.name, instructions: sk.body };
    },
  },
];

export const TOOLS: ToolDef[] = [...BASE_TOOLS, ...AUCTION_TOOLS];

export async function runTool(name: string, args: Record<string, unknown>, ctx: ToolCtx): Promise<{ ok: boolean; result: unknown }> {
  const def = TOOLS.find((t) => t.name === name);
  if (!def) return { ok: false, result: { error: `Unknown tool ${name}` } };
  const parsed = z.object(def.input).safeParse(args ?? {});
  if (!parsed.success) return { ok: false, result: { error: "Invalid arguments: " + parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ") } };
  try {
    return { ok: true, result: await def.run(parsed.data, ctx) };
  } catch (e) {
    const msg = e instanceof ToolError ? e.message : (e as { message?: string })?.message ?? String(e);
    return { ok: false, result: { error: msg } };
  }
}

/** For the chat UI: a short company bank block Sora can rely on (from settings, not from the model). */
export async function bankText(): Promise<string> {
  const site = await siteSettings();
  return `${site.bank.bankName}, ${site.bank.branch}, SWIFT ${site.bank.swift}, account "${site.bank.accountName}" no. ${site.bank.accountNo}`;
}

export { postMessage };
