import { createHash, randomBytes } from "node:crypto";

/** 24-char hex id (12 random bytes). */
export function genId(): string {
  return randomBytes(12).toString("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Short human code from an id, e.g. invoice "HK" + last 5 → HK7F3A2. */
export function shortCode(id: string, n = 5): string {
  return id.slice(-n).toUpperCase();
}
