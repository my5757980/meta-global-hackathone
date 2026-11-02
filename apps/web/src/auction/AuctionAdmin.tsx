import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Bot, Download, Gavel, Inbox, ShoppingBag, Users } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ago, date, jpy } from "../lib/format";
import { Badge, Button, Card, Empty, PageHeader, Select, Skeleton, Stat, Table, Tabs, Textarea } from "../ui";
import { FteName } from "../lib/site";

export function AuctionAdmin() {
  const { can } = useAuth();
  const [tab, setTab] = useState<"overview" | "bids" | "orders" | "enquiries" | "clients">("overview");
  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Gavel className="size-6 text-brand-600" /> Auction admin
          </span>
        }
        subtitle={<span className="inline-flex items-center gap-1.5 text-emerald-700"><span className="size-2 rounded-full bg-emerald-500" /> Auction is working</span>}
        actions={
          <Link to="/auction/list" className="inline-flex h-10 items-center rounded-xl bg-white px-4 text-sm font-semibold shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
            Open the lot list →
          </Link>
        }
      />
      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "overview", label: "Overview" },
            ...(can("auction.bids.view") ? [{ value: "bids" as const, label: "Bids" }] : []),
            ...(can("auction.orders.manage") ? [{ value: "orders" as const, label: "Orders" }] : []),
            ...(can("auction.enquiries.reply") ? [{ value: "enquiries" as const, label: "Enquiries" }] : []),
            ...(can("auction.clients.view") ? [{ value: "clients" as const, label: "Clients" }] : []),
          ]}
        />
      </div>
      {tab === "overview" && <Overview />}
      {tab === "bids" && <Bids />}
      {tab === "orders" && <Orders />}
      {tab === "enquiries" && <Enquiries />}
      {tab === "clients" && <Clients />}
    </div>
  );
}

