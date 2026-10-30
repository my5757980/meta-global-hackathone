import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Bot, CheckCheck, FileText, Send, Ship } from "lucide-react";
import type { ChatCard } from "@autofte/shared";
import { api } from "../lib/api";
import { miniMarkdown, time, usd2 } from "../lib/format";
import { useLiveEvent } from "../lib/sse";
import { Avatar, Badge, clsx } from "../ui";

export interface ChatMsg {
  id: string;
  conversationId: string;
  senderUserId: string | null;
  kind: string;
  body: string;
  fileIds: string[];
  meta: { cards?: ChatCard[]; holder?: string } | null;
  createdAt: string;
  sender: { id: string; name: string; kind: string; title?: string | null } | null;
}

export function useConversation(conversationId: string | null, initial: ChatMsg[] = []) {
  const [messages, setMessages] = useState<ChatMsg[]>(initial);
  const [typing, setTyping] = useState(false);
  useEffect(() => setMessages(initial), [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps
  const onMessage = useCallback(
    (m: ChatMsg) => {
      if (m.conversationId !== conversationId) return;
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    },
    [conversationId],
  );
  const onTyping = useCallback((t: { conversationId: string; on: boolean }) => t.conversationId === conversationId && setTyping(t.on), [conversationId]);
  useLiveEvent("message", onMessage);
  useLiveEvent("typing", onTyping);
  return { messages, setMessages, typing };
}

function Cards({ cards, mine }: { cards: ChatCard[]; mine: boolean }) {
  return (
    <div className="mt-2 space-y-2">
      {cards.map((c, i) => {
        if (c.type === "vehicles")
          return (
            <div key={i} className="scrollbar-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {c.items.map((it) => (
                <Link key={it.id} to={it.link} className="w-48 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-800 shadow-sm hover:shadow">
                  <img src={it.image} alt="" className="aspect-[16/10] w-full object-cover" />
                  <div className="p-2">
                    <p className="text-[11px] font-semibold text-brand-700">{it.id}</p>
                    <p className="line-clamp-2 text-xs font-semibold">{it.title}</p>
                    <p className="mt-1 text-sm font-bold">{it.priceLabel}</p>
                    <p className="truncate text-[11px] text-slate-500">{it.facts.join(" · ")}</p>
                  </div>
                </Link>
              ))}
            </div>
          );
        if (c.type === "quote")
          return (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-3 text-slate-800 shadow-sm">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-700">
                <Ship className="size-3.5" /> Landed price to {c.port}
              </p>
              <p className="mt-0.5 text-xs font-semibold">{c.title}</p>
              <div className="mt-2 space-y-1 text-xs">
                {c.lines.map((l) => (
                  <div key={l.label} className={clsx("flex justify-between gap-3", /^C&F|^CIF/.test(l.label) && "border-t border-slate-100 pt-1 font-bold text-slate-900")}>
                    <span className="text-slate-600">{l.label}</span>
                    <span className="shrink-0">{usd2(l.usd)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-slate-400">Computed by the company price policy · valid 7 days</p>
            </div>
          );
        if (c.type === "invoice")
          return (
            <Link key={i} to={c.link} className="block rounded-xl border border-slate-200 bg-white p-3 text-slate-800 shadow-sm hover:shadow">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-sm font-bold">
                  <FileText className="size-4 text-brand-600" /> Invoice {c.number}
                </p>
                <Badge tone={c.status === "approved" ? "green" : c.status === "pending" ? "amber" : "gray"}>{c.status === "pending" ? "Waiting for approval" : c.status}</Badge>
              </div>
              <div className="mt-2 flex justify-between text-xs">
                <span className="text-slate-500">Total C&F</span>
                <span className="font-bold">{usd2(c.totalUsd)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Advance</span>
                <span className="font-semibold">{usd2(c.advanceUsd)}</span>
              </div>
            </Link>
          );
        return null;
      })}
      {mine && null}
    </div>
  );
}

export function MessageList({ messages, meId, typing, perspective = "buyer" }: { messages: ChatMsg[]; meId: string | null; typing?: boolean; perspective?: "buyer" | "staff" }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, typing]);
  return (
    <div className="space-y-3">
      {messages.map((m) => {
        if (m.kind === "system")
          return (
            <p key={m.id} className="mx-auto max-w-[90%] rounded-full bg-slate-100 px-3 py-1 text-center text-[11px] text-slate-500">
              {m.body}
            </p>
          );
        const mine = perspective === "buyer" ? m.senderUserId === meId : m.sender?.kind !== "customer" && m.sender?.kind !== "visitor";
        const isSora = m.sender?.kind === "fte";
        return (
          <div key={m.id} className={clsx("flex gap-2", mine ? "flex-row-reverse" : "flex-row")}>
            {!mine && <Avatar name={m.sender?.name} kind={m.sender?.kind} size={30} />}
            <div className={clsx("max-w-[85%]", mine && "items-end")}>
              {!mine && perspective === "buyer" && <p className="mb-0.5 text-[11px] font-semibold text-slate-500">{isSora ? "Sora · AI sales executive" : m.sender?.name}</p>}
              {perspective === "staff" && <p className={clsx("mb-0.5 text-[11px] font-semibold", isSora ? "text-violet-600" : "text-slate-500", mine && "text-right")}>{isSora ? "Sora (AI)" : m.sender?.name}</p>}
              {m.body && (
                <div
                  className={clsx(
                    "prose-lite rounded-2xl px-3 py-2 text-sm break-words [&_p]:my-0.5 [&_ul]:my-1",
                    mine ? (perspective === "staff" && isSora ? "rounded-br-md bg-violet-600 text-white [&_strong]:text-white" : "rounded-br-md bg-brand-600 text-white [&_strong]:text-white") : "rounded-bl-md bg-white text-slate-800 ring-1 ring-slate-200",
                  )}
                  dangerouslySetInnerHTML={{ __html: miniMarkdown(m.body) }}
                />
              )}
              {m.meta?.cards?.length ? <Cards cards={m.meta.cards} mine={mine} /> : null}
              <p className={clsx("mt-0.5 flex items-center gap-1 text-[10px] text-slate-400", mine && "justify-end")}>
                {time(m.createdAt)} {mine && <CheckCheck className="size-3" />}
              </p>
            </div>
          </div>
        );
      })}
      {typing && (
        <div className="flex items-center gap-2">
          <Avatar kind="fte" size={30} />
          <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-white px-3 py-3 ring-1 ring-slate-200">
            <span className="typing-dot size-1.5 rounded-full bg-slate-500" />
            <span className="typing-dot size-1.5 rounded-full bg-slate-500" />
            <span className="typing-dot size-1.5 rounded-full bg-slate-500" />
            <span className="ml-2 text-[11px] text-slate-500">Sora is working…</span>
          </div>
        </div>
      )}
      <div ref={end} />
    </div>
  );
}

export function Composer({ conversationId, onSent, initial, placeholder }: { conversationId: string; onSent?: (m: ChatMsg) => void; initial?: string; placeholder?: string }) {
  const [text, setText] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (initial) setText(initial);
  }, [initial]);
  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const m = await api.post<ChatMsg>(`/api/chat/conversations/${conversationId}/messages`, { body });
      setText("");
      onSent?.(m);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="border-t border-slate-200 bg-white p-2">
      {err && <p className="px-2 pb-1 text-xs text-rose-600">{err}</p>}
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder={placeholder ?? "Write a message…"}
          className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-brand-500 focus:bg-white focus:outline-none"
        />
        <button onClick={() => void send()} disabled={busy || !text.trim()} className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50" aria-label="Send">
          <Send className="size-4" />
        </button>
      </div>
      <p className="mt-1 flex items-center gap-1 px-1 text-[10px] text-slate-400">
        <Bot className="size-3" /> Sora is an AI built with Muse Spark Open · a person approves every invoice
      </p>
    </div>
  );
}
