import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Envelope } from "@autofte/shared";
import { Activity, Bot, Check, Clock, Cpu, FileText, FlaskConical, Gauge, Hand, Play, ShieldAlert, ShieldCheck, Sparkles, Users, Wrench, X } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLiveEvent } from "../lib/sse";
import { ago, dateTime, usd } from "../lib/format";
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Skeleton, Stat, StatusBadge, Tabs } from "../ui";
import { FteName, useFte } from "../lib/site";

interface Overview {
  model: { name: string; configured: boolean; family: string };
  week: { seededRuns: number; runs: number; ok: number; conversations: number; leadsCreated: number; invoicesRequested: number; handovers: number; p50FirstReplyMs: number; p90FirstReplyMs: number; tokens: number; hoursSaved: number };
  pendingApprovals: { id: string; kind: string; reason: string; payload: { discountPct?: number }; createdAt: string; conversationId: string | null }[];
  pendingInvoices: { id: string; number: string; consignee: string; total: number; createdAt: string }[];
  envelope: Envelope;
  lastEval: { total: number; passed: number; startedAt: string } | null;
  skills: { name: string; description: string }[];
  tools: { name: string; description: string }[];
}
interface Run {
  id: string;
  trigger: string;
  status: string;
  steps: number;
  latencyMs: number | null;
  firstReplyMs: number | null;
  promptTokens: number;
  completionTokens: number;
  toolCalls: { name: string; args: unknown; ok: boolean; ms: number; preview: string; guard?: boolean }[];
  reasoningExcerpt: string | null;
  error: string | null;
  startedAt: string;
  conversationId: string | null;
  customer: string | null;
}
interface EvalRunRow {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  total: number;
  passed: number;
  done?: number; // cases that finished (fewer than total when the server stopped mid-run)
  provider: string | null;
  model: string | null;
}
interface EvalResult {
  id: string;
  category: string;
  title: string;
  safety: boolean;
  pass: boolean;
  detail: string;
  ms: number;
  tokens: number;
  reply?: string;
  tools?: string[];
  guards?: string[];
}
interface EvalIndex {
  runs: EvalRunRow[];
  running: { id: string; done: number; total: number } | null;
  categories: Record<string, string>;
  cases: { id: string; category: string; title: string; safety: boolean }[];
}

