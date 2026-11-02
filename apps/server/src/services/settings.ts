import { eq } from "drizzle-orm";
import { EnvelopeSchema, PricingPolicySchema, SiteSettingsSchema, type Envelope, type PricingPolicy, type SiteSettings } from "@autofte/shared";
import { db } from "../db/client";
import { settings } from "../db/schema";

const cache = new Map<string, unknown>();

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  if (cache.has(key)) return cache.get(key) as T;
  const [row] = await db().select().from(settings).where(eq(settings.key, key)).limit(1);
  const v = (row?.value as T | undefined) ?? fallback;
  cache.set(key, v);
  return v;
}

export async function putSetting(key: string, value: unknown) {
  await db()
    .insert(settings)
    .values({ key, value: value as never })
    .onConflictDoUpdate({ target: settings.key, set: { value: value as never, updatedAt: new Date() } });
  cache.set(key, value);
}

export function clearSettingsCache() {
  cache.clear();
}

export const siteSettings = async (): Promise<SiteSettings> => SiteSettingsSchema.parse(await getSetting("site", {}));
/** The AI employee's name, for words the server writes itself. It may read the database: never call it inside a transaction. */
export const fteName = async () => (await siteSettings()).ftEName;
export const pricingPolicy = async (): Promise<PricingPolicy> => PricingPolicySchema.parse(await getSetting("pricing", {}));
export const envelope = async (): Promise<Envelope> => EnvelopeSchema.parse(await getSetting("envelope", {}));

/** Demo clock: admins can move "now" forward to show Sora's scheduled follow-ups without waiting a day. */
export async function now(): Promise<Date> {
  const off = Number(await getSetting("demo.clockOffsetMs", 0)) || 0;
  return new Date(Date.now() + off);
}
