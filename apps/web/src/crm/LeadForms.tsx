import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { usd2 } from "../lib/format";
import type { VehicleCard } from "../lib/site";
import { Button, Field, Input, Modal, Select } from "../ui";

interface Country {
  code: string;
  name: string;
  ports: { id: string; name: string }[];
}

export function useCountries() {
  return useQuery({ queryKey: ["countries"], queryFn: () => api.get<Country[]>("/api/public/countries"), staleTime: 3600_000 });
}

/** Country → port: one port fills itself, several give a choice. */
export function PortPicker({ country, port, onCountry, onPort }: { country: string; port: string; onCountry: (c: string) => void; onPort: (p: string) => void }) {
  const cs = useCountries();
  const ports = useMemo(() => cs.data?.find((c) => c.code === country)?.ports ?? [], [cs.data, country]);
  return (
    <>
      <Field label="Country *">
        <Select
          value={country}
          onChange={(e) => {
            onCountry(e.target.value);
            const ps = cs.data?.find((c) => c.code === e.target.value)?.ports ?? [];
            onPort(ps.length === 1 ? ps[0]!.id : "");
          }}
        >
          <option value="">Choose a country…</option>
          {cs.data?.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Port *" hint={ports.length === 1 ? "Only one port — filled automatically" : undefined}>
        <Select value={port} onChange={(e) => onPort(e.target.value)} disabled={!ports.length || ports.length === 1}>
          <option value="">{ports.length ? "Choose a port…" : "Choose a country first"}</option>
          {ports.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}

export function NewLeadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const [f, setF] = useState({ customerName: "", contactPerson: "", phone: "", email: "", address: "", countryCode: "", portId: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New lead"
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                const r = await api.post<{ lead: { id: string }; duplicate: boolean }>("/api/crm/leads", { ...f, email: f.email || undefined, address: f.address || undefined });
                if (r.duplicate) alert("This phone or e-mail already belongs to a lead — opening it.");
                onClose();
                nav(`/crm/leads/${r.lead.id}`);
              } catch (ex) {
                setErr((ex as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Create lead
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Customer / business name *">
          <Input value={f.customerName} onChange={set("customerName")} />
        </Field>
        <Field label="Contact person *">
          <Input value={f.contactPerson} onChange={set("contactPerson")} />
        </Field>
        <Field label="Phone *">
          <Input value={f.phone} onChange={set("phone")} placeholder="+254 7…" />
        </Field>
        <Field label="E-mail">
          <Input type="email" value={f.email} onChange={set("email")} />
        </Field>
        <PortPicker country={f.countryCode} port={f.portId} onCountry={(c) => setF((x) => ({ ...x, countryCode: c }))} onPort={(p) => setF((x) => ({ ...x, portId: p }))} />
        <Field label="Address" className="sm:col-span-2">
          <Input value={f.address} onChange={set("address")} />
        </Field>
      </div>
      {err && <p className="mt-3 text-sm text-rose-600">{err}</p>}
    </Modal>
  );
}

interface VehicleRow {
  vehicleId: string | null;
  unitLabel: string;
  year: string;
  color: string;
  chassisNo: string;
  engine: string;
  transmission: string;
  fuel: string;
  pushUsd: string;
  cnfUsd: string;
}
const emptyRow = (): VehicleRow => ({ vehicleId: null, unitLabel: "", year: "", color: "", chassisNo: "", engine: "", transmission: "", fuel: "", pushUsd: "", cnfUsd: "" });

/** Agent's invoice request: several vehicles ("Add more"), prices optional (Supervisor can price later). */
export function RequestInvoiceModal({ lead, onClose, onDone }: { lead: { id: string; customerName: string; phone: string; email: string | null; address: string | null; countryCode: string | null; portId: string | null }; onClose: () => void; onDone: (id: string) => void }) {
  const [c, setC] = useState({ consigneeName: lead.customerName, consigneePhone: lead.phone, consigneeEmail: lead.email ?? "", consigneeAddress: lead.address ?? "", consigneeCountryCode: lead.countryCode ?? "", consigneePortId: lead.portId ?? "" });
  const [rows, setRows] = useState<VehicleRow[]>([emptyRow()]);
  const [pick, setPick] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const total = rows.reduce((a, r) => a + (Number(r.cnfUsd) || 0), 0);
  const upd = (i: number, k: keyof VehicleRow, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <Modal
      open
      onClose={onClose}
      title={`Request invoice — ${lead.customerName}`}
      wide
      footer={
        <>
          <span className="mr-auto self-center text-sm text-slate-600">
            {rows.length} vehicle(s) · Total C&F <strong>{usd2(total)}</strong>
          </span>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                const r = await api.post<{ id: string }>("/api/crm/invoices", {
                  leadId: lead.id,
                  ...c,
                  consigneeEmail: c.consigneeEmail || undefined,
                  consigneePortId: c.consigneePortId || null,
                  vehicles: rows
                    .filter((r0) => r0.unitLabel.trim())
                    .map((r0) => ({ vehicleId: r0.vehicleId, unitLabel: r0.unitLabel, year: r0.year ? Number(r0.year) : null, color: r0.color || null, chassisNo: r0.chassisNo || null, engine: r0.engine || null, transmission: r0.transmission || null, fuel: r0.fuel || null, pushUsd: Number(r0.pushUsd) || 0, cnfUsd: Number(r0.cnfUsd) || 0 })),
                });
                onDone(r.id);
              } catch (ex) {
                setErr((ex as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Send to Supervisor
          </Button>
        </>
      }
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Consignee</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name *">
          <Input value={c.consigneeName} onChange={(e) => setC({ ...c, consigneeName: e.target.value })} />
        </Field>
        <Field label="Phone *">
          <Input value={c.consigneePhone} onChange={(e) => setC({ ...c, consigneePhone: e.target.value })} />
        </Field>
        <Field label="E-mail">
          <Input value={c.consigneeEmail} onChange={(e) => setC({ ...c, consigneeEmail: e.target.value })} />
        </Field>
        <PortPicker country={c.consigneeCountryCode} port={c.consigneePortId} onCountry={(v) => setC((x) => ({ ...x, consigneeCountryCode: v }))} onPort={(v) => setC((x) => ({ ...x, consigneePortId: v }))} />
        <Field label="Address">
          <Input value={c.consigneeAddress} onChange={(e) => setC({ ...c, consigneeAddress: e.target.value })} />
        </Field>
      </div>
      <p className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Vehicles (prices optional — the Supervisor can price later)</p>
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">Vehicle {i + 1}</p>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setPick(i)}>
                  <Search className="size-4" /> From stock
                </Button>
                {rows.length > 1 && (
                  <Button size="sm" variant="ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove vehicle">
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-5">
              <Input className="sm:col-span-2" placeholder="Make & model *" value={r.unitLabel} onChange={(e) => upd(i, "unitLabel", e.target.value)} />
              <Input placeholder="Year" value={r.year} onChange={(e) => upd(i, "year", e.target.value)} />
              <Input placeholder="Colour" value={r.color} onChange={(e) => upd(i, "color", e.target.value)} />
              <Input placeholder="Chassis no." value={r.chassisNo} onChange={(e) => upd(i, "chassisNo", e.target.value)} />
              <Input placeholder="Engine" value={r.engine} onChange={(e) => upd(i, "engine", e.target.value)} />
              <Input placeholder="Transmission" value={r.transmission} onChange={(e) => upd(i, "transmission", e.target.value)} />
              <Input placeholder="Fuel" value={r.fuel} onChange={(e) => upd(i, "fuel", e.target.value)} />
              <Input placeholder="Push (FOB) $" type="number" value={r.pushUsd} onChange={(e) => upd(i, "pushUsd", e.target.value)} />
              <Input placeholder="C&F $" type="number" value={r.cnfUsd} onChange={(e) => upd(i, "cnfUsd", e.target.value)} />
            </div>
          </div>
        ))}
        {rows.length < 50 && (
          <Button variant="secondary" size="sm" onClick={() => setRows([...rows, emptyRow()])}>
            <Plus className="size-4" /> Add more
          </Button>
        )}
      </div>
      {err && <p className="mt-3 text-sm text-rose-600">{err}</p>}
      {pick !== null && (
        <StockPicker
          onClose={() => setPick(null)}
          onPick={(v) => {
            setRows((rs) => rs.map((r, j) => (j === pick ? { ...r, vehicleId: v.id, unitLabel: `${v.brand} ${v.model}`, year: String(v.year), color: v.color, chassisNo: "", engine: v.engineCc ? `${v.engineCc} cc` : "", transmission: v.transmission, fuel: v.fuel, pushUsd: String(v.discountPriceUsd ?? v.priceUsd) } : r)));
            setPick(null);
          }}
        />
      )}
    </Modal>
  );
}

function StockPicker({ onClose, onPick }: { onClose: () => void; onPick: (v: VehicleCard) => void }) {
  const [q, setQ] = useState("");
  const r = useQuery({ queryKey: ["pick", q], queryFn: () => api.get<{ items: VehicleCard[] }>(`/api/public/vehicles?pageSize=12&q=${encodeURIComponent(q)}`) });
  return (
    <Modal open onClose={onClose} title="Pick a car from stock" wide>
      <Input placeholder="Search model, chassis code, stock no." value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {r.data?.items.map((v) => (
          <button key={v.id} onClick={() => onPick(v)} className="flex items-center gap-3 rounded-xl border border-slate-200 p-2 text-left hover:border-brand-300">
            <img src={v.image} alt="" className="h-12 w-20 shrink-0 rounded-lg object-cover" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{v.title}</span>
              <span className="text-xs text-slate-500">
                {v.stockNo} · {usd2(v.discountPriceUsd ?? v.priceUsd)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
