import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db, type DBorTx } from "../db/client";
import * as s from "../db/schema";
import { bad, forbidden, notFound } from "../lib/http";
import type { AuthUser } from "../auth/session";
import { isOnline, onPresence, publish, onlineUserIds } from "./sse";
import { permsForRole } from "../auth/session";
import { fteName } from "./settings";
import { pushConfigured, pushToUsers } from "./push";

// green dots: tell every open tab when someone comes online or leaves; remember when they were last here
onPresence((userId, online) => {
  publish(onlineUserIds(), "presence", { userId, online, at: new Date().toISOString() });
  if (!online) void db().update(s.users).set({ lastSeenAt: new Date() }).where(eq(s.users.id, userId)).catch(() => {});
  // coming online brings every waiting message to this person's screen: two ticks for whoever sent them
  else void db().update(s.chatMembers).set({ lastDeliveredAt: new Date() }).where(eq(s.chatMembers.userId, userId)).then(() => publish(onlineUserIds(), "delivered", { userId })).catch(() => {});
});

export async function soraUserId(): Promise<string> {
  const [u] = await db().select({ id: s.users.id }).from(s.users).where(eq(s.users.username, "sora")).limit(1);
  if (!u) throw new Error("The AI employee's account is missing — run npm run setup");
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
  const [cv] = await tx.select({ kind: s.chatConversations.kind, holder: s.chatConversations.holder }).from(s.chatConversations).where(eq(s.chatConversations.id, m.conversationId)).limit(1);
  const to = new Set([...(await conversationMembers(m.conversationId)), ...(cv?.kind === "customer" ? await onlineViewAll() : [])]);
  publish(to, "message", out);
  // one tick became two for everyone already online (and for the AI employee while the thread is theirs: it is always here)
  if (m.senderUserId && (m.kind ?? "text") !== "system") {
    const sora = await soraUserId();
    const here = [...(await conversationMembers(m.conversationId))].filter((id) => id !== m.senderUserId && (id === sora ? cv?.holder === "fte" : isOnline(id)));
    if (here.length) {
      await tx.update(s.chatMembers).set({ lastDeliveredAt: new Date() }).where(and(eq(s.chatMembers.conversationId, m.conversationId), inArray(s.chatMembers.userId, here)));
      publish(to, "delivered", { conversationId: m.conversationId });
    }
  }
  // whoever is away gets a push (not awaited: a message is never held up by Firebase, and it may be inside a transaction)
  if (m.senderUserId && (m.kind ?? "text") !== "system" && pushConfigured()) {
    const away = [...(await conversationMembers(m.conversationId))].filter((id) => id !== m.senderUserId && !isOnline(id));
    const what = (m.body ?? "").trim() || (m.kind === "voice" ? "Voice note" : m.kind === "image" ? "Picture" : "New message");
    if (away.length) void pushToUsers(away, { kind: "message", title: sender?.name ?? "New message", body: what, data: { conversationId: m.conversationId } });
  }
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
  const at = new Date();
  await db().update(s.chatMembers).set({ lastReadAt: at, lastDeliveredAt: at }).where(and(eq(s.chatMembers.conversationId, conversationId), eq(s.chatMembers.userId, userId)));
  const [cv] = await db().select({ kind: s.chatConversations.kind }).from(s.chatConversations).where(eq(s.chatConversations.id, conversationId)).limit(1);
  const others = new Set([...(await conversationMembers(conversationId)), ...(cv?.kind === "customer" ? await onlineViewAll() : [])]);
  others.delete(userId);
  publish(others, "read", { conversationId, userId, at: at.toISOString() });
}

/**
 * The ticks on my messages: what the other side has received and read. A buyer sees the team's answer to their messages;
 * staff see the buyer's. In a group, read means everyone has read.
 */
