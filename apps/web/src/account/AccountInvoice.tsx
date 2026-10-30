import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { PROGRESS_STAGES, UNIT_FOLDERS } from "@autofte/shared";
import { Check, ChevronLeft, Download, FileText, Image as ImageIcon, Printer } from "lucide-react";
import { api } from "../lib/api";
import { date, usd2 } from "../lib/format";
import { useSite } from "../lib/site";
import { Badge, Button, Card, Empty, Skeleton, clsx } from "../ui";
import { AccountShell } from "./Account";
import { STATUS, type CustomerInvoice } from "./AccountInvoices";

export default function AccountInvoice() {
  const { id } = useParams();
  const site = useSite();
  const q = useQuery({ queryKey: ["my-invoice", id], queryFn: () => api.get<CustomerInvoice>(`/api/account/invoices/${id}`) });
  if (q.isLoading) return <AccountShell title="Invoice"><Skeleton className="h-64" /></AccountShell>;
  if (!q.data) return <AccountShell title="Invoice"><Empty title="Invoice not found" /></AccountShell>;
  const inv = q.data;
  return (
    <AccountShell
      title={`Invoice ${inv.number}`}
      back={
        <Link to="/account/invoices" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700">
          <ChevronLeft className="size-4" /> My invoices
        </Link>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">Consignee</p>
                <p className="font-semibold text-slate-900">{inv.consigneeName}</p>
                {inv.port && <p className="text-sm text-slate-600">Port of discharge: {inv.port}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={STATUS[inv.status]?.tone ?? "gray"}>{STATUS[inv.status]?.label ?? inv.status}</Badge>
                <Button variant="secondary" size="sm" onClick={() => window.print()}>
                  <Printer className="size-4" /> Print
                </Button>
              </div>
            </div>
          </Card>
          {inv.vehicles.map((v) => {
            const reached = new Set(v.progress.map((p) => p.stage));
            const current = v.progress.at(-1)?.stage;
            return (
              <Card key={v.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{v.label}</p>
                    <p className="text-xs text-slate-500">
                      Chassis {v.chassisNo} · {v.color} · {v.transmission}
                    </p>
                  </div>
                  <p className="text-right">
                    <span className="block text-xs text-slate-500">C&F</span>
                    <span className="font-bold text-slate-900">{usd2(v.cnfUsd)}</span>
                  </p>
                </div>
                <p className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Shipping progress</p>
                <ol className="relative space-y-3 border-l-2 border-slate-200 pl-5">
                  {PROGRESS_STAGES.slice(1).map((st) => {
                    const done = reached.has(st);
                    const p = v.progress.find((x) => x.stage === st);
                    return (
                      <li key={st} className="relative">
                        <span className={clsx("absolute top-0.5 -left-[1.72rem] flex size-5 items-center justify-center rounded-full ring-4 ring-white", done ? (st === current ? "bg-brand-600" : "bg-emerald-500") : "bg-slate-200")}>{done && <Check className="size-3 text-white" />}</span>
                        <p className={clsx("text-sm", done ? "font-semibold text-slate-900" : "text-slate-400")}>{st}</p>
                        {p && (
                          <p className="text-xs text-slate-500">
                            {date(p.date)}
                            {p.note ? ` · ${p.note}` : ""}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ol>
                <p className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Documents & photos</p>
                {v.documents.length ? (
                  <div className="space-y-3">
                    {UNIT_FOLDERS.filter((f) => v.documents.some((d) => d.folder === f)).map((folder) => (
                      <div key={folder}>
                        <p className="text-xs font-semibold text-slate-700">{folder}</p>
                        <div className="mt-1 grid gap-2 sm:grid-cols-2">
                          {v.documents
                            .filter((d) => d.folder === folder)
                            .map((d) => (
                              <a key={d.id} href={`/api/account/files/${d.fileId}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                                {d.mime.startsWith("image/") ? <ImageIcon className="size-4 text-brand-600" /> : <FileText className="size-4 text-brand-600" />}
                                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                                <Download className="size-4 text-slate-400" />
                              </a>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Documents appear here as soon as our team uploads them.</p>
                )}
              </Card>
            );
          })}
        </div>
        <div className="space-y-4">
          <Card>
            <p className="font-semibold text-slate-900">Payment summary</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Total C&F</dt><dd className="font-bold">{usd2(inv.totals.total)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Advance ({inv.advancePercent}%)</dt><dd>{usd2(inv.totals.advance)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Paid</dt><dd className="font-semibold text-emerald-700">{usd2(inv.totals.paid)}</dd></div>
              <div className="flex justify-between border-t border-slate-100 pt-2"><dt className="font-semibold text-slate-900">Balance</dt><dd className="font-bold">{usd2(inv.totals.balance)}</dd></div>
            </dl>
            {inv.payments.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payments received</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {inv.payments.map((p, i) => (
                    <li key={i} className="flex justify-between">
                      <span className="text-slate-600">{date(p.date)}</span>
                      <span className="font-semibold">{usd2(p.amountUsd)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
          {site && inv.totals.balance > 0 && inv.status !== "awaiting_approval" && (
            <Card className="border-brand-200 bg-brand-50/50">
              <p className="font-semibold text-slate-900">Pay by bank transfer</p>
              <p className="mt-2 text-sm text-slate-700">
                {site.bank.bankName}, {site.bank.branch}
                <br />
                SWIFT {site.bank.swift}
                <br />
                {site.bank.accountName} · {site.bank.accountNo}
              </p>
              <p className="mt-2 text-xs text-slate-500">Reference: {inv.number}. We never ask you to pay a personal account.</p>
            </Card>
          )}
        </div>
      </div>
    </AccountShell>
  );
}
