/**
 * Voice notes → text, once. Muse Spark Open hears the WAV a single time; the transcript is stored on
 * the message (shown under the voice bubble for buyer and staff) and Sora's loop works from the text,
 * so a voice note does not re-send audio on every tool step.
 */
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import * as s from "../db/schema";
import { fileAbsPath } from "../services/files";
import { conversationMembers } from "../services/chat";
import { publish } from "../services/sse";
import { chat } from "./model";

const PROMPT = `Transcribe this voice note exactly as spoken, in its original language.
- Urdu or Hindi: write in Roman Urdu (Latin letters) the way people text, unless the speech is clearly formal Urdu — then use Urdu script.
- Any other language: write it in that language's usual script.
Do not translate, summarise or answer it. Return ONLY JSON: {"transcript": "...", "language": "English|Urdu|Swahili|Arabic|..."}`;

const inflight = new Map<string, Promise<{ transcript: string; language: string } | null>>();

export function transcribeMessage(messageId: string) {
  const hit = inflight.get(messageId);
  if (hit) return hit;
  const p = (async () => {
    const [m] = await db().select().from(s.chatMessages).where(eq(s.chatMessages.id, messageId)).limit(1);
    if (!m || m.kind !== "voice") return null;
    const meta = (m.meta ?? {}) as { transcript?: string; language?: string };
    if (meta.transcript) return { transcript: meta.transcript, language: meta.language ?? "" };
    const fid = (m.fileIds as string[])[0];
    if (!fid) return null;
    const [f] = await db().select().from(s.files).where(eq(s.files.id, fid)).limit(1);
    if (!f) return null;
    const url = `data:${f.mime};base64,${readFileSync(fileAbsPath(f.path)).toString("base64")}`;
    const r = await chat({ messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "audio_url", audio_url: { url } }] as never }], effort: "low", maxTokens: 1200 });
    const text = r.message.content ?? "";
    let out = { transcript: text.trim(), language: "" };
    try {
      const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      out = { transcript: String(j.transcript ?? "").trim(), language: String(j.language ?? "") };
    } catch {
      /* keep raw text */
    }
    if (!out.transcript) return null;
    await db().update(s.chatMessages).set({ meta: { ...meta, transcript: out.transcript, language: out.language } as never }).where(eq(s.chatMessages.id, m.id));
    publish(await conversationMembers(m.conversationId), "message.meta", { id: m.id, conversationId: m.conversationId, meta: { ...meta, ...out } });
    return out;
  })()
    .catch((e) => {
      console.error("[voice]", (e as Error).message);
      return null;
    })
    .finally(() => inflight.delete(messageId));
  inflight.set(messageId, p);
  return p;
}
