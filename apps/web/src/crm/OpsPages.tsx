import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Bot, Download, KeyRound, Plus, UserCheck, UserX } from "lucide-react";
import { api, qs } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ago, date, usd } from "../lib/format";
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Skeleton, Stat, Table, Tabs } from "../ui";
import { FteName } from "../lib/site";

export function UnitsPage() {
  const [term, setTerm] = useState("");
  const { can } = useAuth();
  const canSeeProfit = can("crm.units.costing");
  const q = useQuery({ queryKey: ["units", term], queryFn: () => api.get<{ id: string; make: string; model: string; year: number; chassis: string; color: string; drive: string | null; fuel: string | null; mileageKm: number | null; location: string; invoice: string; invoiceId: string; consignee: string; docs: number; stage: string | null; cover: string | null; addedBy: string | null; addedByKind: string | null; profitUsd: number | null }[]>(`/api/crm/units${qs({ q: term })}`) });
  return (
    <div>
      <PageHeader title="Units" subtitle="Every physical vehicle bought for an invoice, with its documents, stage and profit" />
      <div className="mb-4 max-w-md">
        <Input key={term} aria-label="Search units" placeholder="Make, model, year, chassis, colour" defaultValue={term} onKeyDown={(e) => e.key === "Enter" && setTerm((e.target as HTMLInputElement).value)} onBlur={(e) => e.target.value !== term && setTerm(e.target.value)} />
      </div>
      {q.isLoading ? (
        <Skeleton className="h-80" />
      ) : !q.data?.length ? (
        <Empty title="No units found" text={term ? "Try a different search term" : undefined} />
      ) : (
        <Table head={canSeeProfit ? ["Vehicle", "Chassis", "Colour", "Drive / fuel", "Mileage", "Location", "Invoice", "Docs", "Stage", "Added by", "Profit", ""] : ["Vehicle", "Chassis", "Colour", "Drive / fuel", "Mileage", "Location", "Invoice", "Docs", "Stage", "Added by", ""]}>
          {q.data.map((u) => (
            <tr key={u.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-semibold">
                <span className="flex min-w-48 items-center gap-3">
                  {u.cover ? <img src={`/api/crm/files/${u.cover}`} alt="" loading="lazy" className="h-10 w-14 shrink-0 rounded-md object-cover ring-1 ring-slate-200" /> : <span className="h-10 w-14 shrink-0 rounded-md bg-slate-100" />}
                  <span>
                    {u.year} {u.make} {u.model}
                  </span>
                </span>
              </td>
              <td className="px-4 py-3 text-xs whitespace-nowrap">{u.chassis}</td>
              <td className="px-4 py-3">{u.color}</td>
              <td className="px-4 py-3 text-xs whitespace-nowrap">{[u.drive, u.fuel].filter(Boolean).join(" · ") || "—"}</td>
              <td className="px-4 py-3 whitespace-nowrap">{u.mileageKm != null ? `${u.mileageKm.toLocaleString("en-US")} km` : "—"}</td>
              <td className="px-4 py-3 text-xs">{u.location}</td>
              <td className="px-4 py-3">
                <Link to={`/crm/invoices/${u.invoiceId}`} className="font-semibold text-brand-700 hover:underline">
                  {u.invoice}
                </Link>
                <p className="text-xs text-slate-500">{u.consignee}</p>
              </td>
              <td className="px-4 py-3">{u.docs}</td>
              <td className="px-4 py-3">{u.stage ? <Badge tone="blue">{u.stage}</Badge> : "—"}</td>
              <td className="px-4 py-3 whitespace-nowrap">{u.addedByKind === "fte" ? <span className="inline-flex items-center gap-1 font-semibold text-violet-700"><Bot className="size-4" /> {u.addedBy}</span> : u.addedBy ?? "—"}</td>
              {canSeeProfit && <td className={`px-4 py-3 font-semibold whitespace-nowrap ${u.profitUsd != null && u.profitUsd < 0 ? "text-rose-600" : "text-emerald-700"}`}>{u.profitUsd != null ? usd(u.profitUsd) : "—"}</td>}
              <td className="px-4 py-3">
                <Link to={`/crm/units/${u.id}`} className="font-semibold text-brand-700 hover:underline">
                  View
                </Link>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
function presetRange(p: string): [string, string] {
  const now = new Date();
  if (p === "today") return [iso(now), iso(now)];
  if (p === "week") {
    // this working week, Monday to Friday
    const toMonday = now.getUTCDay() === 0 ? -6 : 1 - now.getUTCDay();
    const mon = new Date(now.getTime() + toMonday * 86400_000);
    return [iso(mon), iso(new Date(mon.getTime() + 4 * 86400_000))];
  }
  if (p === "month") return [iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))), iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)))];
  return [iso(new Date(now.getTime() - 179 * 86400_000)), iso(now)];
}

export function ReportsPage() {
  const { can } = useAuth();
  const [preset, setPreset] = useState("month");
  const [[from, to], setRange] = useState(presetRange("month"));
  const [drill, setDrill] = useState<{ id: string; name: string } | null>(null);
  const q = useQuery({ queryKey: ["report", from, to], queryFn: () => api.get<{ totals: { leads: number; invoices: number; units: number; invoicedValue: number; received: number }; perAgent: { id: string; name: string; kind: string; leads: number; invoices: number; units: number; value: number }[]; invoices: { id: string; number: string; consignee: string; vehicle: string; total: number; status: string; agent: string; agentKind: string; createdAt: string }[] }>(`/api/crm/reports${qs({ from, to })}`) });
  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle={`${date(from)} → ${date(to)}`}
        actions={
          <>
            <a href={`/api/crm/reports.xlsx${qs({ from, to })}`} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
              <Download className="size-4" /> Export Excel
            </a>
            <a href={`/api/crm/reports.docx${qs({ from, to })}`} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
              <Download className="size-4" /> Export Word
            </a>
            <a href={`/api/crm/reports.csv${qs({ from, to })}`} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
              <Download className="size-4" /> Export all CSV
            </a>
            {can("crm.backup.download") && (
              <a href="/api/crm/backup.xlsx" className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
                <Download className="size-4" /> Full backup
              </a>
            )}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs
          value={preset}
          onChange={(p) => {
            setPreset(p);
            if (p !== "custom") setRange(presetRange(p));
          }}
          items={[
            { value: "today", label: "Daily" },
            { value: "week", label: "Weekly" },
            { value: "month", label: "Monthly" },
            { value: "half", label: "6 months" },
            { value: "custom", label: "Date range" },
          ]}
        />
        {preset === "today" && (
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" aria-label="Select date" value={from} max={iso(new Date())} onChange={(e) => e.target.value && setRange([e.target.value, e.target.value])} />
            <Button size="sm" variant="secondary" onClick={() => setRange(presetRange("today"))}>
              Today
            </Button>
          </div>
        )}
        {preset === "custom" && (
          <div className="flex gap-2">
            <Input type="date" value={from} onChange={(e) => setRange([e.target.value, to])} />
            <Input type="date" value={to} onChange={(e) => setRange([from, e.target.value])} />
          </div>
        )}
      </div>
      {!q.data ? (
        <Skeleton className="h-60" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Stat label="Leads" value={q.data.totals.leads} />
            <Stat label="Invoices" value={q.data.totals.invoices} />
            <Stat label="Units" value={q.data.totals.units} />
            <Stat label="Invoiced value" value={usd(q.data.totals.invoicedValue)} />
            <Stat label="Payments received" value={usd(q.data.totals.received)} />
          </div>
          <h2 className="mt-6 mb-2 font-semibold text-slate-900">Per agent</h2>
          <Table head={["Agent", "Leads", "Invoices", "Units", "Value (C&F)", ""]}>
            {q.data.perAgent.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3 font-semibold">{a.kind === "fte" ? <span className="inline-flex items-center gap-1 text-violet-700"><Bot className="size-4" /> {a.name} (Digital FTE)</span> : a.name}</td>
                <td className="px-4 py-3">{a.leads}</td>
                <td className="px-4 py-3">{a.invoices}</td>
                <td className="px-4 py-3">{a.units}</td>
                <td className="px-4 py-3 font-semibold">{usd(a.value)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => setDrill({ id: a.id, name: a.name })}>
                    View
                  </Button>
                  <a className="ml-2 text-sm font-semibold text-brand-700" href={`/api/crm/reports.csv${qs({ from, to, userId: a.id })}`}>
                    Export CSV
                  </a>
                </td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-bold">
              <td className="px-4 py-3">Total</td>
              <td className="px-4 py-3">{q.data.totals.leads}</td>
              <td className="px-4 py-3">{q.data.totals.invoices}</td>
              <td className="px-4 py-3">{q.data.totals.units}</td>
              <td className="px-4 py-3">{usd(q.data.totals.invoicedValue)}</td>
              <td />
            </tr>
          </Table>
          <h2 className="mt-6 mb-2 font-semibold text-slate-900">Invoices in the period</h2>
          <Table head={["Invoice", "Consignee", "Vehicle", "C&F", "Agent", "Status", "Date"]}>
            {q.data.invoices.map((i) => (
              <tr key={i.id}>
                <td className="px-4 py-3">
                  <Link to={`/crm/invoices/${i.id}`} className="font-semibold text-brand-700">
                    {i.number}
                  </Link>
                </td>
                <td className="px-4 py-3">{i.consignee}</td>
                <td className="px-4 py-3">{i.vehicle}</td>
                <td className="px-4 py-3">{usd(i.total)}</td>
                <td className="px-4 py-3">{i.agentKind === "fte" ? <FteName /> : i.agent}</td>
                <td className="px-4 py-3">{i.status}</td>
                <td className="px-4 py-3 whitespace-nowrap">{date(i.createdAt)}</td>
              </tr>
            ))}
          </Table>
          {drill && <AgentDetail who={drill} from={from} to={to} onClose={() => setDrill(null)} />}
        </>
      )}
    </div>
  );
}

function AgentDetail({ who, from, to, onClose }: { who: { id: string; name: string }; from: string; to: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ["report-detail", who.id, from, to], queryFn: () => api.get<{ leads: { id: string; customer: string; status: string; createdAt: string }[]; invoices: { id: string; number: string; consignee: string; total: number; status: string; createdAt: string }[]; units: { id: string; make: string; model: string; chassis: string | null; invoice: string; createdAt: string }[] }>(`/api/crm/reports/detail${qs({ userId: who.id, from, to })}`) });
  return (
    <Modal open wide onClose={onClose} title={`${who.name}: ${date(from)} → ${date(to)}`}>
      {!q.data ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="space-y-4">
          <div>
            <p className="mb-1 font-semibold text-slate-900">Leads ({q.data.leads.length})</p>
            {q.data.leads.length ? (
              <ul className="divide-y divide-slate-100 text-sm">
                {q.data.leads.map((l) => (
                  <li key={l.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                    <Link className="font-medium text-brand-700" to={`/crm/leads/${l.id}`}>{l.customer}</Link>
                    <span className="text-slate-500">{l.status.replace(/_/g, " ")} · {date(l.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">None in this period.</p>}
          </div>
          <div>
            <p className="mb-1 font-semibold text-slate-900">Invoices ({q.data.invoices.length})</p>
            {q.data.invoices.length ? (
              <ul className="divide-y divide-slate-100 text-sm">
                {q.data.invoices.map((i) => (
                  <li key={i.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                    <Link className="font-medium text-brand-700" to={`/crm/invoices/${i.id}`}>{i.number} · {i.consignee}</Link>
                    <span className="text-slate-500">{usd(i.total)} · {i.status} · {date(i.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">None in this period.</p>}
          </div>
          <div>
            <p className="mb-1 font-semibold text-slate-900">Units ({q.data.units.length})</p>
            {q.data.units.length ? (
              <ul className="divide-y divide-slate-100 text-sm">
                {q.data.units.map((u) => (
                  <li key={u.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                    <Link className="font-medium text-brand-700" to={`/crm/units/${u.id}`}>{u.make} {u.model}</Link>
                    <span className="text-slate-500">{u.chassis ?? "no chassis"} · {u.invoice} · {date(u.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">None in this period.</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}

export function UsersPage() {
  const qc = useQueryClient();
  const { me, can } = useAuth();
  const canChange = can("crm.users.edit"); // a Supervisor sees the list and creates agents, no more
  const q = useQuery({ queryKey: ["users"], queryFn: () => api.get<{ users: { id: string; name: string; email: string; kind: string; isActive: boolean; title: string; lastSeenAt: string | null; role: string; roleName: string; leads: number; showInChat: boolean; chatForced: boolean; deskByRole: boolean }[]; roles: { slug: string; name: string }[] }>("/api/crm/users") });
  const [create, setCreate] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [transfer, setTransfer] = useState(false);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["users"] });
  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Staff accounts, roles and access"
        actions={
          <>
            {can("crm.leads.transfer") && (
              <Button variant="secondary" onClick={() => setTransfer(true)}>
                Transfer agent data
              </Button>
            )}
            {can("crm.users.create") && (
              <Button onClick={() => setCreate(true)}>
                <Plus className="size-4" /> New user
              </Button>
            )}
          </>
        }
      />
      {!q.data ? (
        <Skeleton className="h-60" />
      ) : (
        <Table head={["Name", "Role", "Leads", "Last seen", "Show in the chat", "Status", ""]}>
          {q.data.users.map((u) => (
            <tr key={u.id}>
              <td className="px-4 py-3">
                <p className="flex items-center gap-1 font-semibold text-slate-900">
                  {u.kind === "fte" && <Bot className="size-4 text-violet-600" />} {u.name}
                </p>
                <p className="text-xs text-slate-500">{u.email}</p>
              </td>
              <td className="px-4 py-3">
                {u.kind === "fte" || u.id === me?.id || !canChange ? (
                  <Badge tone={u.kind === "fte" ? "violet" : "blue"}>{u.roleName}</Badge>
                ) : (
                  <Select
                    className="min-w-40"
                    value={u.role}
                    onChange={async (e) => {
                      try {
                        await api.put(`/api/crm/users/${u.id}`, { roleSlug: e.target.value });
                        refresh();
                      } catch (ex) {
                        alert((ex as Error).message);
                      }
                    }}
                  >
                    {q.data.roles.map((r) => (
                      <option key={r.slug} value={r.slug}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                )}
              </td>
              <td className="px-4 py-3">{u.leads}</td>
              <td className="px-4 py-3 text-xs">{ago(u.lastSeenAt)}</td>
              <td className="px-4 py-3">
                {u.kind === "staff" && !canChange ? (
                  <span className="text-[11px] text-slate-500">{(u.chatForced || (u.showInChat && u.deskByRole)) ? "In the list" : "Not in the list"}</span>
                ) : u.kind === "staff" ? (
                  <span className="block">
                    <select
                      aria-label={`Show ${u.name} in the chat`}
                      className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs"
                      value={u.chatForced ? "yes" : u.showInChat ? "role" : "no"}
                      onChange={async (e) => {
                        await api.put(`/api/crm/users/${u.id}`, { chatVisibility: e.target.value });
                        refresh();
                      }}
                    >
                      <option value="role">Decide from their role</option>
                      <option value="yes">Always show</option>
                      <option value="no">Never show</option>
                    </select>
                    <span className="mt-0.5 block text-[11px] text-slate-500">{(u.chatForced || (u.showInChat && u.deskByRole)) ? "In the list" : "Not in the list"}{u.chatForced ? " · set by hand" : !u.showInChat ? " · held back by hand" : ""}</span>
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-3">{u.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Switched off</Badge>}</td>
              <td className="px-4 py-3">
                {u.kind === "staff" && u.id !== me?.id && (
                  <div className="flex gap-1">
                    {canChange && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await api.put(`/api/crm/users/${u.id}`, { isActive: !u.isActive });
                          refresh();
                        }}
                        aria-label={u.isActive ? "Switch off" : "Switch on"}
                      >
                        {u.isActive ? <UserX className="size-4" /> : <UserCheck className="size-4" />}
                      </Button>
                    )}
                    {can("crm.users.delete") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove the login of ${u.name}`}
                        onClick={async () => {
                          if (!window.confirm(`Remove the login of ${u.name} for good?`)) return;
                          try {
                            await api.del(`/api/crm/users/${u.id}`);
                            refresh();
                          } catch (ex) {
                            alert((ex as Error).message);
                          }
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                    {can("crm.users.password") && u.role !== "admin" && (me?.role === "admin" || u.role !== "manager") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          const r = await api.post<{ oneTimePassword: string }>(`/api/crm/users/${u.id}/reset-password`);
                          setSecret(`New password for ${u.name}: ${r.oneTimePassword}`);
                        }}
                        aria-label="Reset password"
                      >
                        <KeyRound className="size-4" />
                      </Button>
                    )}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {create && q.data && (
        <CreateUser
          roles={me?.role === "supervisor" ? q.data.roles.filter((r) => r.slug === "agent") : q.data.roles}
          onClose={() => setCreate(false)}
          onDone={(pw, name) => {
            setCreate(false);
            setSecret(`Account created for ${name}. One-time password (shown once): ${pw}`);
            refresh();
          }}
        />
      )}
      {transfer && q.data && <TransferModal users={q.data.users.filter((u) => u.isActive)} onClose={() => setTransfer(false)} onDone={refresh} />}
      <Modal open={!!secret} onClose={() => setSecret(null)} title="Share this securely">
        <p className="rounded-xl bg-amber-50 p-3 font-mono text-sm break-all text-amber-900">{secret}</p>
        <p className="mt-2 text-xs text-slate-500">It is shown only once and stored only as a hash.</p>
      </Modal>
    </div>
  );
}

function CreateUser({ roles, onClose, onDone }: { roles: { slug: string; name: string }[]; onClose: () => void; onDone: (pw: string, name: string) => void }) {
  const [f, setF] = useState({ name: "", email: "", phone: "", roleSlug: "agent", title: "" });
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal
      open
      onClose={onClose}
      title="New staff account"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              setErr(null);
              try {
                const r = await api.post<{ oneTimePassword: string }>("/api/crm/users", { ...f, phone: f.phone || undefined, title: f.title || undefined });
                onDone(r.oneTimePassword, f.name);
              } catch (ex) {
                setErr((ex as Error).message);
              }
            }}
          >
            Create
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="Name">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="E-mail">
          <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label="Phone">
          <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </Field>
        <Field label="Role">
          <Select value={f.roleSlug} onChange={(e) => setF({ ...f, roleSlug: e.target.value })}>
            {roles.map((r) => (
              <option key={r.slug} value={r.slug}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Job title (shown in chat)">
          <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </Field>
        {err && <p className="text-sm text-rose-600">{err}</p>}
      </div>
    </Modal>
  );
}

function TransferModal({ users, onClose, onDone }: { users: { id: string; name: string; leads: number }[]; onClose: () => void; onDone: () => void }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Modal
      open
      onClose={onClose}
      title="Transfer all leads, invoices and units from one agent to another"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            disabled={!from || !to || from === to}
            onClick={async () => {
              try {
                const r = await api.post<{ moved: number; invoices: number; units: number }>("/api/crm/leads/transfer", { fromUserId: from, toUserId: to });
                setMsg(`${r.moved} lead(s), ${r.invoices} invoice(s) and ${r.units} unit(s) moved.`);
                onDone();
              } catch (ex) {
                setMsg((ex as Error).message);
              }
            }}
          >
            Transfer
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="From">
          <Select value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">Choose…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.leads} leads)
              </option>
            ))}
          </Select>
        </Field>
        <Field label="To">
          <Select value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Choose…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        {msg && <p className="text-sm text-slate-700">{msg}</p>}
      </div>
    </Modal>
  );
}

export function Card2({ children }: { children: React.ReactNode }) {
  return <Card>{children}</Card>;
}