function Bars({ rows, label, value }: { rows: Record<string, unknown>[]; label: string; value: string }) {
  const max = Math.max(1, ...rows.map((r) => Number(r[value]) || 0));
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="w-28 shrink-0 truncate text-slate-600">{String(r[label])}</span>
          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(Number(r[value]) / max) * 100}%` }} />
          </span>
          <span className="w-10 text-right font-semibold">{String(r[value])}</span>
        </div>
      ))}
    </div>
  );
}

function Overview() {
  const q = useQuery({ queryKey: ["auction-overview"], queryFn: () => api.get<{ lots: { upcoming: number; total: number }; clients: number; bids: { n: number; value: number }; orders: { pending: number; confirmed: number; pipeline: number }; enquiries: { open: number }; bidsByDay: { day: string; bids: number }[]; topBidders: { name: string; bids: number; value: number }[]; desk: { name: string; lastSeenAt: string | null }[] }>("/api/auction/admin/overview") });
  if (!q.data) return <Skeleton className="h-60" />;
  const d = q.data;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Upcoming lots" value={d.lots.upcoming.toLocaleString("en-US")} icon={<Gavel className="size-5" />} />
        <Stat label="Bids" value={d.bids.n} hint={`Value ${jpy(d.bids.value)}`} icon={<Activity className="size-5" />} />
        <Stat label="Pending orders" value={d.orders.pending} hint={`Pipeline ${jpy(d.orders.pipeline)}`} icon={<ShoppingBag className="size-5" />} />
        <Stat label="Confirmed revenue" value={jpy(d.orders.confirmed)} icon={<ShoppingBag className="size-5" />} />
        <Stat label="Open enquiries" value={d.enquiries.open} hint={`${d.clients} clients`} icon={<Inbox className="size-5" />} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <p className="mb-3 font-semibold">Bids by day</p>
          {d.bidsByDay.length ? <Bars rows={d.bidsByDay} label="day" value="bids" /> : <p className="text-sm text-slate-500">No bids yet.</p>}
        </Card>
        <Card>
          <p className="mb-3 font-semibold">Who bids most</p>
          <Bars rows={d.topBidders} label="name" value="bids" />
        </Card>
        <Card>
          <p className="mb-3 font-semibold">Who is on the desk</p>
          <ul className="space-y-1.5 text-sm">
            {d.desk.map((p) => (
              <li key={p.name} className="flex justify-between">
                <span>{p.name}</span>
                <span className="text-slate-500">{ago(p.lastSeenAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Bids() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const q = useQuery({ queryKey: ["admin-bids"], queryFn: () => api.get<{ id: string; amountJpy: number; status: string; note: string | null; createdAt: string; who: string; whoKind: string; lot: { lotNo: number; make: string; model: string; year: number; saleDate: string; hall: string } }[]>("/api/auction/admin/bids") });
  return (
    <div>
      <div className="mb-3 flex justify-between gap-2">
        <p className="text-sm text-slate-500">{can("auction.bids.view_all") ? "Everyone's bids" : "Only your own bids (you do not have “see all bids”)"}</p>
        {can("auction.bids.export") && (
          <a href="/api/auction/admin/bids.xlsx" className="inline-flex h-9 items-center gap-2 rounded-xl bg-white px-3 text-sm font-semibold shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
            <Download className="size-4" /> Export Excel
          </a>
        )}
      </div>
      {!q.data ? (
        <Skeleton className="h-60" />
      ) : !q.data.length ? (
        <Empty title="No bids" />
      ) : (
        <Table head={["When", "Bidder", "Lot", "Vehicle", "Amount", "Note", "Status"]}>
          {q.data.map((b) => (
            <tr key={b.id}>
              <td className="px-4 py-2 text-xs whitespace-nowrap">{ago(b.createdAt)}</td>
              <td className="px-4 py-2 whitespace-nowrap">{b.whoKind === "fte" ? <span className="inline-flex items-center gap-1 font-semibold text-violet-700"><Bot className="size-4" /> <FteName /></span> : b.who}</td>
              <td className="px-4 py-2">
                {b.lot.lotNo}
                <p className="text-xs text-slate-500">{b.lot.hall} · {date(b.lot.saleDate)}</p>
              </td>
              <td className="px-4 py-2">
                {b.lot.year} {b.lot.make} {b.lot.model}
              </td>
              <td className="px-4 py-2 font-semibold whitespace-nowrap">{jpy(b.amountJpy)}</td>
              <td className="px-4 py-2 text-xs text-slate-600">{b.note}</td>
              <td className="px-4 py-2">
                {can("auction.bids.manage") ? (
                  <Select
                    className="w-28"
                    value={b.status}
                    onChange={async (e) => {
                      await api.put(`/api/auction/admin/bids/${b.id}`, { status: e.target.value });
                      await qc.invalidateQueries({ queryKey: ["admin-bids"] });
                    }}
                  >
                    {["active", "won", "lost", "cancelled"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Select>
                ) : (
                  <Badge>{b.status}</Badge>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

function Orders() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-orders"], queryFn: () => api.get<{ id: string; orderNo: string; status: string; priceJpy: number | null; createdAt: string; who: string; lot: { lotNo: number; make: string; model: string } }[]>("/api/auction/admin/orders") });
  if (!q.data) return <Skeleton className="h-60" />;
  if (!q.data.length) return <Empty title="No orders" />;
  return (
    <Table head={["Order", "Client", "Lot", "Price", "Placed", "Status"]}>
      {q.data.map((o) => (
        <tr key={o.id}>
          <td className="px-4 py-2 font-semibold">{o.orderNo}</td>
          <td className="px-4 py-2">{o.who}</td>
          <td className="px-4 py-2">
            {o.lot.lotNo} · {o.lot.make} {o.lot.model}
          </td>
          <td className="px-4 py-2">{jpy(o.priceJpy)}</td>
          <td className="px-4 py-2 text-xs">{ago(o.createdAt)}</td>
          <td className="px-4 py-2">
            <Select
              className="w-36"
              value={o.status}
              onChange={async (e) => {
                await api.put(`/api/auction/admin/orders/${o.id}`, { status: e.target.value });
                await qc.invalidateQueries({ queryKey: ["admin-orders"] });
              }}
            >
              {["pending", "approved", "confirmed", "paid", "shipped", "delivered", "cancelled"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </td>
        </tr>
      ))}
    </Table>
  );
}

function Enquiries() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-enq"], queryFn: () => api.get<{ id: string; enqNo: string; message: string; reply: string | null; status: string; createdAt: string; who: string; lot: { id: string; lotNo: number; make: string; model: string } }[]>("/api/auction/admin/enquiries") });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  if (!q.data) return <Skeleton className="h-60" />;
  return (
    <div className="space-y-3">
      {q.data.map((e) => (
        <Card key={e.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">
              {e.enqNo} · {e.who} ·{" "}
              <Link to={`/auction/lots/${e.lot.id}`} className="text-brand-700">
                Lot {e.lot.lotNo} {e.lot.make} {e.lot.model}
              </Link>
            </p>
            <Badge tone={e.status === "answered" ? "green" : "amber"}>{e.status}</Badge>
          </div>
          <p className="mt-2 text-sm text-slate-700">{e.message}</p>
          {e.reply ? (
            <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-900">{e.reply}</p>
          ) : (
            <div className="mt-2 flex gap-2">
              <Textarea rows={2} className="flex-1" value={drafts[e.id] ?? ""} onChange={(ev) => setDrafts({ ...drafts, [e.id]: ev.target.value })} placeholder="Reply…" />
              <Button
                onClick={async () => {
                  await api.post(`/api/auction/admin/enquiries/${e.id}/reply`, { reply: drafts[e.id] });
                  await qc.invalidateQueries({ queryKey: ["admin-enq"] });
                }}
              >
                Reply
              </Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function Clients() {
  const q = useQuery({ queryKey: ["admin-clients"], queryFn: () => api.get<{ id: string; name: string; email: string; phone: string; countryCode: string; company: string; bids: number; orders: number }[]>("/api/auction/admin/clients") });
  if (!q.data) return <Skeleton className="h-60" />;
  return (
    <Table head={["Client", "Company", "Country", "Bids", "Orders"]}>
      {q.data.map((c) => (
        <tr key={c.id}>
          <td className="px-4 py-2">
            <p className="flex items-center gap-1 font-semibold"><Users className="size-4 text-slate-400" /> {c.name}</p>
            <p className="text-xs text-slate-500">{c.email} · {c.phone}</p>
          </td>
          <td className="px-4 py-2">{c.company}</td>
          <td className="px-4 py-2">{c.countryCode}</td>
          <td className="px-4 py-2">{c.bids}</td>
          <td className="px-4 py-2">{c.orders}</td>
        </tr>
      ))}
    </Table>
  );
}
