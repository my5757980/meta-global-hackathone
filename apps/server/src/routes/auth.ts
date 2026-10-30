import { Router } from "express";
import { randomBytes } from "node:crypto";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { env } from "../env";
import { db } from "../db/client";
import * as s from "../db/schema";
import { bad, conflict, forbidden, h, HttpError, parse } from "../lib/http";
import { createSession, destroySession, loadAuthUser, requireAuth } from "../auth/session";
import { hashPassword, verifyPassword } from "../auth/passwords";
import { ensureCustomerConversation } from "../services/chat";
import { audit } from "../services/audit";

export const authRouter = Router();

const DEMO_USERS: Record<string, string> = {
  customer: "joseph.mwangi@example.com",
  agent: "ayesha@hikari-motors.example",
  supervisor: "daniel@hikari-motors.example",
  manager: "fatima@hikari-motors.example",
  admin: "kenji@hikari-motors.example",
  accounts: "grace@hikari-motors.example",
};

function publicMe(u: Awaited<ReturnType<typeof loadAuthUser>>) {
  if (!u) return null;
  return { id: u.id, kind: u.kind, name: u.name, email: u.email, phone: u.phone, role: u.roleSlug, roleName: u.roleName, title: u.title, countryCode: u.countryCode, mustChangePassword: u.mustChangePassword, hasRecoveryKey: u.hasRecoveryKey, perms: [...u.perms] };
}

authRouter.get("/me", h((req) => ({ user: publicMe(req.user ?? null), demoMode: env.DEMO_MODE })));

authRouter.get("/demo-roles", h(() => (env.DEMO_MODE ? Object.keys(DEMO_USERS) : [])));

/** One-click demo sign-in (no passwords anywhere in the repo, README or video). */
authRouter.post(
  "/demo/:role",
  h(async (req, res) => {
    if (!env.DEMO_MODE) throw forbidden("Demo sign-in is switched off");
    const email = DEMO_USERS[String(req.params.role)];
    if (!email) throw bad("Unknown demo role");
    const [u] = await db().select().from(s.users).where(eq(s.users.email, email)).limit(1);
    if (!u) throw bad("Demo data missing — run npm run setup");
    await createSession(res, u.id, req.headers["user-agent"]);
    return { user: publicMe(await loadAuthUser(u.id)) };
  }),
);

authRouter.post(
  "/login",
  h(async (req, res) => {
    const body = parse(z.object({ login: z.string().trim().min(2).max(120), password: z.string().min(1).max(200) }), req.body);
    const [u] = await db()
      .select()
      .from(s.users)
      .where(or(sql`lower(${s.users.email}) = lower(${body.login})`, sql`lower(${s.users.username}) = lower(${body.login})`))
      .limit(1);
    if (!u || !(await verifyPassword(body.password, u.passwordHash))) throw new HttpError(401, "These credentials do not match our records.");
    if (!u.isActive) throw new HttpError(403, "This account is switched off. Please contact the company.");
    await createSession(res, u.id, req.headers["user-agent"]);
    return { user: publicMe(await loadAuthUser(u.id)) };
  }),
);

authRouter.post(
  "/register",
  h(async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(2).max(80),
        email: z.string().trim().toLowerCase().email().max(120),
        phone: z.string().trim().min(6).max(30),
        password: z.string().min(8).max(200),
        countryCode: z.string().length(2).optional(),
        company: z.string().trim().max(120).optional(),
      }),
      req.body,
    );
    const [exists] = await db().select({ id: s.users.id, kind: s.users.kind }).from(s.users).where(sql`lower(${s.users.email}) = ${body.email}`).limit(1);
    if (exists && exists.kind !== "visitor") throw conflict("An account with this e-mail already exists — please sign in");
    const [role] = await db().select().from(s.roles).where(eq(s.roles.slug, "customer")).limit(1);
    const hash = await hashPassword(body.password);
    let userId: string;
    if (exists) {
      // a visitor who chatted before becomes a customer: same person, same conversation
      await db().update(s.users).set({ kind: "customer", name: body.name, phone: body.phone, passwordHash: hash, roleId: role!.id, countryCode: body.countryCode ?? null, company: body.company ?? null }).where(eq(s.users.id, exists.id));
      userId = exists.id;
    } else {
      const [u] = await db().insert(s.users).values({ kind: "customer", name: body.name, email: body.email, phone: body.phone, passwordHash: hash, roleId: role!.id, countryCode: body.countryCode ?? null, company: body.company ?? null }).returning();
      userId = u!.id;
    }
    // CRM records with this e-mail now belong to the account (the buyer sees their invoices)
    await db().update(s.leads).set({ customerUserId: userId }).where(and(sql`lower(${s.leads.email}) = ${body.email}`, isNull(s.leads.customerUserId)));
    await createSession(res, userId, req.headers["user-agent"]);
    return { user: publicMe(await loadAuthUser(userId)) };
  }),
);

authRouter.post(
  "/logout",
  h(async (req, res) => {
    await destroySession(req, res);
    return { ok: true };
  }),
);

