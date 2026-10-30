import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet } from "lucide-react";
import { api } from "../lib/api";
import { Badge, Button, Modal, clsx } from "../ui";

interface ImportRow {
  row: number;
  name: string;
  phone: string;
  email: string;
  country: string;
  port: string;
  status: "ok" | "duplicate" | "error";
  note: string;
}
interface ImportResult {
  dryRun: boolean;
  total: number;
  ok: number;
  duplicates: number;
  errors: number;
  imported: number;
  rows: ImportRow[];
}

/** Upload leads from Excel: download the template, check the file (nothing saved), then import the good rows. */
export function LeadImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<ImportResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<"check" | "import" | null>(null);
  const send = async (dry: boolean) => {
    if (!file) return;
    setBusy(dry ? "check" : "import");
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post<ImportResult>(`/api/crm/leads/import?dryRun=${dry ? 1 : 0}`, fd);
      setRes(r);
      if (!dry) await qc.invalidateQueries({ queryKey: ["leads"] });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const close = () => {
    setFile(null);
    setRes(null);
    setErr(null);
    onClose();
  };
  const tone = { ok: "green", duplicate: "amber", error: "red" } as const;
  return (
    <Modal
      open={open}
      onClose={close}
      title="Import leads from Excel"
      wide
      footer={
        res && !res.dryRun ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={!file} loading={busy === "check"} onClick={() => void send(true)}>
              Check file
            </Button>
            <Button disabled={!res?.dryRun || !res.ok} loading={busy === "import"} onClick={() => void send(false)}>
              Import {res?.ok ?? 0} lead{res?.ok === 1 ? "" : "s"}
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-4 text-sm">
        <ol className="list-decimal space-y-1 pl-5 text-slate-600">
          <li>
            <a href="/api/crm/leads/template.xlsx" className="inline-flex items-center gap-1 font-semibold text-brand-700">
              <Download className="size-4" /> Download the template
            </a>{" "}
            — one buyer per row; the second sheet lists every country and port.
          </li>
          <li>Choose the filled file and press “Check file” — nothing is saved yet.</li>
          <li>Import: duplicates (same phone or e-mail as a lead you already have) and rows with errors are skipped; the Supervisor is told once.</li>
        </ol>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 p-4 hover:bg-slate-50">
          <FileSpreadsheet className="size-6 text-emerald-600" />
          <span className="min-w-0 flex-1 truncate">{file ? file.name : "Choose an .xlsx file…"}</span>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setRes(null);
              e.target.value = "";
            }}
          />
        </label>
        {err && <p className="rounded-xl bg-rose-50 p-3 text-rose-700">{err}</p>}
        {res && (
          <>
            <p className={clsx("rounded-xl p-3 font-semibold", res.dryRun ? "bg-slate-50 text-slate-800" : "bg-emerald-50 text-emerald-800")}>
              {res.dryRun ? `${res.total} rows checked: ${res.ok} ready to import · ${res.duplicates} duplicate · ${res.errors} with errors` : `Imported ${res.imported} lead${res.imported === 1 ? "" : "s"} · skipped ${res.duplicates} duplicate and ${res.errors} with errors`}
            </p>
            <div className="scrollbar-thin max-h-72 overflow-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    {["Row", "Customer", "Phone", "Country / port", "Result"].map((h) => (
                      <th key={h} className="px-3 py-2 font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {res.rows.map((r) => (
                    <tr key={r.row}>
                      <td className="px-3 py-2 text-slate-400">{r.row}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">{r.name || "—"}</td>
                      <td className="px-3 py-2">{r.phone || "—"}</td>
                      <td className="px-3 py-2">
                        {r.country || "—"}
                        {r.port ? ` · ${r.port}` : ""}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={tone[r.status]}>{r.status === "ok" ? "ready" : r.status}</Badge>
                        {r.note && <span className="ml-1 text-slate-500">{r.note}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
