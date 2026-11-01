import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";
import { getToken, needsServer, setToken } from "./config";
import type { Me } from "./types";

interface AuthCtx {
  ready: boolean;
  me: Me | null;
  demoMode: boolean;
  isBuyer: boolean;
  signIn: (login: string, password: string) => Promise<void>;
  register: (f: { name: string; email: string; phone: string; password: string; countryCode?: string }) => Promise<void>;
  demo: () => Promise<void>;
  visitor: (f: { name: string; email: string; phone: string }) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

type SessionResponse = { user: Me | null; sessionToken?: string };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [demoMode, setDemoMode] = useState(false);

  const refresh = useCallback(async () => {
    if (needsServer()) {
      setMe(null);
      return;
    }
    try {
      const r = await api.get<{ user: Me | null; demoMode: boolean }>("/api/auth/me");
      setDemoMode(!!r.demoMode);
      setMe(r.user);
      if (!r.user && getToken()) await setToken(null); // expired or signed out elsewhere
    } catch {
      /* offline: keep what we had */
    }
  }, []);

  useEffect(() => {
    // the server address and token were loaded by Boot before this provider mounted
    void refresh().finally(() => setReady(true));
  }, [refresh]);

  const adopt = useCallback(async (r: SessionResponse) => {
    if (r.sessionToken) await setToken(r.sessionToken);
    setMe(r.user);
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      ready,
      me,
      demoMode,
      isBuyer: me?.kind === "customer" || me?.kind === "visitor",
      signIn: async (login, password) => adopt(await api.post<SessionResponse>("/api/auth/login", { login, password })),
      register: async (f) => adopt(await api.post<SessionResponse>("/api/auth/register", f)),
      demo: async () => adopt(await api.post<SessionResponse>("/api/auth/demo/customer")),
      visitor: async (f) => adopt(await api.post<SessionResponse>("/api/auth/visitor", { ...f, channel: "app" })),
      signOut: async () => {
        try {
          await api.post("/api/auth/logout");
        } catch {
          /* still forget it here */
        }
        await setToken(null);
        setMe(null);
      },
      refresh,
    }),
    [ready, me, demoMode, adopt, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
