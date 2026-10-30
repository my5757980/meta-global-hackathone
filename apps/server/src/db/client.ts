import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { env, pgliteDir } from "../env";
import * as schema from "./schema";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(here, "../../drizzle");

export type DB = PgliteDatabase<typeof schema>;
/** A transaction handle has the same query API as the db. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type DBorTx = DB | Tx;

let _db: DB | null = null;
let _pglite: PGlite | null = null;
let _pool: pg.Pool | null = null;

/**
 * One database for the whole platform: embedded PGlite by default (no install for judges),
 * or a real Postgres when DATABASE_URL is set. Both use the same schema and migrations.
 */
export async function openDb(opts: { memory?: boolean } = {}): Promise<DB> {
  if (_db) return _db;
  if (env.DATABASE_URL && !opts.memory) {
    _pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });
    _db = drizzlePg(_pool, { schema, casing: "snake_case" }) as unknown as DB;
  } else {
    if (!opts.memory) mkdirSync(pgliteDir, { recursive: true });
    _pglite = opts.memory ? new PGlite() : new PGlite(pgliteDir);
    await _pglite.waitReady;
    _db = drizzlePglite(_pglite, { schema, casing: "snake_case" });
  }
  return _db;
}

export function db(): DB {
  if (!_db) throw new Error("Database not opened yet");
  return _db;
}

export async function runMigrations(): Promise<void> {
  const d = db();
  if (_pool) await migratePg(d as never, { migrationsFolder });
  else await migratePglite(d, { migrationsFolder });
}

export async function closeDb(): Promise<void> {
  if (_pglite) await _pglite.close();
  if (_pool) await _pool.end();
  _db = null;
  _pglite = null;
  _pool = null;
}

export function dbKind(): "pglite" | "postgres" {
  return _pool ? "postgres" : "pglite";
}

export { schema };
