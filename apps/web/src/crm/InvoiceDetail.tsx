import { useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, ChevronLeft, MessageSquare, Printer, ShieldCheck, X } from "lucide-react";
import { api } from "../lib/api";
import { dateTime, date, usd2 } from "../lib/format";
import { Badge, Button, Card, Empty, Field, Modal, Skeleton, StatusBadge, Textarea } from "../ui";
import { InvoiceOps } from "./InvoiceOps";
import { FteName, useFte } from "../lib/site";

interface Full {
  invoice: { id: string; number: string; status: string; consigneeName: string; consigneePhone: string; consigneeEmail: string | null; consigneeAddress: string | null; totalCnfUsd: number; totalPushUsd: number; advancePercent: number; rejectionNote: string | null; createdAt: string; approvedAt: string | null; m3Rate: number | null; exchangeRate: number | null; salesperson: string | null };
  lead: { id: string; customerName: string; contactPerson: string; phone: string; email: string | null; status: string } | null;
  vehicles: { id: string; unitLabel: string; year: number; color: string; chassisNo: string; engine: string; transmission: string; fuel: string; pushUsd: number; cnfUsd: number }[];
  payments: { id: string; amountUsd: number; receivedDate: string }[];
  port: { name: string } | null;
  country: { name: string } | null;
  requestedBy: { name: string; kind: string } | null;
  approvedBy: { name: string } | null;
  totals: { total: number; advance: number; paid: number; balance: number };
  audit: { id: string; action: string; summary: string; createdAt: string; actor: string | null; actorKind: string }[];
  conversation: { id: string; summary: string | null; holder: string } | null;
  fteTrail: { id: string; action: string; summary: string; createdAt: string }[];
  quote: { lines: { label: string; usd: number }[] } | null;
  canApprove: boolean;
}

