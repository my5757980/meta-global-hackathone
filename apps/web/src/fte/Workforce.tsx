import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AUTONOMY_LABELS } from "@autofte/shared";
import { Check, FileText, MessageSquare, Play, Scale, ShieldCheck, TriangleAlert, Users, X } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLiveEvent } from "../lib/sse";
import { ago, dateTime, usd } from "../lib/format";
import { Badge, Button, Card, Empty, Field, Input, Modal, Select, Skeleton, clsx } from "../ui";

interface Seat {
  key: string;
  name: string;
  title: string | null;
  enabled: boolean;
  owns: string[];
  doesNotOwn: string[];
  checkedBy: string;
  stopsWhen: string;
  tools: string[];
  tasks: { key: string; label: string; levels: number[]; level: number }[];
  today: { runs: number; failed: number; tokens: number; last: string | null };
}
interface Decision {
  id: string;
  seq: number;
  who: string;
  task: string;
  entity: string;
  decision: string;
  reason: string;
  createdAt: string;
  overruledAt: string | null;
  overruleNote: string | null;
  overruledBy: string | null;
  byFte: boolean;
}
interface Data {
  on: boolean;
  reflexesOn: boolean;
  feedsSimulated: boolean;
  room: string | null;
  seats: Seat[];
  needsYou: { id: string; kind: string; reason: string; createdAt: string; opinion: string | null; number: string | null; amountUsd: number | null; from: string | null; proposal: boolean }[];
  withChief: number;
  ledger: Decision[];
  ledgerCheck: { ok: boolean; rows: number; brokenAt: number | null };
  reports: { day: string; body: string; createdAt: string }[];
}

const initials = (n: string) => n.slice(0, 1).toUpperCase();

interface SaleData {
  available: boolean;
  sale: { id: string; status: "running" | "done" | "failed"; buyer: string; stage: string; conversationId: string | null; invoiceId: string | null; invoiceNumber: string | null; error: string | null; startedAt: string; finishedAt: string | null } | null;
  timeline: { at: string; who: string; kind: "buyer" | "world" | "fte" | "fte-chat" | "person" | "system"; text: string }[];
  fteSteps: number;
  personSteps: number;
}

