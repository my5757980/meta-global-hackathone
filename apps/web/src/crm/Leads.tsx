import { Link, useSearchParams } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { LEAD_STATUS_LABELS } from "@autofte/shared";
import { Bot } from "lucide-react";
import { api, qs } from "../lib/api";
import { useAuth } from "../lib/auth";
import { date } from "../lib/format";
import { Empty, Input, PageHeader, Pagination, Select, Skeleton, StatusBadge, Table } from "../ui";

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
}

export default function Leads() {
  const { can } = useAuth();
  const [sp, setSp] = useSearchParams();
  const params = { q: sp.get("q") ?? "", status: sp.get("status") ?? "", agent: sp.get("agent") ?? "", page: Number(sp.get("page") ?? 1) };
  const q = useQuery({ queryKey: ["leads", params], queryFn: () => api.get<{ items: LeadRow[]; total: number; page: number; pageSize: number; agents: { id: string; name: string; kind: string; n: number }[] }>(`/api/crm/leads${qs(params)}`), placeholderData: keepPreviousData });
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v);
    else n.delete(k);
    if (k !== "page") n.delete("page");
    setSp(n);
  };
  return (
    <div>
      <PageHeader title={can("crm.leads.view_all") ? "All leads" : "My leads"} subtitle="Every buyer, from the website chat, the app, Excel uploads and agents" />
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
      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="w-64" placeholder="Search name, phone, e-mail" defaultValue={params.q} onKeyDown={(e) => e.key === "Enter" && set("q", (e.target as HTMLInputElement).value)} />
        <Select className="w-48" value={params.status} onChange={(e) => set("status", e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(LEAD_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-96" />
      ) : !q.data?.items.length ? (
        <Empty title="No leads match" />
      ) : (
        <>
          <Table head={["Customer", "Contact", "Country / port", "Owner", "Source", "Created", "Status"]}>
            {q.data.items.map((l) => (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold">
                  <Link to={`/crm/leads/${l.id}`} className="text-brand-700 hover:underline">
                    {l.customerName}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {l.contactPerson}
                  <p className="text-xs text-slate-500">{l.phone}</p>
                </td>
                <td className="px-4 py-3">
                  {l.country ?? "—"}
                  <p className="text-xs text-slate-500">{l.port}</p>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{l.ownerKind === "fte" ? <span className="inline-flex items-center gap-1 font-semibold text-violet-700"><Bot className="size-4" /> Sora</span> : l.owner}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{l.source.replace("_", " ")}</td>
                <td className="px-4 py-3 whitespace-nowrap">{date(l.createdAt)}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={l.status} label={LEAD_STATUS_LABELS[l.status as keyof typeof LEAD_STATUS_LABELS]} />
                </td>
              </tr>
            ))}
          </Table>
          <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(p) => set("page", String(p))} />
        </>
      )}
    </div>
  );
}
