import { Link, useSearchParams } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Bot } from "lucide-react";
import { api, qs } from "../lib/api";
import { date, usd2 } from "../lib/format";
import { Empty, Input, PageHeader, Pagination, Skeleton, StatusBadge, Table, Tabs } from "../ui";
import { FteName } from "../lib/site";

interface Row {
  id: string;
  number: string;
  status: string;
  consigneeName: string;
  totalCnfUsd: number;
  createdAt: string;
  requestedByName: string;
  requestedByKind: string;
  port: string;
  vehicleCount: number;
  firstVehicle: string;
  paid: number;
}

export default function Invoices() {
  const [sp, setSp] = useSearchParams();
  const status = sp.get("status") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const q = useQuery({ queryKey: ["invoices", status, page, sp.get("q")], queryFn: () => api.get<{ items: Row[]; total: number; page: number; pageSize: number }>(`/api/crm/invoices${qs({ status, page, q: sp.get("q") })}`), placeholderData: keepPreviousData });
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v);
    else n.delete(k);
    if (k !== "page") n.delete("page");
    setSp(n);
  };
  return (
    <div>
      <PageHeader title="Invoices" subtitle={<>Requested by agents and by <FteName /> · approved by the Supervisor</>} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={status}
          onChange={(v) => set("status", v)}
          items={[
            { value: "", label: "All" },
            { value: "pending", label: "Waiting approval" },
            { value: "approved", label: "Approved" },
            { value: "sent", label: "Sent" },
            { value: "rejected", label: "Rejected" },
          ]}
        />
        <Input className="w-60" placeholder="Search number or consignee" defaultValue={sp.get("q") ?? ""} onKeyDown={(e) => e.key === "Enter" && set("q", (e.target as HTMLInputElement).value)} />
      </div>
      {q.isLoading ? (
        <Skeleton className="h-80" />
      ) : !q.data?.items.length ? (
        <Empty title="No invoices here" />
      ) : (
        <>
          <Table head={["Invoice", "Consignee", "Vehicle", "Port", "C&F", "Paid", "Requested by", "Status"]}>
            {q.data.items.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold whitespace-nowrap">
                  <Link to={`/crm/invoices/${r.id}`} className="text-brand-700 hover:underline">
                    {r.number}
                  </Link>
                  <p className="text-xs font-normal text-slate-500">{date(r.createdAt)}</p>
                </td>
                <td className="px-4 py-3">{r.consigneeName}</td>
                <td className="px-4 py-3">
                  {r.firstVehicle}
                  {r.vehicleCount > 1 && <span className="ml-1 text-xs text-slate-500">+{r.vehicleCount - 1} more</span>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{r.port ?? "—"}</td>
                <td className="px-4 py-3 font-semibold whitespace-nowrap">{usd2(r.totalCnfUsd)}</td>
                <td className="px-4 py-3 whitespace-nowrap">{usd2(r.paid)}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {r.requestedByKind === "fte" ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-violet-700">
                      <Bot className="size-4" /> <FteName />
                    </span>
                  ) : (
                    r.requestedByName
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} />
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
