import { useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LEAD_STATUS_LABELS } from "@autofte/shared";
import { Bot, ChevronLeft, Send } from "lucide-react";
import { api } from "../lib/api";
import { dateTime, usd2 } from "../lib/format";
import { Avatar, Button, Card, Empty, Skeleton, StatusBadge, Textarea } from "../ui";

interface LeadFull {
  lead: { id: string; customerName: string; contactPerson: string; phone: string; email: string | null; address: string | null; status: string; source: string; createdAt: string };
  notes: { id: string; body: string; createdAt: string; author: string | null; authorKind: string | null }[];
  invoices: { id: string; number: string; status: string; totalCnfUsd: number; createdAt: string }[];
  country: { name: string } | null;
  port: { name: string } | null;
  owner: { name: string; kind: string } | null;
}

export default function LeadDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["lead", id], queryFn: () => api.get<LeadFull>(`/api/crm/leads/${id}`) });
  const [note, setNote] = useState("");
  if (q.isLoading) return <Skeleton className="h-96" />;
  if (!q.data) return <Empty title="Lead not found" />;
  const { lead } = q.data;
  return (
    <div>
      <Link to="/crm/leads" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700">
        <ChevronLeft className="size-4" /> Leads
      </Link>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-900">{lead.customerName}</h1>
        <StatusBadge status={lead.status} label={LEAD_STATUS_LABELS[lead.status as keyof typeof LEAD_STATUS_LABELS]} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-4">
          <Card>
            <dl className="space-y-2 text-sm">
              {[
                ["Contact", lead.contactPerson],
                ["Phone", lead.phone],
                ["E-mail", lead.email ?? "—"],
                ["Country", q.data.country?.name ?? "—"],
                ["Port", q.data.port?.name ?? "—"],
                ["Owner", q.data.owner ? (q.data.owner.kind === "fte" ? "Sora (Digital FTE)" : q.data.owner.name) : "—"],
                ["Source", lead.source.replace("_", " ")],
                ["Created", dateTime(lead.createdAt)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-right font-medium text-slate-900">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card>
            <p className="font-semibold text-slate-900">Invoices</p>
            {q.data.invoices.length ? (
              <ul className="mt-2 divide-y divide-slate-100">
                {q.data.invoices.map((i) => (
                  <li key={i.id}>
                    <Link to={`/crm/invoices/${i.id}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-brand-700">
                      <span className="font-semibold">{i.number}</span>
                      <span>{usd2(i.totalCnfUsd)}</span>
                      <StatusBadge status={i.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-500">No invoices yet.</p>
            )}
          </Card>
        </div>
        <Card className="flex flex-col">
          <p className="font-semibold text-slate-900">Notes</p>
          <div className="scrollbar-thin mt-3 max-h-[28rem] flex-1 space-y-3 overflow-y-auto">
            {q.data.notes.map((n) => (
              <div key={n.id} className="flex gap-2">
                <Avatar name={n.author} kind={n.authorKind} size={28} />
                <div className="rounded-2xl rounded-tl-md bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
                  <p className="text-xs font-semibold text-slate-700">
                    {n.authorKind === "fte" ? (
                      <span className="inline-flex items-center gap-1 text-violet-700">
                        <Bot className="size-3.5" /> Sora
                      </span>
                    ) : (
                      n.author
                    )}{" "}
                    <span className="font-normal text-slate-400">· {dateTime(n.createdAt)}</span>
                  </p>
                  <p className="text-sm whitespace-pre-wrap text-slate-800">{n.body}</p>
                </div>
              </div>
            ))}
            {!q.data.notes.length && <p className="text-sm text-slate-500">No notes yet.</p>}
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!note.trim()) return;
              await api.post(`/api/crm/leads/${lead.id}/notes`, { body: note });
              setNote("");
              await qc.invalidateQueries({ queryKey: ["lead", id] });
            }}
          >
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" className="flex-1" />
            <Button type="submit" aria-label="Add note">
              <Send className="size-4" />
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
