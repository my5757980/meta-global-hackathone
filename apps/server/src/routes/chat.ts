import { Router } from "express";
import multer from "multer";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import * as s from "../db/schema";
import { bad, forbidden, h, notFound, parse, HttpError } from "../lib/http";
import { isStaff, requireAuth, requirePerm } from "../auth/session";
import { addToGroup, canSeeConversation, createGroup, deskAgents, deskConversations, ensureCustomerConversation, ensureStaffDm, listMessages, markRead, peopleForBuyers, postMessage, receiptsFor, removeFromGroup, renameGroup, setHolder, teamDirectory } from "../services/chat";
import { iceServers, pendingCallFor, signalCall, startCall } from "../services/calls";
import { isOnline } from "../services/sse";
import { saveFile } from "../services/files";
import { triggerSora } from "../fte/agent";
import { ON_A_CALL } from "../fte/prompts";
import { transcribeMessage } from "../fte/voice";
import { audit } from "../services/audit";
import { notify, usersWithPerm } from "../services/notify";
import { fteName } from "../services/settings";
import { env } from "../env";
import { tooMany } from "../services/publicDemo";

export const chatRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 10 } });

/** The signed-in buyer's own conversation (customer or visitor). */
chatRouter.get(
  "/mine",
  h(async (req) => {
    const u = requireAuth(req);
    if (isStaff(u)) throw bad("Staff use the desk");
    const conv = await ensureCustomerConversation(u.id, req.query.channel === "app" ? "app" : "web");
    const messages = await listMessages(conv.id, { limit: 80 });
    await markRead(conv.id, u.id);
    // the colleague holding the chat (a buyer can call them while they are online)
    const [agent] = conv.holder === "human" && conv.assignedUserId ? await db().select({ id: s.users.id, name: s.users.name, title: s.users.title }).from(s.users).where(eq(s.users.id, conv.assignedUserId)).limit(1) : [];
    return { conversation: conv, messages, agent: agent ? { ...agent, online: isOnline(agent.id) } : null };
  }),
);

chatRouter.get(
  "/conversations",
  h(async (req) => {
    if (req.query.scope === "team") {
      const u = requireAuth(req);
      if (!isStaff(u)) throw forbidden();
      return deskConversations(u, "team");
    }
    const u = requirePerm(req, "chat.desk");
    return deskConversations(u, req.query.scope === "all" ? "all" : "mine", typeof req.query.agent === "string" ? req.query.agent : undefined);
  }),
);

/** See-everything staff drill down: agent, then that agent's customers. */
chatRouter.get(
  "/desk-agents",
  h(async (req) => {
    requirePerm(req, "chat.view_all");
    return deskAgents();
  }),
);

/** The ticks: what the other side has received and read in this conversation. */
chatRouter.get(
  "/conversations/:id/receipts",
  h(async (req) => {
    const u = requireAuth(req);
    const conv = await canSeeConversation(u, String(req.params.id));
    return receiptsFor(conv, u.id);
  }),
);

/** A buyer asks for a person: the team with green dots, then one of them, or whoever is free. */
chatRouter.get(
  "/people",
  h(async (req) => {
    const u = requireAuth(req);
    if (isStaff(u)) throw bad("Staff use the desk");
    return peopleForBuyers();
  }),
);
chatRouter.post(
  "/mine/person",
  h(async (req) => {
    const u = requireAuth(req);
    if (isStaff(u)) throw bad("Staff use the desk");
    const b = parse(z.object({ userId: z.string().min(8).optional() }), req.body ?? {});
    const conv = await ensureCustomerConversation(u.id, req.query.channel === "app" ? "app" : "web");
    const link = `/desk?c=${conv.id}`;
    if (b.userId) {
      const person = (await peopleForBuyers()).find((p) => p.id === b.userId);
      if (!person) throw notFound("That person is not on the team");
      if (conv.holder === "human" && conv.assignedUserId === person.id) return { ok: true };
      await setHolder(conv.id, "human", { id: person.id, name: person.name }, person.online ? undefined : "they are away and will answer here when they are back");
      await notify([person.id], { type: "handover", title: `${u.name} asked for you in the chat`, body: "Open the chat desk to answer", link });
    } else {
      if (conv.holder === "human") return { ok: true };
      await setHolder(conv.id, "human", null, "the customer asked for a person");
      await notify(await usersWithPerm("chat.desk"), { type: "handover", title: `${u.name} asked for a person`, body: "Open the chat desk to answer", link });
    }
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "chat.person_requested", entity: "conversation", entityId: conv.id, summary: `${u.name} asked for a person in the chat` });
    return { ok: true };
  }),
);
chatRouter.post(
  "/mine/back-to-fte",
  h(async (req) => {
    const u = requireAuth(req);
    if (isStaff(u)) throw bad("Staff use the desk");
    const conv = await ensureCustomerConversation(u.id, req.query.channel === "app" ? "app" : "web");
    if (conv.holder === "fte") return { ok: true };
    await setHolder(conv.id, "fte", null);
    return { ok: true };
  }),
);

