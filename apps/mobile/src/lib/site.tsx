import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";
import type { Site } from "./types";

/** The tenant's branding (name, colours, contact, bank) — the same settings the website uses. */
const FALLBACK: Site = {
  companyName: "Hikari Motors",
  tagline: "Quality used cars from Japan, delivered to your port",
  ftEName: "Sora",
  primaryColor: "#0f4c81",
  accentColor: "#f59e0b",
  phone: "",
  whatsapp: "",
  email: "",
  address: "",
  bank: { bankName: "", branch: "", swift: "", accountName: "", accountNo: "" },
};

interface SiteCtx {
  site: Site;
  loaded: boolean;
  reload: () => Promise<void>;
}
const Ctx = createContext<SiteCtx>({ site: FALLBACK, loaded: false, reload: async () => {} });

export function SiteProvider({ children }: { children: ReactNode }) {
  const [site, setSite] = useState<Site>(FALLBACK);
  const [loaded, setLoaded] = useState(false);
  const reload = useCallback(async () => {
    try {
      const r = await api.get<{ site: Site }>("/api/public/site");
      setSite({ ...FALLBACK, ...r.site });
    } catch {
      /* offline: keep the last branding */
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  const value = useMemo(() => ({ site, loaded, reload }), [site, loaded, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSite = () => useContext(Ctx);

/** Brand colours derived from settings; everything else is a fixed neutral scale. */
export function useColors() {
  const { site } = useSite();
  return useMemo(() => ({ ...C, brand: site.primaryColor || C.brand, accent: site.accentColor || C.accent }), [site.primaryColor, site.accentColor]);
}

export const C = {
  brand: "#0f4c81",
  accent: "#f59e0b",
  bg: "#f1f5f9",
  card: "#ffffff",
  line: "#e2e8f0",
  ink: "#0f172a",
  text: "#334155",
  muted: "#64748b",
  faint: "#94a3b8",
  green: "#059669",
  greenBg: "#ecfdf5",
  amber: "#b45309",
  amberBg: "#fffbeb",
  red: "#e11d48",
  redBg: "#fff1f2",
  violet: "#6d28d9",
  violetBg: "#f5f3ff",
  blueBg: "#eff6ff",
};
