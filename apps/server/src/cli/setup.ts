/**
 * `npm run setup` — create/upgrade the database and load the demo data.
 *   --reset   wipe the embedded database (or every table on DATABASE_URL) and seed again
 */
import { rmSync } from "node:fs";
import { sql } from "drizzle-orm";
import { env, filesDir, pgliteDir } from "../env";
import { closeDb, db, dbKind, lockPglite, openDb, runMigrations } from "../db/client";
import { isSeeded, seedAll } from "../seed";

async function main() {
  const reset = process.argv.includes("--reset");
  if (reset && !env.DATABASE_URL) {
    lockPglite(); // refuse to wipe the files under a running server
    rmSync(pgliteDir, { recursive: true, force: true });
    rmSync(filesDir, { recursive: true, force: true });
  }
  const t0 = Date.now();
  await openDb();
  if (reset && env.DATABASE_URL) {
    await db().execute(sql`drop schema if exists public cascade`);
    await db().execute(sql`drop schema if exists drizzle cascade`);
    await db().execute(sql`create schema public`);
    rmSync(filesDir, { recursive: true, force: true });
  }
  await runMigrations();
  console.log(`database ready (${dbKind()})`);
  if (await isSeeded(db())) {
    console.log("demo data already present — use `npm run setup -- --reset` to start again");
  } else {
    const sum = await seedAll(db(), (m) => console.log("  " + m));
    console.log("demo data loaded:", JSON.stringify(sum));
  }
  await closeDb();
  console.log(`setup finished in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => {});
  process.exit(1);
});