/** Team chat: colleagues with green dots, private DMs, groups. */
chatRouter.get(
  "/team",
  h(async (req) => {
    const u = requireAuth(req);
    if (!isStaff(u)) throw forbidden();
    return teamDirectory(u.id);
  }),
);

chatRouter.post(
  "/dm",
  h(async (req) => {
    const u = requireAuth(req);
    if (!isStaff(u)) throw forbidden();
    const b = parse(z.object({ userId: z.string().min(1).max(40) }), req.body);
    return ensureStaffDm(u, b.userId);
  }),
);

chatRouter.post(
  "/groups",
  h(async (req) => {
    const u = requirePerm(req, "chat.groups");
    const b = parse(z.object({ title: z.string().trim().min(2).max(80), memberIds: z.array(z.string().max(40)).min(1).max(50) }), req.body);
    return createGroup(u, b.title, b.memberIds);
  }),
);

chatRouter.patch(
  "/groups/:id",
  h(async (req) => {
    const u = requireAuth(req);
    const b = parse(z.object({ title: z.string().trim().min(2).max(80) }), req.body);
    await renameGroup(u, String(req.params.id), b.title);
    return { ok: true };
  }),
);

chatRouter.post(
  "/groups/:id/members",
  h(async (req) => {
    const u = requireAuth(req);
    const b = parse(z.object({ userIds: z.array(z.string().max(40)).min(1).max(50) }), req.body);
    await addToGroup(u, String(req.params.id), b.userIds);
    return { ok: true };
  }),
);

chatRouter.delete(
  "/groups/:id/members/:userId",
  h(async (req) => {
    const u = requireAuth(req);
    await removeFromGroup(u, String(req.params.id), String(req.params.userId));
    return { ok: true };
  }),
);

chatRouter.post(
  "/groups/:id/leave",
  h(async (req) => {
    const u = requireAuth(req);
    await removeFromGroup(u, String(req.params.id), u.id);
    return { ok: true };
  }),
);

/** Voice / video call in a conversation (1:1). The browsers connect directly; we ring and relay. */
chatRouter.post(
  "/conversations/:id/calls",
  h(async (req) => {
    const u = requireAuth(req);
    const b = parse(z.object({ media: z.enum(["audio", "video"]).default("audio") }), req.body ?? {});
    return startCall(u, String(req.params.id), b.media);
  }),
);

chatRouter.get(
  "/calls/pending",
  h(async (req) => ({ call: await pendingCallFor(requireAuth(req).id) })),
);

chatRouter.get(
  "/ice",
  h((req) => {
    requireAuth(req);
    return { iceServers: iceServers() };
  }),
);

/** The app's Firebase token. A new sign-in on the same phone takes it over, so a push never reaches the last person who used it. */
chatRouter.post(
  "/push-token",
  h(async (req) => {
    const u = requireAuth(req);
    const b = parse(z.object({ token: z.string().min(20).max(4096), platform: z.string().max(20).default("android") }), req.body);
    await db().insert(s.pushTokens).values({ token: b.token, userId: u.id, platform: b.platform }).onConflictDoUpdate({ target: s.pushTokens.token, set: { userId: u.id, platform: b.platform, updatedAt: new Date() } });
    return { ok: true };
  }),
);

chatRouter.post(
  "/push-token/forget",
  h(async (req) => {
    const u = requireAuth(req);
    const b = parse(z.object({ token: z.string().min(20).max(4096) }), req.body);
    await db().delete(s.pushTokens).where(and(eq(s.pushTokens.token, b.token), eq(s.pushTokens.userId, u.id)));
    return { ok: true };
  }),
);

chatRouter.post(
  "/calls/:id/signal",
  h(async (req) => {
    const u = requireAuth(req);
    const b = parse(z.object({ type: z.enum(["accept", "decline", "end", "offer", "answer", "ice"]), data: z.unknown().optional() }), req.body);
    return signalCall(u, String(req.params.id), b.type, b.data);
  }),
);

chatRouter.get(
  "/conversations/:id",
  h(async (req) => {
    const u = requireAuth(req);
    const conv = await canSeeConversation(u, String(req.params.id));
    const messages = await listMessages(conv.id, { limit: 100 });
    const [customer] = conv.customerUserId ? await db().select({ id: s.users.id, name: s.users.name, email: s.users.email, phone: s.users.phone, kind: s.users.kind, countryCode: s.users.countryCode, company: s.users.company }).from(s.users).where(eq(s.users.id, conv.customerUserId)).limit(1) : [];
    const members = await db().select({ id: s.users.id, name: s.users.name, kind: s.users.kind, title: s.users.title, lastSeenAt: s.users.lastSeenAt, role: s.chatMembers.role }).from(s.chatMembers).innerJoin(s.users, eq(s.users.id, s.chatMembers.userId)).where(eq(s.chatMembers.conversationId, conv.id));
    await markRead(conv.id, u.id).catch(() => {});
    return { conversation: conv, messages, customer: customer ? { ...customer, online: isOnline(customer.id) } : null, members: members.map((m) => ({ ...m, online: isOnline(m.id) })) };
  }),
);

