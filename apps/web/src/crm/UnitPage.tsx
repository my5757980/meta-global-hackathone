import { useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, ChevronLeft, Download, FileText, Image as ImageIcon, Pencil, Star, Trash2, Upload } from "lucide-react";
import { api } from "../lib/api";
import { date, jpy, usd2 } from "../lib/format";
import { Badge, Button, Card, Empty, Field, Input, Modal, Skeleton, Table, clsx } from "../ui";

interface Unit {
  id: string;
  make: string;
  model: string;
  year: number | null;
  color: string | null;
  chassis: string | null;
  engineCc: number | null;
  drive: string | null;
  fuel: string | null;
  mileageKm: number | null;
  transmission: string | null;
  steering: string | null;
  doors: number | null;
  seats: number | null;
  location: string | null;
}
interface UnitFull {
  unit: Unit;
  addedBy: { name: string; kind: string } | null;
  invoice: { id: string; number: string; status: string; consignee: string };
  totals: { total: number; paid: number; balance: number };
  payments: { id: string; amountUsd: number; sellingPriceUsd: number | null; receivedDate: string; fxRate: number | null; yenAmount: number | null; receiptFileId: string | null; recordedByName: string | null }[];
  documents: { id: string; folder: string; fileId: string; name: string | null; mime: string; size: number; createdAt: string }[];
  cover: string | null;
  financials: { currency: string; lotNo: string | null; auctionName: string | null } | null;
  profit: { costJpy: number; costUsd: number | null; sellingUsd: number | null; profitUsd: number | null; note: string | null } | null;
  progress: { id: string; stage: string; stageDate: string; note: string | null }[];
  folders: string[];
  canManage: boolean;
  canCost: boolean;
}

const FIELDS: [keyof Unit, string, "text" | "number"][] = [
  ["make", "Make", "text"],
  ["model", "Model", "text"],
  ["year", "Year", "number"],
  ["color", "Colour", "text"],
  ["chassis", "Chassis", "text"],
  ["location", "Location (yard)", "text"],
  ["engineCc", "Engine cc", "number"],
  ["mileageKm", "Mileage (km)", "number"],
  ["doors", "Doors", "number"],
  ["seats", "Seats", "number"],
  ["drive", "Drive", "text"],
  ["fuel", "Fuel", "text"],
  ["transmission", "Transmission", "text"],
  ["steering", "Steering", "text"],
];

