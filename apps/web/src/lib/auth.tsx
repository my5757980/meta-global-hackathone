import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export interface Me {
  id: string;
  kind: "staff" | "customer" | "visitor" | "fte";
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  roleName: string | null;
  title: string | null;
  countryCode: string | null;
  perms: string[];
}

interface AuthCtx {
  me: Me | null;
  loading: boolean;
  demoMode: boolean;
  can: (perm: string) => boolean;
  isStaff: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["me"], queryFn: () => api.get<{ user: Me | null; demoMode: boolean }>("/api/auth/me"), staleTime: 60_000 });
  const me = q.data?.user ?? null;
  const value = useMemo<AuthCtx>(
    () => ({
      me,
      loading: q.isLoading,
      demoMode: q.data?.demoMode ?? false,
      can: (perm) => !!me?.perms.includes(perm),
      isStaff: me?.kind === "staff",
      refresh: async () => {
        await qc.invalidateQueries({ queryKey: ["me"] });
      },
      logout: async () => {
        await api.post("/api/auth/logout");
        qc.clear();
        window.location.href = "/";
      },
    }),
    [me, q.isLoading, q.data?.demoMode, qc],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}

/** Keep "online" fresh for staff green dots even without the chat open. */
export function usePresencePing(enabled: boolean) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => {
      void api.post("/api/ping").catch(() => {});
      force((x) => x + 1);
    }, 30_000);
    return () => clearInterval(t);
  }, [enabled]);
}
