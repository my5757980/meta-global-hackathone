import { useCallback, useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Envelope } from "@autofte/shared";
import { Activity, Bot, Check, Clock, Cpu, FileText, Gauge, Hand, ShieldCheck, Sparkles, Users, Wrench, X } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLiveEvent } from "../lib/sse";
import { ago, dateTime, usd } from "../lib/format";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Skeleton, Stat, StatusBadge, Tabs } from "../ui";

interface Overview {
  model: { name: string; configured: boolean; family: string };
  week: { runs: number; ok: number; conversations: number; leadsCreated: number; invoicesRequested: number; handovers: number; p50FirstReplyMs: number; p90FirstReplyMs: number; tokens: number; hoursSaved: number };
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
  toolCalls: { name: string; args: unknown; ok: boolean; ms: number; preview: string }[];
  reasoningExcerpt: string | null;
  error: string | null;
  startedAt: string;
  conversationId: string | null;
  customer: string | null;
}

export default function FteConsole() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"activity" | "approvals" | "envelope" | "skills">("activity");
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
            Sora — Digital FTE console
          </span>
        }
        subtitle={d ? `${d.model.family} · ${d.model.name} · ${d.model.configured ? "online" : "model key missing"}` : "…"}
      />
      {!d ? (
        <Skeleton className="h-28" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Turns handled (7 days)" value={d.week.runs} hint={`${d.week.conversations} conversations`} icon={<Activity className="size-5" />} />
          <Stat label="Median first reply" value={d.week.p50FirstReplyMs ? `${(d.week.p50FirstReplyMs / 1000).toFixed(1)} s` : "—"} hint={d.week.p90FirstReplyMs ? `p90 ${(d.week.p90FirstReplyMs / 1000).toFixed(1)} s` : undefined} icon={<Gauge className="size-5" />} />
          <Stat label="Leads · invoice requests" value={`${d.week.leadsCreated} · ${d.week.invoicesRequested}`} hint={`${d.week.handovers} handed to people`} icon={<Users className="size-5" />} />
          <Stat label="Agent hours saved (est.)" value={d.week.hoursSaved} hint={d.lastEval ? `Last eval ${d.lastEval.passed}/${d.lastEval.total} passed` : "Eval suite: run npm run eval"} icon={<Clock className="size-5" />} />
        </div>
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
          ]}
        />
      </div>
      {tab === "activity" && (
        <Card padded={false}>
          {runs.isLoading ? (
            <Skeleton className="m-4 h-40" />
          ) : !runs.data?.length ? (
            <p className="p-6 text-center text-sm text-slate-500">No runs yet — open the website chat and ask Sora for a car.</p>
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
                    <p className="flex items-center gap-2 font-mono text-xs font-semibold">
                      {t.ok ? <Check className="size-3.5 text-emerald-600" /> : <X className="size-3.5 text-rose-600" />} {t.name} <span className="font-normal text-slate-400">{t.ms} ms</span>
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
          <FileText className="size-4 text-brand-600" /> Invoice requests from Sora
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
  const qc = useQueryClient();
  const [f, setF] = useState(env);
  const [msg, setMsg] = useState<string | null>(null);
  const num = (k: keyof Envelope) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: Number(e.target.value) });
  return (
    <Card className="max-w-3xl">
      <p className="flex items-center gap-2 font-semibold text-slate-900">
        <ShieldCheck className="size-4 text-emerald-600" /> What Sora may do without asking
      </p>
      <p className="mt-1 text-sm text-slate-500">Enforced on the server inside every tool — a prompt cannot talk Sora past these limits.</p>
      <form
        className="mt-4 grid gap-4 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setMsg(null);
          try {
            await api.put("/api/fte/envelope", f);
            await qc.invalidateQueries({ queryKey: ["fte-overview"] });
            setMsg("Saved — Sora uses the new limits from its next action.");
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
