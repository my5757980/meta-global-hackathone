/**
 * Sora's runtime loop. One run per trigger (a buyer message, an event, an approval decision):
 * build context → call Muse Spark Open with the MCP tool list → execute tool calls through MCP →
 * repeat (≤ 8 steps) → post the reply (with cards) → record the run. Failures go to a human.
 */
import { readFileSync } from "node:fs";
import { desc, eq } from "drizzle-orm";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { ChatCard, VehicleCardItem } from "@autofte/shared";
import { env } from "../env";
import { db } from "../db/client";
import * as s from "../db/schema";
import { listMessages, postMessage, setHolder } from "../services/chat";
import { envelope, now as clockNow, siteSettings } from "../services/settings";
import { fileAbsPath } from "../services/files";
import { publish } from "../services/sse";
import { conversationMembers } from "../services/chat";
import { notify, usersWithPerm } from "../services/notify";
import { chat, modelConfigured } from "./model";
import { openMcpSession } from "./mcp";
import { transcribeMessage } from "./voice";
import { skillIndex } from "./skills";
import { SUMMARY_PROMPT, systemPrompt } from "./prompts";
import { promisesPerson } from "./guards";

const MAX_STEPS = 8;

const running = new Map<string, Promise<void>>();
const again = new Set<string>();

export interface RunTrigger {
  kind: "message" | "event" | "approval" | "eval";
  note?: string; // for events: what happened, in plain words, for Sora to act on
  eventId?: string;
}

/** Queue a run for a conversation; overlapping triggers collapse into one follow-up run. */
export function triggerSora(conversationId: string, trigger: RunTrigger) {
  if (!env.FTE_ENABLED) return;
  if (running.has(conversationId)) {
    again.add(conversationId);
    pendingNotes.set(conversationId, [...(pendingNotes.get(conversationId) ?? []), ...(trigger.note ? [trigger.note] : [])]);
    return;
  }
  const p = runSora(conversationId, trigger)
    .catch((e) => console.error("[sora]", e))
    .finally(() => {
      running.delete(conversationId);
      if (again.has(conversationId)) {
        again.delete(conversationId);
        const notes = pendingNotes.get(conversationId) ?? [];
        pendingNotes.delete(conversationId);
        triggerSora(conversationId, { kind: notes.length ? "event" : "message", note: notes.join("\n") || undefined });
      }
    });
  running.set(conversationId, p);
}
const pendingNotes = new Map<string, string[]>();

export function isRunning(conversationId: string) {
  return running.has(conversationId);
}

function dataUrl(fileRow: { path: string; mime: string }): string | null {
  try {
    return `data:${fileRow.mime};base64,${readFileSync(fileAbsPath(fileRow.path)).toString("base64")}`;
  } catch {
    return null;
  }
}

