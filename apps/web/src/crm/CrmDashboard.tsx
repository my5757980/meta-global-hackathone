import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { LEAD_STATUS_LABELS } from "@autofte/shared";
import { Bot, FileText, Handshake, Hourglass, Users } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ago, usd } from "../lib/format";
import { Card, PageHeader, Skeleton, Stat, StatusBadge } from "../ui";
import { FteName, useFte } from "../lib/site";

interface Summary {
  leads: { status: keyof typeof LEAD_STATUS_LABELS; n: number }[];
  invoices: { status: string; n: number; total: number }[];
  recent: { id: string; number: string; status: string; total: number; consignee: string; createdAt: string; requestedBy: string; requestedKind: string }[];
  customers: number;
}

export default function CrmDashboard() {
  const fte = useFte();
  const { me } = useAuth();
  const q = useQuery({ queryKey: ["crm-summary"], queryFn: () => api.get<Summary>("/api/crm/summary") });
  const d = q.data;
  const leadTotal = d?.leads.reduce((a, l) => a + l.n, 0) ?? 0;
  const inv = (s: string) => d?.invoices.find((i) => i.status === s);
  return (
    <div>
      <PageHeader title={`Good day, ${me?.name.split(" ")[0]}`} subtitle={<>Your sales pipeline at a glance — <FteName />'s work included.</>} />
      {q.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <Link to="/crm/leads" className="block rounded-2xl hover:opacity-90">
              <Stat label="Leads" value={leadTotal.toLocaleString("en-US")} icon={<Users className="size-5" />} />
            </Link>
            <Link to="/crm/leads?customers=1" className="block rounded-2xl hover:opacity-90">
              <Stat label="Customers" value={(d?.customers ?? 0).toLocaleString("en-US")} hint="with an approved invoice" icon={<Handshake className="size-5" />} />
            </Link>
            <Stat label="Waiting for approval" value={inv("pending")?.n ?? 0} hint={usd(inv("pending")?.total ?? 0) + " C&F"} icon={<Hourglass className="size-5" />} />
            <Stat label="Approved / sent" value={(inv("approved")?.n ?? 0) + (inv("sent")?.n ?? 0)} hint={usd((inv("approved")?.total ?? 0) + (inv("sent")?.total ?? 0)) + " C&F"} icon={<FileText className="size-5" />} />
            <Stat label={`${fte}'s invoice requests`} value={d?.recent.filter((r) => r.requestedKind === "fte").length ?? 0} hint="in the latest 8" icon={<Bot className="size-5" />} />
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
            <Card>
              <p className="mb-3 font-semibold text-slate-900">Leads by status</p>
              <div className="space-y-2">
                {d?.leads.map((l) => (
                  <Link key={l.status} to={`/crm/leads?status=${l.status}`} className="flex items-center gap-3">
                    <span className="w-36 shrink-0 text-sm text-slate-600">{LEAD_STATUS_LABELS[l.status] ?? l.status}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full rounded-full bg-brand-500" style={{ width: `${Math.max(3, (l.n / Math.max(1, leadTotal)) * 100)}%` }} />
                    </span>
                    <span className="w-10 text-right text-sm font-semibold text-slate-900">{l.n}</span>
                  </Link>
                ))}
              </div>
            </Card>
            <Card padded={false}>
              <div className="flex items-center justify-between px-5 pt-5">
                <p className="font-semibold text-slate-900">Latest invoices</p>
                <Link to="/crm/invoices" className="text-sm font-semibold text-brand-700">
                  All →
                </Link>
              </div>
              <ul className="mt-2 divide-y divide-slate-100">
                {d?.recent.map((r) => (
                  <li key={r.id}>
                    <Link to={`/crm/invoices/${r.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {r.number} · {r.consignee}
                        </p>
                        <p className="text-xs text-slate-500">
                          {r.requestedKind === "fte" ? `🤖 ${fte}` : r.requestedBy} · {ago(r.createdAt)}
                        </p>
                      </div>
                      <span className="text-sm font-semibold">{usd(r.total)}</span>
                      <StatusBadge status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
