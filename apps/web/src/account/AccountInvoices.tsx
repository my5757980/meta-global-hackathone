import { Link, Navigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText, Ship } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { date, usd2 } from "../lib/format";
import { Badge, Card, Empty, Skeleton } from "../ui";
import { AccountShell } from "./Account";

export interface CustomerInvoice {
  id: string;
  number: string;
  status: string;
  createdAt: string;
  approvedAt: string | null;
  consigneeName: string;
  port: string | null;
  advancePercent: number;
  totals: { total: number; advance: number; paid: number; balance: number };
  payments: { date: string; amountUsd: number }[];
  vehicles: { id: string; label: string; color: string; chassisNo: string; transmission: string | null; fuel: string | null; cnfUsd: number; progress: { stage: string; date: string; note: string | null }[]; documents: { id: string; folder: string; fileId: string; name: string; mime: string; size: number }[] }[];
}

export const STATUS: Record<string, { label: string; tone: "amber" | "green" | "blue" | "gray" }> = {
  awaiting_approval: { label: "Waiting for approval", tone: "amber" },
  approved: { label: "Approved — pay advance", tone: "green" },
  sent: { label: "Confirmed", tone: "blue" },
};

export default function AccountInvoices() {
  const { me, loading } = useAuth();
  const q = useQuery({ queryKey: ["my-invoices"], queryFn: () => api.get<CustomerInvoice[]>("/api/account/invoices"), enabled: !!me });
  if (!loading && !me) return <Navigate to="/login" replace />;
  return (
    <AccountShell title="My invoices">
      {q.isLoading ? (
        <Skeleton className="h-40" />
      ) : !q.data?.length ? (
        <Empty icon={<FileText className="size-8" />} title="No invoices yet" text="When our supervisor approves an invoice for you, it appears here with payments, documents and shipping progress." />
      ) : (
        <div className="space-y-3">
          {q.data.map((inv) => {
            const last = inv.vehicles[0]?.progress.at(-1);
            return (
              <Link key={inv.id} to={`/account/invoices/${inv.id}`} className="block">
                <Card className="transition hover:shadow-md">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-bold text-slate-900">
                        <FileText className="size-4 text-brand-600" /> Invoice {inv.number}
                      </p>
                      <p className="mt-1 truncate text-sm text-slate-600">
                        {inv.vehicles.map((v) => v.label).join(", ")} {inv.port ? `→ ${inv.port}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">Issued {date(inv.approvedAt ?? inv.createdAt)}</p>
                    </div>
                    <Badge tone={STATUS[inv.status]?.tone ?? "gray"}>{STATUS[inv.status]?.label ?? inv.status}</Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-slate-500">Total C&F</p>
                      <p className="font-bold text-slate-900">{usd2(inv.totals.total)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Paid</p>
                      <p className="font-semibold text-emerald-700">{usd2(inv.totals.paid)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Balance</p>
                      <p className="font-semibold text-slate-900">{usd2(inv.totals.balance)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Shipping</p>
                      <p className="flex items-center gap-1 font-semibold text-brand-700">
                        <Ship className="size-3.5" /> {last?.stage ?? "Not started"}
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </AccountShell>
  );
}