async function buildHistory(conversationId: string, soraId: string): Promise<ChatCompletionMessageParam[]> {
  const msgs = await listMessages(conversationId, { limit: 24 });
  const out: ChatCompletionMessageParam[] = [];
  const mediaBudget = { image: 2, voice: 2 };
  const fileIds = msgs.flatMap((m) => (Array.isArray(m.fileIds) ? (m.fileIds as string[]) : []));
  const fileRows = fileIds.length ? await db().select().from(s.files).where(eq(s.files.id, fileIds[0]!)) : [];
  void fileRows;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]!;
    const fromSora = m.senderUserId === soraId;
    const isStaff = !fromSora && (m.sender?.kind === "staff");
    let text = m.body ?? "";
    const meta = (m.meta ?? {}) as { cards?: ChatCard[] };
    if (meta.cards?.length) {
      text += "\n[cards shown: " + meta.cards.map((c) => (c.type === "vehicles" ? c.items.map((x) => `${x.title} ${x.id}${x.kind === "lot" ? ` lot_id=${x.link.split("/").pop()}` : ""}`).join("; ") : c.type === "quote" ? `quote ${c.quoteId} ${c.title} C&F ${c.totalUsd}` : c.type === "invoice" ? `invoice ${c.number} ${c.status}` : c.type === "sheet" ? `sheet lot_id=${c.lotId} grade ${c.grade} verdict ${c.verdict}` : "")).join(" | ") + "]";
    }
    if (m.kind === "system") {
      out.unshift({ role: "user", content: `[System note: ${text}]` });
      continue;
    }
    if (fromSora) {
      out.unshift({ role: "assistant", content: text || "(sent cards)" });
      continue;
    }
    if (isStaff) {
      out.unshift({ role: "user", content: `[Team member ${m.sender?.name} wrote to the buyer: ${text}]` });
      continue;
    }
    // buyer
    const parts: unknown[] = [];
    const ids = Array.isArray(m.fileIds) ? (m.fileIds as string[]) : [];
    if (m.kind === "voice" && ids.length) {
      // heard once by Muse Spark Open, then Sora works from the transcript (no audio on every tool step)
      const t = await transcribeMessage(m.id);
      if (t?.transcript) {
        out.unshift({ role: "user", content: `[Voice note from the buyer${t.language ? ` (${t.language})` : ""}, transcript]: ${t.transcript}${text ? `\n${text}` : ""}` });
        continue;
      }
    }
    if ((m.kind === "image" || m.kind === "voice") && ids.length) {
      for (const fid of ids.slice(0, 3)) {
        const [f] = await db().select().from(s.files).where(eq(s.files.id, fid)).limit(1);
        if (!f) continue;
        if (m.kind === "image" && mediaBudget.image > 0) {
          const u = dataUrl(f);
          if (u) {
            parts.push({ type: "image_url", image_url: { url: u } });
            mediaBudget.image--;
          }
        } else if (m.kind === "voice" && mediaBudget.voice > 0) {
          const u = dataUrl(f);
          if (u) {
            parts.push({ type: "text", text: "Voice note from the buyer — understand it and answer in the same language:" });
            parts.push({ type: "audio_url", audio_url: { url: u } });
            mediaBudget.voice--;
          }
        }
      }
    }
    if (parts.length) {
      if (text) parts.unshift({ type: "text", text });
      out.unshift({ role: "user", content: parts as never });
    } else {
      out.unshift({ role: "user", content: text || (m.kind === "voice" ? "[voice note]" : m.kind === "image" ? "[picture]" : "") });
    }
  }
  return out;
}

function vehicleCard(results: { stock_no: string; title: string; price_usd: number; year: number; mileage_km: number; link: string; image: string; fuel?: string; transmission?: string }[], mentioned: string): ChatCard | null {
  if (!results?.length) return null;
  const hit = results.filter((r) => mentioned.includes(r.stock_no));
  const pick = (hit.length ? hit : results).slice(0, 3);
  const items: VehicleCardItem[] = pick.map((r) => ({
    kind: "stock",
    id: r.stock_no,
    title: r.title,
    priceLabel: `$${Number(r.price_usd).toLocaleString("en-US")} FOB`,
    image: r.image,
    link: r.link,
    facts: [`${r.year}`, `${Number(r.mileage_km).toLocaleString("en-US")} km`, r.fuel ?? "", r.transmission ?? ""].filter(Boolean),
  }));
  return { type: "vehicles", items };
}

