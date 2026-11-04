import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, Check, CheckCheck, ChevronLeft, ChevronRight, FileText, Mic, Paperclip, Phone, PhoneMissed, Send, Ship, Smile, Square, Video, Volume2, X } from "lucide-react";
import { resizeImage, WavRecorder } from "./media";
import type { ChatCard } from "@autofte/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { miniMarkdown, time, usd2 } from "../lib/format";
import { FteName } from "../lib/site";
import { useLiveEvent } from "../lib/sse";
import { Avatar, Badge, clsx } from "../ui";

/** Nothing inside the chat shows a loading word: rows of the right shape with nothing in them yet read as arriving. */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden className="animate-pulse">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-slate-50 px-3 py-3">
          <span className="size-9 shrink-0 rounded-full bg-slate-200" />
          <span className="min-w-0 flex-1 space-y-2">
            <span className="block h-3 w-2/5 rounded bg-slate-200" />
            <span className="block h-2.5 w-4/5 rounded bg-slate-100" />
          </span>
        </div>
      ))}
    </div>
  );
}

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

export interface Receipts {
  deliveredAt: string | null;
  readAt: string | null;
}

export function useConversation(conversationId: string | null, initial: ChatMsg[] = []) {
  const [messages, setMessages] = useState<ChatMsg[]>(initial);
  const [typing, setTyping] = useState(false);
  const [receipts, setReceipts] = useState<Receipts | null>(null);
  const { me } = useAuth();
  const qc = useQueryClient();
  // somebody looking at a thread is reading it: that is what turns the other side's ticks blue
  const markRead = useCallback(() => {
    if (conversationId) void api.post(`/api/chat/conversations/${conversationId}/read`, {}).then(() => qc.invalidateQueries({ queryKey: ["chat-unread"] })).catch(() => {});
  }, [conversationId, qc]);
  useEffect(() => {
    window.addEventListener("focus", markRead);
    return () => window.removeEventListener("focus", markRead);
  }, [markRead]);
  useEffect(() => {
    const t = setTimeout(() => void qc.invalidateQueries({ queryKey: ["chat-unread"] }), 800); // opening it read it on the server
    return () => clearTimeout(t);
  }, [conversationId, qc]);
  const loadReceipts = useCallback(() => {
    if (conversationId) void api.get<Receipts>(`/api/chat/conversations/${conversationId}/receipts`).then(setReceipts).catch(() => {});
  }, [conversationId]);
  useEffect(loadReceipts, [loadReceipts]);
  const onReceipt = useCallback((e: { conversationId?: string }) => (!e.conversationId || e.conversationId === conversationId) && loadReceipts(), [conversationId, loadReceipts]);
  useLiveEvent("read", onReceipt);
  useLiveEvent("delivered", onReceipt);
  useEffect(() => setMessages(initial), [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps
  const onMessage = useCallback(
    (m: ChatMsg) => {
      if (m.conversationId !== conversationId) return;
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      if (m.senderUserId !== me?.id && document.hasFocus()) markRead();
    },
    [conversationId, me?.id, markRead],
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
  return { messages, setMessages, typing, receipts };
}

/** One tick: sent. Two: it reached them. Blue: they read it. */
function Ticks({ at, receipts }: { at: string; receipts?: Receipts | null }) {
  const t = new Date(at).getTime();
  if (receipts?.readAt && new Date(receipts.readAt).getTime() >= t) return <CheckCheck className="size-3.5 text-sky-500" role="img" aria-label="Read" />;
  if (receipts?.deliveredAt && new Date(receipts.deliveredAt).getTime() >= t) return <CheckCheck className="size-3.5" role="img" aria-label="Delivered" />;
  return <Check className="size-3.5" role="img" aria-label="Sent" />;
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
        if (c.type === "sheet")
          return (
            <Link key={i} to={`/auction/lots/${c.lotId}`} className="block rounded-xl border border-slate-200 bg-white p-3 text-slate-800 shadow-sm hover:shadow">
              <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
                <Badge tone={c.verdict === "good" ? "green" : c.verdict === "caution" ? "amber" : "red"}>{c.verdict.toUpperCase()}</Badge> Auction sheet · grade {c.grade}
              </p>
              <p className="mt-1 text-xs text-slate-600">{c.summary}</p>
            </Link>
          );
        return null;
      })}
      {mine && null}
    </div>
  );
}


