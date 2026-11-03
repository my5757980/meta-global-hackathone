import Constants from "expo-constants";
import { absUrl } from "./config";

/** A screen that throws, or an error nobody caught, is reported to the server's log. Reporting must never itself break anything. */
export function reportCrash(e: unknown, where: string) {
  const err = e instanceof Error ? e : new Error(String(e));
  void fetch(absUrl("/api/public/crash"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: err.message.slice(0, 500), stack: err.stack?.slice(0, 4000), where, version: Constants.expoConfig?.version ?? "" }),
  }).catch(() => {});
}

export function watchCrashes() {
  const g = globalThis as unknown as { ErrorUtils?: { getGlobalHandler: () => (e: unknown, fatal?: boolean) => void; setGlobalHandler: (f: (e: unknown, fatal?: boolean) => void) => void } };
  if (!g.ErrorUtils) return;
  const before = g.ErrorUtils.getGlobalHandler();
  g.ErrorUtils.setGlobalHandler((e, fatal) => {
    reportCrash(e, fatal ? "fatal" : "uncaught");
    before(e, fatal);
  });
}
