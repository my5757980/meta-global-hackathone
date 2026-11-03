import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { PROGRESS_STAGES, UNIT_FOLDERS } from "@autofte/shared";
import { Check, ChevronLeft, ChevronRight, Download, FileText, Image as ImageIcon, Printer, Upload, X } from "lucide-react";
import { api } from "../lib/api";
import { date, usd2 } from "../lib/format";
import { useSite } from "../lib/site";
import { Badge, Button, Card, Empty, Skeleton, clsx } from "../ui";
import { AccountShell } from "./Account";
import { ORDER_TONE, STATUS, type CustomerInvoice } from "./AccountInvoices";

/** The car's pictures at full size, one at a time. */
function PhotoViewer({ urls, at, onClose }: { urls: string[]; at: number; onClose: () => void }) {
  const [i, setI] = useState(at);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" role="dialog" aria-label="Vehicle photos" onClick={onClose}>
      <img src={urls[i]} alt="" className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
      <button aria-label="Close" className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white" onClick={onClose}><X className="size-5" /></button>
      {urls.length > 1 && (
        <>
          <button aria-label="Previous" className="absolute top-1/2 left-3 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white" onClick={(e) => { e.stopPropagation(); setI((i - 1 + urls.length) % urls.length); }}><ChevronLeft className="size-6" /></button>
          <button aria-label="Next" className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white" onClick={(e) => { e.stopPropagation(); setI((i + 1) % urls.length); }}><ChevronRight className="size-6" /></button>
        </>
      )}
    </div>,
    document.body,
  );
}

/** Paying is done at the buyer's bank. The slip comes here, and the accounts desk reads it. */
function SendSlip({ inv }: { inv: CustomerInvoice }) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (send: () => Promise<{ message: string }>) => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ ok: true, text: (await send()).message });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const upload = (f: File) => {
    const form = new FormData();
    form.append("file", f);
    return run(async () => {
      const r = await fetch(`/api/account/invoices/${inv.id}/slip`, { method: "POST", body: form, credentials: "include" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not send the slip");
      return j;
    });
  };
  const sample = (part: "advance" | "balance") => run(() => api.post<{ message: string }>(`/api/account/invoices/${inv.id}/demo-slip`, { part }));
  const advanceDue = inv.totals.paid + 0.01 < inv.totals.advance;
  return (
    <Card>
      <p className="font-semibold text-slate-900">Paid? Send us the bank slip</p>
      <p className="mt-1 text-sm text-slate-600">Our accounts desk reads it and updates this page, usually within a minute.</p>
      <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label="Bank slip picture" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
      <Button className="mt-3 w-full" disabled={busy} onClick={() => file.current?.click()}>
        <Upload className="size-4" /> {busy ? "Sending…" : "Upload slip picture"}
      </Button>
      {inv.demoSlips && (
        <div className="mt-3 rounded-xl bg-amber-50 p-3">
          <p className="text-xs text-amber-900">Demo: there is no real bank, so these print a sample slip with this invoice's figures and send it.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {advanceDue && <Button variant="secondary" size="sm" disabled={busy} onClick={() => void sample("advance")}>Sample slip: advance {usd2(inv.totals.advance - inv.totals.paid)}</Button>}
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => void sample("balance")}>Sample slip: balance {usd2(inv.totals.balance)}</Button>
          </div>
        </div>
      )}
      {msg && <p role="status" className={clsx("mt-2 text-sm", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
    </Card>
  );
}

export default function AccountInvoice() {
  const { id } = useParams();
  const site = useSite();
  const [viewer, setViewer] = useState<{ urls: string[]; at: number } | null>(null);
  const q = useQuery({ queryKey: ["my-invoice", id], queryFn: () => api.get<CustomerInvoice>(`/api/account/invoices/${id}`), refetchInterval: 8000 });
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
                {inv.salesperson && <p className="text-sm text-slate-600">Sales person: {inv.salesperson}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {inv.status !== "awaiting_approval" && <Badge tone={ORDER_TONE[inv.orderState] ?? "gray"}>{inv.orderState}</Badge>}
                <Badge tone={STATUS[inv.status]?.tone ?? "gray"}>{STATUS[inv.status]?.label ?? inv.status}</Badge>
                {inv.status === "approved" || inv.status === "sent" ? (
                  <a href={`/api/account/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
                    <Download className="size-4" /> Invoice PDF
                  </a>
                ) : null}
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
                  <dl className="grid grid-cols-3 gap-3 text-right text-sm">
                    <div><dt className="text-xs text-slate-500">C&F</dt><dd className="font-bold text-slate-900">{usd2(v.cnfUsd)}</dd></div>
                    <div><dt className="text-xs text-slate-500">Paid</dt><dd className="font-semibold text-emerald-700">{usd2(v.paidUsd)}</dd></div>
                    <div><dt className="text-xs text-slate-500">Remaining</dt><dd className="font-semibold text-slate-900">{usd2(v.remainingUsd)}</dd></div>
                  </dl>
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
                {v.documents.some((d) => d.mime.startsWith("image/")) && (
                  <>
                    <p className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Vehicle photos</p>
                    <div className="flex flex-wrap gap-2">
                      {v.documents.filter((d) => d.mime.startsWith("image/")).map((d, i, all) => (
                        <button key={d.id} aria-label={`Open picture ${i + 1}`} onClick={() => setViewer({ urls: all.map((x) => `/api/account/files/${x.fileId}`), at: i })}>
                          <img src={`/api/account/files/${d.fileId}`} alt="" loading="lazy" className="h-16 w-24 rounded-lg object-cover ring-1 ring-slate-200" />
                        </button>
                      ))}
                    </div>
                  </>
                )}
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
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment history</p>
                <table className="mt-2 w-full text-sm">
                  <thead className="text-left text-xs text-slate-500">
                    <tr><th className="py-1 font-medium">Date</th><th className="py-1 text-right font-medium">Amount</th><th className="py-1 text-right font-medium">Balance after</th></tr>
                  </thead>
                  <tbody>
                    {inv.payments.map((p, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="py-1 text-slate-600">{date(p.date)}</td>
                        <td className="py-1 text-right font-semibold">{usd2(p.amountUsd)}</td>
                        <td className="py-1 text-right">{usd2(p.balanceAfter)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
          {inv.totals.balance > 0 && inv.status !== "awaiting_approval" && <SendSlip inv={inv} />}
          {inv.timeline.length > 0 && (
            <Card>
              <p className="font-semibold text-slate-900">Order notes</p>
              <ol className="mt-3 space-y-2 border-l-2 border-slate-100 pl-3">
                {inv.timeline.map((n, i) => (
                  <li key={i} className="text-sm">
                    <p className="text-slate-800">{n.text}</p>
                    <p className="text-[11px] text-slate-400">{date(n.at)}</p>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>
      </div>
      {viewer && <PhotoViewer urls={viewer.urls} at={viewer.at} onClose={() => setViewer(null)} />}
    </AccountShell>
  );
}
