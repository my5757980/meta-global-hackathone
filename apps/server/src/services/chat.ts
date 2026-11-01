import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db, type DBorTx } from "../db/client";
import * as s from "../db/schema";
import { bad, forbidden, notFound } from "../lib/http";
import type { AuthUser } from "../auth/session";
import { isOnline, onPresence, publish, onlineUserIds } from "./sse";
import { permsForRole } from "../auth/session";

// green dots: tell every open tab when someone comes online or leaves; remember when they were last here
onPresence((userId, online) => {
  publish(onlineUserIds(), "presence", { userId, online, at: new Date().toISOString() });
  if (!online) void db().update(s.users).set({ lastSeenAt: new Date() }).where(eq(s.users.id, userId)).catch(() => {});
});

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

/**
 * WARNING: do not pass a PGlite transaction as `tx`. The recipient fan-out below (conversationMembers,
 * onlineViewAll → permsForRole) uses db(), and PGlite has one connection, so a db() call inside
 * db().transaction() deadlocks the server. Post the message after the transaction commits.
 */
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
  // see-everything staff follow BUYER threads live; staff DMs and groups stay with their members
  const [cv] = await tx.select({ kind: s.chatConversations.kind }).from(s.chatConversations).where(eq(s.chatConversations.id, m.conversationId)).limit(1);
  const to = new Set([...(await conversationMembers(m.conversationId)), ...(cv?.kind === "customer" ? await onlineViewAll() : [])]);
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

/**
 * The desk lists. Buyers: "all" = every buyer conversation (needs chat.view_all), "mine" = the ones I am in.
 * Team: my staff DMs and groups — private to their members, whatever my permissions.
 */
export async function deskConversations(u: AuthUser, scope: "mine" | "all" | "team") {
  const memberOf = db().select({ id: s.chatMembers.conversationId }).from(s.chatMembers).where(eq(s.chatMembers.userId, u.id));
  const where =
    scope === "team"
      ? and(inArray(s.chatConversations.kind, ["staff_dm", "group"]), inArray(s.chatConversations.id, memberOf))
      : scope === "all" && u.perms.has("chat.view_all")
        ? eq(s.chatConversations.kind, "customer")
        : and(eq(s.chatConversations.kind, "customer"), inArray(s.chatConversations.id, memberOf));
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
      peerId: sql<string | null>`(select cm.user_id from chat_members cm where cm.conversation_id = ${s.chatConversations.id} and cm.user_id <> ${u.id} limit 1)`,
      peerName: sql<string | null>`(select uu.name from chat_members cm join users uu on uu.id = cm.user_id where cm.conversation_id = ${s.chatConversations.id} and cm.user_id <> ${u.id} limit 1)`,
      memberCount: sql<number>`(select count(*)::int from chat_members cm where cm.conversation_id = ${s.chatConversations.id})`,
    })
    .from(s.chatConversations)
    .leftJoin(s.users, eq(s.users.id, s.chatConversations.customerUserId))
    .where(where)
    .orderBy(desc(s.chatConversations.lastMessageAt))
    .limit(200);
  return rows.map((r) => ({
    ...r.c,
    customer: r.customerName ? { name: r.customerName, email: r.customerEmail, kind: r.customerKind, country: r.customerCountry, online: !!r.c.customerUserId && isOnline(r.c.customerUserId) } : null,
    peer: r.c.kind === "staff_dm" && r.peerId ? { id: r.peerId, name: r.peerName ?? "Colleague", online: isOnline(r.peerId) } : null,
    memberCount: r.memberCount,
    last: r.last,
    lastKind: r.lastKind,
    unread: r.unread,
  }));
}

/** Everyone on the team chat (active staff, not Sora), with a live green dot and last seen. */
export async function teamDirectory(meId: string) {
  const rows = await db()
    .select({ id: s.users.id, name: s.users.name, title: s.users.title, lastSeenAt: s.users.lastSeenAt, role: s.roles.name })
    .from(s.users)
    .leftJoin(s.roles, eq(s.roles.id, s.users.roleId))
    .where(and(eq(s.users.kind, "staff"), eq(s.users.isActive, true)))
    .orderBy(asc(s.users.name));
  return rows.filter((r) => r.id !== meId).map((r) => ({ ...r, online: isOnline(r.id) }));
}

async function activeStaff(ids: string[]) {
  if (!ids.length) return [];
  return db().select({ id: s.users.id, name: s.users.name }).from(s.users).where(and(inArray(s.users.id, ids), eq(s.users.kind, "staff"), eq(s.users.isActive, true)));
}