export default function UnitPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["unit", id], queryFn: () => api.get<UnitFull>(`/api/crm/units/${id}`) });
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["unit", id] });
  if (q.isLoading) return <Skeleton className="h-96" />;
  if (!q.data) return <Empty title="Unit not found" />;
  const d = q.data;
  const u = d.unit;
  return (
    <div>
      <Link to="/crm/units" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700">
        <ChevronLeft className="size-4" /> Units
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-4">
          <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
            {d.cover ? <img src={`/api/crm/files/${d.cover}`} alt="Cover" className="size-full object-cover" /> : <span className="flex size-full items-center justify-center text-slate-400"><ImageIcon className="size-6" /></span>}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">
              {u.year} {u.make} {u.model}
            </h1>
            <p className="text-sm text-slate-500">
              Chassis {u.chassis ?? "not set"} · <Link to={`/crm/invoices/${d.invoice.id}`} className="font-semibold text-brand-700">{d.invoice.number}</Link> · {d.invoice.consignee}
            </p>
            {d.addedBy && (
              <p className="mt-1 text-xs text-slate-500">
                Added by {d.addedBy.kind === "fte" ? <span className="inline-flex items-center gap-1 font-semibold text-violet-700"><Bot className="size-3.5" /> {d.addedBy.name}</span> : d.addedBy.name}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {d.canManage && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> Edit
            </Button>
          )}
          {d.canManage && d.documents.length > 0 && (
            <a href={`/api/crm/units/${u.id}/documents.zip`} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
              <Download className="size-4" /> Download all documents (ZIP)
            </a>
          )}
        </div>
      </div>
      {err && <p className="mb-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-4">
          <Card>
            <p className="mb-3 font-semibold text-slate-900">Vehicle</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {FIELDS.map(([k, label]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="truncate font-medium text-slate-900">{u[k] ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card>
            <p className="font-semibold text-slate-900">Payment summary</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Invoice total</dt><dd className="font-bold">{usd2(d.totals.total)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Total received</dt><dd className="font-semibold text-emerald-700">{usd2(d.totals.paid)}</dd></div>
              <div className="flex justify-between border-t border-slate-100 pt-2"><dt className="font-semibold text-slate-900">Balance</dt><dd className="font-bold">{usd2(d.totals.balance)}</dd></div>
            </dl>
          </Card>
          {d.canCost && <Card>
            <p className="font-semibold text-slate-900">Costing & profit</p>
            {d.profit ? (
              <dl className="mt-3 space-y-1 text-sm">
                {d.financials?.lotNo && <div className="flex justify-between"><dt className="text-slate-500">Lot · auction</dt><dd>{d.financials.lotNo} · {d.financials.auctionName}</dd></div>}
                {d.financials?.currency !== "USD" && <div className="flex justify-between"><dt className="text-slate-500">Cost of unit</dt><dd>{jpy(d.profit.costJpy)}</dd></div>}
                <div className="flex justify-between"><dt className="text-slate-500">Cost (USD)</dt><dd>{d.profit.costUsd != null ? usd2(d.profit.costUsd) : "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Selling price</dt><dd>{usd2(d.profit.sellingUsd)}</dd></div>
                <div className="flex justify-between border-t border-slate-200 pt-1 font-bold"><dt>Profit</dt><dd className={clsx(d.profit.profitUsd != null && d.profit.profitUsd < 0 ? "text-rose-600" : "text-emerald-700")}>{d.profit.profitUsd != null ? usd2(d.profit.profitUsd) : d.profit.note}</dd></div>
              </dl>
            ) : (
              <p className="mt-2 text-sm text-slate-500">No costing yet.</p>
            )}
            <Link to={`/crm/invoices/${d.invoice.id}`} className="mt-3 inline-block text-sm font-semibold text-brand-700">Edit on the invoice →</Link>
          </Card>}
          {d.progress.length > 0 && (
            <Card>
              <p className="mb-2 font-semibold text-slate-900">Shipping progress</p>
              <div className="flex flex-wrap gap-1.5">
                {d.progress.map((p, i) => <Badge key={p.id} tone={i === d.progress.length - 1 ? "blue" : "green"}>{p.stage} · {date(p.stageDate)}</Badge>)}
              </div>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <Card>
            <p className="font-semibold text-slate-900">Document repository</p>
            <p className="text-sm text-slate-500">Files by folder. PDF, JPG and PNG. The first picture is the cover until you choose another.</p>
            <div className="mt-3 space-y-2">
              {d.folders.map((folder) => {
                const files = d.documents.filter((x) => x.folder === folder);
                return (
                  <div key={folder} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">
                        {folder} <span className="font-normal text-slate-400">({files.length})</span>
                      </p>
                      {d.canManage && <UploadTo unitId={u.id} folder={folder} onDone={refresh} onError={setErr} />}
                    </div>
                    {files.length === 0 ? (
                      <p className="mt-1 text-xs text-slate-400">No files yet</p>
                    ) : (
                      <ul className="mt-2 space-y-1.5">
                        {files.map((f) => (
                          <li key={f.id} className="flex items-center gap-2 text-sm">
                            {f.mime.startsWith("image/") ? <img src={`/api/crm/files/${f.fileId}`} alt="" className="size-9 shrink-0 rounded-md object-cover ring-1 ring-slate-200" /> : <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500"><FileText className="size-4" /></span>}
                            <a href={`/api/crm/files/${f.fileId}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-slate-700 hover:text-brand-700">{f.name ?? "file"}</a>
                            {d.cover === f.fileId && <Badge tone="violet">Cover</Badge>}
                            {d.canManage && f.mime.startsWith("image/") && d.cover !== f.fileId && (
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={`Make ${f.name ?? "this file"} the cover`}
                                title="Make it the cover"
                                onClick={async () => {
                                  try {
                                    await api.put(`/api/crm/units/${u.id}/cover`, { fileId: f.fileId });
                                    refresh();
                                  } catch (ex) {
                                    setErr((ex as Error).message);
                                  }
                                }}
                              >
                                <Star className="size-4" />
                              </Button>
                            )}
                            {d.canManage && (
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={`Delete ${f.name ?? "this file"}`}
                                onClick={async () => {
                                  if (!window.confirm(`Delete ${f.name ?? "this file"}?`)) return;
                                  try {
                                    await api.del(`/api/crm/units/${u.id}/documents/${f.id}`);
                                    refresh();
                                  } catch (ex) {
                                    setErr((ex as Error).message);
                                  }
                                }}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
          {d.payments.length > 0 && (
            <div>
              <p className="mb-2 font-semibold text-slate-900">Payments on this invoice</p>
              <Table head={["Date", "Selling price", "Received", "Exchange rate", "Yen amount", "Recorded by", "Receipt"]}>
                {d.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2 whitespace-nowrap">{date(p.receivedDate)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{p.sellingPriceUsd != null ? usd2(p.sellingPriceUsd) : "—"}</td>
                    <td className="px-4 py-2 font-semibold whitespace-nowrap">{usd2(p.amountUsd)}</td>
                    <td className="px-4 py-2">{p.fxRate ?? "—"}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{p.yenAmount != null ? jpy(p.yenAmount) : "—"}</td>
                    <td className="px-4 py-2">{p.recordedByName ?? "—"}</td>
                    <td className="px-4 py-2">{p.receiptFileId ? <a className="font-semibold text-brand-700" href={`/api/crm/files/${p.receiptFileId}`} target="_blank" rel="noreferrer">Open</a> : "—"}</td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </div>
      </div>
      {editing && <EditUnit unit={u} onClose={() => setEditing(false)} onDone={refresh} />}
    </div>
  );
}

function UploadTo({ unitId, folder, onDone, onError }: { unitId: string; folder: string; onDone: () => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <label className={clsx("inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50", busy && "opacity-50")}>
      <Upload className="size-3.5" /> {busy ? "Uploading…" : "Upload"}
      <input
        type="file"
        multiple
        accept="image/*,application/pdf"
        className="hidden"
        aria-label={`Upload to ${folder}`}
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])];
          if (!files.length) return;
          setBusy(true);
          const fd = new FormData();
          fd.append("folder", folder);
          files.forEach((f) => fd.append("files", f));
          try {
            await api.post(`/api/crm/units/${unitId}/documents`, fd);
            onDone();
          } catch (ex) {
            onError((ex as Error).message);
          } finally {
            setBusy(false);
            e.target.value = "";
          }
        }}
      />
    </label>
  );
}

function EditUnit({ unit, onClose, onDone }: { unit: Unit; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<Record<string, string>>(Object.fromEntries(FIELDS.map(([k]) => [k, unit[k] != null ? String(unit[k]) : ""])));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`Edit ${unit.make} ${unit.model}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                const body = Object.fromEntries(FIELDS.map(([k, , kind]) => [k, kind === "number" ? (f[k] ? Number(f[k]) : null) : f[k] || null]));
                await api.patch(`/api/crm/units/${unit.id}`, { ...body, make: f.make, model: f.model });
                onDone();
                onClose();
              } catch (ex) {
                setErr((ex as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {FIELDS.map(([k, label, kind]) => (
          <Field key={k} label={label}>
            <Input type={kind} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </Field>
        ))}
      </div>
      {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
    </Modal>
  );
}
