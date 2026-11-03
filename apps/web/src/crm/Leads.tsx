import { Link, useSearchParams } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { LEAD_STATUS_LABELS } from "@autofte/shared";
import { useMemo, useState } from "react";
import { Bot, FileSpreadsheet, Plus, UserPlus, X } from "lucide-react";
import { NewLeadModal, useCountries } from "./LeadForms";
import { AssignLeadsModal } from "./LeadAssign";
import { LeadImportModal } from "./LeadImport";
import { api, qs } from "../lib/api";
import { useAuth } from "../lib/auth";
import { date, usd2 } from "../lib/format";
import { Button, Empty, Field, Input, PageHeader, Pagination, Select, Skeleton, StatusBadge, Table, Tabs } from "../ui";
import { FteName } from "../lib/site";

interface LeadRow {
  id: string;
  customerName: string;
  contactPerson: string;
  phone: string;
  email: string | null;
  status: string;
  country: string | null;
  port: string | null;
  owner: string | null;
  ownerKind: string | null;
  source: string;
  createdAt: string;
  duplicateBy: string | null;
  invoiced: number;
  paid: number;
}

export default function Leads() {
  const { can } = useAuth();
  const [sp, setSp] = useSearchParams();
  const [newLead, setNewLead] = useState(false);
  const [importing, setImporting] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const params = { q: sp.get("q") ?? "", status: sp.get("status") ?? "", agent: sp.get("agent") ?? "", country: sp.get("country") ?? "", port: sp.get("port") ?? "", from: sp.get("from") ?? "", to: sp.get("to") ?? "", customers: sp.get("customers") ?? "", pageSize: sp.get("pageSize") ?? "", page: Number(sp.get("page") ?? 1) };
  const customersTab = params.customers === "1";
  const canAssign = can("crm.leads.upload") && can("crm.leads.view_all");
  const countries = useCountries();
  const ports = useMemo(() => countries.data?.find((c) => c.code === params.country)?.ports ?? [], [countries.data, params.country]);
  const filtered = Boolean(params.q || params.status || params.country || params.port || params.from || params.to);
  const q = useQuery({ queryKey: ["leads", params], queryFn: () => api.get<{ items: LeadRow[]; total: number; page: number; pageSize: number; agents: { id: string; name: string; kind: string; n: number }[] }>(`/api/crm/leads${qs(params)}`), placeholderData: keepPreviousData });
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v);
    else n.delete(k);
    if (k !== "page") n.delete("page");
    if (k === "country") n.delete("port");
    setSp(n);
  };
  const clearFilters = () => {
    const n = new URLSearchParams();
    if (params.customers) n.set("customers", params.customers);
    if (params.agent) n.set("agent", params.agent);
    setSp(n);
  };
  return (
    <div>
      <PageHeader title={customersTab ? "Customers" : can("crm.leads.view_all") ? "All leads" : "My leads"} subtitle={customersTab ? "Buyers with an approved invoice: what they were invoiced and what they have paid" : "Every buyer, from the website chat, the app, Excel uploads and agents"} actions={
          <div className="flex flex-wrap gap-2">
            {canAssign && (
              <Button variant="secondary" onClick={() => setAssigning(true)}>
                <UserPlus className="size-4" /> Assign imported leads
              </Button>
            )}
            {can("crm.leads.upload") && (
              <Button variant="secondary" onClick={() => setImporting(true)}>
                <FileSpreadsheet className="size-4" /> Import from Excel
              </Button>
            )}
            {can("crm.leads.create") && (
              <Button onClick={() => setNewLead(true)}>
                <Plus className="size-4" /> New lead
              </Button>
            )}
          </div>
        }
      />
      <NewLeadModal open={newLead} onClose={() => setNewLead(false)} />
      <LeadImportModal open={importing} onClose={() => setImporting(false)} />
      {assigning && <AssignLeadsModal onClose={() => setAssigning(false)} />}
      <div className="mb-4">
        <Tabs
          value={customersTab ? "customers" : "leads"}
          onChange={(v) => set("customers", v === "customers" ? "1" : "")}
          items={[
            { value: "leads", label: "Leads" },
            { value: "customers", label: "Customers" },
          ]}
        />
      </div>
      {q.data?.agents && q.data.agents.length > 0 && (
        <div className="scrollbar-thin mb-4 flex gap-2 overflow-x-auto pb-1">
          {q.data.agents.map((a) => (
            <button key={a.id} onClick={() => set("agent", params.agent === a.id ? "" : a.id)} className={`shrink-0 rounded-2xl border px-4 py-2 text-left ${params.agent === a.id ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-white"}`}>
              <p className="flex items-center gap-1 text-sm font-semibold text-slate-900">
                {a.kind === "fte" && <Bot className="size-4 text-violet-600" />} {a.name}
              </p>
              <p className="text-xs text-slate-500">{a.n} leads</p>
            </button>
          ))}
        </div>
      )}
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Field label="Search">
          <Input key={params.q} placeholder="Name, phone, e-mail" defaultValue={params.q} onKeyDown={(e) => e.key === "Enter" && set("q", (e.target as HTMLInputElement).value)} onBlur={(e) => e.target.value !== params.q && set("q", e.target.value)} />
        </Field>
        <Field label="Status">
          <Select value={params.status} onChange={(e) => set("status", e.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(LEAD_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Country">
          <Select value={params.country} onChange={(e) => set("country", e.target.value)}>
            <option value="">All countries</option>
            {countries.data?.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Port">
          <Select value={params.port} disabled={!ports.length} onChange={(e) => set("port", e.target.value)}>
            <option value="">{params.country ? "All ports" : "Choose a country first"}</option>
            {ports.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Created from">
          <Input type="date" value={params.from} max={params.to || undefined} onChange={(e) => set("from", e.target.value)} />
        </Field>
        <Field label="Created to">
          <Input type="date" value={params.to} min={params.from || undefined} onChange={(e) => set("to", e.target.value)} />
        </Field>
      </div>
      {filtered && (
        <div className="mb-4 flex items-center gap-3 text-sm text-slate-600">
          <span>{q.data ? `${q.data.total} found` : ""}</span>
          <Button size="sm" variant="ghost" onClick={clearFilters}>
            <X className="size-4" /> Clear filters
          </Button>
        </div>
      )}
      {q.isLoading ? (
        <Skeleton className="h-96" />
      ) : !q.data?.items.length ? (
        <Empty title={customersTab ? "No customers match" : "No leads match"} />
      ) : (
        <>
          <Table head={customersTab ? ["Customer", "Contact", "Country / port", "Owner", "Invoiced", "Paid", "Balance"] : ["Customer", "Contact", "Country / port", "Owner", "Source", "Created", "Status"]}>
            {q.data.items.map((l) => (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold">
                  <Link to={`/crm/leads/${l.id}`} className="text-brand-700 hover:underline">
                    {l.customerName}
                  </Link>
                  {l.duplicateBy && <p className="text-xs font-medium text-rose-700">{l.duplicateBy} tried to add this client</p>}
                </td>
                <td className="px-4 py-3">
                  {l.contactPerson}
                  <p className="text-xs text-slate-500">{l.phone}</p>
                </td>
                <td className="px-4 py-3">
                  {l.country ?? "—"}
                  <p className="text-xs text-slate-500">{l.port}</p>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{l.ownerKind === "fte" ? <span className="inline-flex items-center gap-1 font-semibold text-violet-700"><Bot className="size-4" /> <FteName /></span> : l.owner}</td>
                {customersTab ? (
                  <>
                    <td className="px-4 py-3 whitespace-nowrap">{usd2(l.invoiced)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-emerald-700">{usd2(l.paid)}</td>
                    <td className="px-4 py-3 font-semibold whitespace-nowrap">{usd2(l.invoiced - l.paid)}</td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 text-xs text-slate-600">{l.source.replace("_", " ")}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{date(l.createdAt)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={l.status} label={LEAD_STATUS_LABELS[l.status as keyof typeof LEAD_STATUS_LABELS]} />
                    </td>
                  </>
                )}
              </tr>
            ))}
          </Table>
          <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(p) => set("page", String(p))} onPageSize={(n) => set("pageSize", String(n))} />
        </>
      )}
    </div>
  );
}
