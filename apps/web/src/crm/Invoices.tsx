import { Link, useSearchParams } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Bot, Search, X } from "lucide-react";
import { api, qs } from "../lib/api";
import { date, usd2 } from "../lib/format";
import { Button, Empty, Input, PageHeader, Pagination, Select, Skeleton, StatusBadge, Table, clsx } from "../ui";
import { FteName } from "../lib/site";

interface Row {
  id: string;
  number: string;
  status: string;
  displayStatus: string;
  consigneeName: string;
  totalCnfUsd: number;
  createdAt: string;
  requestedByName: string;
  requestedByKind: string;
  port: string;
  vehicleCount: number;
  firstVehicle: string;
  chassis: string | null;
  paid: number;
}
interface Result {
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
  counts: { total: number; pending: number; approved: number; sent: number; rejected: number; paymentReceived: number };
  months: string[];
}

const monthName = (m: string) => new Date(`${m}-15T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export default function Invoices() {
  const [sp, setSp] = useSearchParams();
  const status = sp.get("status") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const month = sp.get("month") ?? "";
  const agent = sp.get("agent") ?? "";
  const term = sp.get("q") ?? "";
  const pageSize = sp.get("pageSize") ?? "";
  const q = useQuery({ queryKey: ["invoices", status, page, term, month, agent, pageSize], queryFn: () => api.get<Result>(`/api/crm/invoices${qs({ status, page, q: term, month, agent, pageSize })}`), placeholderData: keepPreviousData });
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v);
    else n.delete(k);
    if (k !== "page") n.delete("page");
    setSp(n);
  };
  const c = q.data?.counts;
  const cards: [string, string, number | undefined, string][] = [
    ["", "Total", c?.total, "text-slate-900"],
    ["pending", "Pending", c?.pending, "text-amber-700"],
    ["approved", "Approved", c?.approved, "text-emerald-700"],
    ["sent", "Sent", c?.sent, "text-blue-700"],
    ["payment_received", "Payment received", c?.paymentReceived, "text-emerald-800"],
    ["rejected", "Rejected", c?.rejected, "text-rose-700"],
  ];
  return (
    <div>
      <PageHeader title="Invoices" subtitle={<>Requested by agents and by <FteName /> · approved by the invoice desk</>} />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {cards.map(([v, label, n, tone]) => (
          <button key={label} onClick={() => set("status", v === status ? "" : v)} aria-pressed={status === v} className={clsx("rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-brand-300", status === v ? "border-brand-500 ring-1 ring-brand-500" : "border-slate-200")}>
            <p className="text-xs font-semibold text-slate-500">{label}</p>
            <p className={clsx("mt-1 text-2xl font-bold", tone)}>{n ?? "…"}</p>
          </button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input key={`q-${term}`} className="w-60" aria-label="Search number or customer" placeholder="Search number or customer" defaultValue={term} onKeyDown={(e) => e.key === "Enter" && set("q", (e.target as HTMLInputElement).value)} />
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input key={`a-${agent}`} className="w-56 pl-9" aria-label="Search invoices by agent name" placeholder="Search by agent name" defaultValue={agent} onKeyDown={(e) => e.key === "Enter" && set("agent", (e.target as HTMLInputElement).value)} />
        </div>
        <div className="w-48">
          <Select aria-label="Filter invoices by month" value={month} onChange={(e) => set("month", e.target.value)}>
            <option value="">All months</option>
            {q.data?.months.map((m) => (
              <option key={m} value={m}>
                {monthName(m)}
              </option>
            ))}
          </Select>
        </div>
        {(term || agent || month || status) && (
          <Button size="sm" variant="ghost" onClick={() => setSp(new URLSearchParams())}>
            <X className="size-4" /> Clear
          </Button>
        )}
      </div>
      {q.isLoading ? (
        <Skeleton className="h-80" />
      ) : !q.data?.items.length ? (
        <Empty title="No invoices found" />
      ) : (
        <>
          <Table head={["Invoice", "Customer", "Agent", "Vehicle", "Chassis no.", "Port", "C&F", "Paid", "Status", "Date"]}>
            {q.data.items.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold whitespace-nowrap">
                  <Link to={`/crm/invoices/${r.id}`} className="text-brand-700 hover:underline">
                    {r.number}
                  </Link>
                </td>
                <td className="px-4 py-3">{r.consigneeName}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {r.requestedByKind === "fte" ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-violet-700">
                      <Bot className="size-4" /> {r.requestedByName}
                    </span>
                  ) : (
                    r.requestedByName
                  )}
                </td>
                <td className="px-4 py-3">
                  {r.firstVehicle}
                  {r.vehicleCount > 1 && <span className="ml-1 text-xs text-slate-500">+{r.vehicleCount - 1} more</span>}
                </td>
                <td className="px-4 py-3 text-xs whitespace-nowrap">{r.chassis ?? "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap">{r.port ?? "—"}</td>
                <td className="px-4 py-3 font-semibold whitespace-nowrap">{usd2(r.totalCnfUsd)}</td>
                <td className="px-4 py-3 whitespace-nowrap">{usd2(r.paid)}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.displayStatus} />
                </td>
                <td className="px-4 py-3 text-xs whitespace-nowrap">{date(r.createdAt)}</td>
              </tr>
            ))}
          </Table>
          <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(p) => set("page", String(p))} onPageSize={(n) => set("pageSize", String(n))} />
        </>
      )}
    </div>
  );
}
