import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Hand, LogOut, MessagesSquare, Pencil, Plus, Undo2, UserMinus, UserPlus, Users } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLiveEvent } from "../lib/sse";
import { ago } from "../lib/format";
import { Avatar, Badge, Button, Card, Empty, Field, Input, Modal, Spinner, Tabs, clsx } from "../ui";
import { Composer, MessageList, useConversation, type ChatMsg } from "./ChatThread";
import { CallButtons } from "./calls";

interface ConvRow {
  id: string;
  kind: string;
  title: string | null;
  holder: string;
  fteSummary: string | null;
  lastMessageAt: string;
  customer: { name: string; email: string | null; kind: string; country: string | null; online: boolean } | null;
  peer: { id: string; name: string; online: boolean } | null;
  memberCount: number;
  last: string | null;
  lastKind: string | null;
  unread: number;
}
interface Colleague {
  id: string;
  name: string;
  title: string | null;
  role: string | null;
  lastSeenAt: string | null;
  online: boolean;
}
interface Member {
  id: string;
  name: string;
  kind: string;
  title: string | null;
  lastSeenAt: string | null;
  role: string;
  online: boolean;
}
interface ConvDetail {
  conversation: { id: string; holder: string; kind: string; title: string | null; fteSummary: string | null };
  messages: ChatMsg[];
  customer: { id: string; name: string; email: string; phone: string; kind: string; countryCode: string; company: string | null; online: boolean } | null;
  members: Member[];
}

const rowName = (c: ConvRow) => c.customer?.name ?? c.peer?.name ?? c.title ?? "Conversation";
const lastLine = (c: ConvRow) => (c.lastKind === "card" ? "📎 card" : c.lastKind === "call" ? `📞 ${c.last}` : c.lastKind === "image" ? "📷 picture" : c.lastKind === "voice" ? "🎤 voice note" : c.last || "…");