const picUrl = (m: ChatMsg, f: string) => `/api/chat/media/${f}?m=${m.id}`;

function ImageGrid({ msg, onOpen }: { msg: ChatMsg; onOpen: (url: string) => void }) {
  const urls = msg.fileIds.map((f) => picUrl(msg, f));
  return (
    <div className={clsx("mt-1 grid gap-1", urls.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
      {urls.slice(0, 4).map((u, i) => (
        <button key={u} onClick={() => onOpen(u)} className="relative overflow-hidden rounded-xl" aria-label="Open the picture">
          <img src={u} alt="" className="h-28 w-full max-w-[16rem] object-cover" loading="lazy" />
          {i === 3 && urls.length > 4 && <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-lg font-bold text-white">+{urls.length - 4}</span>}
        </button>
      ))}
    </div>
  );
}

/** A picture, opened: every picture in the conversation is one arrow, key or swipe away, and "2 / 5" says how many there are. */
function PictureViewer({ shots, at, onClose }: { shots: string[]; at: number; onClose: () => void }) {
  const [i, setI] = useState(Math.max(0, at));
  const go = useCallback((d: number) => setI((n) => (n + d + shots.length) % shots.length), [shots.length]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [go, onClose]);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const many = shots.length > 1;
  return (
    <div
      role="dialog"
      aria-label="Picture"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90"
      onClick={onClose}
      onTouchStart={(e) => {
        const t = e.touches[0];
        touch.current = t && e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
      }}
      onTouchEnd={(e) => {
        const t = e.changedTouches[0];
        if (!t || !touch.current) return;
        const dx = t.clientX - touch.current.x;
        const dy = t.clientY - touch.current.y;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
      }}
    >
      <button className="absolute top-4 right-4 flex size-11 items-center justify-center rounded-full bg-white/10 text-white" aria-label="Close" onClick={onClose}>
        <X className="size-6" />
      </button>
      {many && <p className="absolute top-6 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-sm font-semibold text-white" aria-live="polite">{i + 1} / {shots.length}</p>}
      {many && (
        <button className="absolute left-3 flex size-11 items-center justify-center rounded-full bg-white/10 text-white" aria-label="Previous picture" onClick={(e) => { e.stopPropagation(); go(-1); }}>
          <ChevronLeft className="size-6" />
        </button>
      )}
      <img src={shots[i] ?? shots[0]} alt="" className="max-h-[90vh] max-w-[92vw] object-contain" onClick={(e) => e.stopPropagation()} />
      {many && (
        <button className="absolute right-3 flex size-11 items-center justify-center rounded-full bg-white/10 text-white" aria-label="Next picture" onClick={(e) => { e.stopPropagation(); go(1); }}>
          <ChevronRight className="size-6" />
        </button>
      )}
    </div>
  );
}

/** "Today", "Yesterday", or the date: the line between one day and the next. */
function dayOf(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** The line a call leaves in the conversation. The one who rang and the one who was rung read it differently. */
function callLine(m: ChatMsg, mine: boolean) {
  const meta = m.meta as { media?: string; status?: string; seconds?: number } | null;
  const what = meta?.media === "video" ? "Video call" : "Voice call";
  const small = what.toLowerCase();
  switch (meta?.status) {
    case "ended":
      return { line: `${what} · ${clock(meta.seconds ?? 0)}`, tone: "good", missed: false };
    case "missed":
      return mine ? { line: `${what} — no answer`, tone: "plain", missed: false } : { line: `Missed ${small}`, tone: "bad", missed: true };
    case "cancelled":
      return mine ? { line: `${what} — cancelled`, tone: "plain", missed: false } : { line: `Missed ${small}`, tone: "bad", missed: true };
    case "declined":
      return { line: mine ? `${what} — declined` : `${what} — you declined`, tone: "plain", missed: false };
    case "failed":
      return { line: `${what} — could not connect`, tone: "plain", missed: false };
    default:
      return { line: m.body, tone: "plain", missed: false };
  }
}

/** In a group, one person is always one colour. */
function nameColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h},54%,34%)`;
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

export function MessageList({ messages, meId, typing, perspective = "buyer", receipts }: { messages: ChatMsg[]; meId: string | null; typing?: boolean; perspective?: "buyer" | "staff" | "team"; receipts?: Receipts | null }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, typing]);
  const shots = useMemo(() => messages.flatMap((m) => (m.kind === "image" ? m.fileIds.map((f) => picUrl(m, f)) : [])), [messages]);
  const [shot, setShot] = useState<number | null>(null);
  const closeShot = useCallback(() => setShot(null), []);
  const one = (m: ChatMsg) => {
        if (m.kind === "system")
          return (
            <p className="mx-auto max-w-[90%] rounded-full bg-slate-100 px-3 py-1 text-center text-[11px] text-slate-500">
              {m.body}
            </p>
          );
        if (m.kind === "call") {
          const c = callLine(m, m.senderUserId === meId);
          const video = (m.meta as { media?: string } | null)?.media === "video";
          return (
            <p className={clsx("mx-auto flex w-fit max-w-[90%] items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold", c.tone === "bad" ? "bg-rose-50 text-rose-700" : c.tone === "good" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700")}>
              {video ? <Video className="size-3.5" /> : c.missed ? <PhoneMissed className="size-3.5" /> : <Phone className="size-3.5" />} {c.line}
              <span className="font-normal text-slate-500">
                {perspective === "staff" && m.sender?.name ? `· ${m.sender.name} ` : ""}· {time(m.createdAt)}
              </span>
            </p>
          );
        }
        const mine = perspective === "staff" ? m.sender?.kind !== "customer" && m.sender?.kind !== "visitor" : m.senderUserId === meId;
        const isSora = m.sender?.kind === "fte";
        return (
          <div className={clsx("flex gap-2", mine ? "flex-row-reverse" : "flex-row")}>
            {!mine && <Avatar name={m.sender?.name} kind={m.sender?.kind} size={30} />}
            <div className={clsx("max-w-[85%]", mine && "items-end")}>
              {!mine && perspective === "buyer" && <p className="mb-0.5 text-[11px] font-semibold text-slate-500">{isSora ? <><FteName /> · AI sales executive</> : m.sender?.name}</p>}
              {perspective === "staff" && <p className={clsx("mb-0.5 text-[11px] font-semibold", isSora ? "text-violet-600" : "text-slate-500", mine && "text-right")}>{isSora ? <><FteName /> (AI)</> : m.sender?.name}</p>}
              {perspective === "team" && !mine && <p className="mb-0.5 text-[11px] font-semibold" style={{ color: nameColor(m.sender?.name ?? "") }}>{m.sender?.name}</p>}
              {m.kind === "image" && m.fileIds?.length > 0 && <ImageGrid msg={m} onOpen={(u) => setShot(shots.indexOf(u))} />}
              {m.body && (
                <div
                  className={clsx(
                    "prose-lite rounded-2xl px-3 py-2 text-sm break-words [&_p]:my-0.5 [&_ul]:my-1",
                    mine ? (perspective === "staff" && isSora ? "rounded-br-md bg-violet-600 text-white [&_a]:text-white [&_strong]:text-white" : "rounded-br-md bg-brand-600 text-white [&_a]:text-white [&_strong]:text-white") : "rounded-bl-md bg-white text-slate-800 ring-1 ring-slate-200",
                  )}
                  dangerouslySetInnerHTML={{ __html: miniMarkdown(m.body) }}
                />
              )}
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
                {time(m.createdAt)} {mine && <Ticks at={m.createdAt} receipts={receipts} />}
              </p>
            </div>
          </div>
        );
  };
  return (
    <div className="space-y-3">
      {messages.map((m, i) => {
        const day = dayOf(m.createdAt);
        return (
          <Fragment key={m.id}>
            {(i === 0 || dayOf(messages[i - 1]!.createdAt) !== day) && (
              <p className="flex justify-center">
                <span className="rounded-lg bg-slate-200/70 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">{day}</span>
              </p>
            )}
            {one(m)}
          </Fragment>
        );
      })}
      {shot !== null && shots.length > 0 && <PictureViewer shots={shots} at={shot} onClose={closeShot} />}
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

const EMOJI = "😀 😃 😄 😁 😆 😅 😂 🤣 😊 🙂 😉 😍 🥰 😘 😋 😎 🤩 🥳 🤔 🤨 😐 😴 😌 😔 😢 😭 😤 😠 😡 🤯 😱 😳 🥺 😬 🙄 😷 🤒 🤕 🤢 🤧 👍 👎 👌 🙏 👏 🙌 💪 🤝 ✌️ 🤞 👋 ✋ 🖐️ 👊 ❤️ 🧡 💛 💚 💙 💜 🖤 💯 🔥 ✨ ⭐ 🎉 🎊 ✅ ❌ ⚠️ ❓ ❗ 💬 📌 📎 🚗 🚙 🏎️ 🚐 🚚 🛻 🏍️ 🚢 ✈️ ⚓ 🔑 💰 💵 💳 🧾 📄 📦 📍 ⏳ 🕐 📅 📞 📧".split(" ");
const MAX_BATCH = 20; // pictures chosen at one go
const MAX_VOICE_SECS = 300; // a long voice note is a phone call

export function Composer({ conversationId, onSent, initial, placeholder, soraHint = true }: { conversationId: string; onSent?: (m: ChatMsg) => void; initial?: string; placeholder?: string; soraHint?: boolean }) {
  const [text, setText] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rec, setRec] = useState<WavRecorder | null>(null);
  const [secs, setSecs] = useState(0);
  const [emoji, setEmoji] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const emojiWrap = useRef<HTMLDivElement>(null);
  // chosen is not sent: pictures wait above the box, each with a cross, and leave only when Send is pressed
  const [drafts, setDrafts] = useState<{ file: File; url: string }[]>([]);
  const [progress, setProgress] = useState<{ n: number; of: number } | null>(null);
  const clearTray = useCallback(() => {
    setDrafts((d) => {
      d.forEach((x) => URL.revokeObjectURL(x.url));
      return [];
    });
  }, []);
  // pictures belong to the conversation they were chosen in: carrying them into the next one is how a car ends up in somebody else's chat
  useEffect(() => clearTray, [conversationId, clearTray]);
  useEffect(() => {
    if (!emoji) return;
    const out = (e: MouseEvent) => {
      if (!emojiWrap.current?.contains(e.target as Node)) setEmoji(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setEmoji(false);
    document.addEventListener("mousedown", out);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", out);
      document.removeEventListener("keydown", esc);
    };
  }, [emoji]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(150, el.scrollHeight)}px`;
  }, [text]);
  const narrow = typeof window !== "undefined" && !!window.matchMedia?.("(max-width:340px)").matches; // a 320 wide phone has no room for the long words
  useEffect(() => {
    if (initial) setText(initial);
  }, [initial]);
  const addEmoji = (e: string) => {
    const el = box.current;
    const at = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? at;
    setText(text.slice(0, at) + e + text.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + e.length, at + e.length);
    });
  };
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
  const choose = (picked: File[]) => {
    if (!picked.length) return;
    setErr(null);
    const files = picked.filter((f) => f.type.startsWith("image/"));
    if (!files.length) return setErr("Only pictures can be sent this way.");
    const room = MAX_BATCH - drafts.length;
    if (room <= 0) return setErr(`Up to ${MAX_BATCH} pictures at a time. Send these first.`);
    if (files.length > room) setErr(`Up to ${MAX_BATCH} pictures at a time: the first ${room} were added.`);
    setDrafts((d) => [...d, ...files.slice(0, room).map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    box.current?.focus();
  };
  const removeDraft = (url: string) => {
    URL.revokeObjectURL(url);
    setDrafts((d) => d.filter((x) => x.url !== url));
  };
  /** One at a time and in the order chosen, so whoever chose five knows the rest are coming. They land together with the words typed beside them. */
  const sendDrafts = async () => {
    if (busy) return;
    const batch = drafts;
    setBusy(true);
    setErr(null);
    const ids: string[] = [];
    let failed: string | null = null;
    for (let i = 0; i < batch.length; i++) {
      setProgress({ n: i + 1, of: batch.length });
      try {
        ids.push(...(await upload([{ blob: await resizeImage(batch[i]!.file), name: `photo-${i + 1}.jpg` }])));
      } catch (e) {
        failed = (e as Error).message;
        break;
      }
    }
    setProgress(null);
    try {
      if (ids.length) await post({ kind: "image", fileIds: ids, body: failed ? "" : text.trim() });
      const gone = batch.slice(0, ids.length);
      gone.forEach((x) => URL.revokeObjectURL(x.url));
      setDrafts((d) => d.filter((x) => !gone.includes(x)));
      if (failed) {
        const left = batch.length - ids.length;
        setErr(`${failed} ${left} picture${left === 1 ? " was" : "s were"} not sent: press Send to try again.`);
      } else setText("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const submit = () => void (drafts.length ? sendDrafts() : send());
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
  useEffect(() => {
    if (rec && secs >= MAX_VOICE_SECS) void toggleVoice(); // five minutes and it sends itself
  }, [secs]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="border-t border-slate-200 bg-white p-2">
      {err && <p className="px-2 pb-1 text-xs text-rose-600">{err}</p>}
      {drafts.length > 0 && (
        <div className="mb-1.5 flex items-center gap-2 px-1" role="group" aria-label="Pictures waiting to be sent">
          <div className="scrollbar-thin flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1">
            {drafts.map((d) => (
              <div key={d.url} className="relative size-14 shrink-0 overflow-hidden rounded-lg ring-1 ring-slate-200">
                <img src={d.url} alt={d.file.name || "Picture waiting to be sent"} className="size-full object-cover" />
                <button type="button" onClick={() => removeDraft(d.url)} disabled={busy} title="Remove this picture" aria-label="Remove this picture" className="absolute top-0 right-0 flex size-7 items-center justify-center rounded-bl-lg bg-black/60 text-white">
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={clearTray} disabled={busy} className="shrink-0 rounded-lg px-2 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-rose-600">
            Remove all
          </button>
        </div>
      )}
      {progress && progress.of > 1 && <p className="px-2 pb-1 text-xs font-semibold text-slate-600" aria-live="polite">Sending {progress.n} of {progress.of} photos…</p>}
      {rec ? (
        <div className="flex items-center gap-2">
          <span className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-700">
            <span className="size-2 shrink-0 animate-pulse rounded-full bg-rose-600" /> <span className="truncate">Recording… {clock(secs)} · tap the square to send</span>
          </span>
          <button onClick={() => { rec.cancel(); setRec(null); }} className="rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button onClick={() => void toggleVoice()} className="flex size-10 items-center justify-center rounded-xl bg-rose-600 text-white" aria-label="Stop and send voice note">
            <Square className="size-4 fill-current" />
          </button>
        </div>
      ) : (
        <div className="relative flex items-end gap-1.5">
          <div ref={emojiWrap} className="shrink-0">
            {emoji && (
              <div role="menu" aria-label="Emoji" className="scrollbar-thin absolute bottom-12 left-0 z-10 grid max-h-64 w-[18.5rem] max-w-[calc(100vw-2rem)] grid-cols-7 gap-1 overflow-y-auto rounded-2xl bg-white p-2 shadow-xl ring-1 ring-slate-200">
                {EMOJI.map((e) => (
                  <button key={e} type="button" role="menuitem" onClick={() => addEmoji(e)} className="flex size-9 items-center justify-center rounded-lg text-lg hover:bg-slate-100">
                    {e}
                  </button>
                ))}
              </div>
            )}
            <button type="button" onClick={() => setEmoji((v) => !v)} className="flex size-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="Add an emoji" aria-expanded={emoji}>
              <Smile className="size-5" />
            </button>
          </div>
          <label className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="Send pictures">
            <Paperclip className="size-5" />
            <input type="file" accept="image/*" multiple className="hidden" disabled={busy} onChange={(e) => { choose([...(e.target.files ?? [])]); e.target.value = ""; }} />
          </label>
          <textarea
            ref={box}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder={narrow ? "Message…" : (placeholder ?? "Write a message…")}
            className="min-h-[2.5rem] min-w-0 flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-brand-500 focus:bg-white focus:outline-none"
          />
          {text.trim() || drafts.length ? (
            <button onClick={submit} disabled={busy} className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50" aria-label="Send">
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
          <Bot className="size-3" /> <FteName /> is an AI built with Muse Spark Open · voice notes in Urdu or English · ask for a person at any time
        </p>
      )}
    </div>
  );
}
