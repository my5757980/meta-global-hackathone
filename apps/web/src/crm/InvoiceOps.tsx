import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Calculator, Download, FileText, Image as ImageIcon, Plus, Ship, Upload, Wallet } from "lucide-react";
import { api } from "../lib/api";
import { date, jpy, usd2 } from "../lib/format";
import { Badge, Button, Card, Field, Input, Modal, Select, Textarea, clsx } from "../ui";

interface Vehicle {
  id: string;
  unitLabel: string;
  year: number | null;
  color: string | null;
  chassisNo: string | null;
  engine: string | null;
  transmission: string | null;
  fuel: string | null;
  cnfUsd: number;
}
interface UnitsData {
  units: { unit: { id: string; invoiceVehicleId: string; make: string; model: string; year: number; chassis: string; color: string; location: string }; documents: { id: string; folder: string; fileId: string; name: string; mime: string; size: number }[]; financials: Record<string, number | string | null> | null; profit: { costJpy: number; costUsd: number | null; sellingUsd: number | null; profitUsd: number | null; note: string | null } | null }[];
  progress: { id: string; invoiceVehicleId: string; stage: string; stageDate: string; note: string | null }[];
  canManage: boolean;
  canProgress: boolean;
  canPay: boolean;
  folders: string[];
  stages: string[];
}

const COST_FIELDS: [string, string][] = [
  ["buyingJpy", "Buying"],
  ["auctionFeeJpy", "Auction fee"],
  ["domesticJpy", "Domestic transport"],
  ["storageJpy", "Storage"],
  ["inspectJpy", "Inspection"],
  ["repairsJpy", "Repairs"],
  ["partsJpy", "Parts"],
  ["miscJpy", "Misc"],
  ["agencyFeeJpy", "Agency fee"],
  ["freightJpy", "Freight"],
  ["vanningJpy", "CC / vanning"],
  ["docJpy", "Documents"],
  ["dhlJpy", "DHL"],
];

