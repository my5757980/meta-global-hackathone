import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { randomToken } from "../lib/id";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

/** A random password nobody knows — demo accounts are entered through the demo sign-in buttons. */
export function randomPassword(): string {
  return randomToken(18);
}

/** XXXX-XXXX-XXXX with no 0/O/1/I: read out over the phone once, then the buyer must change it. */
export function oneTimePassword(): string {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return [...randomBytes(12)].map((x) => A[x % A.length]).join("").match(/.{4}/g)!.join("-");
}
