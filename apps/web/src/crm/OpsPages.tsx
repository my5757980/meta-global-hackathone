import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Download, KeyRound, Plus, UserCheck, UserX } from "lucide-react";
import { api, qs } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ago, date, usd } from "../lib/format";
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Skeleton, Stat, Table, Tabs } from "../ui";
import { FteName } from "../lib/site";

export function UnitsPage() {
  const q = useQuery({ queryKey: ["units"], queryFn: () => api.get<{ id: string; make: string; model: string; year: number; chassis: string; color: string; location: string; invoice: string; invoiceId: string; consignee: string; docs: number; stage: string | null }[]>("/api/crm/units") });
  return (
    <div>
      <PageHeader title="Units" subtitle="Every physical vehicle bought for an invoice, with its documents and shipping stage" />
      {q.isLoading ? (
        <Skeleton className="h-80" />
      ) : !q.data?.length ? (
        <Empty title="No units yet" />
      ) : (
        <Table head={["Vehicle", "Chassis", "Invoice", "Consignee", "Documents", "Stage", "Location"]}>
          {q.data.map((u) => (
            <tr key={u.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-semibold">
                {u.year} {u.make} {u.model}
                <p className="text-xs font-normal text-slate-500">{u.color}</p>
              </td>
              <td className="px-4 py-3 text-xs">{u.chassis}</td>
              <td className="px-4 py-3">
                <Link to={`/crm/invoices/${u.invoiceId}`} className="font-semibold text-brand-700 hover:underline">
                  {u.invoice}
                </Link>
              </td>
              <td className="px-4 py-3">{u.consignee}</td>
              <td className="px-4 py-3">{u.docs}</td>
              <td className="px-4 py-3">{u.stage ? <Badge tone="blue">{u.stage}</Badge> : "—"}</td>
              <td className="px-4 py-3 text-xs">{u.location}</td>
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
  if (p === "week") return [iso(new Date(now.getTime() - 6 * 86400_000)), iso(now)];
  if (p === "month") return [iso(new Date(now.getTime() - 29 * 86400_000)), iso(now)];
  return [iso(new Date(now.getTime() - 179 * 86400_000)), iso(now)];
}

export function ReportsPage() {
  const { can } = useAuth();
  const [preset, setPreset] = useState("month");
  const [[from, to], setRange] = useState(presetRange("month"));
  const q = useQuery({ queryKey: ["report", from, to], queryFn: () => api.get<{ totals: { leads: number; invoices: number; units: number; invoicedValue: number; received: number }; perAgent: { id: string; name: string; kind: string; leads: number; invoices: number; value: number }[]; invoices: { id: string; number: string; consignee: string; vehicle: string; total: number; status: string; agent: string; agentKind: string; createdAt: string }[] }>(`/api/crm/reports${qs({ from, to })}`) });
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
          <Table head={["Agent", "Leads", "Invoices", "Value (C&F)"]}>
            {q.data.perAgent.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3 font-semibold">{a.kind === "fte" ? <span className="inline-flex items-center gap-1 text-violet-700"><Bot className="size-4" /> {a.name} (Digital FTE)</span> : a.name}</td>
                <td className="px-4 py-3">{a.leads}</td>
                <td className="px-4 py-3">{a.invoices}</td>
                <td className="px-4 py-3 font-semibold">{usd(a.value)}</td>
              </tr>
            ))}
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
        </>
      )}
    </div>
  );
}

export function UsersPage() {
  const qc = useQueryClient();
  const { me, can } = useAuth();
  const q = useQuery({ queryKey: ["users"], queryFn: () => api.get<{ users: { id: string; name: string; email: string; kind: string; isActive: boolean; title: string; lastSeenAt: string | null; role: string; roleName: string; leads: number }[]; roles: { slug: string; name: string }[] }>("/api/crm/users") });
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
            <Button onClick={() => setCreate(true)}>
              <Plus className="size-4" /> New user
            </Button>
          </>
        }
      />
      {!q.data ? (
        <Skeleton className="h-60" />
      ) : (
        <Table head={["Name", "Role", "Leads", "Last seen", "Status", ""]}>
          {q.data.users.map((u) => (
            <tr key={u.id}>
              <td className="px-4 py-3">
                <p className="flex items-center gap-1 font-semibold text-slate-900">
                  {u.kind === "fte" && <Bot className="size-4 text-violet-600" />} {u.name}
                </p>
                <p className="text-xs text-slate-500">{u.email}</p>
              </td>
              <td className="px-4 py-3">
                {u.kind === "fte" || u.id === me?.id ? (
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
              <td className="px-4 py-3">{u.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Switched off</Badge>}</td>
              <td className="px-4 py-3">
                {u.kind === "staff" && u.id !== me?.id && (
                  <div className="flex gap-1">
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
                  </div>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {create && q.data && (
        <CreateUser
          roles={q.data.roles}
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
      title="Transfer all leads from one agent to another"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            disabled={!from || !to || from === to}
            onClick={async () => {
              try {
                const r = await api.post<{ moved: number }>("/api/crm/leads/transfer", { fromUserId: from, toUserId: to });
                setMsg(`${r.moved} lead(s) moved.`);
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