const sendSchema = z.object({ body: z.string().max(8000).default(""), kind: z.enum(["text", "image", "voice"]).default("text"), fileIds: z.array(z.string()).max(20).default([]), onCall: z.boolean().optional() });

chatRouter.post(
  "/conversations/:id/messages",
  h(async (req) => {
    const u = requireAuth(req);
    const conv = await canSeeConversation(u, String(req.params.id));
    const body = parse(sendSchema, req.body);
    if (!body.body.trim() && !body.fileIds.length) throw bad("Empty message");
    if (env.PUBLIC_DEMO && !isStaff(u) && tooMany(`msg:${u.id}`, 30, 10 * 60_000)) throw new HttpError(429, "This is a shared public demo: please wait a few minutes before sending more.");
    if (body.fileIds.length) {
      const owned = await db().select({ id: s.files.id, owner: s.files.ownerUserId }).from(s.files).where(inArray(s.files.id, body.fileIds));
      if (owned.length !== body.fileIds.length || owned.some((f) => f.owner !== u.id)) throw forbidden("Attach only your own uploads");
    }
    // a staff member writing in a thread Sora holds takes it over automatically
    if (isStaff(u) && u.kind === "staff" && conv.kind === "customer" && conv.holder === "fte") {
      await setHolder(conv.id, "human", { id: u.id, name: u.name });
    }
    const msg = await postMessage({ conversationId: conv.id, senderUserId: u.id, kind: body.kind, body: body.body, fileIds: body.fileIds });
    if (body.kind === "voice") void transcribeMessage(msg.id); // start hearing it at once (also useful to staff)
    if (!isStaff(u) && conv.kind === "customer") {
      const [fresh] = await db().select({ holder: s.chatConversations.holder }).from(s.chatConversations).where(eq(s.chatConversations.id, conv.id)).limit(1);
      if (fresh?.holder === "fte") triggerSora(conv.id, { kind: "message", note: body.onCall ? ON_A_CALL : undefined });
    }
    return msg;
  }),
);

chatRouter.post(
  "/upload",
  upload.array("files", 10),
  h(async (req) => {
    const u = requireAuth(req);
    const files = (req.files as Express.Multer.File[]) ?? [];
    if (!files.length) throw bad("No file");
    const out = [];
    for (const f of files) {
      const mime = f.mimetype;
      if (!/^(image\/(png|jpeg|webp)|audio\/(wav|x-wav|mpeg|ogg|webm|mp4|aac))$/.test(mime)) throw bad(`Unsupported file type ${mime}`);
      const kind = mime.startsWith("image/") ? "chat-image" : "chat-voice";
      out.push(await saveFile(f.buffer, { kind, mime: mime === "audio/x-wav" ? "audio/wav" : mime, originalName: f.originalname, ownerUserId: u.id }));
    }
    return { files: out.map((f) => ({ id: f.id })) };
  }),
);

chatRouter.post(
  "/conversations/:id/read",
  h(async (req) => {
    const u = requireAuth(req);
    const conv = await canSeeConversation(u, String(req.params.id));
    await markRead(conv.id, u.id);
    return { ok: true };
  }),
);

chatRouter.post(
  "/conversations/:id/takeover",
  h(async (req) => {
    const u = requirePerm(req, "chat.desk");
    const conv = await canSeeConversation(u, String(req.params.id));
    if (conv.kind !== "customer") throw bad("Only customer conversations");
    await setHolder(conv.id, "human", { id: u.id, name: u.name });
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "chat.takeover", entity: "conversation", entityId: conv.id, summary: `${u.name} took over from ${await fteName()}`, conversationId: conv.id });
    return { ok: true };
  }),
);

chatRouter.post(
  "/conversations/:id/handback",
  h(async (req) => {
    const u = requirePerm(req, "chat.desk");
    const conv = await canSeeConversation(u, String(req.params.id));
    if (conv.kind !== "customer") throw bad("Only customer conversations");
    await setHolder(conv.id, "fte", { id: u.id, name: u.name });
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "chat.handback", entity: "conversation", entityId: conv.id, summary: `${u.name} handed the conversation back to ${await fteName()}`, conversationId: conv.id });
    return { ok: true };
  }),
);

/** Media of a chat message: only people in the conversation (or see-everything staff). */
chatRouter.get(
  "/media/:fileId",
  h(async (req, res) => {
    const u = requireAuth(req);
    const [m] = await db().select().from(s.chatMessages).where(eq(s.chatMessages.id, String(req.query.m ?? ""))).limit(1);
    if (!m || !(m.fileIds as string[]).includes(String(req.params.fileId))) throw notFound();
    await canSeeConversation(u, m.conversationId);
    const { getFile } = await import("../services/files");
    const f = await getFile(String(req.params.fileId));
    if (!f) throw notFound();
    res.setHeader("Content-Type", f.mime);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.sendFile(f.abs, { dotfiles: "allow" }); // stored under .data/ — send() treats dot-folders as missing by default
    return undefined;
  }),
);