export function InvoiceOps({ invoiceId, status, vehicles, balance }: { invoiceId: string; status: string; vehicles: Vehicle[]; balance: number }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["invoice-units", invoiceId], queryFn: () => api.get<UnitsData>(`/api/crm/invoices/${invoiceId}/units`) });
  const [pay, setPay] = useState(false);
  const [unitFor, setUnitFor] = useState<Vehicle | null>(null);
  const [progressFor, setProgressFor] = useState<Vehicle | null>(null);
  const [costFor, setCostFor] = useState<UnitsData["units"][number] | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["invoice-units", invoiceId] });
    void qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
  };
  const d = q.data;
  const approved = status === "approved" || status === "sent";
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-slate-900">Documents</p>
          <div className="flex flex-wrap gap-2">
            <a href={`/api/crm/invoices/${invoiceId}/pdf`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
              <FileText className="size-4" /> Invoice PDF
            </a>
            <a href={`/api/crm/invoices/${invoiceId}/xlsx`} className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
              <Download className="size-4" /> Excel
            </a>
            {d && d.units.some((u) => u.documents.length) && (
              <a href={`/api/crm/invoices/${invoiceId}/documents.zip`} className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
                <Download className="size-4" /> All files (ZIP)
              </a>
            )}
            {approved && d?.canPay && balance > 0 && (
              <Button size="sm" variant="success" onClick={() => setPay(true)}>
                <Wallet className="size-4" /> Record payment
              </Button>
            )}
          </div>
        </div>
      </Card>
      {approved &&
        vehicles.map((v, idx) => {
          const u = d?.units.find((x) => x.unit.invoiceVehicleId === v.id);
          const prog = d?.progress.filter((p) => p.invoiceVehicleId === v.id) ?? [];
          return (
            <Card key={v.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">
                    {v.year} {v.unitLabel}
                  </p>
                  <p className="text-xs text-slate-500">
                    {v.chassisNo} · {v.color}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {d?.canProgress && (
                    <Button size="sm" variant="secondary" onClick={() => setProgressFor(v)}>
                      <Ship className="size-4" /> Update progress
                    </Button>
                  )}
                  {!u && d?.canManage && (
                    <Button size="sm" onClick={() => setUnitFor(v)}>
                      <Plus className="size-4" /> Add unit ({idx + 1} of {vehicles.length})
                    </Button>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {prog.length ? prog.map((p) => <Badge key={p.id} tone={p === prog.at(-1) ? "blue" : "green"}>{p.stage} · {date(p.stageDate)}</Badge>) : <span className="text-xs text-slate-500">No progress recorded yet.</span>}
              </div>
              {u && (
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Files by folder</p>
                    <div className="space-y-2">
                      {d!.folders.map((folder) => {
                        const files = u.documents.filter((x) => x.folder === folder);
                        return (
                          <div key={folder} className="rounded-xl border border-slate-200 p-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-slate-700">
                                {folder} <span className="font-normal text-slate-400">({files.length})</span>
                              </p>
                              {d!.canManage && <UploadButton unitId={u.unit.id} folder={folder} onDone={refresh} />}
                            </div>
                            {files.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                {files.map((f) => (
                                  <a key={f.id} href={`/api/crm/files/${f.fileId}`} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-700 ring-1 ring-slate-200 hover:bg-white">
                                    {f.mime.startsWith("image/") ? <ImageIcon className="size-3.5" /> : <FileText className="size-3.5" />}
                                    <span className="truncate">{f.name}</span>
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Costing & profit</p>
                      {d!.canManage && (
                        <Button size="sm" variant="ghost" onClick={() => setCostFor(u)}>
                          <Calculator className="size-4" /> Edit
                        </Button>
                      )}
                    </div>
                    {u.profit ? (
                      <dl className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
                        <div className="flex justify-between"><dt className="text-slate-500">Cost of unit</dt><dd>{jpy(u.profit.costJpy)}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Cost (USD)</dt><dd>{u.profit.costUsd != null ? usd2(u.profit.costUsd) : "—"}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Selling price</dt><dd>{usd2(u.profit.sellingUsd)}</dd></div>
                        <div className="flex justify-between border-t border-slate-200 pt-1 font-bold"><dt>Profit</dt><dd className={clsx(u.profit.profitUsd != null && u.profit.profitUsd < 0 ? "text-rose-600" : "text-emerald-700")}>{u.profit.profitUsd != null ? usd2(u.profit.profitUsd) : u.profit.note}</dd></div>
                      </dl>
                    ) : (
                      <p className="text-sm text-slate-500">No costing yet.</p>
                    )}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      <PaymentModal open={pay} onClose={() => setPay(false)} invoiceId={invoiceId} balance={balance} onDone={refresh} />
      {unitFor && <UnitModal v={unitFor} invoiceId={invoiceId} onClose={() => setUnitFor(null)} onDone={refresh} />}
      {progressFor && d && <ProgressModal v={progressFor} stages={d.stages} onClose={() => setProgressFor(null)} onDone={refresh} />}
      {costFor && <CostModal u={costFor} onClose={() => setCostFor(null)} onDone={refresh} />}
    </div>
  );
}

function UploadButton({ unitId, folder, onDone }: { unitId: string; folder: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <label className={clsx("inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50", busy && "opacity-50")}>
      <Upload className="size-3.5" /> {busy ? "Uploading…" : "Upload"}
      <input
        type="file"
        multiple
        accept="image/*,application/pdf"
        className="hidden"
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
            alert((ex as Error).message);
          } finally {
            setBusy(false);
            e.target.value = "";
          }
        }}
      />
    </label>
  );
}

function PaymentModal({ open, onClose, invoiceId, balance, onDone }: { open: boolean; onClose: () => void; invoiceId: string; balance: number; onDone: () => void }) {
  const [f, setF] = useState({ amountUsd: "", receivedDate: new Date().toISOString().slice(0, 10), fxRate: "150" });
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record a payment"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="success"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              const fd = new FormData();
              fd.append("amountUsd", f.amountUsd);
              fd.append("receivedDate", f.receivedDate);
              if (f.fxRate) fd.append("fxRate", f.fxRate);
              if (file) fd.append("receipt", file);
              try {
                await api.post(`/api/crm/invoices/${invoiceId}/payments`, fd);
                onDone();
                onClose();
              } catch (ex) {
                setErr((ex as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Save payment
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount received (USD)" hint={`Balance ${usd2(balance)}`}>
          <Input type="number" min={0.01} step={0.01} value={f.amountUsd} onChange={(e) => setF({ ...f, amountUsd: e.target.value })} />
        </Field>
        <Field label="Received date">
          <Input type="date" value={f.receivedDate} onChange={(e) => setF({ ...f, receivedDate: e.target.value })} />
        </Field>
        <Field label="Exchange rate (JPY per USD)">
          <Input type="number" step={0.01} value={f.fxRate} onChange={(e) => setF({ ...f, fxRate: e.target.value })} />
        </Field>
        <Field label="Receipt (image or PDF)">
          <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="py-2" />
        </Field>
      </div>
      <p className="mt-3 text-xs text-slate-500">The buyer sees the payment in their account, and Sora thanks them with the new balance.</p>
      {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
    </Modal>
  );
}

function UnitModal({ v, invoiceId, onClose, onDone }: { v: Vehicle; invoiceId: string; onClose: () => void; onDone: () => void }) {
  const [make, ...rest] = v.unitLabel.split(" ");
  const [f, setF] = useState({ make: make ?? "", model: rest.join(" "), year: String(v.year ?? ""), color: v.color ?? "", chassis: v.chassisNo ?? "", engineCc: (v.engine ?? "").replace(/\D/g, ""), transmission: v.transmission ?? "", fuel: v.fuel ?? "", drive: "", mileageKm: "", steering: "Right", location: "Yokohama yard" });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const n = (x: string) => (x ? Number(x) : null);
  return (
    <Modal
      open
      onClose={onClose}
      title="Add unit"
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              setErr(null);
              try {
                await api.post(`/api/crm/invoices/${invoiceId}/units`, { invoiceVehicleId: v.id, make: f.make, model: f.model, year: n(f.year), color: f.color || null, chassis: f.chassis || null, engineCc: n(f.engineCc), transmission: f.transmission || null, fuel: f.fuel || null, drive: f.drive || null, mileageKm: n(f.mileageKm), steering: f.steering || null, location: f.location || null });
                onDone();
                onClose();
              } catch (ex) {
                setErr((ex as Error).message);
              }
            }}
          >
            Save unit
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-500">Pre-filled from the invoice — check it against the auction sheet and export certificate.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ["make", "Make"],
            ["model", "Model"],
            ["year", "Year"],
            ["color", "Colour"],
            ["chassis", "Chassis no."],
            ["engineCc", "Engine (cc)"],
            ["transmission", "Transmission"],
            ["fuel", "Fuel"],
            ["drive", "Drive"],
            ["mileageKm", "Mileage (km)"],
            ["steering", "Steering"],
            ["location", "Location"],
          ] as [keyof typeof f, string][]
        ).map(([k, label]) => (
          <Field key={k} label={label}>
            <Input value={f[k]} onChange={set(k)} />
          </Field>
        ))}
      </div>
      {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
    </Modal>
  );
}

function ProgressModal({ v, stages, onClose, onDone }: { v: Vehicle; stages: string[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ stage: stages[0] ?? "", stageDate: new Date().toISOString().slice(0, 10), note: "" });
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal
      open
      onClose={onClose}
      title={`Shipping progress — ${v.unitLabel}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              setErr(null);
              try {
                await api.post(`/api/crm/invoice-vehicles/${v.id}/progress`, { ...f, note: f.note || undefined });
                onDone();
                onClose();
              } catch (ex) {
                setErr((ex as Error).message);
              }
            }}
          >
            Save stage
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="Stage">
          <Select value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })}>
            {stages.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Date">
          <Input type="date" max={new Date().toISOString().slice(0, 10)} value={f.stageDate} onChange={(e) => setF({ ...f, stageDate: e.target.value })} />
        </Field>
        <Field label="Note for the buyer (optional)">
          <Textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. Vessel Pacific Star, ETA 24 Nov" />
        </Field>
        <p className="text-xs text-slate-500">History is append-only. Sora tells the buyer about the new stage.</p>
        {err && <p className="text-sm text-rose-600">{err}</p>}
      </div>
    </Modal>
  );
}

function CostModal({ u, onClose, onDone }: { u: UnitsData["units"][number]; onClose: () => void; onDone: () => void }) {
  const f0 = u.financials ?? {};
  const [f, setF] = useState<Record<string, string>>(Object.fromEntries([...COST_FIELDS.map(([k]) => [k, String(f0[k] ?? 0)]), ["fxRate", f0.fxRate != null ? String(f0.fxRate) : ""], ["sellingPriceUsd", f0.sellingPriceUsd != null ? String(f0.sellingPriceUsd) : ""], ["lotNo", String(f0.lotNo ?? "")], ["auctionName", String(f0.auctionName ?? "")]]));
  const [err, setErr] = useState<string | null>(null);
  const costJpy = COST_FIELDS.reduce((a, [k]) => a + (Number(f[k]) || 0), 0);
  const fx = Number(f.fxRate);
  const costUsd = fx > 0 ? costJpy / fx : null;
  const profit = costUsd != null && f.sellingPriceUsd ? Number(f.sellingPriceUsd) - costUsd : null;
  return (
    <Modal
      open
      onClose={onClose}
      title={`Costing — ${u.unit.make} ${u.unit.model}`}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              setErr(null);
              try {
                await api.put(`/api/crm/units/${u.unit.id}/financials`, { ...Object.fromEntries(COST_FIELDS.map(([k]) => [k, Number(f[k]) || 0])), fxRate: f.fxRate ? Number(f.fxRate) : null, sellingPriceUsd: f.sellingPriceUsd ? Number(f.sellingPriceUsd) : null, lotNo: f.lotNo || null, auctionName: f.auctionName || null });
                onDone();
                onClose();
              } catch (ex) {
                setErr((ex as Error).message);
              }
            }}
          >
            Save costing
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Lot no.">
          <Input value={f.lotNo} onChange={(e) => setF({ ...f, lotNo: e.target.value })} />
        </Field>
        <Field label="Auction" className="sm:col-span-3">
          <Input value={f.auctionName} onChange={(e) => setF({ ...f, auctionName: e.target.value })} />
        </Field>
        {COST_FIELDS.map(([k, label]) => (
          <Field key={k} label={`${label} (¥)`}>
            <Input type="number" min={0} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </Field>
        ))}
        <Field label="Exchange rate (JPY/USD)" hint="Blank = profit not calculated">
          <Input type="number" step={0.01} value={f.fxRate} onChange={(e) => setF({ ...f, fxRate: e.target.value })} />
        </Field>
        <Field label="Selling price (USD)">
          <Input type="number" step={0.01} value={f.sellingPriceUsd} onChange={(e) => setF({ ...f, sellingPriceUsd: e.target.value })} />
        </Field>
      </div>
      <div className="mt-4 grid gap-2 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-3">
        <p>
          Cost: <strong>{jpy(costJpy)}</strong>
        </p>
        <p>
          Cost USD: <strong>{costUsd != null ? usd2(costUsd) : "needs FX rate"}</strong>
        </p>
        <p>
          Profit: <strong className={clsx(profit != null && profit < 0 ? "text-rose-600" : "text-emerald-700")}>{profit != null ? usd2(profit) : "—"}</strong>
        </p>
      </div>
      {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
    </Modal>
  );
}
