import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Maximize2, MessageCircle, MessagesSquare, UserRound, X } from "lucide-react";
import { api } from "../lib/api";
import { chime, useChatUnread } from "../lib/chatUnread";
import { useAuth } from "../lib/auth";
import { CompanyName, FteName } from "../lib/site";
import { useLiveEvent, useLiveStream } from "../lib/sse";
import { Avatar, Button, Field, Input } from "../ui";
import { Composer, MessageList, SkeletonRows, useConversation, type ChatMsg } from "./ChatThread";
import { CallButtons } from "./calls";
import { CallFte } from "./FteCall";

type OpenListener = (text?: string) => void;
let openListener: OpenListener | null = null;
let pending: string | undefined;

/** Open the chat from anywhere (e.g. "Ask Sora about this car"), optionally with a draft message. */
export function openChatWith(text?: string) {
  if (openListener) openListener(text);
  else pending = text;
}

/** The cards that say who wrote, and what: up to three, only while that chat is shut. Each closes itself after eight seconds, and a click answers it. */
export function MessageCards({ meId, shut, onOpen, skip, peopleOnly }: { meId: string; shut: boolean; onOpen: (conversationId: string) => void; skip?: (conversationId: string) => boolean; peopleOnly?: boolean }) {
  const [cards, setCards] = useState<{ id: string; who: string; text: string; conversationId: string }[]>([]);
  const onMessage = useCallback(
    (m: ChatMsg) => {
      if (!shut || !m.senderUserId || m.senderUserId === meId || m.kind === "system" || m.kind === "call") return;
      if (peopleOnly && m.sender?.kind === "fte") return; // the desk is told what people write, not every line an FTE answers
      if (skip?.(m.conversationId)) return;
      const text = m.kind === "image" ? "Sent a photo" : m.kind === "voice" ? "Sent a voice message" : m.body.replace(/[*#_`>]/g, "").replace(/\s+/g, " ").trim().slice(0, 140);
      const card = { id: m.id, who: m.sender?.name ?? "New message", text: text || "New message", conversationId: m.conversationId };
      setCards((cs) => [card, ...cs.filter((c) => c.conversationId !== card.conversationId)].slice(0, 3));
      chime();
      setTimeout(() => setCards((cs) => cs.filter((c) => c.id !== card.id)), 8000);
    },
    [meId, shut, skip, peopleOnly],
  );
  useLiveEvent("message", onMessage);
  useEffect(() => {
    if (!shut) setCards([]);
  }, [shut]);
  if (!cards.length) return null;
  return (
    <div className="fixed right-4 bottom-20 z-40 flex w-[min(330px,calc(100vw-2rem))] flex-col gap-2 sm:right-5 sm:bottom-24 print:hidden">
      {cards.map((card) => (
        <div key={card.id} role="status" aria-live="polite" className="flex items-start gap-2 rounded-2xl border-l-4 border-rose-600 bg-white p-3 shadow-xl ring-1 ring-slate-200">
          <button onClick={() => { setCards((cs) => cs.filter((c) => c.id !== card.id)); onOpen(card.conversationId); }} className="flex min-w-0 flex-1 items-start gap-2 text-left">
            <Avatar name={card.who} size={36} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-slate-900">{card.who}</span>
              <span className="line-clamp-2 text-sm text-slate-600">{card.text}</span>
            </span>
          </button>
          <button onClick={() => setCards((cs) => cs.filter((c) => c.id !== card.id))} aria-label="Close" className="-mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

const countBadge = (n: number) => (
  <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-bold text-white ring-2 ring-white">{n > 99 ? "99+" : n}</span>
);

/** Staff reading the website: one round button to the desk, with what is waiting. */
export function DeskButton() {
  const { me, can } = useAuth();
  const nav = useNavigate();
  const on = !!me && can("chat.desk");
  const n = useChatUnread(on);
  if (!on) return null;
  return (
    <>
      <MessageCards meId={me.id} shut peopleOnly onOpen={(c) => nav(`/desk?c=${c}`)} />
      <Link to="/desk" title="Open the chat desk" aria-label="Open the chat desk" className="fixed right-4 bottom-4 z-40 flex size-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-xl ring-4 ring-white hover:scale-105 sm:right-5 sm:bottom-5 print:hidden">
        <MessagesSquare className="size-6" />
        {n > 0 && countBadge(n)}
      </Link>
    </>
  );
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | undefined>();
  const { me } = useAuth();
  const waiting = useChatUnread(!!me);
  useEffect(() => {
    openListener = (t) => {
      setDraft(t);
      setOpen(true);
    };
    if (pending !== undefined) {
      openListener(pending);
      pending = undefined;
    }
    return () => {
      openListener = null;
    };
  }, []);
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white sm:inset-auto sm:right-5 sm:bottom-24 sm:h-[min(640px,calc(100vh-8rem))] sm:w-[400px] sm:rounded-2xl sm:shadow-2xl sm:ring-1 sm:ring-slate-200">
          <ChatPanel draft={draft} onClose={() => setOpen(false)} />
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed right-4 bottom-4 z-40 flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-brand-600 text-white shadow-xl ring-4 ring-white hover:scale-105 sm:right-5 sm:bottom-5"
        aria-label={open ? "Close chat" : "Open chat"}
      >
        {open ? <X className="size-6" /> : <MessageCircle className="size-6" />}
        {!open && (waiting > 0 ? countBadge(waiting) : <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-accent-500 text-[11px] font-bold text-slate-900">AI</span>)}
      </button>
      {me && <MessageCards meId={me.id} shut={!open} onOpen={() => setOpen(true)} />}
    </>
  );
}

export function ChatPanel({ draft, onClose, full }: { draft?: string; onClose?: () => void; full?: boolean }) {
  const { me, refresh } = useAuth();
  const qc = useQueryClient();
  useLiveStream(!!me);
  const mine = useQuery({
    queryKey: ["chat-mine", me?.id],
    queryFn: () => api.get<{ conversation: { id: string; holder: string }; messages: ChatMsg[]; agent: { id: string; name: string; title: string | null; online: boolean } | null }>("/api/chat/mine"),
    enabled: !!me && me.kind !== "staff",
  });
  // a colleague joining / leaving, or going on / off line, changes the banner and the call button
  const reload = useCallback(() => void qc.invalidateQueries({ queryKey: ["chat-mine"] }), [qc]);
  useLiveEvent("holder", reload);
  useLiveEvent("presence", reload);
  const conv = mine.data?.conversation ?? null;
  const agent = mine.data?.agent ?? null;
  const { messages, setMessages, typing, receipts } = useConversation(conv?.id ?? null, mine.data?.messages ?? []);
  useEffect(() => {
    if (mine.data) setMessages(mine.data.messages);
  }, [mine.data, setMessages]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-gradient-to-r from-brand-700 to-violet-700 px-4 py-3 text-white sm:rounded-t-2xl">
        <Avatar kind="fte" size={38} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold"><FteName /> · AI sales executive</p>
          <p className="flex items-center gap-1 text-[11px] text-white/80">
            <span className="size-1.5 rounded-full bg-emerald-400" /> Online 24/7 · Built with Muse Spark Open
          </p>
        </div>
        {!full && (
          <Link to="/chat" className="rounded-lg p-2 hover:bg-white/10" aria-label="Open in full window" onClick={onClose}>
            <Maximize2 className="size-4" />
          </Link>
        )}
        {onClose && (
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-white/10" aria-label="Close chat">
            <X className="size-5" />
          </button>
        )}
      </div>
      {me?.kind === "staff" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-600">
          You're signed in as staff.
          <Link to="/desk" className="font-semibold text-brand-700">
            Open the chat desk →
          </Link>
        </div>
      ) : !me ? (
        <VisitorDoor
          onDone={async () => {
            await refresh();
            await qc.invalidateQueries({ queryKey: ["chat-mine"] });
          }}
        />
      ) : mine.isLoading || !conv ? (
        <div className="flex-1 overflow-hidden bg-slate-50">
          <SkeletonRows />
        </div>
      ) : (
        <>
          <div className="scrollbar-thin flex-1 overflow-y-auto bg-slate-50 px-3 py-4">
            {messages.length === 0 && (
              <div className="mx-auto mb-4 max-w-xs rounded-2xl bg-white p-4 text-center text-sm text-slate-600 ring-1 ring-slate-200">
                <Bot className="mx-auto mb-2 size-6 text-violet-600" />
                Hi {me.name.split(" ")[0]}! I'm <FteName />. Tell me what car you need and your port — I'll find real cars and the exact price delivered.
              </div>
            )}
            <MessageList messages={messages} meId={me.id} typing={typing} receipts={receipts} />
          </div>
          {conv.holder === "fte" && (
            <div className="flex justify-center bg-violet-50/60 px-3 py-1 text-xs">
              <CallFte conversationId={conv.id} />
            </div>
          )}
          {conv.holder === "fte" && <TalkToPerson onDone={reload} />}
          {conv.holder === "human" && (
            <div className="flex flex-wrap items-center justify-center gap-2 bg-amber-50 px-3 py-1 text-[11px] text-amber-800">
              <span>
                {agent ? `${agent.name}${agent.title ? ` (${agent.title})` : ""} is with you in this chat${agent.online ? " · online" : ""}.` : "A team member is with you in this chat."}
              </span>
              <button
                className="font-semibold text-violet-700 underline"
                onClick={async () => {
                  await api.post("/api/chat/mine/back-to-fte", {});
                  reload();
                }}
              >
                Back to <FteName />
              </button>
              {agent && <CallButtons conversationId={conv.id} peerName={agent.name} away={!agent.online} className="[&_button]:p-1" />}
            </div>
          )}
          <Composer conversationId={conv.id} initial={draft} onSent={(m) => setMessages((p) => (p.some((x) => x.id === m.id) ? p : [...p, m]))} />
        </>
      )}
    </div>
  );
}

/** The buyer can always leave the AI for a person: the team with green dots, or whoever is free. */
function TalkToPerson({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const people = useQuery({ queryKey: ["chat-people"], queryFn: () => api.get<{ id: string; name: string; title: string | null; online: boolean }[]>("/api/chat/people"), enabled: open });
  const onPresence = useCallback(() => void qc.invalidateQueries({ queryKey: ["chat-people"] }), [qc]);
  useLiveEvent("presence", onPresence);
  const ask = async (userId?: string) => {
    setBusy(true);
    setErr(null);
    try {
      await api.post("/api/chat/mine/person", userId ? { userId } : {});
      setOpen(false);
      onDone();
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const online = people.data?.filter((p) => p.online).length ?? 0;
  return (
    <div className="border-t border-slate-200 bg-white">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-slate-50">
        <UserRound className="size-3.5" /> Talk to a person
      </button>
      {open && (
        <div className="scrollbar-thin max-h-56 overflow-y-auto border-t border-slate-100 px-3 py-2">
          <p className="mb-1 text-xs text-slate-500">{people.isLoading ? "Checking who is here..." : online ? `${online} of the team online now` : "The team is away. They answer here when they are back."}</p>
          <button disabled={busy} onClick={() => void ask()} className="mb-1 w-full rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
            Whoever is free
          </button>
          <ul>
            {people.data?.map((p) => (
              <li key={p.id}>
                <button disabled={busy} onClick={() => void ask(p.id)} className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-slate-50 disabled:opacity-60">
                  <Avatar name={p.name} kind="staff" size={30} online={p.online} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-900">{p.name}</span>
                    <span className="block truncate text-[11px] text-slate-500">{p.title ?? "Sales team"}{p.online ? " · online" : " · away"}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {err && <p className="mt-1 text-xs text-rose-600">{err}</p>}
        </div>
      )}
    </div>
  );
}

function VisitorDoor({ onDone }: { onDone: () => Promise<void> }) {
  const [f, setF] = useState({ name: "", email: "", phone: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-1 flex-col gap-3 overflow-y-auto bg-slate-50 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          await api.post("/api/auth/visitor", f);
          await onDone();
        } catch (ex) {
          setErr((ex as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="rounded-2xl bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">
        <p className="font-semibold text-slate-900">Hello! 👋</p>
        <p className="mt-1">I'm <FteName />, the AI sales executive of <CompanyName />. Tell me who you are once, and I'll remember you next time.</p>
      </div>
      <Field label="Your name">
        <Input required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" />
      </Field>
      <Field label="E-mail">
        <Input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />
      </Field>
      <Field label="Phone / WhatsApp">
        <Input required minLength={6} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" />
      </Field>
      {err && <p className="text-sm text-rose-600">{err}</p>}
      <Button type="submit" loading={busy}>
        Start chatting
      </Button>
      <p className="text-center text-xs text-slate-500">
        Have an account?{" "}
        <Link to="/login" className="font-semibold text-brand-700">
          Sign in
        </Link>
      </p>
    </form>
  );
}
