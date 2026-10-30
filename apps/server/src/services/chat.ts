import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db, type DBorTx } from "../db/client";
import * as s from "../db/schema";
import { forbidden, notFound } from "../lib/http";
import type { AuthUser } from "../auth/session";
import { publish, onlineUserIds } from "./sse";
import { permsForRole } from "../auth/session";

export async function soraUserId(): Promise<string> {
  const [u] = await db().select({ id: s.users.id }).from(s.users).where(eq(s.users.kind, "fte")).limit(1);
  if (!u) throw new Error("Sora's account is missing — run npm run setup");
  return u.id;
}

/** The one customer conversation of a buyer (website, app and visitor door all land in the same thread). */
export async function ensureCustomerConversation(customerUserId: string, channel: "web" | "app" = "web") {
  const [c] = await db().select().from(s.chatConversations).where(and(eq(s.chatConversations.kind, "customer"), eq(s.chatConversations.customerUserId, customerUserId))).limit(1);
  if (c) return c;
  const sora = await soraUserId();
  const [created] = await db().insert(s.chatConversations).values({ kind: "customer", customerUserId, holder: "fte", channel }).returning();
  await db().insert(s.chatMembers).values([
    { conversationId: created!.id, userId: customerUserId },
    { conversationId: created!.id, userId: sora },
  ]);
  return created!;
}

export async function conversationMembers(conversationId: string): Promise<string[]> {
  const rows = await db().select({ id: s.chatMembers.userId }).from(s.chatMembers).where(eq(s.chatMembers.conversationId, conversationId));
  return rows.map((r) => r.id);
}

/** Who may see every conversation (online right now) — they get live updates too. */
async function onlineViewAll(): Promise<string[]> {
  const online = [...onlineUserIds()];
  if (!online.length) return [];
  const rows = await db().select({ id: s.users.id, roleId: s.users.roleId }).from(s.users).where(inArray(s.users.id, online));
  const out: string[] = [];
  for (const r of rows) if ((await permsForRole(r.roleId)).has("chat.view_all")) out.push(r.id);
  return out;
}

export async function canSeeConversation(u: AuthUser, conversationId: string) {
  const [conv] = await db().select().from(s.chatConversations).where(eq(s.chatConversations.id, conversationId)).limit(1);
  if (!conv) throw notFound("Conversation not found");
  if (u.perms.has("chat.view_all") && conv.kind === "customer") return conv;
  const [m] = await db().select().from(s.chatMembers).where(and(eq(s.chatMembers.conversationId, conversationId), eq(s.chatMembers.userId, u.id))).limit(1);
  if (!m) throw forbidden("You are not part of this conversation");
  return conv;
}

export interface PostMessage {
  conversationId: string;
  senderUserId: string | null;
  kind?: "text" | "image" | "voice" | "call" | "system" | "card";
  body?: string;
  fileIds?: string[];
  meta?: unknown;
}

export async function postMessage(m: PostMessage, tx: DBorTx = db()) {
  const [msg] = await tx
    .insert(s.chatMessages)
    .values({ conversationId: m.conversationId, senderUserId: m.senderUserId, kind: m.kind ?? "text", body: (m.body ?? "").slice(0, 8000), fileIds: m.fileIds ?? [], meta: (m.meta ?? null) as never })
    .returning();
  await tx.update(s.chatConversations).set({ lastMessageAt: new Date() }).where(eq(s.chatConversations.id, m.conversationId));
  if (m.senderUserId) {
    await tx.update(s.chatMembers).set({ lastReadAt: new Date() }).where(and(eq(s.chatMembers.conversationId, m.conversationId), eq(s.chatMembers.userId, m.senderUserId)));
  }
  const sender = m.senderUserId ? (await tx.select({ id: s.users.id, name: s.users.name, kind: s.users.kind, title: s.users.title }).from(s.users).where(eq(s.users.id, m.senderUserId)).limit(1))[0] : null;
  const out = { ...msg!, sender: sender ?? null };
  const to = new Set([...(await conversationMembers(m.conversationId)), ...(await onlineViewAll())]);
  publish(to, "message", out);
  return out;
}

