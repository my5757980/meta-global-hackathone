import { defineConfig } from "drizzle-kit";

// Migrations are generated from the schema and committed; the server applies them on boot
// to either the embedded PGlite database or a real Postgres (DATABASE_URL).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  casing: "snake_case",
});