export default function FteConsole() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"activity" | "approvals" | "envelope" | "skills" | "evals" | "schedule">("activity");
  const ov = useQuery({ queryKey: ["fte-overview"], queryFn: () => api.get<Overview>("/api/fte/overview") });
  const runs = useQuery({ queryKey: ["fte-runs"], queryFn: () => api.get<Run[]>("/api/fte/runs") });
  const onRun = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["fte-runs"] });
    void qc.invalidateQueries({ queryKey: ["fte-overview"] });
  }, [qc]);
  useLiveEvent("fte.run", onRun);
  useLiveEvent("notification", onRun);
  const [open, setOpen] = useState<Run | null>(null);
  const d = ov.data;
  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-brand-600 text-white">
              <Bot className="size-5" />
            </span>
            <FteName /> — Digital FTE console
          </span>
        }
        subtitle={d ? `${d.model.family} · ${d.model.name} · ${d.model.configured ? "online" : "model key missing"}` : "…"}
      />
      {!d ? (
        <Skeleton className="h-28" />
      ) : (
        <>
        {d.week.seededRuns > 0 && <p className="mb-3 text-xs text-slate-500">Includes {d.week.seededRuns} seeded demo turns, so this page is not empty on a fresh demo. Real turns add to them.</p>}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Turns handled (7 days)" value={d.week.runs} hint={`${d.week.conversations} conversations`} icon={<Activity className="size-5" />} />
          <Stat label="Median first reply" value={d.week.p50FirstReplyMs ? `${(d.week.p50FirstReplyMs / 1000).toFixed(1)} s` : "—"} hint={d.week.p90FirstReplyMs ? `p90 ${(d.week.p90FirstReplyMs / 1000).toFixed(1)} s` : undefined} icon={<Gauge className="size-5" />} />
          <Stat label="Leads · invoice requests" value={`${d.week.leadsCreated} · ${d.week.invoicesRequested}`} hint={`${d.week.handovers} handed to people`} icon={<Users className="size-5" />} />
          <Stat label="Agent hours saved (est.)" value={d.week.hoursSaved} hint={d.lastEval ? `Last eval ${d.lastEval.passed}/${d.lastEval.total} passed` : "Eval suite: run npm run eval"} icon={<Clock className="size-5" />} />
        </div>
        </>
      )}
      <div className="mt-6 mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "activity", label: "Live activity" },
            { value: "approvals", label: "Approvals", count: (d?.pendingApprovals.length ?? 0) + (d?.pendingInvoices.length ?? 0) },
            { value: "envelope", label: "Authority envelope" },
            { value: "skills", label: "Skills & tools" },
            { value: "evals", label: "Evals" },
            { value: "schedule", label: "Schedule & clock" },
          ]}
        />
      </div>
      {tab === "evals" && <Evals canRun={can("fte.evals.run")} />}
      {tab === "schedule" && <Schedule canMove={can("fte.envelope.manage")} />}
      {tab === "activity" && (
        <Card padded={false}>
          {runs.isLoading ? (
            <Skeleton className="m-4 h-40" />
          ) : !runs.data?.length ? (
            <p className="p-6 text-center text-sm text-slate-500">No runs yet — open the website chat and ask <FteName /> for a car.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {runs.data.map((r) => (
                <li key={r.id}>
                  <button onClick={() => setOpen(r)} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                    <StatusBadge status={r.status} />
                    <span className="text-sm font-semibold text-slate-900">{r.customer ?? "—"}</span>
                    <Badge tone={r.trigger === "message" ? "blue" : "violet"}>{r.trigger === "message" ? "buyer message" : r.trigger === "event" ? "proactive" : r.trigger}</Badge>
                    <span className="flex min-w-0 flex-1 flex-wrap gap-1">
                      {r.toolCalls.map((t, i) => (
                        <span key={i} className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] ${t.ok ? "bg-slate-100 text-slate-700" : "bg-rose-50 text-rose-700"}`}>
                          {t.name}
                        </span>
                      ))}
                    </span>
                    <span className="text-xs text-slate-500">{r.latencyMs ? `${(r.latencyMs / 1000).toFixed(1)} s` : "…"}</span>
                    <span className="text-xs text-slate-400">{ago(r.startedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {tab === "approvals" && d && <Approvals d={d} canDecide={can("fte.approvals.decide")} />}
      {tab === "envelope" && d && <EnvelopeEditor env={d.envelope} canEdit={can("fte.envelope.manage")} />}
      {tab === "skills" && d && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <p className="flex items-center gap-2 font-semibold text-slate-900">
              <Sparkles className="size-4 text-violet-600" /> Skills (SKILL.md, loaded on demand)
            </p>
            <ul className="mt-3 space-y-3">
              {d.skills.map((s) => (
                <li key={s.name}>
                  <p className="font-mono text-sm font-semibold text-slate-900">{s.name}</p>
                  <p className="text-sm text-slate-600">{s.description}</p>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <p className="flex items-center gap-2 font-semibold text-slate-900">
              <Wrench className="size-4 text-brand-600" /> Tools (served over MCP at /mcp)
            </p>
            <ul className="mt-3 space-y-3">
              {d.tools.map((t) => (
                <li key={t.name}>
                  <p className="font-mono text-sm font-semibold text-slate-900">{t.name}</p>
                  <p className="line-clamp-2 text-sm text-slate-600">{t.description}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title="Run detail" wide>
        {open && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={open.status} />
              <Badge tone="gray">{dateTime(open.startedAt)}</Badge>
              <Badge tone="gray">
                <Cpu className="size-3" /> {open.promptTokens + open.completionTokens} tokens
              </Badge>
              {open.firstReplyMs && <Badge tone="blue">reply in {(open.firstReplyMs / 1000).toFixed(1)} s</Badge>}
              {open.conversationId && (
                <Link to={`/desk?c=${open.conversationId}`} className="text-sm font-semibold text-brand-700">
                  Open conversation →
                </Link>
              )}
            </div>
            <div>
              <p className="mb-2 font-semibold text-slate-900">Tool calls (through MCP)</p>
              <ol className="space-y-2">
                {open.toolCalls.map((t, i) => (
                  <li key={i} className="rounded-xl border border-slate-200 p-3">
                    <p className="flex flex-wrap items-center gap-2 font-mono text-xs font-semibold">
                      {t.ok ? <Check className="size-3.5 text-emerald-600" /> : <X className="size-3.5 text-rose-600" />} {t.name} <span className="font-normal text-slate-400">{t.ms} ms</span>
                      {t.guard && <Badge tone="amber">code guard — the reply promised it, the model skipped the call</Badge>}
                    </p>
                    <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-50 p-2 text-[11px] text-slate-700">{JSON.stringify(t.args)}</pre>
                    <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-slate-900 p-2 text-[11px] whitespace-pre-wrap text-slate-100">{t.preview}</pre>
                  </li>
                ))}
                {!open.toolCalls.length && <p className="text-slate-500">No tools needed for this turn.</p>}
              </ol>
            </div>
            {open.reasoningExcerpt && (
              <div>
                <p className="mb-1 font-semibold text-slate-900">Reasoning (excerpt from Muse Spark Open)</p>
                <pre className="max-h-60 overflow-auto rounded-xl bg-violet-50 p-3 text-[11px] whitespace-pre-wrap text-violet-900">{open.reasoningExcerpt}</pre>
              </div>
            )}
            {open.error && <p className="rounded-xl bg-rose-50 p-3 text-rose-700">{open.error}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}

function Approvals({ d, canDecide }: { d: Overview; canDecide: boolean }) {
  const qc = useQueryClient();
  const decide = async (id: string, decision: "approved" | "rejected") => {
    await api.post(`/api/fte/approvals/${id}/decide`, { decision });
    await qc.invalidateQueries({ queryKey: ["fte-overview"] });
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <p className="flex items-center gap-2 font-semibold text-slate-900">
          <FileText className="size-4 text-brand-600" /> Invoice requests from <FteName />
        </p>
        {d.pendingInvoices.length ? (
          <ul className="mt-3 divide-y divide-slate-100">
            {d.pendingInvoices.map((i) => (
              <li key={i.id}>
                <Link to={`/crm/invoices/${i.id}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-brand-700">
                  <span className="font-semibold">
                    {i.number} · {i.consignee}
                  </span>
                  <span>{usd(i.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Nothing waiting.</p>
        )}
      </Card>
      <Card>
        <p className="flex items-center gap-2 font-semibold text-slate-900">
          <Hand className="size-4 text-amber-600" /> Requests beyond the envelope
        </p>
        {d.pendingApprovals.length ? (
          <ul className="mt-3 space-y-3">
            {d.pendingApprovals.map((a) => (
              <li key={a.id} className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-semibold text-slate-900">
                  {a.kind}
                  {a.payload?.discountPct ? ` · ${a.payload.discountPct}%` : ""}
                </p>
                <p className="text-sm text-slate-600">{a.reason}</p>
                <p className="text-[11px] text-slate-400">{ago(a.createdAt)}</p>
                {canDecide && (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="success" onClick={() => void decide(a.id, "approved")}>
                      Approve
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => void decide(a.id, "rejected")}>
                      Decline
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Nothing waiting.</p>
        )}
      </Card>
    </div>
  );
}

function EnvelopeEditor({ env, canEdit }: { env: Envelope; canEdit: boolean }) {
  const fte = useFte();
  const qc = useQueryClient();
  const [f, setF] = useState(env);
  const [msg, setMsg] = useState<string | null>(null);
  const num = (k: keyof Envelope) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: Number(e.target.value) });
  return (
    <Card className="max-w-3xl">
      <p className="flex items-center gap-2 font-semibold text-slate-900">
        <ShieldCheck className="size-4 text-emerald-600" /> What <FteName /> may do without asking
      </p>
      <p className="mt-1 text-sm text-slate-500">Enforced on the server inside every tool — a prompt cannot talk <FteName /> past these limits.</p>
      <form
        className="mt-4 grid gap-4 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setMsg(null);
          try {
            await api.put("/api/fte/envelope", f);
            await qc.invalidateQueries({ queryKey: ["fte-overview"] });
            setMsg(`Saved — ${fte} uses the new limits from its next action.`);
          } catch (ex) {
            setMsg((ex as Error).message);
          }
        }}
      >
        <Field label="Max discount without approval (%)">
          <Input type="number" min={0} max={50} step={0.5} value={f.maxDiscountPct} onChange={num("maxDiscountPct")} disabled={!canEdit} />
        </Field>
        <Field label="Max auction bid without approval (¥)">
          <Input type="number" min={0} step={10000} value={f.maxBidJpy} onChange={num("maxBidJpy")} disabled={!canEdit} />
        </Field>
        <Field label="Proactive messages per buyer per day">
          <Input type="number" min={0} max={20} value={f.proactivePerBuyerPerDay} onChange={num("proactivePerBuyerPerDay")} disabled={!canEdit} />
        </Field>
        <Field label="Follow up an unanswered quote after (hours)">
          <Input type="number" min={1} max={720} value={f.followUpAfterHours} onChange={num("followUpAfterHours")} disabled={!canEdit} />
        </Field>
        <Field label="Working hours for proactive messages (start)">
          <Input type="number" min={0} max={23} value={f.workingHourStart} onChange={num("workingHourStart")} disabled={!canEdit} />
        </Field>
        <Field label="Working hours (end)">
          <Input type="number" min={1} max={24} value={f.workingHourEnd} onChange={num("workingHourEnd")} disabled={!canEdit} />
        </Field>
        <Field label="Always hand to a person (comma separated)" className="sm:col-span-2">
          <Input value={f.escalateTopics.join(", ")} onChange={(e) => setF({ ...f, escalateTopics: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} disabled={!canEdit} />
        </Field>
        <div className="flex items-center gap-3 sm:col-span-2">
          {canEdit ? <Button type="submit">Save envelope</Button> : <p className="text-sm text-slate-500">Only the Supervisor can change the envelope.</p>}
          {msg && <span className="text-sm text-slate-600">{msg}</span>}
        </div>
      </form>
    </Card>
  );
}

interface ClockState {
  now: string;
  offsetHours: number;
  nextSaleDay: string | null;
  pending: { id: string; dueAt: string; what: string }[];
  settledLots?: number;
  eventsRun?: number;
}

/** The demo clock: jump forward to watch tomorrow's work happen now (follow-ups, auction results). */
function Schedule({ canMove }: { canMove: boolean }) {
  const fte = useFte();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["fte-clock"], queryFn: () => api.get<ClockState>("/api/fte/clock"), refetchInterval: 15000 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const move = async (body: { advanceHours?: number; reset?: boolean }) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.post<ClockState>("/api/fte/clock", body);
      qc.setQueryData(["fte-clock"], r);
      void qc.invalidateQueries({ queryKey: ["fte-runs"] });
      setMsg(body.reset ? "Clock back to real time." : `Moved ${body.advanceHours} h forward · ${r.settledLots ?? 0} auction lots settled · ${r.eventsRun ?? 0} scheduled tasks ran — ${fte} is messaging the buyers now (see Live activity).`);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const d = q.data;
  if (!d) return <Skeleton className="h-40" />;
  const inH = (iso: string) => {
    const h = (new Date(iso).getTime() - new Date(d.now).getTime()) / 3600_000;
    return h <= 0 ? "due now" : h < 24 ? `in ${Math.round(h)} h` : `in ${Math.round(h / 24)} d`;
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <p className="flex items-center gap-2 font-semibold text-slate-900">
          <Clock className="size-4 text-brand-600" /> Demo clock
        </p>
        <p className="mt-3 text-2xl font-bold text-slate-900">{new Date(d.now).toLocaleString("en-GB", { timeZone: "Asia/Tokyo", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
        <p className="text-sm text-slate-500">
          Japan time · {d.offsetHours ? `${d.offsetHours} h ahead of real time` : "real time"} · next auction day {d.nextSaleDay ?? "—"}
        </p>
        {canMove ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {[1, 24, 72].map((h) => (
              <Button key={h} variant="secondary" size="sm" disabled={busy} onClick={() => void move({ advanceHours: h })}>
                +{h === 1 ? "1 hour" : `${h / 24} day${h > 24 ? "s" : ""}`}
              </Button>
            ))}
            <Button variant="secondary" size="sm" disabled={busy || !d.offsetHours} onClick={() => void move({ reset: true })}>
              Reset
            </Button>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Only the Supervisor moves the demo clock.</p>
        )}
        {msg && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{msg}</p>}
        <p className="mt-4 text-xs text-slate-500">Moving the clock runs everything that falls due: quote follow-ups, follow-ups <FteName /> scheduled itself, and auction days ending — lots are settled and <FteName /> tells each buyer whether the bid won.</p>
      </Card>
      <Card>
        <p className="flex items-center gap-2 font-semibold text-slate-900">
          <Activity className="size-4 text-violet-600" /> <FteName />'s upcoming follow-ups
        </p>
        {d.pending.length ? (
          <ul className="mt-3 divide-y divide-slate-100">
            {d.pending.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <span className="text-slate-700">{p.what}</span>
                <Badge tone="violet">{inH(p.dueAt)}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Nothing scheduled. Quotes and <FteName />'s own promises appear here.</p>
        )}
      </Card>
    </div>
  );
}

/** Sora's eval suite: run it on the live model, watch it fill in, and read every case's evidence. */
function Evals({ canRun }: { canRun: boolean }) {
  const fte = useFte();
  const qc = useQueryClient();
  const idx = useQuery({ queryKey: ["fte-evals"], queryFn: () => api.get<EvalIndex>("/api/fte/evals"), refetchInterval: (q) => (q.state.data?.running ? 3000 : false) });
  const running = idx.data?.running ?? null;
  const [pick, setPick] = useState<string | null>(null);
  const runId = pick ?? running?.id ?? idx.data?.runs[0]?.id ?? null;
  const run = useQuery({
    queryKey: ["fte-eval", runId],
    queryFn: () => api.get<EvalRunRow & { results: EvalResult[] }>(`/api/fte/evals/${runId}`),
    enabled: !!runId,
    refetchInterval: running && running.id === runId ? 3000 : false,
  });
  // when a run finishes, read its final state once more (the last poll may predate it)
  const was = useRef<string | null>(null);
  useEffect(() => {
    if (was.current && !running) {
      void qc.invalidateQueries({ queryKey: ["fte-eval", was.current] });
      void qc.invalidateQueries({ queryKey: ["fte-overview"] });
    }
    was.current = running?.id ?? null;
  }, [running, qc]);
  const [failedOnly, setFailedOnly] = useState(false);
  const [open, setOpen] = useState<EvalResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const start = async () => {
    setErr(null);
    setStarting(true);
    try {
      const r = await api.post<{ id: string; total: number }>("/api/fte/evals/run");
      setPick(r.id);
      await qc.invalidateQueries({ queryKey: ["fte-evals"] });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  if (idx.isLoading) return <Skeleton className="h-48" />;
  const d = idx.data;
  if (!d) return <p className="text-sm text-rose-600">Could not load the eval suite.</p>;
  const r = run.data;
  const results = r?.results ?? [];
  const safetyFailed = results.filter((x) => x.safety && !x.pass).length;
  const guarded = results.filter((x) => x.guards?.length).length;
  const tokens = results.reduce((a, x) => a + x.tokens, 0);
  const secs = r?.finishedAt ? Math.round((new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 1000) : null;
  const byCat = Object.entries(d.categories)
    .map(([key, label]) => ({ key, label, n: results.filter((x) => x.category === key).length, ok: results.filter((x) => x.category === key && x.pass).length }))
    .filter((c) => c.n);
  const shown = failedOnly ? results.filter((x) => !x.pass) : results;
  const live = !!running && running.id === runId;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-semibold text-slate-900">
              <FlaskConical className="size-4 text-violet-600" /> <FteName />'s eval suite
            </p>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              {d.cases.length} cases in {Object.keys(d.categories).length} categories, run on the live Meta model through the real tools. Every case talks to a fresh test buyer and is checked against the database; everything it creates is removed afterwards. Safety cases block a release.
            </p>
          </div>
          {canRun && (
            <Button onClick={() => void start()} loading={starting} disabled={!!running}>
              <Play className="size-4" /> {running ? "Running…" : "Run all cases"}
            </Button>
          )}
        </div>
        {err && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{err}</p>}
        {running && (
          <div className="mt-4">
            <div className="flex justify-between text-xs font-semibold text-slate-600">
              <span>Running on the live model…</span>
              <span>
                {running.done}/{running.total}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${Math.round((running.done / Math.max(1, running.total)) * 100)}%` }} />
            </div>
          </div>
        )}
      </Card>

      {!d.runs.length && !running ? (
        <Empty icon={<FlaskConical className="size-8" />} title="No eval runs yet" text={canRun ? `Run the suite to score ${fte} on the live model.` : "The Supervisor can run the suite (or run npm run eval)."} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Select aria-label="Eval run" value={runId ?? ""} onChange={(e) => setPick(e.target.value)} className="w-auto max-w-full">
              {d.runs.map((x) => (
                <option key={x.id} value={x.id}>
                  {dateTime(x.startedAt)} — {running?.id === x.id ? "running" : x.done != null && x.done < x.total ? `stopped early: ${x.passed}/${x.done} passed of ${x.total}` : `${x.passed}/${x.total} passed`}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={failedOnly} onChange={(e) => setFailedOnly(e.target.checked)} className="size-4 rounded border-slate-300" /> Failed only
            </label>
          </div>
          {!r ? (
            <Skeleton className="h-40" />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Stat
                  label="Passed"
                  value={`${r.passed}/${results.length < r.total ? results.length : r.total}`}
                  hint={live ? `${results.length} of ${r.total} done` : results.length < r.total ? `stopped early at ${results.length} of ${r.total}` : results.length ? `${Math.round((r.passed / results.length) * 100)}%` : undefined}
                  icon={<Check className="size-5" />}
                />
                <Stat label="Safety failures" value={safetyFailed} hint={safetyFailed ? "release blocked" : "none — release OK"} icon={<ShieldAlert className="size-5" />} />
                <Stat label="Tokens" value={tokens.toLocaleString("en-US")} hint={secs != null ? `${secs} s in total` : "…"} icon={<Cpu className="size-5" />} />
                <Stat label="Model" value={<span className="text-sm" title={r.model ?? undefined}>{r.model?.replace(/^.*\//, "").replace(/-\d+$/, "") ?? "—"}</span>} hint={guarded ? `code guard stepped in on ${guarded} case${guarded > 1 ? "s" : ""}` : (r.provider ?? undefined)} icon={<Bot className="size-5" />} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {byCat.map((c) => (
                  <Card key={c.key} className="!p-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900" title={c.label}>
                        {c.label}
                      </p>
                      <p className={`text-sm font-bold ${c.ok === c.n ? "text-emerald-700" : "text-rose-700"}`}>
                        {c.ok}/{c.n}
                      </p>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${c.ok === c.n ? "bg-emerald-500" : "bg-rose-500"}`} style={{ width: `${Math.round((c.ok / c.n) * 100)}%` }} />
                    </div>
                  </Card>
                ))}
              </div>
              <Card padded={false}>
                {!shown.length ? (
                  <p className="p-6 text-center text-sm text-slate-500">{failedOnly ? "No failed cases in this run." : "Waiting for the first case…"}</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {shown.map((x) => (
                      <li key={x.id}>
                        <button onClick={() => setOpen(x)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-slate-50">
                          {x.pass ? <Check className="size-4 shrink-0 text-emerald-600" /> : <X className="size-4 shrink-0 text-rose-600" />}
                          <span className="min-w-0 flex-1 text-sm font-semibold text-slate-900">{x.title}</span>
                          <Badge tone="gray">{d.categories[x.category] ?? x.category}</Badge>
                          {x.safety && <Badge tone="violet">safety</Badge>}
                          {!!x.guards?.length && <Badge tone="amber">code guard</Badge>}
                          <span className="text-xs text-slate-500">{(x.ms / 1000).toFixed(1)} s</span>
                          <span className="basis-full truncate pl-7 font-mono text-[11px] text-slate-500">{x.detail}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          )}
        </>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.title ?? "Case"} wide>
        {open && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={open.pass ? "green" : "red"}>{open.pass ? "Passed" : "Failed"}</Badge>
              <Badge tone="gray">{d.categories[open.category] ?? open.category}</Badge>
              {open.safety && <Badge tone="violet">safety case</Badge>}
              <Badge tone="gray">
                <Cpu className="size-3" /> {open.tokens.toLocaleString("en-US")} tokens
              </Badge>
              <Badge tone="gray">{(open.ms / 1000).toFixed(1)} s</Badge>
              <span className="font-mono text-[11px] text-slate-400">{open.id}</span>
            </div>
            <div>
              <p className="mb-1 font-semibold text-slate-900">What the check found</p>
              <p className="rounded-xl bg-slate-50 p-3 font-mono text-xs break-words text-slate-700">{open.detail}</p>
            </div>
            {!!open.tools?.length && (
              <div>
                <p className="mb-1 font-semibold text-slate-900">Tools <FteName /> called</p>
                <div className="flex flex-wrap gap-1">
                  {open.tools.map((t, i) => (
                    <span key={i} className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {!!open.guards?.length && <p className="rounded-xl bg-amber-50 p-3 text-amber-800">Code guard: {open.guards.join(", ")} — <FteName />'s reply promised it but the model skipped the call, so the server kept the promise.</p>}
            {open.reply && (
              <div>
                <p className="mb-1 font-semibold text-slate-900"><FteName />'s reply</p>
                <pre className="max-h-72 overflow-auto rounded-xl bg-violet-50 p-3 text-xs whitespace-pre-wrap text-violet-900">{open.reply}</pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
