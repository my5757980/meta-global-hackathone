import { rmSync } from "node:fs";
import { sql } from "drizzle-orm";
import { clearPermCache } from "../auth/session";
import { db, runMigrations } from "../db/client";
import { env, filesDir } from "../env";
import { forgetSale } from "../fte/demoSale";
import { seedAll } from "../seed";
import { clearSettingsCache } from "./settings";

/** Put the demo company back: the same steps as `npm run setup -- --reset`, inside the running server. Everyone is signed out. */
let resetting = false;
let lastReset = Date.now();
export const resetRunning = () => resetting;
export const lastResetAt = () => lastReset;

export async function resetDemo(): Promise<number> {
  resetting = true;
  const t0 = Date.now();
  try {
    await db().execute(sql`drop schema if exists public cascade`);
    await db().execute(sql`drop schema if exists drizzle cascade`);
    await db().execute(sql`create schema public`);
    rmSync(filesDir, { recursive: true, force: true });
    await runMigrations();
    await seedAll(db(), () => {});
    clearSettingsCache();
    clearPermCache();
    forgetSale();
    lastReset = Date.now();
    return Math.round((lastReset - t0) / 1000);
  } finally {
    resetting = false;
  }
}

/**
 * A demo open to the public: anyone can press anything, including Admin. So it puts itself back every few hours, but not under
 * someone's hands: it waits for a quiet moment, and only after anything has changed.
 */
let lastChange = 0;
export const noteChange = () => {
  lastChange = Date.now();
};
const QUIET_MS = 20 * 60_000;

export function startPublicDemoResets() {
  const every = env.PUBLIC_DEMO_RESET_HOURS * 3_600_000;
  setInterval(() => {
    const now = Date.now();
    if (resetting || lastChange <= lastReset || now - lastReset < every) return;
    if (now - lastChange < QUIET_MS && now - lastReset < every * 2) return;
    void resetDemo()
      .then((s) => console.log(`[demo] put back in ${s} s`))
      .catch((e) => console.error("[demo] reset failed", (e as Error).message));
  }, 5 * 60_000).unref();
}
