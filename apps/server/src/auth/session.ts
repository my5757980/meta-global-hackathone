import type { NextFunction, Request, Response } from "express";
import { and, eq, gt } from "drizzle-orm";
import type { PermissionKey } from "@autofte/shared";
import { db } from "../db/client";
import { rolePermissions, roles, sessions, users } from "../db/schema";
import { randomToken, sha256 } from "../lib/id";
import { forbidden, HttpError } from "../lib/http";
import { isProd } from "../env";

export const COOKIE = "afte_sid";
const TTL_MS = 1000 * 60 * 60 * 12; // 12 h

export interface AuthUser {
  id: string;
  kind: string;
  name: string;
  email: string | null;
  phone: string | null;
  roleSlug: string | null;
  roleName: string | null;
  title: string | null;
  countryCode: string | null;
  mustChangePassword: boolean;
  hasRecoveryKey: boolean;
  perms: Set<string>;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const permCache = new Map<string, Set<string>>();
export function clearPermCache() {
  permCache.clear();
}

export async function permsForRole(roleId: string | null): Promise<Set<string>> {
  if (!roleId) return new Set();
  const hit = permCache.get(roleId);
  if (hit) return hit;
  const rows = await db().select({ k: rolePermissions.permissionKey }).from(rolePermissions).where(eq(rolePermissions.roleId, roleId));
  const set = new Set(rows.map((r) => r.k));
  permCache.set(roleId, set);
  return set;
}

export async function loadAuthUser(userId: string): Promise<AuthUser | null> {
  const [u] = await db()
    .select({
      id: users.id,
      kind: users.kind,
      name: users.name,
      email: users.email,
      phone: users.phone,
      isActive: users.isActive,
      roleId: users.roleId,
      roleSlug: roles.slug,
      roleName: roles.name,
      title: users.title,
      countryCode: users.countryCode,
      mustChangePassword: users.mustChangePassword,
      recoveryKeyHash: users.recoveryKeyHash,
    })
    .from(users)
    .leftJoin(roles, eq(roles.id, users.roleId))
    .where(eq(users.id, userId))
    .limit(1);
  if (!u || !u.isActive) return null;
  const { recoveryKeyHash, ...rest } = u;
  return { ...rest, hasRecoveryKey: !!recoveryKeyHash, perms: await permsForRole(u.roleId) };
}

/** Returns the raw token. Only an app client is ever given it in JSON (see sessionFor); browsers keep the httpOnly cookie. */
export async function createSession(res: Response, userId: string, userAgent?: string, ttlMs = TTL_MS): Promise<string> {
  const token = randomToken(32);
  await db()
    .insert(sessions)
    .values({ id: sha256(token), userId, expiresAt: new Date(Date.now() + ttlMs), userAgent: userAgent?.slice(0, 200) ?? null });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: isProd, maxAge: ttlMs, path: "/" });
  return token;
}

/** The phone app has no cookie jar it can rely on: it says `x-autofte-client: app` and sends `Authorization: Session <token>`. */
export const isAppClient = (req: Request) => req.headers["x-autofte-client"] === "app";
const APP_TTL_MS = 1000 * 60 * 60 * 24 * 30; // a phone is not a browser tab: 30 days

/** Start a session; an app client also receives the token in the response body. */
export async function sessionFor(req: Request, res: Response, userId: string): Promise<{ sessionToken?: string }> {
  const app = isAppClient(req);
  const token = await createSession(res, userId, req.headers["user-agent"], app ? APP_TTL_MS : TTL_MS);
  return app ? { sessionToken: token } : {};
}

function tokenFrom(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Session ")) return auth.slice(8);
  return req.cookies?.[COOKIE];
}

export async function destroySession(req: Request, res: Response) {
  const token = tokenFrom(req);
  if (token) await db().delete(sessions).where(eq(sessions.id, sha256(token)));
  res.clearCookie(COOKIE, { path: "/" });
}

/** Attach req.user when a valid session cookie (or Bearer session token for the app) is present. */
export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = tokenFrom(req);
    if (token) {
      const [sess] = await db()
        .select()
        .from(sessions)
        .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, new Date())))
        .limit(1);
      if (sess) {
        const u = await loadAuthUser(sess.userId);
        if (u) req.user = u;
      }
    }
    next();
  } catch (e) {
    next(e);
  }
}

export function requireAuth(req: Request) {
  if (!req.user) throw new HttpError(401, "Please sign in");
  return req.user;
}

export function can(u: AuthUser | undefined, perm: PermissionKey): boolean {
  return !!u && u.perms.has(perm);
}

export function requirePerm(req: Request, perm: PermissionKey) {
  const u = requireAuth(req);
  if (!u.perms.has(perm)) throw forbidden();
  return u;
}

export function isStaff(u: AuthUser | undefined): boolean {
  return !!u && (u.kind === "staff" || u.kind === "fte");
}