export async function listMessages(conversationId: string, opts: { before?: Date; after?: Date; limit?: number } = {}) {
  const where = [eq(s.chatMessages.conversationId, conversationId)];
  if (opts.after) where.push(gt(s.chatMessages.createdAt, opts.after));
  if (opts.before) where.push(sql`${s.chatMessages.createdAt} < ${opts.before}`);
  const rows = await db()
    .select({ m: s.chatMessages, senderName: s.users.name, senderKind: s.users.kind, senderTitle: s.users.title })
    .from(s.chatMessages)
    .leftJoin(s.users, eq(s.users.id, s.chatMessages.senderUserId))
    .where(and(...where))
    .orderBy(desc(s.chatMessages.createdAt))
    .limit(opts.limit ?? 60);
  return rows.reverse().map((r) => ({ ...r.m, sender: r.m.senderUserId ? { id: r.m.senderUserId, name: r.senderName, kind: r.senderKind, title: r.senderTitle } : null }));
}

export async function markRead(conversationId: string, userId: string) {
  await db().update(s.chatMembers).set({ lastReadAt: new Date() }).where(and(eq(s.chatMembers.conversationId, conversationId), eq(s.chatMembers.userId, userId)));
  const others = (await conversationMembers(conversationId)).filter((x) => x !== userId);
  publish(others, "read", { conversationId, userId, at: new Date().toISOString() });
}

/** A human takes a thread from Sora (or Sora hands over). Sora stops replying until it is handed back. */
export async function setHolder(conversationId: string, holder: "fte" | "human", byUser: { id: string; name: string } | null, note?: string) {
  await db()
    .update(s.chatConversations)
    .set({ holder, assignedUserId: holder === "human" && byUser ? byUser.id : undefined })
    .where(eq(s.chatConversations.id, conversationId));
  if (byUser) {
    await db().insert(s.chatMembers).values({ conversationId, userId: byUser.id }).onConflictDoNothing();
  }
  const text = holder === "human" ? `${byUser?.name ?? "A team member"} joined the conversation${note ? ` — ${note}` : ""}` : `Sora is back in the conversation${byUser ? ` (handed back by ${byUser.name})` : ""}`;
  await postMessage({ conversationId, senderUserId: null, kind: "system", body: text, meta: { holder } });
  publish(await conversationMembers(conversationId), "holder", { conversationId, holder });
}

export async function deskConversations(u: AuthUser, scope: "mine" | "all") {
  const all = scope === "all" && u.perms.has("chat.view_all");
  const memberOf = all
    ? undefined
    : db().select({ id: s.chatMembers.conversationId }).from(s.chatMembers).where(eq(s.chatMembers.userId, u.id));
  const rows = await db()
    .select({
      c: s.chatConversations,
      customerName: s.users.name,
      customerEmail: s.users.email,
      customerKind: s.users.kind,
      customerCountry: s.users.countryCode,
      last: sql<string>`(select body from chat_messages m where m.conversation_id = ${s.chatConversations.id} order by created_at desc limit 1)`,
      lastKind: sql<string>`(select kind from chat_messages m where m.conversation_id = ${s.chatConversations.id} order by created_at desc limit 1)`,
      unread: sql<number>`(select count(*)::int from chat_messages m where m.conversation_id = ${s.chatConversations.id} and (m.sender_user_id is distinct from ${u.id}) and m.created_at > coalesce((select last_read_at from chat_members cm where cm.conversation_id = ${s.chatConversations.id} and cm.user_id = ${u.id}), 'epoch'))`,
    })
    .from(s.chatConversations)
    .leftJoin(s.users, eq(s.users.id, s.chatConversations.customerUserId))
    .where(memberOf ? inArray(s.chatConversations.id, memberOf) : undefined)
    .orderBy(desc(s.chatConversations.lastMessageAt))
    .limit(200);
  return rows.map((r) => ({ ...r.c, customer: r.customerName ? { name: r.customerName, email: r.customerEmail, kind: r.customerKind, country: r.customerCountry } : null, last: r.last, lastKind: r.lastKind, unread: r.unread }));
}
