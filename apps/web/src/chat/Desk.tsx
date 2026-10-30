import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Hand, MessagesSquare, Undo2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLiveEvent } from "../lib/sse";
import { ago } from "../lib/format";
import { Avatar, Badge, Button, Card, Empty, Spinner, Tabs, clsx } from "../ui";
import { Composer, MessageList, useConversation, type ChatMsg } from "./ChatThread";

interface ConvRow {
  id: string;
  kind: string;
  title: string | null;
  holder: string;
  fteSummary: string | null;
  lastMessageAt: string;
  customer: { name: string; email: string | null; kind: string; country: string | null } | null;
  last: string | null;
  lastKind: string | null;
  unread: number;
}

export default function Desk() {
  const { me, can } = useAuth();
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const [scope, setScope] = useState<"mine" | "all">(can("chat.view_all") ? "all" : "mine");
  const selected = sp.get("c");
  const list = useQuery({ queryKey: ["desk", scope], queryFn: () => api.get<ConvRow[]>(`/api/chat/conversations?scope=${scope}`) });
  const refresh = useCallback(() => void qc.invalidateQueries({ queryKey: ["desk"] }), [qc]);
  useLiveEvent("message", refresh);
  useLiveEvent("holder", refresh);
  useEffect(() => {
    if (!selected && list.data?.length) setSp({ c: list.data[0]!.id }, { replace: true });
  }, [selected, list.data, setSp]);

  return (
    <div className="grid h-[calc(100vh-7.5rem)] min-h-[520px] gap-4 lg:grid-cols-[22rem_1fr]">
      <Card padded={false} className={clsx("flex min-h-0 flex-col", selected && "hidden lg:flex")}>
        <div className="border-b border-slate-100 p-3">
          <p className="mb-2 flex items-center gap-2 font-semibold text-slate-900">
            <MessagesSquare className="size-4" /> Chat desk
          </p>
          {can("chat.view_all") && (
            <Tabs
              value={scope}
              onChange={setScope}
              items={[
                { value: "all", label: "All buyers" },
                { value: "mine", label: "Mine" },
              ]}
            />
          )}
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto">
          {list.isLoading ? (
            <div className="flex justify-center p-6">
              <Spinner />
            </div>
          ) : !list.data?.length ? (
            <p className="p-6 text-center text-sm text-slate-500">No conversations yet.</p>
          ) : (
            list.data.map((c) => (
              <button key={c.id} onClick={() => setSp({ c: c.id })} className={clsx("flex w-full gap-3 border-b border-slate-50 px-3 py-3 text-left hover:bg-slate-50", selected === c.id && "bg-brand-50/60")}>
                <Avatar name={c.customer?.name ?? c.title} kind={c.kind === "group" ? "staff" : "customer"} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900">{c.customer?.name ?? c.title ?? "Conversation"}</p>
                    <span className="shrink-0 text-[10px] text-slate-400">{ago(c.lastMessageAt)}</span>
                  </div>
                  <p className="truncate text-xs text-slate-500">{c.last || (c.lastKind === "card" ? "📎 card" : "…")}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    {c.kind === "customer" && (c.holder === "fte" ? <Badge tone="violet"><Bot className="size-3" /> Sora</Badge> : <Badge tone="amber">Human</Badge>)}
                    {c.customer?.kind === "visitor" && <Badge tone="gray">Visitor</Badge>}
                    {c.unread > 0 && <Badge tone="red">{c.unread} new</Badge>}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </Card>
      {selected ? <DeskThread key={selected} id={selected} meId={me!.id} onBack={() => setSp({})} /> : <Empty title="Choose a conversation" />}
    </div>
  );
}

function DeskThread({ id, meId, onBack }: { id: string; meId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["conv", id], queryFn: () => api.get<{ conversation: { id: string; holder: string; kind: string; fteSummary: string | null }; messages: ChatMsg[]; customer: { name: string; email: string; phone: string; kind: string; countryCode: string; company: string | null } | null }>(`/api/chat/conversations/${id}`) });
  const { messages, setMessages, typing } = useConversation(id, q.data?.messages ?? []);
  useEffect(() => {
    if (q.data) setMessages(q.data.messages);
  }, [q.data, setMessages]);
  const onHolder = useCallback((e: { conversationId: string }) => e.conversationId === id && void qc.invalidateQueries({ queryKey: ["conv", id] }), [id, qc]);
  useLiveEvent("holder", onHolder);
  const [busy, setBusy] = useState(false);
  if (q.isLoading || !q.data)
    return (
      <Card className="flex items-center justify-center">
        <Spinner />
      </Card>
    );
  const c = q.data.conversation;
  const toggle = async () => {
    setBusy(true);
    try {
      await api.post(`/api/chat/conversations/${id}/${c.holder === "fte" ? "takeover" : "handback"}`);
      await qc.invalidateQueries({ queryKey: ["conv", id] });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card padded={false} className="flex min-h-0 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
        <button className="text-sm font-semibold text-brand-700 lg:hidden" onClick={onBack}>
          ← Back
        </button>
        <Avatar name={q.data.customer?.name} kind="customer" size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900">{q.data.customer?.name ?? "Conversation"}</p>
          <p className="truncate text-xs text-slate-500">
            {q.data.customer?.company ? `${q.data.customer.company} · ` : ""}
            {q.data.customer?.email} · {q.data.customer?.phone} {q.data.customer?.kind === "visitor" && "· visitor"}
          </p>
        </div>
        {c.kind === "customer" && (
          <Button variant={c.holder === "fte" ? "secondary" : "accent"} size="sm" loading={busy} onClick={() => void toggle()}>
            {c.holder === "fte" ? (
              <>
                <Hand className="size-4" /> Take over from Sora
              </>
            ) : (
              <>
                <Undo2 className="size-4" /> Hand back to Sora
              </>
            )}
          </Button>
        )}
      </div>
      {c.fteSummary && (
        <div className="border-b border-violet-100 bg-violet-50/60 px-4 py-2 text-xs text-violet-900">
          <span className="font-semibold">Sora's summary: </span>
          {c.fteSummary}
        </div>
      )}
      <div className="scrollbar-thin flex-1 overflow-y-auto bg-slate-50 px-4 py-4">
        <MessageList messages={messages} meId={meId} typing={typing} perspective="staff" />
      </div>
      <Composer conversationId={id} placeholder={c.holder === "fte" ? "Writing here takes the conversation over from Sora…" : "Write to the buyer…"} onSent={(m) => setMessages((p) => (p.some((x) => x.id === m.id) ? p : [...p, m]))} />
    </Card>
  );
}
