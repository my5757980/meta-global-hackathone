import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const here = dirname(fileURLToPath(import.meta.url));
/** Repository root (…/autofte). */
export const ROOT = resolve(here, "../../..");

// Load the root .env once (Node ≥ 20.12 has process.loadEnvFile).
const envFile = resolve(ROOT, ".env");
if (existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile);
  } catch {
    /* ignore malformed lines; zod below reports what is missing */
  }
}

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().default(8787),
  PUBLIC_URL: z.string().default("http://localhost:5173"),
  DATABASE_URL: z.string().optional(),
  DATA_DIR: z.string().default(resolve(ROOT, ".data")),
  SESSION_SECRET: z.string().default("dev-only-change-me"),
  DEMO_MODE: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
  BASETEN_API_KEY: z.string().optional(),
  BASETEN_BASE_URL: z.string().default("https://inference.baseten.co/v1"),
  BASETEN_MODEL: z.string().default("meta-models/muse-spark-open-1026"),
  FIREWORKS_API_KEY: z.string().optional(),
  FIREWORKS_BASE_URL: z.string().default("https://api.fireworks.ai/inference/v1"),
  FIREWORKS_MODEL: z.string().optional(),
  FTE_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
  DEMO_FEED_MINUTES: z.coerce.number().min(0).default(15), // 0 = no new demo lots arrive
  WORKFORCE_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
  FIREBASE_SERVICE_ACCOUNT: z.string().optional(),
  PUBLIC_DEMO: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  PUBLIC_DEMO_RESET_HOURS: z.coerce.number().positive().default(3),
  PUBLIC_DEMO_TOKENS_PER_DAY: z.coerce.number().int().positive().default(2_000_000),
  TURN_URL: z.string().optional(),
  TURN_USERNAME: z.string().optional(),
  TURN_PASSWORD: z.string().optional(),
  SMTP_URL: z.string().optional(),
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_SECRET: z.string().optional(),
  PAYPAL_BASE_URL: z.string().default("https://api-m.sandbox.paypal.com"),
  MAIL_FROM: z.string().default("no-reply@hikari-motors.example"),
});

export const env = schema.parse(process.env);
export const isProd = env.NODE_ENV === "production";
export const filesDir = resolve(env.DATA_DIR, "files");
export const pgliteDir = resolve(env.DATA_DIR, "pglite");
export const skillsDir = resolve(ROOT, "skills");
export const webDist = resolve(ROOT, "apps/web/dist");