export async function runSora(conversationId: string, trigger: RunTrigger): Promise<void> {
  const [conv] = await db().select().from(s.chatConversations).where(eq(s.chatConversations.id, conversationId)).limit(1);
  if (!conv || conv.kind !== "customer") return;
  if (conv.holder !== "fte" && trigger.kind !== "approval") return;
  const [sora] = await db().select().from(s.users).where(eq(s.users.kind, "fte")).limit(1);
  if (!sora) return;
  const members = await conversationMembers(conversationId);
  const [run] = await db().insert(s.fteRuns).values({ trigger: trigger.kind, conversationId, eventId: trigger.eventId ?? null, status: "running" }).returning();
  const t0 = Date.now();
  publish(members, "typing", { conversationId, userId: sora.id, on: true });

  if (!modelConfigured()) {
    await postMessage({ conversationId, senderUserId: sora.id, body: "Thanks for your message! Our AI assistant is offline in this demo (no model key configured), so a team member will reply shortly." });
    await db().update(s.fteRuns).set({ status: "error", error: "no model key", finishedAt: new Date(), latencyMs: Date.now() - t0 }).where(eq(s.fteRuns.id, run!.id));
    publish(members, "typing", { conversationId, userId: sora.id, on: false });
    return;
  }

  const [buyer] = conv.customerUserId ? await db().select().from(s.users).where(eq(s.users.id, conv.customerUserId)).limit(1) : [];
  const [site, env0, today] = await Promise.all([siteSettings(), envelope(), clockNow()]);
  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: systemPrompt({
        site,
        envelope: env0,
        skills: skillIndex(),
        buyer: buyer ? { name: buyer.name, kind: buyer.kind, email: buyer.email, phone: buyer.phone, country: buyer.countryCode, company: buyer.company } : null,
        summary: conv.fteSummary,
        today: today.toLocaleString("en-GB", { timeZone: "Asia/Tokyo", dateStyle: "full", timeStyle: "short" }),
        channel: conv.channel,
      }),
    },
    ...(await buildHistory(conversationId, sora.id)),
  ];
  if (trigger.note) messages.push({ role: "user", content: `[System event for you to act on now: ${trigger.note}]` });

  const mcp = await openMcpSession({ principalUserId: sora.id, principalName: sora.name, principalKind: "fte", conversationId, buyerUserId: conv.customerUserId, runId: run!.id });
  const toolCalls: { name: string; args: unknown; ok: boolean; ms: number; preview: string; guard?: true }[] = [];
  let promptTokens = 0;
  let completionTokens = 0;
  let provider = "";
  let model = "";
  let reasoning = "";
  let finalText = "";
  let firstReplyMs: number | null = null;
  const cards: ChatCard[] = [];
  let lastSearch: unknown[] | null = null;
  let lastLots: { lot_id: string; lot_no: number; hall: string; sale_date: string; title: string; grade: string; mileage_km: number; start_price_jpy: number; est_fob_usd: number | null; link: string; image: string }[] | null = null;
  let handedOver = false;
  let status: "ok" | "error" | "handover" = "ok";
  let error: string | null = null;

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const r = await chat({ messages, tools: mcp.tools, effort: "low", maxTokens: 1800 });
      promptTokens += r.promptTokens;
      completionTokens += r.completionTokens;
      provider = r.provider;
      model = r.model;
      if (r.message.reasoning_content && reasoning.length < 1500) reasoning += (reasoning ? "\n…\n" : "") + r.message.reasoning_content.slice(0, 700);
      const calls = r.message.tool_calls ?? [];
      if (!calls.length) {
        finalText = (r.message.content ?? "").trim();
        break;
      }
      messages.push({ role: "assistant", content: r.message.content ?? "", tool_calls: calls } as ChatCompletionMessageParam);
      for (const call of calls) {
        if (call.type !== "function") continue;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          args = {};
        }
        const ct = Date.now();
        const res = await mcp.call(call.function.name, args);
        toolCalls.push({ name: call.function.name, args, ok: res.ok, ms: Date.now() - ct, preview: res.text.slice(0, 300) });
        messages.push({ role: "tool", tool_call_id: call.id, content: res.text.slice(0, 12000) });
        if (!res.ok) continue;
        try {
          const data = JSON.parse(res.text);
          if (call.function.name === "search_stock") lastSearch = data.results ?? null;
          if (call.function.name === "search_auction_lots" && data.results?.length) {
            lastLots = data.results;
          }
          if (call.function.name === "read_auction_sheet" && data.lot_id) {
            cards.push({ type: "sheet", lotId: data.lot_id, verdict: (data.verdict ?? "caution") as "good" | "caution" | "avoid", grade: String(data.grade ?? "?"), summary: [...(data.reasons ?? [])].slice(0, 3).join(" · ") });
          }
          if (call.function.name === "quote_cnf" && data.quote_id) {
            cards.push({ type: "quote", quoteId: data.quote_id, title: `${data.stock_no} · ${data.title}`, lines: data.lines, totalUsd: data.cnf_usd, port: data.port });
          }
          if (call.function.name === "request_invoice" && data.invoice_id) {
            cards.push({ type: "invoice", invoiceId: data.invoice_id, number: data.number, status: "pending", totalUsd: data.total_cnf_usd, advanceUsd: Math.round(((data.total_cnf_usd * (data.advance_percent ?? 50)) / 100) * 100) / 100, link: "/account/invoices" });
          }
          if (call.function.name === "handover_to_human") handedOver = true;
        } catch {
          /* non-JSON tool text */
        }
      }
      if (step === MAX_STEPS - 1) finalText = "Let me check this with a colleague and come back to you shortly.";
    }
    if (!handedOver && finalText && promisesPerson(finalText)) {
      const last = [...messages].reverse().find((m) => m.role === "user");
      const said = typeof last?.content === "string" ? last.content : Array.isArray(last?.content) ? last.content.map((p) => ("text" in p ? p.text : "")).join(" ") : "";
      const args = { reason: "promised a person", summary: `${sora.name} told the buyer a colleague is joining but did not hand over, so the server did. Buyer's last message: "${said.slice(0, 600)}"` };
      const ct = Date.now();
      const res = await mcp.call("handover_to_human", args);
      toolCalls.push({ name: "handover_to_human", args, ok: res.ok, ms: Date.now() - ct, preview: `[guard] ${res.text.slice(0, 280)}`, guard: true });
      if (res.ok) handedOver = true;
    }
    if (lastSearch) {
      const vc = vehicleCard(lastSearch as never, finalText);
      if (vc) cards.unshift(vc);
    }
    if (lastLots) {
      const hit = lastLots.filter((l) => finalText.includes(String(l.lot_no)));
      const pick = (hit.length ? hit : lastLots).slice(0, 3);
      cards.unshift({ type: "vehicles", items: pick.map((l) => ({ kind: "lot" as const, id: `Lot ${l.lot_no}`, title: l.title, priceLabel: `Start ¥${Number(l.start_price_jpy).toLocaleString("en-US")}`, image: l.image, link: l.link, facts: [`Grade ${l.grade}`, `${Number(l.mileage_km).toLocaleString("en-US")} km`, l.hall, l.sale_date] })) });
    }
    if (finalText || cards.length) {
      firstReplyMs = Date.now() - t0;
      await postMessage({ conversationId, senderUserId: sora.id, body: finalText, kind: cards.length && !finalText ? "card" : "text", meta: cards.length ? { cards, runId: run!.id } : { runId: run!.id } });
    }
    if (handedOver) status = "handover";
  } catch (e) {
    status = "error";
    error = String((e as Error)?.message ?? e).slice(0, 500);
    console.error("[sora run]", error);
    await postMessage({ conversationId, senderUserId: sora.id, body: "Sorry — I'm having trouble right now. A team member will reply to you shortly." });
    await setHolder(conversationId, "human", null, `${sora.name} could not reach its model`);
    await notify(await usersWithPerm("chat.desk"), { type: "handover", title: `${sora.name} needs a person (model error)`, body: error.slice(0, 120), link: `/desk?c=${conversationId}` });
  } finally {
    await mcp.close();
    publish(members, "typing", { conversationId, userId: sora.id, on: false });
    await db()
      .update(s.fteRuns)
      .set({ status, steps: toolCalls.length, provider, model, promptTokens, completionTokens, latencyMs: Date.now() - t0, firstReplyMs, toolCalls: toolCalls as never, reasoningExcerpt: reasoning || null, error, finishedAt: new Date() })
      .where(eq(s.fteRuns.id, run!.id));
    publish(await usersWithPerm("fte.console"), "fte.run", { runId: run!.id, conversationId, status, tools: toolCalls.map((t) => t.name), latencyMs: Date.now() - t0 });
  }
  void maybeSummarise(conversationId);
}

/** Keep a short running summary so long chats stay cheap and colleagues get context instantly. */
async function maybeSummarise(conversationId: string) {
  try {
    const [{ n }] = (await db().select({ n: db().$count(s.chatMessages, eq(s.chatMessages.conversationId, conversationId)) }).from(s.chatMessages).limit(1)) as [{ n: number }];
    if (n % 6 !== 0 && n > 6) return;
    const msgs = await listMessages(conversationId, { limit: 40 });
    const transcript = msgs.map((m) => `${m.sender?.name ?? "System"}: ${m.body}`).join("\n").slice(-12000);
    const r = await chat({ messages: [{ role: "system", content: SUMMARY_PROMPT }, { role: "user", content: transcript }], effort: "low", maxTokens: 400 });
    const text = (r.message.content ?? "").trim();
    if (text) await db().update(s.chatConversations).set({ fteSummary: text.slice(0, 1500) }).where(eq(s.chatConversations.id, conversationId));
  } catch {
    /* summary is best-effort */
  }
}

export async function latestRuns(limit = 30) {
  return db().select().from(s.fteRuns).orderBy(desc(s.fteRuns.startedAt)).limit(limit);
}
