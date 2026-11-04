import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useLiveEvent } from "./sse";

/** How many chat messages are waiting for this person. The tab title carries the number too. */
export function useChatUnread(on: boolean) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["chat-unread"], queryFn: () => api.get<{ unread: number }>("/api/chat/unread"), enabled: on, refetchInterval: 60_000 });
  const again = useCallback(() => void qc.invalidateQueries({ queryKey: ["chat-unread"] }), [qc]);
  useLiveEvent("message", again);
  const n = on ? (q.data?.unread ?? 0) : 0;
  useEffect(() => {
    const plain = document.title.replace(/^\(\d+\+?\)\s*/, "");
    document.title = n > 0 ? `(${n > 99 ? "99+" : n}) ${plain}` : plain;
  }, [n]);
  return n;
}

/** A short tone made in the browser: nothing to fetch, nothing to fail. */
export function chime() {
  try {
    const ac = new AudioContext();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.connect(g).connect(ac.destination);
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.14, ac.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.32);
    o.start();
    o.stop(ac.currentTime + 0.34);
    o.onended = () => void ac.close().catch(() => {});
  } catch {
    /* a browser that will not make a noise is not a fault */
  }
}
