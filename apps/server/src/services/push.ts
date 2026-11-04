import { createSign } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import * as s from "../db/schema";
import { env } from "../env";

/**
 * Push to the Android app when its owner is away: Firebase Cloud Messaging v1, spoken to directly (a signed token, then one POST).
 * Optional: with no FIREBASE_SERVICE_ACCOUNT in .env nothing is sent, and the app still gets everything while it is open.
 */
interface Account {
  project_id: string;
  client_email: string;
  private_key: string;
}
let account: Account | null | undefined;
function firebase(): Account | null {
  if (account !== undefined) return account;
  account = null;
  const raw = env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) return account;
  try {
    const parsed = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8")) as Account;
    if (parsed.project_id && parsed.client_email && parsed.private_key) account = parsed;
    else console.warn("[push] FIREBASE_SERVICE_ACCOUNT is missing fields: push is off");
  } catch {
    console.warn("[push] FIREBASE_SERVICE_ACCOUNT is not valid JSON: push is off");
  }
  return account;
}
export const pushConfigured = () => !!firebase();

let cached: { token: string; until: number } | null = null;
async function accessToken(a: Account): Promise<string> {
  if (cached && cached.until > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: a.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(a.private_key, "base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!r.ok || !j.access_token) throw new Error(`Firebase refused the sign-in (${r.status})`);
  cached = { token: j.access_token, until: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return cached.token;
}

export interface PushNote {
  kind: "message" | "call";
  title: string;
  body: string;
  data?: Record<string, string>;
}

/** Returns how many phones Firebase accepted it for. Never throws: a push must not break what triggered it. */
export async function pushToUsers(userIds: string[], note: PushNote): Promise<number> {
  const a = firebase();
  if (!a || !userIds.length) return 0;
  try {
    const rows = await db().select({ token: s.pushTokens.token }).from(s.pushTokens).where(inArray(s.pushTokens.userId, userIds));
    if (!rows.length) return 0;
    const bearer = await accessToken(a);
    const actions = env.PUSH_ACTION_BUTTONS;
    let sent = 0;
    for (const { token } of rows) {
      const r = await fetch(`https://fcm.googleapis.com/v1/projects/${a.project_id}/messages:send`, {
        method: "POST",
        headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
        body: JSON.stringify({
          message: actions
            ? {
                // data only: the phone's own notification service draws it, and only then can it carry buttons
                token,
                data: { kind: note.kind, ...note.data, title: note.title.slice(0, 80), message: note.body.slice(0, 180), channelId: note.kind === "call" ? "calls" : "messages", categoryId: note.kind === "call" ? "call" : "message", body: JSON.stringify({ kind: note.kind, ...note.data }) },
                android: { priority: "HIGH", ttl: note.kind === "call" ? "45s" : "3600s" },
              }
            : {
                token,
                data: { kind: note.kind, ...note.data },
                android: {
                  priority: "HIGH",
                  ttl: note.kind === "call" ? "45s" : "3600s",
                  notification: { channel_id: note.kind === "call" ? "calls" : "messages", title: note.title.slice(0, 80), body: note.body.slice(0, 180), sound: "default", tag: note.data?.conversationId },
                },
              },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (r.ok) sent += 1;
      else if (r.status === 404 || r.status === 400) {
        console.warn(`[push] Firebase refused a phone (${r.status}): token removed`);
        await db().delete(s.pushTokens).where(eq(s.pushTokens.token, token)); // uninstalled, or a stale token
      } else console.warn(`[push] Firebase answered ${r.status}`);
    }
    console.log(`[push] ${note.kind}: sent to ${sent} of ${rows.length} phone(s)`);
    return sent;
  } catch (e) {
    console.warn("[push]", (e as Error).message);
    return 0;
  }
}
