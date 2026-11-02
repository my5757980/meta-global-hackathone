import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Bot, CheckCheck, ChevronLeft, ChevronRight, FileText, Mic, Paperclip, Phone, Send, Ship, Square, Video, Volume2, X } from "lucide-react";
import { resizeImage, WavRecorder } from "./media";
import type { ChatCard } from "@autofte/shared";
import { api } from "../lib/api";
import { miniMarkdown, time, usd2 } from "../lib/format";
import { FteName } from "../lib/site";
import { useLiveEvent } from "../lib/sse";
import { Avatar, Badge, clsx } from "../ui";

export interface ChatMsg {
  id: string;
  conversationId: string;
  senderUserId: string | null;
  kind: string;
  body: string;
  fileIds: string[];
  meta: { cards?: ChatCard[]; holder?: string; transcript?: string; language?: string } | null;
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
  const onMeta = useCallback(
    (e: { id: string; conversationId: string; meta: ChatMsg["meta"] }) => {
      if (e.conversationId !== conversationId) return;
      setMessages((prev) => prev.map((x) => (x.id === e.id ? { ...x, meta: { ...(x.meta ?? {}), ...(e.meta ?? {}) } } : x)));
    },
    [conversationId],
  );
  useLiveEvent("message", onMessage);
  useLiveEvent("message.meta", onMeta);
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
              <p className="mt-2 text-[11px] text-slate-400">Computed by the company price policy · valid 7 days</p>
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


function ImageGrid({ msg }: { msg: ChatMsg }) {
  const [open, setOpen] = useState<number | null>(null);
  const urls = msg.fileIds.map((f) => `/api/chat/media/${f}?m=${msg.id}`);
  return (
    <>
      <div className={clsx("mt-1 grid gap-1", urls.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
        {urls.slice(0, 4).map((u, i) => (
          <button key={u} onClick={() => setOpen(i)} className="relative overflow-hidden rounded-xl">
            <img src={u} alt="" className="h-28 w-full max-w-[16rem] object-cover" loading="lazy" />
            {i === 3 && urls.length > 4 && <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-lg font-bold text-white">+{urls.length - 4}</span>}
          </button>
        ))}
      </div>
      {open !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90" onClick={() => setOpen(null)}>
          <button className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white" aria-label="Close">
            <X className="size-6" />
          </button>
          {urls.length > 1 && (
            <button className="absolute left-3 rounded-full bg-white/10 p-2 text-white" aria-label="Previous" onClick={(e) => { e.stopPropagation(); setOpen((open - 1 + urls.length) % urls.length); }}>
              <ChevronLeft className="size-6" />
            </button>
          )}
          <img src={urls[open]} alt="" className="max-h-[90vh] max-w-[92vw] object-contain" onClick={(e) => e.stopPropagation()} />
          {urls.length > 1 && (
            <button className="absolute right-3 rounded-full bg-white/10 p-2 text-white" aria-label="Next" onClick={(e) => { e.stopPropagation(); setOpen((open + 1) % urls.length); }}>
              <ChevronRight className="size-6" />
            </button>
          )}
        </div>
      )}
    </>
  );
}

/** Spoken playback with the browser's own speech synthesis (not an AI model call). */
function SpeakButton({ text }: { text: string }) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const plain = text.replace(/\*\*/g, "").replace(/[#*_`>]/g, "");
  return (
    <button
      onClick={() => {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(plain);
        if (/[؀-ۿ]/.test(plain)) u.lang = "ur-PK";
        window.speechSynthesis.speak(u);
      }}
      className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-brand-600"
      aria-label="Listen"
    >
      <Volume2 className="size-3" /> Listen
    </button>
  );
}

export function MessageList({ messages, meId, typing, perspective = "buyer" }: { messages: ChatMsg[]; meId: string | null; typing?: boolean; perspective?: "buyer" | "staff" | "team" }) {
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
        if (m.kind === "call") {
          const meta = m.meta as { media?: string; status?: string } | null;
          const missed = meta?.status !== "ended";
          return (
            <p key={m.id} className={clsx("mx-auto flex w-fit max-w-[90%] items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold", missed ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700")}>
              {meta?.media === "video" ? <Video className="size-3.5" /> : <Phone className="size-3.5" />} {m.body}
              <span className="font-normal text-slate-500">
                · {m.sender?.name ?? ""} · {time(m.createdAt)}
              </span>
            </p>
          );
        }
        const mine = perspective === "staff" ? m.sender?.kind !== "customer" && m.sender?.kind !== "visitor" : m.senderUserId === meId;
        const isSora = m.sender?.kind === "fte";
        return (
          <div key={m.id} className={clsx("flex gap-2", mine ? "flex-row-reverse" : "flex-row")}>
            {!mine && <Avatar name={m.sender?.name} kind={m.sender?.kind} size={30} />}
            <div className={clsx("max-w-[85%]", mine && "items-end")}>
              {!mine && perspective === "buyer" && <p className="mb-0.5 text-[11px] font-semibold text-slate-500">{isSora ? <><FteName /> · AI sales executive</> : m.sender?.name}</p>}
              {perspective === "staff" && <p className={clsx("mb-0.5 text-[11px] font-semibold", isSora ? "text-violet-600" : "text-slate-500", mine && "text-right")}>{isSora ? <><FteName /> (AI)</> : m.sender?.name}</p>}
              {perspective === "team" && !mine && <p className="mb-0.5 text-[11px] font-semibold text-slate-500">{m.sender?.name}</p>}
              {m.body && (
                <div
                  className={clsx(
                    "prose-lite rounded-2xl px-3 py-2 text-sm break-words [&_p]:my-0.5 [&_ul]:my-1",
                    mine ? (perspective === "staff" && isSora ? "rounded-br-md bg-violet-600 text-white [&_strong]:text-white" : "rounded-br-md bg-brand-600 text-white [&_strong]:text-white") : "rounded-bl-md bg-white text-slate-800 ring-1 ring-slate-200",
                  )}
                  dangerouslySetInnerHTML={{ __html: miniMarkdown(m.body) }}
                />
              )}
              {m.kind === "image" && m.fileIds?.length > 0 && <ImageGrid msg={m} />}
              {m.kind === "voice" && m.fileIds?.length > 0 && (
                <div className="mt-1">
                  <audio controls preload="none" src={`/api/chat/media/${m.fileIds[0]}?m=${m.id}`} className="h-10 w-64 max-w-full" />
                  {m.meta?.transcript ? (
                    <p className="mt-1 max-w-xs text-xs text-slate-500 italic">“{m.meta.transcript}”{m.meta.language ? ` · ${m.meta.language}` : ""}</p>
                  ) : (
                    <p className="mt-1 text-[11px] text-slate-400">Transcribing…</p>
                  )}
                </div>
              )}
              {m.meta?.cards?.length ? <Cards cards={m.meta.cards} mine={mine} /> : null}
              {isSora && m.body && perspective === "buyer" && <SpeakButton text={m.body} />}
              <p className={clsx("mt-0.5 flex items-center gap-1 text-[11px] text-slate-400", mine && "justify-end")}>
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
            <span className="ml-2 text-[11px] text-slate-500"><FteName /> is working…</span>
          </div>
        </div>
      )}
      <div ref={end} />
    </div>
  );
}

export function Composer({ conversationId, onSent, initial, placeholder, soraHint = true }: { conversationId: string; onSent?: (m: ChatMsg) => void; initial?: string; placeholder?: string; soraHint?: boolean }) {
  const [text, setText] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rec, setRec] = useState<WavRecorder | null>(null);
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (initial) setText(initial);
  }, [initial]);
  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => setSecs(Math.round((Date.now() - rec.startedAt) / 1000)), 500);
    return () => clearInterval(t);
  }, [rec]);
  const post = async (body: unknown) => {
    const m = await api.post<ChatMsg>(`/api/chat/conversations/${conversationId}/messages`, body);
    onSent?.(m);
  };
  const upload = async (blobs: { blob: Blob; name: string }[]) => {
    const fd = new FormData();
    blobs.forEach((b) => fd.append("files", b.blob, b.name));
    const r = await api.post<{ files: { id: string }[] }>("/api/chat/upload", fd);
    return r.files.map((f) => f.id);
  };
  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await post({ body });
      setText("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const sendPictures = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    setErr(null);
    try {
      const blobs = await Promise.all(files.slice(0, 10).map(async (f, i) => ({ blob: await resizeImage(f), name: `photo-${i + 1}.jpg` })));
      const ids = await upload(blobs);
      await post({ kind: "image", fileIds: ids, body: text.trim() });
      setText("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const toggleVoice = async () => {
    setErr(null);
    if (!rec) {
      try {
        const r = new WavRecorder();
        await r.start();
        setSecs(0);
        setRec(r);
      } catch {
        setErr("Microphone not available — allow microphone access to send a voice note.");
      }
      return;
    }
    setBusy(true);
    try {
      const { blob, seconds } = await rec.stop();
      setRec(null);
      if (seconds < 0.8) return;
      const ids = await upload([{ blob, name: "voice-note.wav" }]);
      await post({ kind: "voice", fileIds: ids, body: "" });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="border-t border-slate-200 bg-white p-2">
      {err && <p className="px-2 pb-1 text-xs text-rose-600">{err}</p>}
      {rec ? (
        <div className="flex items-center gap-2">
          <span className="flex flex-1 items-center gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-700">
            <span className="size-2 animate-pulse rounded-full bg-rose-600" /> Recording… {secs}s
          </span>
          <button onClick={() => { rec.cancel(); setRec(null); }} className="rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button onClick={() => void toggleVoice()} className="flex size-10 items-center justify-center rounded-xl bg-rose-600 text-white" aria-label="Stop and send voice note">
            <Square className="size-4 fill-current" />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-1.5">
          <label className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="Send pictures">
            <Paperclip className="size-5" />
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void sendPictures([...(e.target.files ?? [])]); e.target.value = ""; }} />
          </label>
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
          {text.trim() ? (
            <button onClick={() => void send()} disabled={busy} className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50" aria-label="Send">
              <Send className="size-4" />
            </button>
          ) : (
            <button onClick={() => void toggleVoice()} disabled={busy} className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50" aria-label="Record a voice note">
              <Mic className="size-4" />
            </button>
          )}
        </div>
      )}
      {soraHint && (
        <p className="mt-1 flex items-center gap-1 px-1 text-[11px] text-slate-400">
          <Bot className="size-3" /> <FteName /> is an AI built with Muse Spark Open · voice notes in Urdu or English · a person approves every invoice
        </p>
      )}
    </div>
  );
}