/** Chat door for strangers: name + e-mail + phone once; the same e-mail continues the same conversation. */
authRouter.post(
  "/visitor",
  h(async (req, res) => {
    const body = parse(
      z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email().max(120), phone: z.string().trim().min(6).max(30), channel: z.enum(["web", "app"]).default("web") }),
      req.body,
    );
    if (req.user) {
      const conv = await ensureCustomerConversation(req.user.id, body.channel);
      return { user: publicMe(req.user), conversationId: conv.id };
    }
    const [u] = await db().select().from(s.users).where(sql`lower(${s.users.email}) = ${body.email}`).limit(1);
    if (u && u.kind !== "visitor") throw conflict("This e-mail has an account — please sign in to continue your conversation");
    let userId = u?.id;
    if (!userId) {
      const [created] = await db().insert(s.users).values({ kind: "visitor", name: body.name, email: body.email, phone: body.phone }).returning();
      userId = created!.id;
    } else {
      await db().update(s.users).set({ name: body.name, phone: body.phone }).where(and(eq(s.users.id, userId), eq(s.users.kind, "visitor")));
    }
    await createSession(res, userId, req.headers["user-agent"]);
    const conv = await ensureCustomerConversation(userId, body.channel);
    return { user: publicMe(await loadAuthUser(userId)), conversationId: conv.id };
  }),
);

authRouter.post(
  "/password",
  h(async (req) => {
    const me = requireAuth(req);
    const body = parse(z.object({ current: z.string().min(1), next: z.string().min(8).max(200) }), req.body);
    const [u] = await db().select().from(s.users).where(eq(s.users.id, me.id)).limit(1);
    if (!(await verifyPassword(body.current, u?.passwordHash))) throw bad("Your current password is not correct");
    if (body.next === body.current) throw bad("Choose a new password, not the one-time password");
    await db().update(s.users).set({ passwordHash: await hashPassword(body.next), mustChangePassword: false, updatedAt: new Date() }).where(eq(s.users.id, me.id));
    return { ok: true };
  }),
);

/**
 * Recovery key (staff): there is no e-mail server in the demo, so a lost password is recovered with a key the
 * person saved earlier. It is shown once, stored only as a hash, and works once — then they make a new one.
 */
const RECOVERY_WORDS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newRecoveryKey(): string {
  const raw = randomBytes(16);
  const chars = [...raw].map((x) => RECOVERY_WORDS[x % RECOVERY_WORDS.length]).join("");
  return chars.match(/.{4}/g)!.join("-");
}

authRouter.post(
  "/recovery-key",
  h(async (req) => {
    const me = requireAuth(req);
    if (me.kind !== "staff") throw forbidden("Recovery keys are for staff accounts");
    const body = parse(z.object({ password: z.string().min(1).max(200) }), req.body);
    const [u] = await db().select().from(s.users).where(eq(s.users.id, me.id)).limit(1);
    if (!(await verifyPassword(body.password, u?.passwordHash))) throw bad("Your password is not correct");
    const key = newRecoveryKey();
    await db().update(s.users).set({ recoveryKeyHash: await hashPassword(key), updatedAt: new Date() }).where(eq(s.users.id, me.id));
    await audit(db(), { actorUserId: me.id, actorKind: "human", action: "auth.recovery_key", entity: "user", entityId: me.id, summary: `${me.name} made a new recovery key` });
    return { recoveryKey: key };
  }),
);

const recoverTries = new Map<string, { n: number; until: number }>();
authRouter.post(
  "/recover",
  h(async (req) => {
    const body = parse(z.object({ email: z.string().trim().toLowerCase().email().max(120), recoveryKey: z.string().trim().min(10).max(40), newPassword: z.string().min(8).max(200) }), req.body);
    const k = `${body.email}|${req.ip}`;
    const t = recoverTries.get(k);
    if (t && t.n >= 5 && t.until > Date.now()) throw new HttpError(429, "Too many attempts — try again in 15 minutes");
    const [u] = await db().select().from(s.users).where(sql`lower(${s.users.email}) = ${body.email}`).limit(1);
    const key = body.recoveryKey.toUpperCase().replace(/[^A-Z0-9]/g, "").match(/.{1,4}/g)?.join("-") ?? "";
    if (!u || !u.isActive || !u.recoveryKeyHash || !(await verifyPassword(key, u.recoveryKeyHash))) {
      recoverTries.set(k, { n: (t && t.until > Date.now() ? t.n : 0) + 1, until: Date.now() + 15 * 60_000 });
      throw bad("That e-mail and recovery key do not match");
    }
    recoverTries.delete(k);
    await db().update(s.users).set({ passwordHash: await hashPassword(body.newPassword), recoveryKeyHash: null, mustChangePassword: false, updatedAt: new Date() }).where(eq(s.users.id, u.id));
    await db().delete(s.sessions).where(eq(s.sessions.userId, u.id)); // every old sign-in ends
    await audit(db(), { actorUserId: u.id, actorKind: "human", action: "auth.recovered", entity: "user", entityId: u.id, summary: `${u.name} reset their password with the recovery key (key used up)` });
    return { ok: true, message: "Password changed. Sign in, then make a new recovery key on your profile." };
  }),
);
