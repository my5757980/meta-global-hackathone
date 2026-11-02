import { AppState } from "react-native";
import { fetch as streamFetch } from "expo/fetch";
import { absUrl, authHeaders } from "./config";

/**
 * The server's live stream, the same one the website's tabs keep open: while it is open this person counts as online, so a
 * colleague's call can ring here and a new message arrives at once. It closes when the app goes to the background (a push does
 * the job from there), unless a call is on: the sound must not stop because someone looked at another app.
 */
type Listener = (data: never) => void;
const listeners = new Map<string, Set<Listener>>();
let holdInBackground = false;

export function onLive<T>(event: string, fn: (data: T) => void): () => void {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(fn as Listener);
  return () => void listeners.get(event)?.delete(fn as Listener);
}
const emit = (event: string, data: unknown) => listeners.get(event)?.forEach((fn) => (fn as (d: unknown) => void)(data));

export const holdLive = (on: boolean) => {
  holdInBackground = on;
};

/** Open the stream while signed in; returns how to stop it. It comes back by itself after a lost connection. */
export function startLive(): () => void {
  let stopped = false;
  let ctrl: AbortController | null = null;
  let wait = 1000;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const connect = async () => {
    if (stopped || ctrl || AppState.currentState === "background") return;
    const mine = new AbortController();
    ctrl = mine;
    try {
      const r = await streamFetch(absUrl("/api/stream"), { headers: { Accept: "text/event-stream", "x-autofte-client": "app", ...authHeaders() }, signal: mine.signal, credentials: "include" });
      if (!r.ok || !r.body) throw new Error(`stream ${r.status}`);
      wait = 1000;
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        for (let end = buffer.indexOf("\n\n"); end >= 0; end = buffer.indexOf("\n\n")) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          let event = "message";
          const data: string[] = [];
          for (const line of block.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) data.push(line.slice(5).trim());
          }
          if (!data.length) continue;
          try {
            emit(event, JSON.parse(data.join("\n")));
          } catch {
            /* one bad event must not end the stream */
          }
        }
      }
    } catch {
      /* lost, or aborted on purpose: the lines below decide */
    }
    if (ctrl === mine) ctrl = null;
    if (!stopped && AppState.currentState !== "background") {
      timer = setTimeout(() => void connect(), wait);
      wait = Math.min(wait * 2, 15_000);
    }
  };

  const sub = AppState.addEventListener("change", (state) => {
    if (state === "active") void connect();
    else if (state === "background" && !holdInBackground) {
      ctrl?.abort();
      ctrl = null;
    }
  });
  void connect();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    sub.remove();
    ctrl?.abort();
    ctrl = null;
  };
}