export default function InvoiceDetail() {
  const fte = useFte();
  const { id } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["invoice", id], queryFn: () => api.get<Full>(`/api/crm/invoices/${id}`) });
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const act = async (what: "approve" | "reject" | "sent") => {
    setBusy(what);
    setErr(null);
    try {
      await api.post(`/api/crm/invoices/${id}/${what}`, what === "reject" ? { note } : {});
      setRejecting(false);
      await qc.invalidateQueries();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  if (q.isLoading) return <Skeleton className="h-96" />;
  if (!q.data) return <Empty title="Invoice not found" />;
  const d = q.data;
  const inv = d.invoice;
  const bySora = d.requestedBy?.kind === "fte";
  return (
    <div>
      <Link to="/crm/invoices" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700">
        <ChevronLeft className="size-4" /> Invoices
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold text-slate-900">
            Invoice {inv.number} <StatusBadge status={inv.status} />
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Requested {dateTime(inv.createdAt)} by{" "}
            {bySora ? (
              <span className="inline-flex items-center gap-1 font-semibold text-violet-700">
                <Bot className="size-4" /> <FteName /> (Digital FTE)
              </span>
            ) : (
              <span className="font-semibold text-slate-700">{d.requestedBy?.name}</span>
            )}
            {d.approvedBy && ` · ${inv.status === "rejected" ? "declined" : "approved"} by ${d.approvedBy.name}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </Button>
          {d.canApprove && inv.status === "pending" && (
            <>
              <Button variant="danger" onClick={() => setRejecting(true)}>
                <X className="size-4" /> Reject
              </Button>
              <Button variant="success" loading={busy === "approve"} onClick={() => void act("approve")}>
                <Check className="size-4" /> Approve invoice
              </Button>
            </>
          )}
          {d.canApprove && inv.status === "approved" && (
            <Button loading={busy === "sent"} onClick={() => void act("sent")}>
              Mark as sent
            </Button>
          )}
        </div>
      </div>
      {err && <p className="mb-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}
      {inv.status === "pending" && bySora && (
        <Card className="mb-4 border-violet-200 bg-violet-50/60">
          <p className="flex items-center gap-2 font-semibold text-violet-900">
            <ShieldCheck className="size-5" /> <FteName /> is asking for your approval
          </p>
          <p className="mt-1 text-sm text-violet-900/80"><FteName /> negotiated and quoted inside its authority envelope. It cannot issue invoices itself — approve or reject, and <FteName /> will tell the buyer instantly.</p>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Card>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Consignee</p>
                <p className="mt-1 font-semibold text-slate-900">{inv.consigneeName}</p>
                <p className="text-sm text-slate-600">{inv.consigneePhone}</p>
                {inv.consigneeEmail && <p className="text-sm text-slate-600">{inv.consigneeEmail}</p>}
                {inv.consigneeAddress && <p className="text-sm text-slate-600">{inv.consigneeAddress}</p>}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Destination</p>
                <p className="mt-1 font-semibold text-slate-900">{d.port?.name ?? "—"}</p>
                <p className="text-sm text-slate-600">{d.country?.name}</p>
                {d.lead && (
                  <Link to={`/crm/leads/${d.lead.id}`} className="mt-2 inline-block text-sm font-semibold text-brand-700">
                    Lead: {d.lead.customerName} →
                  </Link>
                )}
              </div>
            </div>
          </Card>
          <Card padded={false}>
            <p className="px-5 pt-5 font-semibold text-slate-900">Vehicles</p>
            <div className="scrollbar-thin overflow-x-auto">
              <table className="mt-3 w-full min-w-[560px] text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-2">Vehicle</th>
                    <th className="px-3 py-2">Chassis</th>
                    <th className="px-3 py-2 text-right">FOB (push)</th>
                    <th className="px-5 py-2 text-right">C&F</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {d.vehicles.map((v) => (
                    <tr key={v.id}>
                      <td className="px-5 py-3">
                        <p className="font-semibold text-slate-900">
                          {v.year} {v.unitLabel}
                        </p>
                        <p className="text-xs text-slate-500">
                          {v.color} · {v.engine} · {v.transmission} · {v.fuel}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-xs">{v.chassisNo}</td>
                      <td className="px-3 py-3 text-right">{usd2(v.pushUsd)}</td>
                      <td className="px-5 py-3 text-right font-semibold">{usd2(v.cnfUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap justify-end gap-6 border-t border-slate-100 px-5 py-4 text-sm">
              <span>
                Total C&F <strong className="ml-1 text-slate-900">{usd2(d.totals.total)}</strong>
              </span>
              <span>
                Advance {inv.advancePercent}% <strong className="ml-1">{usd2(d.totals.advance)}</strong>
              </span>
              <span>
                Paid <strong className="ml-1 text-emerald-700">{usd2(d.totals.paid)}</strong>
              </span>
              <span>
                Balance <strong className="ml-1">{usd2(d.totals.balance)}</strong>
              </span>
            </div>
          </Card>
          {d.quote && (
            <Card>
              <p className="font-semibold text-slate-900">Quote the buyer accepted</p>
              <div className="mt-3 space-y-1 text-sm">
                {d.quote.lines.map((l) => (
                  <div key={l.label} className="flex justify-between gap-3">
                    <span className="text-slate-600">{l.label}</span>
                    <span className="font-medium">{usd2(l.usd)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-400">Computed by the company price policy (not by the model).</p>
            </Card>
          )}
          <InvoiceOps invoiceId={inv.id} status={inv.status} vehicles={d.vehicles} balance={d.totals.balance} />
          {inv.rejectionNote && (
            <Card className="border-rose-200 bg-rose-50">
              <p className="text-sm font-semibold text-rose-800">Internal rejection note</p>
              <p className="text-sm text-rose-700">{inv.rejectionNote}</p>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          {d.conversation && (
            <Card className="border-violet-200">
              <p className="flex items-center gap-2 font-semibold text-slate-900">
                <MessageSquare className="size-4 text-violet-600" /> Conversation with the buyer
              </p>
              {d.conversation.summary && <p className="mt-2 text-sm text-slate-700">{d.conversation.summary}</p>}
              <Link to={`/desk?c=${d.conversation.id}`} className="mt-3 inline-block text-sm font-semibold text-brand-700">
                Open in chat desk →
              </Link>
            </Card>
          )}
          {d.fteTrail.length > 0 && (
            <Card>
              <p className="flex items-center gap-2 font-semibold text-slate-900">
                <Bot className="size-4 text-violet-600" /> <FteName />'s audit trail
              </p>
              <ol className="mt-3 space-y-2 border-l-2 border-violet-100 pl-4">
                {d.fteTrail.map((a) => (
                  <li key={a.id} className="text-sm">
                    <p className="text-slate-800">{a.summary}</p>
                    <p className="text-[11px] text-slate-400">
                      {a.action} · {dateTime(a.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            </Card>
          )}
          <Card>
            <p className="font-semibold text-slate-900">History</p>
            {!d.audit.length && <p className="mt-2 text-sm text-slate-500">Nothing recorded since the request.</p>}
            <ol className="mt-3 space-y-2">
              {d.audit.map((a) => (
                <li key={a.id} className="text-sm">
                  <p className="text-slate-800">{a.summary}</p>
                  <p className="text-[11px] text-slate-400">
                    {a.actorKind === "fte" ? fte : a.actor} · {dateTime(a.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
          {d.payments.length > 0 && (
            <Card>
              <p className="font-semibold text-slate-900">Payments</p>
              <ul className="mt-2 space-y-1 text-sm">
                {d.payments.map((p) => (
                  <li key={p.id} className="flex justify-between">
                    <span>{date(p.receivedDate)}</span>
                    <Badge tone="green">{usd2(p.amountUsd)}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
      <Modal
        open={rejecting}
        onClose={() => setRejecting(false)}
        title={`Reject invoice ${inv.number}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy === "reject"} onClick={() => void act("reject")}>
              Reject
            </Button>
          </>
        }
      >
        <Field label="Internal note (the buyer will not see it)" hint={`${fte} will tell the buyer politely and propose a next step.`}>
          <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Price too low for this grade — offer HK-10002 instead" />
        </Field>
      </Modal>
    </div>
  );
}