export default function Desk() {
  const { me, can } = useAuth();
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get("tab") === "team" ? "team" : "buyers") as "buyers" | "team";
  const [scope, setScope] = useState<"mine" | "all">(can("chat.view_all") ? "all" : "mine");
  const selected = sp.get("c");
  const list = useQuery({ queryKey: ["desk", tab === "team" ? "team" : scope], queryFn: () => api.get<ConvRow[]>(`/api/chat/conversations?scope=${tab === "team" ? "team" : scope}`) });
  const team = useQuery({ queryKey: ["team"], queryFn: () => api.get<Colleague[]>("/api/chat/team"), enabled: tab === "team" });
  const refresh = useCallback(() => void qc.invalidateQueries({ queryKey: ["desk"] }), [qc]);
  const onPresence = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["desk"] });
    void qc.invalidateQueries({ queryKey: ["team"] });
  }, [qc]);
  useLiveEvent("message", refresh);
  useLiveEvent("holder", refresh);
  useLiveEvent("presence", onPresence);
  const [newGroup, setNewGroup] = useState(false);
  const open = (id: string) => setSp(tab === "team" ? { tab: "team", c: id } : { c: id });
  useEffect(() => {
    if (!selected && tab === "buyers" && list.data?.length && window.innerWidth >= 1024) setSp({ c: list.data[0]!.id }, { replace: true });
  }, [selected, list.data, setSp, tab]);
  const dm = async (userId: string) => {
    const c = await api.post<{ id: string }>("/api/chat/dm", { userId });
    await qc.invalidateQueries({ queryKey: ["desk", "team"] });
    setSp({ tab: "team", c: c.id });
  };

  return (
    <div className="grid h-[calc(100vh-7.5rem)] min-h-[520px] gap-4 lg:grid-cols-[22rem_1fr]">
      <Card padded={false} className={clsx("flex min-h-0 flex-col", selected && "hidden lg:flex")}>
        <div className="space-y-2 border-b border-slate-100 p-3">
          <p className="flex items-center gap-2 font-semibold text-slate-900">
            <MessagesSquare className="size-4" /> Chat desk
          </p>
          <Tabs
            value={tab}
            onChange={(v) => setSp(v === "team" ? { tab: "team" } : {})}
            items={[
              { value: "buyers", label: "Buyers" },
              { value: "team", label: "Team" },
            ]}
          />
          {tab === "buyers" && can("chat.view_all") && (
            <div className="flex gap-1 text-xs">
              {(["all", "mine"] as const).map((v) => (
                <button key={v} onClick={() => setScope(v)} className={clsx("rounded-full px-2.5 py-1 font-semibold", scope === v ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600")}>
                  {v === "all" ? "All buyers" : "Mine"}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto">
          {tab === "team" && (
            <div className="border-b border-slate-100 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Colleagues</p>
                {can("chat.groups") && (
                  <button onClick={() => setNewGroup(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700">
                    <Plus className="size-3.5" /> New group
                  </button>
                )}
              </div>
              {team.isLoading ? (
                <Spinner />
              ) : (
                <div className="scrollbar-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  {team.data?.map((p) => (
                    <button key={p.id} onClick={() => void dm(p.id)} className="flex w-16 shrink-0 flex-col items-center gap-1 rounded-xl p-1 hover:bg-slate-50" title={`${p.name}${p.role ? ` · ${p.role}` : ""} — ${p.online ? "online" : p.lastSeenAt ? `last seen ${ago(p.lastSeenAt)}` : "offline"}`}>
                      <Avatar name={p.name} kind="staff" size={40} online={p.online} />
                      <span className="w-full truncate text-center text-[11px] text-slate-700">{p.name.split(" ")[0]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {list.isLoading ? (
            <div className="flex justify-center p-6">
              <Spinner />
            </div>
          ) : !list.data?.length ? (
            <p className="p-6 text-center text-sm text-slate-500">{tab === "team" ? "No team chats yet — tap a colleague to start one." : "No conversations yet."}</p>
          ) : (
            list.data.map((c) => (
              <button key={c.id} onClick={() => open(c.id)} className={clsx("flex w-full gap-3 border-b border-slate-50 px-3 py-3 text-left hover:bg-slate-50", selected === c.id && "bg-brand-50/60")}>
                <Avatar name={rowName(c)} kind={c.kind === "customer" ? "customer" : "staff"} size={38} online={c.customer?.online ?? c.peer?.online} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-1 truncate text-sm font-semibold text-slate-900">
                      {c.kind === "group" && <Users className="size-3.5 shrink-0 text-slate-400" />}
                      <span className="truncate">{rowName(c)}</span>
                    </p>
                    <span className="shrink-0 text-[10px] text-slate-400">{ago(c.lastMessageAt)}</span>
                  </div>
                  <p className="truncate text-xs text-slate-500">{lastLine(c)}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    {c.kind === "customer" &&
                      (c.holder === "fte" ? (
                        <Badge tone="violet">
                          <Bot className="size-3" /> Sora
                        </Badge>
                      ) : (
                        <Badge tone="amber">Human</Badge>
                      ))}
                    {c.customer?.kind === "visitor" && <Badge tone="gray">Visitor</Badge>}
                    {c.kind === "group" && <Badge tone="gray">{c.memberCount} members</Badge>}
                    {c.unread > 0 && <Badge tone="red">{c.unread} new</Badge>}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </Card>
      {selected ? <DeskThread key={selected} id={selected} meId={me!.id} onBack={() => setSp(tab === "team" ? { tab: "team" } : {})} onLeft={() => setSp({ tab: "team" })} /> : <Empty icon={<MessagesSquare className="size-8" />} title={tab === "team" ? "Pick a colleague or a group" : "Choose a conversation"} />}
      <NewGroupModal open={newGroup} onClose={() => setNewGroup(false)} onCreated={(id) => setSp({ tab: "team", c: id })} />
    </div>
  );
}

function NewGroupModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const team = useQuery({ queryKey: ["team"], queryFn: () => api.get<Colleague[]>("/api/chat/team"), enabled: open });
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setErr(null);
    setBusy(true);
    try {
      const g = await api.post<{ id: string }>("/api/chat/groups", { title, memberIds: picked });
      await qc.invalidateQueries({ queryKey: ["desk", "team"] });
      setTitle("");
      setPicked([]);
      onClose();
      onCreated(g.id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New group"
      footer={
        <Button onClick={() => void create()} loading={busy} disabled={title.trim().length < 2 || !picked.length}>
          Create group
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Group name">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Kenya sales team" maxLength={80} />
        </Field>
        <PeoplePicker people={team.data ?? []} picked={picked} setPicked={setPicked} />
        {err && <p className="text-sm text-rose-600">{err}</p>}
      </div>
    </Modal>
  );
}

function PeoplePicker({ people, picked, setPicked }: { people: Colleague[]; picked: string[]; setPicked: (v: string[]) => void }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-slate-700">Colleagues ({picked.length} chosen)</p>
      <div className="scrollbar-thin max-h-64 space-y-1 overflow-y-auto">
        {people.map((p) => (
          <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-slate-50">
            <input type="checkbox" className="size-4" checked={picked.includes(p.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))} />
            <Avatar name={p.name} kind="staff" size={30} online={p.online} />
            <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{p.name}</span>
            <span className="text-xs text-slate-400">{p.role}</span>
          </label>
        ))}
        {!people.length && <p className="text-sm text-slate-500">No colleagues to add.</p>}
      </div>
    </div>
  );
}

function DeskThread({ id, meId, onBack, onLeft }: { id: string; meId: string; onBack: () => void; onLeft: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["conv", id], queryFn: () => api.get<ConvDetail>(`/api/chat/conversations/${id}`) });
  const { messages, setMessages, typing } = useConversation(id, q.data?.messages ?? []);
  useEffect(() => {
    if (q.data) setMessages(q.data.messages);
  }, [q.data, setMessages]);
  const onHolder = useCallback(
    (e: { conversationId: string; removed?: boolean }) => {
      if (e.conversationId !== id) return;
      if (e.removed) onLeft();
      else void qc.invalidateQueries({ queryKey: ["conv", id] });
    },
    [id, qc, onLeft],
  );
  useLiveEvent("holder", onHolder);
  const onPresence = useCallback(() => void qc.invalidateQueries({ queryKey: ["conv", id] }), [id, qc]);
  useLiveEvent("presence", onPresence);
  const onSystem = useCallback((m: ChatMsg) => m.conversationId === id && m.kind === "system" && void qc.invalidateQueries({ queryKey: ["conv", id] }), [id, qc]);
  useLiveEvent("message", onSystem);
  const [busy, setBusy] = useState(false);
  const [manage, setManage] = useState(false);
  if (q.isLoading || !q.data)
    return (
      <Card className="flex items-center justify-center">
        <Spinner />
      </Card>
    );
  const c = q.data.conversation;
  const peer = c.kind === "staff_dm" ? q.data.members.find((m) => m.id !== meId) : undefined;
  const toggle = async () => {
    setBusy(true);
    try {
      await api.post(`/api/chat/conversations/${id}/${c.holder === "fte" ? "takeover" : "handback"}`);
      await qc.invalidateQueries({ queryKey: ["conv", id] });
    } finally {
      setBusy(false);
    }
  };
  const name = c.kind === "customer" ? (q.data.customer?.name ?? "Buyer") : c.kind === "group" ? (c.title ?? "Group") : (peer?.name ?? "Colleague");
  const sub =
    c.kind === "customer"
      ? `${q.data.customer?.online ? "● online · " : ""}${q.data.customer?.company ? `${q.data.customer.company} · ` : ""}${q.data.customer?.email ?? ""} · ${q.data.customer?.phone ?? ""}${q.data.customer?.kind === "visitor" ? " · visitor" : ""}`
      : c.kind === "group"
        ? `${q.data.members.length} members · ${q.data.members.filter((m) => m.online).length} online`
        : peer?.online
          ? "● online"
          : peer?.lastSeenAt
            ? `last seen ${ago(peer.lastSeenAt)}`
            : "offline";
  const callable = c.kind === "customer" ? q.data.customer?.online : c.kind === "staff_dm" ? peer?.online : false;
  return (
    <Card padded={false} className="flex min-h-0 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
        <button className="text-sm font-semibold text-brand-700 lg:hidden" onClick={onBack}>
          ← Back
        </button>
        <Avatar name={name} kind={c.kind === "customer" ? "customer" : "staff"} size={36} online={c.kind === "customer" ? q.data.customer?.online : peer?.online} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900">{name}</p>
          <p className={clsx("truncate text-xs", sub.startsWith("●") ? "text-emerald-600" : "text-slate-500")}>{sub}</p>
        </div>
        {c.kind !== "group" && <CallButtons conversationId={id} peerName={name} disabled={callable ? null : `${name} is offline — calls need them online`} />}
        {c.kind === "group" && (
          <Button variant="secondary" size="sm" onClick={() => setManage(true)}>
            <Users className="size-4" /> Members
          </Button>
        )}
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
      {c.kind === "customer" && c.fteSummary && (
        <div className="border-b border-violet-100 bg-violet-50/60 px-4 py-2 text-xs text-violet-900">
          <span className="font-semibold">Sora's summary: </span>
          {c.fteSummary}
        </div>
      )}
      <div className="scrollbar-thin flex-1 overflow-y-auto bg-slate-50 px-4 py-4">
        <MessageList messages={messages} meId={meId} typing={typing} perspective={c.kind === "customer" ? "staff" : "team"} />
      </div>
      <Composer
        conversationId={id}
        soraHint={c.kind === "customer"}
        placeholder={c.kind !== "customer" ? `Message ${name}…` : c.holder === "fte" ? "Writing here takes the conversation over from Sora…" : "Write to the buyer…"}
        onSent={(m) => setMessages((p) => (p.some((x) => x.id === m.id) ? p : [...p, m]))}
      />
      {c.kind === "group" && <GroupMembers open={manage} onClose={() => setManage(false)} group={c} members={q.data.members} meId={meId} onLeft={onLeft} />}
    </Card>
  );
}

function GroupMembers({ open, onClose, group, members, meId, onLeft }: { open: boolean; onClose: () => void; group: { id: string; title: string | null }; members: Member[]; meId: string; onLeft: () => void }) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const owner = members.find((m) => m.role === "owner");
  const canManage = owner?.id === meId || can("chat.view_all");
  const team = useQuery({ queryKey: ["team"], queryFn: () => api.get<Colleague[]>("/api/chat/team"), enabled: open && canManage });
  const [title, setTitle] = useState(group.title ?? "");
  const [adding, setAdding] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["conv", group.id] });
      await qc.invalidateQueries({ queryKey: ["desk", "team"] });
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const outside = (team.data ?? []).filter((p) => !members.some((m) => m.id === p.id));
  return (
    <Modal open={open} onClose={onClose} title={group.title ?? "Group"}>
      <div className="space-y-5">
        {canManage && (
          <div className="flex items-end gap-2">
            <Field label="Group name" className="flex-1">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
            </Field>
            <Button variant="secondary" disabled={title.trim().length < 2 || title === group.title} onClick={() => void run(() => api.patch(`/api/chat/groups/${group.id}`, { title }))}>
              <Pencil className="size-4" /> Rename
            </Button>
          </div>
        )}
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">Members ({members.length})</p>
          <ul className="space-y-1">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
                <Avatar name={m.name} kind="staff" size={30} online={m.online} />
                <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                  {m.name} {m.id === meId && <span className="text-slate-400">(you)</span>}
                </span>
                {m.role === "owner" && <Badge tone="blue">owner</Badge>}
                {canManage && m.id !== meId && (
                  <button onClick={() => void run(() => api.del(`/api/chat/groups/${group.id}/members/${m.id}`))} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${m.name}`}>
                    <UserMinus className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
        {canManage && outside.length > 0 && (
          <div className="space-y-2">
            <PeoplePicker people={outside} picked={adding} setPicked={setAdding} />
            <Button variant="secondary" disabled={!adding.length} onClick={() => void run(async () => { await api.post(`/api/chat/groups/${group.id}/members`, { userIds: adding }); setAdding([]); })}>
              <UserPlus className="size-4" /> Add to group
            </Button>
          </div>
        )}
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <Button
          variant="secondary"
          onClick={() =>
            void run(async () => {
              await api.post(`/api/chat/groups/${group.id}/leave`);
              onClose();
              onLeft();
            })
          }
        >
          <LogOut className="size-4" /> Leave group
        </Button>
      </div>
    </Modal>
  );
}