export async function receiptsFor(conv: { id: string; kind: string; customerUserId: string | null }, viewerId: string) {
  const rows = await db().select({ userId: s.chatMembers.userId, readAt: s.chatMembers.lastReadAt, deliveredAt: s.chatMembers.lastDeliveredAt }).from(s.chatMembers).where(eq(s.chatMembers.conversationId, conv.id));
  const others = conv.kind === "customer" && viewerId !== conv.customerUserId ? rows.filter((r) => r.userId === conv.customerUserId) : rows.filter((r) => r.userId !== viewerId);
  const times = (k: "readAt" | "deliveredAt") => others.map((o) => (o[k] ? new Date(o[k]!).getTime() : 0));
  const pick = (k: "readAt" | "deliveredAt") => {
    const t = times(k);
    if (!t.length) return null;
    const v = conv.kind === "group" ? Math.min(...t) : Math.max(...t);
    return v ? new Date(v).toISOString() : null;
  };
  return { readAt: pick("readAt"), deliveredAt: pick("deliveredAt") };
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
  const text = holder === "human" ? `${byUser?.name ?? "A team member"} joined the conversation${note ? ` — ${note}` : ""}` : `${await fteName()} is back in the conversation${byUser ? ` (handed back by ${byUser.name})` : ""}`;
  await postMessage({ conversationId, senderUserId: null, kind: "system", body: text, meta: { holder } });
  publish(await conversationMembers(conversationId), "holder", { conversationId, holder });
}

/**
 * The desk lists. Buyers: "all" = every buyer conversation (needs chat.view_all), "mine" = the ones I am in.
 * Team: my staff DMs and groups — private to their members, whatever my permissions.
 */
export async function deskConversations(u: AuthUser, scope: "mine" | "all" | "team", agentId?: string) {
  const memberOf = db().select({ id: s.chatMembers.conversationId }).from(s.chatMembers).where(eq(s.chatMembers.userId, u.id));
  const where =
    scope === "team"
      ? and(inArray(s.chatConversations.kind, ["staff_dm", "group"]), inArray(s.chatConversations.id, memberOf))
      : scope === "all" && u.perms.has("chat.view_all")
        ? and(eq(s.chatConversations.kind, "customer"), agentId ? sql`(${s.chatConversations.assignedUserId} = ${agentId} or exists (select 1 from leads l where l.customer_user_id = ${s.chatConversations.customerUserId} and l.owner_user_id = ${agentId}))` : undefined)
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

/** See-everything staff: each agent with how many buyers' chats are theirs, to drill down agent, then customers. */
export async function deskAgents(viewerId: string) {
  const r = await db().execute(sql`select u.id, u.name, u.kind, count(distinct c.id)::int as n, max(c.last_message_at) as last_at,
      coalesce(sum((select count(*) from chat_messages m where m.conversation_id = c.id and m.kind <> 'system' and m.sender_user_id is distinct from ${viewerId}
        and m.created_at > coalesce((select last_read_at from chat_members cm where cm.conversation_id = c.id and cm.user_id = ${viewerId}), c.created_at))), 0)::int as unread
    from users u
    join chat_conversations c on c.kind = 'customer' and (c.assigned_user_id = u.id or exists (select 1 from leads l where l.customer_user_id = c.customer_user_id and l.owner_user_id = u.id))
    where u.kind in ('staff', 'fte')
    group by u.id, u.name, u.kind
    order by last_at desc nulls last, u.name`);
  return (r as unknown as { rows: { id: string; name: string; kind: string; n: number; unread: number }[] }).rows;
}

/** Messages written by others, in this person's conversations, after they last read them. */
export async function unreadTotal(userId: string) {
  const r = await db().execute(sql`select count(*)::int as n from chat_messages m join chat_members cm on cm.conversation_id = m.conversation_id and cm.user_id = ${userId}
    where m.kind <> 'system' and m.sender_user_id is distinct from ${userId} and m.created_at > coalesce(cm.last_read_at, 'epoch')`);
  return (r as unknown as { rows: { n: number }[] }).rows[0]?.n ?? 0;
}

/** Who a buyer can ask for in the chat: people on the chat desk, with a green dot. No e-mail or phone. */
export async function peopleForBuyers() {
  const rows = await db()
    .select({ id: s.users.id, name: s.users.name, title: s.users.title, roleId: s.users.roleId, forced: s.users.chatForced })
    .from(s.users)
    .where(and(eq(s.users.kind, "staff"), eq(s.users.isActive, true), eq(s.users.showInChat, true)))
    .orderBy(asc(s.users.name));
  const out: { id: string; name: string; title: string | null; online: boolean }[] = [];
  for (const r of rows) if (r.forced || (await permsForRole(r.roleId)).has("chat.desk")) out.push({ id: r.id, name: r.name, title: r.title, online: isOnline(r.id) });
  return out.sort((a, b) => Number(b.online) - Number(a.online));
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
  if (ownerOnly && m.role !== "owner") throw forbidden("Only the person who made this group can change it"); // a group is a room people were put in: an administrator gets no key to it
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
