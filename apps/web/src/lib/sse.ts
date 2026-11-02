import { useEffect } from "react";

type Listener = (data: any) => void;
const listeners = new Map<string, Set<Listener>>();
let es: EventSource | null = null;
let retry = 1000;
let wanted = false;

const EVENTS = ["message", "message.meta", "typing", "notification", "holder", "read", "delivered", "fte.run", "call", "presence"];

function connect() {
  if (!wanted || es) return;
  es = new EventSource("/api/stream", { withCredentials: true });
  es.onopen = () => {
    retry = 1000;
  };
  for (const ev of EVENTS) {
    es.addEventListener(ev, (e) => {
      let data: unknown = null;
      try {
        data = JSON.parse((e as MessageEvent).data);
      } catch {
        /* ignore */
      }
      listeners.get(ev)?.forEach((fn) => fn(data));
    });
  }
  es.onerror = () => {
    es?.close();
    es = null;
    if (wanted) setTimeout(connect, (retry = Math.min(retry * 2, 15000)));
  };
}

/** Open the live stream while signed in (one per tab). */
export function useLiveStream(enabled: boolean) {
  useEffect(() => {
    wanted = enabled;
    if (enabled) connect();
    else {
      es?.close();
      es = null;
    }
  }, [enabled]);
}

export function useLiveEvent(event: string, fn: Listener) {
  useEffect(() => {
    let set = listeners.get(event);
    if (!set) listeners.set(event, (set = new Set()));
    set.add(fn);
    return () => {
      set!.delete(fn);
    };
  }, [event, fn]);
}
