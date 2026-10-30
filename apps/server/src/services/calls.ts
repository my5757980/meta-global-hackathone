import { eq } from "drizzle-orm";
import { db } from "../db/client";
import * as s from "../db/schema";
import { bad, conflict, forbidden } from "../lib/http";
import { isStaff, type AuthUser } from "../auth/session";
import { canSeeConversation, conversationMembers, postMessage, setHolder } from "./chat";
import { isOnline, onPresence, publish } from "./sse";

/**
 * One-to-one voice and video calls. The browsers talk peer-to-peer (WebRTC); the server only rings, relays
 * the offer / answer / network candidates over the live stream, and writes the call into the chat.
 */
const RING_MS = 45_000;
interface Live {
  id: string;
  conversationId: string;
  callerId: string;
  calleeId: string;
  media: "audio" | "video";
  answeredAt: number | null;
  timer: NodeJS.Timeout | null;
}
const live = new Map<string, Live>();

const busy = (userId: string) => [...live.values()].some((c) => c.callerId === userId || c.calleeId === userId);

// closing the last tab drops the call (the page holding the connection is gone)
onPresence((userId, online) => {
  if (online) return;
  for (const c of [...live.values()]) if (c.callerId === userId || c.calleeId === userId) void finish(c, c.answeredAt ? "ended" : "missed").catch(() => {});
});

export async function startCall(u: AuthUser, conversationId: string, media: "audio" | "video") {
  const conv = await canSeeConversation(u, conversationId);
  if (conv.kind === "group") throw bad("Group calls are not available — call one colleague");
  let callee: string | null = null;
  if (conv.kind === "staff_dm") callee = (await conversationMembers(conv.id)).find((m) => m !== u.id) ?? null;
  else if (isStaff(u)) callee = conv.customerUserId;
  else {
    // a buyer can call the colleague holding their chat; Sora answers in writing
    if (conv.holder !== "human" || !conv.assignedUserId) throw bad("Sora answers in writing — a team member can call you once they join the chat");
    callee = conv.assignedUserId;
  }
  if (!callee) throw bad("Nobody to call in this conversation");
  if (busy(u.id)) throw conflict("You are already in a call");
  const [them] = await db().select({ name: s.users.name }).from(s.users).where(eq(s.users.id, callee)).limit(1);
  if (busy(callee)) throw conflict(`${them?.name ?? "They"} ${them ? "is" : "are"} on another call`);
  const [row] = await db().insert(s.chatCalls).values({ conversationId: conv.id, callerId: u.id, calleeId: callee, media }).returning();
  const c: Live = { id: row!.id, conversationId: conv.id, callerId: u.id, calleeId: callee, media, answeredAt: null, timer: null };
  live.set(c.id, c);
  if (!isOnline(callee)) {
    await finish(c, "missed");
    throw conflict(`${them?.name ?? "They"} ${them ? "is" : "are"} offline — they will see a missed call in the chat`);
  }
  // a colleague calling a buyer takes the thread from Sora, as writing to them would
  if (conv.kind === "customer" && isStaff(u) && u.kind === "staff" && conv.holder === "fte") await setHolder(conv.id, "human", { id: u.id, name: u.name });
  c.timer = setTimeout(() => void finish(c, "missed").catch(() => {}), RING_MS);
  publish([callee], "call", { type: "ring", callId: c.id, conversationId: conv.id, media, from: { id: u.id, name: u.name } });
  return { callId: c.id, media, peer: { id: callee, name: them?.name ?? "" } };
}

export async function signalCall(u: AuthUser, callId: string, type: string, data: unknown) {
  const c = live.get(callId);
  if (!c) throw conflict("This call has ended");
  if (u.id !== c.callerId && u.id !== c.calleeId) throw forbidden();
  const other = u.id === c.callerId ? c.calleeId : c.callerId;
  switch (type) {
    case "accept":
      if (u.id !== c.calleeId || c.answeredAt) throw conflict("This call cannot be answered");
      if (c.timer) clearTimeout(c.timer);
      c.answeredAt = Date.now();
      await db().update(s.chatCalls).set({ status: "active", answeredAt: new Date() }).where(eq(s.chatCalls.id, c.id));
      publish([other], "call", { type: "accept", callId });
      publish([u.id], "call", { type: "taken", callId }); // the callee's other tabs stop ringing
      return { ok: true };
    case "decline":
      if (u.id !== c.calleeId) throw forbidden();
      await finish(c, "declined");
      return { ok: true };
    case "end":
      await finish(c, c.answeredAt ? "ended" : u.id === c.callerId ? "missed" : "declined");
      return { ok: true };
    case "offer":
    case "answer":
    case "ice":
      publish([other], "call", { type, callId, data });
      return { ok: true };
    default:
      throw bad("Unknown signal");
  }
}

async function finish(c: Live, status: "ended" | "missed" | "declined") {
  if (!live.delete(c.id)) return; // already finished
  if (c.timer) clearTimeout(c.timer);
  const seconds = c.answeredAt ? Math.round((Date.now() - c.answeredAt) / 1000) : 0;
  await db().update(s.chatCalls).set({ status, endedAt: new Date() }).where(eq(s.chatCalls.id, c.id));
  publish([c.callerId, c.calleeId], "call", { type: "ended", callId: c.id, status, seconds });
  const what = c.media === "video" ? "video call" : "voice call";
  const body = status === "ended" ? `${what[0]!.toUpperCase()}${what.slice(1)} · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : status === "declined" ? `Declined ${what}` : `Missed ${what}`;
  await postMessage({ conversationId: c.conversationId, senderUserId: c.callerId, kind: "call", body, meta: { callId: c.id, media: c.media, status, seconds } });
}