/** The one private thread between two colleagues. */
export async function ensureStaffDm(me: AuthUser, otherId: string) {
  if (otherId === me.id) throw bad("Choose a colleague");
  const [other] = await activeStaff([otherId]);
  if (!other) throw notFound("Colleague not found");
  const mine = db().select({ id: s.chatMembers.conversationId }).from(s.chatMembers).where(eq(s.chatMembers.userId, me.id));
  const theirs = db().select({ id: s.chatMembers.conversationId }).from(s.chatMembers).where(eq(s.chatMembers.userId, otherId));
  const [c] = await db()
    .select()
    .from(s.chatConversations)
    .where(and(eq(s.chatConversations.kind, "staff_dm"), inArray(s.chatConversations.id, mine), inArray(s.chatConversations.id, theirs)))
    .limit(1);
  if (c) return c;
  const [created] = await db().insert(s.chatConversations).values({ kind: "staff_dm", holder: "human" }).returning();
  await db().insert(s.chatMembers).values([
    { conversationId: created!.id, userId: me.id },
    { conversationId: created!.id, userId: otherId },
  ]);
  return created!;
}

export async function createGroup(me: AuthUser, title: string, memberIds: string[]) {
  const people = await activeStaff([...new Set(memberIds)].filter((x) => x !== me.id));
  if (!people.length) throw bad("Add at least one colleague");
  const [g] = await db().insert(s.chatConversations).values({ kind: "group", title: title.trim(), holder: "human" }).returning();
  await db().insert(s.chatMembers).values([{ conversationId: g!.id, userId: me.id, role: "owner" }, ...people.map((p) => ({ conversationId: g!.id, userId: p.id }))]);
  await postMessage({ conversationId: g!.id, senderUserId: null, kind: "system", body: `${me.name} created the group "${g!.title}" with ${people.map((p) => p.name).join(", ")}` });
  return g!;
}

async function groupFor(me: AuthUser, id: string, ownerOnly: boolean) {
  const [g] = await db().select().from(s.chatConversations).where(eq(s.chatConversations.id, id)).limit(1);
  if (!g || g.kind !== "group") throw notFound("Group not found");
  const [m] = await db().select().from(s.chatMembers).where(and(eq(s.chatMembers.conversationId, id), eq(s.chatMembers.userId, me.id))).limit(1);
  if (!m) throw forbidden("You are not in this group");
  if (ownerOnly && m.role !== "owner" && !me.perms.has("chat.view_all")) throw forbidden("Only the group's owner can do this");
  return g;
}

export async function renameGroup(me: AuthUser, id: string, title: string) {
  const g = await groupFor(me, id, true);
  await db().update(s.chatConversations).set({ title: title.trim() }).where(eq(s.chatConversations.id, g.id));
  await postMessage({ conversationId: g.id, senderUserId: null, kind: "system", body: `${me.name} renamed the group to "${title.trim()}"` });
}

export async function addToGroup(me: AuthUser, id: string, userIds: string[]) {
  const g = await groupFor(me, id, true);
  const people = await activeStaff(userIds);
  if (!people.length) throw bad("Choose colleagues to add");
  await db().insert(s.chatMembers).values(people.map((p) => ({ conversationId: g.id, userId: p.id }))).onConflictDoNothing();
  await postMessage({ conversationId: g.id, senderUserId: null, kind: "system", body: `${me.name} added ${people.map((p) => p.name).join(", ")}` });
}

export async function removeFromGroup(me: AuthUser, id: string, userId: string) {
  const g = await groupFor(me, id, userId !== me.id);
  const [who] = await db().select({ name: s.users.name }).from(s.users).where(eq(s.users.id, userId)).limit(1);
  const [gone] = await db().delete(s.chatMembers).where(and(eq(s.chatMembers.conversationId, g.id), eq(s.chatMembers.userId, userId))).returning();
  if (!gone) throw notFound("Not in this group");
  // an owner who leaves passes the group on to the longest-standing member
  if (gone.role === "owner") {
    const [next] = await db().select().from(s.chatMembers).where(eq(s.chatMembers.conversationId, g.id)).orderBy(asc(s.chatMembers.joinedAt)).limit(1);
    if (next) await db().update(s.chatMembers).set({ role: "owner" }).where(and(eq(s.chatMembers.conversationId, g.id), eq(s.chatMembers.userId, next.userId)));
  }
  await postMessage({ conversationId: g.id, senderUserId: null, kind: "system", body: userId === me.id ? `${me.name} left the group` : `${me.name} removed ${who?.name ?? "a member"}` });
  publish([userId], "holder", { conversationId: g.id, removed: true });
}