/** A whole sale from the first chat to the delivered car, for anyone who wants to see it happen. */
function WatchASale() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["fte-demo-sale"],
    queryFn: () => api.get<SaleData>("/api/fte/demo-sale"),
    refetchInterval: (query) => (query.state.data?.sale?.status === "running" ? 2000 : false),
  });
  const [err, setErr] = useState<string | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const d = q.data;
  const steps = d?.timeline.length ?? 0;
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight; // the newest step stays in view
  }, [steps]);
  if (!d?.available && !d?.sale) return null;
  const run = async () => {
    setErr(null);
    try {
      await api.post("/api/fte/demo-sale", {});
      await qc.invalidateQueries({ queryKey: ["fte-demo-sale"] });
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const sl = d.sale;
  const running = sl?.status === "running";
  const seconds = sl ? Math.round(((sl.finishedAt ? new Date(sl.finishedAt).getTime() : Date.now()) - new Date(sl.startedAt).getTime()) / 1000) : 0;
  return (
    <Card className="border-violet-200">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-semibold text-slate-900"><Play className="size-4 text-violet-600" /> Watch one whole sale, start to finish</p>
          <p className="mt-1 text-sm text-slate-600">A scripted buyer asks for a car and pays; a demo bank and yard answer. Everything the business does in reply is the real FTEs, live. It takes a few minutes.</p>
        </div>
        <Button disabled={running} onClick={() => void run()}>{running ? `Running: ${sl?.stage}…` : sl ? "Run another" : "Run a sale"}</Button>
      </div>
      {err && <p role="alert" className="mt-2 rounded-xl bg-rose-50 p-2.5 text-sm text-rose-700">{err}</p>}
      {sl && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={sl.status === "done" ? "green" : sl.status === "failed" ? "red" : "blue"}>{sl.status === "done" ? "Delivered" : sl.status === "failed" ? "Stopped" : sl.stage}</Badge>
            <span className="font-medium text-slate-800">{sl.buyer}</span>
            {sl.invoiceNumber && <span className="text-slate-500">invoice {sl.invoiceNumber}</span>}
            <span className="text-slate-500">{Math.floor(seconds / 60)} min {seconds % 60} s</span>
            <span className="font-semibold text-slate-900">{d.fteSteps} steps by FTEs · {d.personSteps} by people</span>
            {sl.conversationId && <Link to={`/desk?c=${sl.conversationId}`} className="font-semibold text-brand-700 hover:underline">Open the chat</Link>}
            {sl.invoiceId && <Link to={`/crm/invoices/${sl.invoiceId}`} className="font-semibold text-brand-700 hover:underline">Open the invoice</Link>}
          </div>
          {sl.error && <p role="alert" className="mt-2 rounded-xl bg-rose-50 p-2.5 text-sm text-rose-700">{sl.error}</p>}
          <ol ref={list} aria-label="What happened" className="mt-3 max-h-96 space-y-1.5 overflow-y-auto border-l-2 border-violet-100 pl-3 text-sm">
            {d.timeline.map((t, i) => (
              <li key={i} className="[overflow-wrap:anywhere]">
                <span className={clsx("font-semibold", t.kind === "buyer" ? "text-amber-700" : t.kind === "world" ? "text-slate-500" : t.kind === "person" ? "text-rose-700" : "text-violet-700")}>{t.who}:</span> <span className="text-slate-700">{t.text}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Card>
  );
}

export default function Workforce() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["fte-workforce"], queryFn: () => api.get<Data>("/api/fte/workforce"), refetchInterval: 15000 });
  const refresh = useCallback(() => void qc.invalidateQueries({ queryKey: ["fte-workforce"] }), [qc]);
  useLiveEvent("fte.run", refresh);
  useLiveEvent("notification", refresh);
  const [overrule, setOverrule] = useState<Decision | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const canManage = can("fte.envelope.manage");
  const canDecide = can("fte.approvals.decide");
  const d = q.data;
  if (!d) return <Skeleton className="h-64" />;

  const setSeat = async (key: string, body: object) => {
    setErr(null);
    try {
      await api.put(`/api/fte/workforce/${key}`, body);
      refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const decide = async (id: string, decision: "approved" | "rejected") => {
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/api/fte/approvals/${id}/decide`, { decision, note: notes[id]?.trim() || undefined });
      refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const report = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.post("/api/fte/workforce/report", {});
      refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const sendOverrule = async () => {
    if (!overrule) return;
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/api/fte/decisions/${overrule.id}/overrule`, { note });
      setOverrule(null);
      setNote("");
      refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-semibold text-slate-900">
              <Users className="size-4 text-brand-600" /> {d.seats.length} Digital FTEs, one for each seat in the business
            </p>
            <p className="mt-1 text-sm text-slate-600">They hand work to each other by themselves. You set the limits and answer only what is above the chief of staff's mandate.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={d.on ? "green" : "amber"}>{d.on ? "Working" : d.reflexesOn ? "No model key: only the automatic steps run" : "Switched off"}</Badge>
            {d.room && (
              <Link to={`/desk?c=${d.room}`} className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
                <MessageSquare className="size-4" /> Team room
              </Link>
            )}
          </div>
        </div>
        {d.feedsSimulated && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">In this demo the bank, the yard and the shipping line are simulated: slips and documents are printed for you, and yard signals play on the demo clock (Schedule & clock). What the FTEs do with them is real.</p>}
      </Card>
      {err && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{err}</p>}
      <WatchASale />

      <section aria-label="Needs you">
        <h2 className="mb-2 flex flex-wrap items-center gap-2 font-semibold text-slate-900">
          <TriangleAlert className="size-4 text-amber-600" /> Needs you
          {d.withChief > 0 && <span className="text-sm font-normal text-slate-500">{d.withChief} more with the chief of staff</span>}
        </h2>
        {d.needsYou.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {d.needsYou.map((a) => (
              <Card key={a.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="amber">{a.proposal ? "Proposal" : a.kind}</Badge>
                  {a.number && <Badge tone="gray">{a.number}</Badge>}
                  {a.amountUsd != null && <span className="text-sm font-bold text-slate-900">{usd(a.amountUsd)}</span>}
                  <span className="text-xs text-slate-500">{ago(a.createdAt)}</span>
                </div>
                <p className="mt-2 text-sm text-slate-800">{a.reason}</p>
                {a.opinion && <p className="mt-2 rounded-xl bg-violet-50 p-2.5 text-sm text-violet-900"><span className="font-semibold">{a.proposal ? a.from ?? "The desk" : "Chief of staff"}:</span> {a.opinion}</p>}
                {canDecide && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <div className="min-w-40 flex-1">
                      <Input aria-label="Your note" placeholder="Your note (optional)" value={notes[a.id] ?? ""} onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })} />
                    </div>
                    <Button size="sm" disabled={busy} onClick={() => void decide(a.id, "approved")}><Check className="size-4" /> Approve</Button>
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => void decide(a.id, "rejected")}><X className="size-4" /> Reject</Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Nothing needs you right now.</p>
        )}
      </section>

      <section aria-label="The roster">
        <h2 className="mb-2 font-semibold text-slate-900">The roster</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {d.seats.map((w) => (
            <Card key={w.key} className={clsx(!w.enabled && "opacity-70")}>
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-brand-600 font-bold text-white">{initials(w.name)}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{w.name}</p>
                  <p className="text-xs text-slate-500">{w.title}</p>
                </div>
                {canManage && (
                  <label className="flex min-h-7 cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                    <input type="checkbox" checked={w.enabled} onChange={(e) => void setSeat(w.key, { enabled: e.target.checked })} />
                    On
                  </label>
                )}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Today: {w.today.runs} job{w.today.runs === 1 ? "" : "s"}
                {w.today.failed > 0 && <span className="font-semibold text-rose-700"> ({w.today.failed} failed)</span>} · {w.today.tokens.toLocaleString("en-US")} tokens{w.today.last ? ` · last ${ago(w.today.last)}` : ""}
              </p>
              <div className="mt-3 space-y-2">
                {w.tasks.map((t) => (
                  <Field key={t.key} label={t.label}>
                    <Select aria-label={`${w.name}: ${t.label}`} value={t.level} disabled={!canManage} onChange={(e) => void setSeat(w.key, { levels: { [t.key]: Number(e.target.value) } })}>
                      {t.levels.map((l) => (
                        <option key={l} value={l}>{AUTONOMY_LABELS[l]}</option>
                      ))}
                    </Select>
                  </Field>
                ))}
              </div>
              <details className="mt-3 text-sm">
                <summary className="min-h-7 cursor-pointer py-1 font-semibold text-brand-700">Role card</summary>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Owns</p>
                <ul className="list-disc pl-4 text-slate-700">{w.owns.map((x) => <li key={x}>{x}</li>)}</ul>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Does not own</p>
                <ul className="list-disc pl-4 text-slate-700">{w.doesNotOwn.map((x) => <li key={x}>{x}</li>)}</ul>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">How the work is checked</p>
                <p className="text-slate-700">{w.checkedBy}</p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Stops when</p>
                <p className="text-slate-700">{w.stopsWhen}</p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Tools ({w.tools.length})</p>
                <p className="flex flex-wrap gap-1">{w.tools.map((x) => <span key={x} className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 [overflow-wrap:anywhere]">{x}</span>)}</p>
              </details>
            </Card>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <section aria-label="Decision ledger">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900"><Scale className="size-4 text-brand-600" /> Decision ledger</h2>
            <Badge tone={d.ledgerCheck.ok ? "green" : "red"}><ShieldCheck className="size-3" /> {d.ledgerCheck.ok ? `Signatures check out (${d.ledgerCheck.rows})` : `Changed at row ${d.ledgerCheck.brokenAt}`}</Badge>
          </div>
          <Card padded={false}>
            {d.ledger.length ? (
              <ul className="divide-y divide-slate-100">
                {d.ledger.map((x) => (
                  <li key={x.id} className="px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-slate-400">#{x.seq}</span>
                      <span className="font-semibold text-slate-900">{x.who}</span>
                      <Badge tone={/reject|refus|timed/i.test(x.decision) ? "red" : "green"}>{x.decision}</Badge>
                      <span className="text-xs text-slate-500" title={dateTime(x.createdAt)}>{ago(x.createdAt)}</span>
                      {canDecide && x.byFte && !x.overruledAt && <button className="ml-auto min-h-7 text-xs font-semibold text-brand-700 hover:underline" onClick={() => { setOverrule(x); setNote(""); }}>Overrule</button>}
                    </div>
                    <p className="mt-1 text-slate-700">{x.reason}</p>
                    {x.overruledAt && <p className="mt-1 rounded-lg bg-rose-50 p-2 text-xs text-rose-800">Overruled by {x.overruledBy}: {x.overruleNote}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="No decisions yet" />
            )}
          </Card>
        </section>
        <section aria-label="Daily reports">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900"><FileText className="size-4 text-brand-600" /> Daily reports</h2>
            {canManage && <Button size="sm" variant="secondary" disabled={busy} onClick={() => void report()}>Write today's report</Button>}
          </div>
          {d.reports.length ? (
            <div className="space-y-3">
              {d.reports.map((r) => (
                <Card key={r.day}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{r.day}</p>
                  <p className="mt-1 text-sm whitespace-pre-line text-slate-800">{r.body}</p>
                </Card>
              ))}
            </div>
          ) : (
            <Card><p className="text-sm text-slate-500">The chief of staff writes one each day there is work.</p></Card>
          )}
        </section>
      </div>

      <Modal open={!!overrule} onClose={() => setOverrule(null)} title={`Overrule decision #${overrule?.seq}`}>
        <p className="text-sm text-slate-600">This does not undo the action: change that on its own screen. It tells the chief of staff what you would have done, and he reads it before deciding again.</p>
        <p className="mt-2 rounded-xl bg-slate-50 p-2.5 text-sm text-slate-800">{overrule?.who}: {overrule?.decision}. {overrule?.reason}</p>
        <div className="mt-3">
          <Field label="What should have happened, and why">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOverrule(null)}>Cancel</Button>
          <Button disabled={busy || note.trim().length < 3} onClick={() => void sendOverrule()}>Overrule</Button>
        </div>
      </Modal>
    </div>
  );
}
