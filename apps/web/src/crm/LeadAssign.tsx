import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Button, Modal, Select, Skeleton } from "../ui";

interface Assignment {
  groups: { code: string | null; country: string | null; n: number }[];
  agents: { id: string; name: string }[];
}

/** Supervisor: hand imported leads to agents, country by country. Only leads still with the Supervisor move. */
export function AssignLeadsModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["lead-assignment"], queryFn: () => api.get<Assignment>("/api/crm/lead-assignment") });
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const assign = async (code: string) => {
    setBusy(code);
    setMsg(null);
    try {
      const r = await api.post<{ moved: number }>("/api/crm/lead-assignment", { countryCode: code, toUserId: choice[code] });
      const who = q.data?.agents.find((a) => a.id === choice[code])?.name;
      setMsg({ ok: true, text: `${r.moved} lead${r.moved === 1 ? "" : "s"} assigned to ${who}.` });
      await qc.invalidateQueries();
    } catch (ex) {
      setMsg({ ok: false, text: (ex as Error).message });
    } finally {
      setBusy(null);
    }
  };
  return (
    <Modal open onClose={onClose} title="Assign imported leads by country">
      <p className="mb-3 text-sm text-slate-600">These are the new leads you imported from Excel that are still with you. Leads that belong to an agent never move from here.</p>
      {q.isLoading ? (
        <Skeleton className="h-32" />
      ) : !q.data?.groups.length ? (
        <p className="rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-600">No imported leads are waiting.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {q.data.groups.map((g) => (
            <li key={g.code ?? "none"} className="flex flex-wrap items-center gap-2 py-2.5">
              <p className="min-w-32 flex-1 text-sm font-semibold text-slate-900">
                {g.country ?? "No country"} <span className="font-normal text-slate-500">({g.n})</span>
              </p>
              {g.code && (
                <>
                  <div className="w-52">
                    <Select aria-label={`Agent for ${g.country}`} value={choice[g.code] ?? ""} onChange={(e) => setChoice({ ...choice, [g.code!]: e.target.value })}>
                      <option value="">Choose an agent...</option>
                      {q.data!.agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button size="sm" disabled={!choice[g.code]} loading={busy === g.code} onClick={() => void assign(g.code!)}>
                    Assign
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {msg && <p className={`mt-3 rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{msg.text}</p>}
    </Modal>
  );
}
