import { useState } from "react";
import { Link } from "react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Bot, Download, FileSpreadsheet, Gavel, Inbox, ShoppingBag, Trash2, Users } from "lucide-react";
import { api, qs } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ago, date, jpy, km } from "../lib/format";
import { Badge, Button, Card, Empty, Field, Input, PageHeader, Pagination, Select, Skeleton, Stat, StatusBadge, Table, Tabs, Textarea } from "../ui";
import { FteName } from "../lib/site";
import { LotImportModal } from "./LotImport";

export function AuctionAdmin() {
  const { can } = useAuth();
  const [tab, setTab] = useState<"overview" | "vehicles" | "bids" | "orders" | "enquiries" | "clients">("overview");
  const [importing, setImporting] = useState(false);
  const signal = useQuery({ queryKey: ["auction-overview"], queryFn: () => api.get<OverviewData>("/api/auction/admin/overview") }).data?.feed;
  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Gavel className="size-6 text-brand-600" /> Auction admin
          </span>
        }
        subtitle={
          signal ? (
            <span className={`inline-flex flex-wrap items-center gap-1.5 ${signal.status === "working" ? "text-emerald-700" : "text-rose-700"}`}>
              <span className={`size-2 rounded-full ${signal.status === "working" ? "bg-emerald-500" : "bg-rose-500"}`} /> {signal.text}
              <span className="text-slate-500">· {signal.detail}{signal.newestAt ? ` · newest lot added ${ago(signal.newestAt)}` : ""}</span>
            </span>
          ) : undefined
        }
        actions={
          <>
          {can("auction.lots.import") && (
            <Button variant="secondary" onClick={() => setImporting(true)}>
              <FileSpreadsheet className="size-4" /> Import lots
            </Button>
          )}
          <Link to="/auction/list" className="inline-flex h-10 items-center rounded-xl bg-white px-4 text-sm font-semibold shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
            Open the lot list →
          </Link>
          </>
        }
      />
      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "overview", label: "Overview" },
            { value: "vehicles", label: "Vehicles" },
            ...(can("auction.bids.view") ? [{ value: "bids" as const, label: "Bids" }] : []),
            ...(can("auction.orders.manage") ? [{ value: "orders" as const, label: "Orders" }] : []),
            ...(can("auction.enquiries.reply") ? [{ value: "enquiries" as const, label: "Enquiries" }] : []),
            ...(can("auction.clients.view") ? [{ value: "clients" as const, label: "Clients" }] : []),
          ]}
        />
      </div>
      {tab === "overview" && <Overview />}
      {tab === "vehicles" && <Vehicles />}
      {tab === "bids" && <Bids />}
      {tab === "orders" && <Orders />}
      {tab === "enquiries" && <Enquiries />}
      {tab === "clients" && <Clients />}
      <LotImportModal open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}

interface OverviewData {
  lots: { upcoming: number; total: number };
  clients: number;
  bids: { n: number; value: number };
  orders: { pending: number; confirmed: number; pipeline: number };
  enquiries: { open: number };
  bidsByDay: { day: string; bids: number }[];
  topBidders: { name: string; bids: number; value: number; share: number }[];
  desk: { name: string; kind: string; lastSeenAt: string | null }[];
  funnel: { clients: number; bidders: number; bids: number; won: number; orders: number; paid: number };
  customerActions: { kind: string; name: string; at: string; lot_id: string; lot_no: number; make: string; model: string; amount: number | null }[];
  deskActions: { id: string; summary: string; at: string; name: string | null }[];
  recentBids: { id: string; amountJpy: number; status: string; createdAt: string; who: string; lotId: string; lotNo: number; make: string; model: string }[];
  recentOrders: { id: string; orderNo: string; priceJpy: number; status: string; createdAt: string; who: string; lotId: string; lotNo: number; make: string; model: string }[];
  feed: { status: string; text: string; detail: string; newestAt: string | null };
}

function Vehicles() {
  const [f, setF] = useState({ q: "", status: "", hall: "", page: 1 });
  const halls = useQuery({ queryKey: ["ahalls"], queryFn: () => api.get<{ id: string; name: string }[]>("/api/auction/halls"), staleTime: 3600_000 });
  const q = useQuery({ queryKey: ["admin-vehicles", f], queryFn: () => api.get<{ items: { id: string; lotNo: number; saleDate: string; make: string; model: string; modelCode: string; year: number; mileageKm: number; grade: string; startPriceJpy: number; status: string; hall: string; bids: number }[]; total: number; page: number; pageSize: number }>(`/api/auction/admin/vehicles${qs(f)}`), placeholderData: keepPreviousData });
  return (
    <div>
      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <Field label="Search">
          <Input key="vehicles-search" placeholder="Make, model, code or lot no." defaultValue={f.q} onKeyDown={(e) => e.key === "Enter" && setF({ ...f, q: (e.target as HTMLInputElement).value, page: 1 })} onBlur={(e) => e.target.value !== f.q && setF({ ...f, q: e.target.value, page: 1 })} />
        </Field>
        <Field label="Status">
          <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, page: 1 })}>
            <option value="">All statuses</option>
            <option value="upcoming">Upcoming</option>
            <option value="sold">Sold</option>
            <option value="unsold">Not sold</option>
            <option value="withdrawn">Withdrawn</option>
          </Select>
        </Field>
        <Field label="Hall">
          <Select value={f.hall} onChange={(e) => setF({ ...f, hall: e.target.value, page: 1 })}>
            <option value="">All halls</option>
            {halls.data?.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {!q.data ? (
        <Skeleton className="h-60" />
      ) : !q.data.items.length ? (
        <Empty title="No lots match" />
      ) : (
        <>
          <p className="mb-2 text-sm text-slate-500">{q.data.total.toLocaleString("en-US")} lots</p>
          <Table head={["Lot", "Vehicle", "Hall", "Sale date", "Mileage", "Grade", "Start price", "Bids", "Status"]}>
            {q.data.items.map((l) => (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link className="font-semibold text-brand-700" to={`/auction/lots/${l.id}`}>
                    {l.lotNo}
                  </Link>
                </td>
                <td className="px-4 py-2">
                  {l.year} {l.make} {l.model} <span className="text-xs text-slate-500">{l.modelCode}</span>
                </td>
                <td className="px-4 py-2 whitespace-nowrap">{l.hall}</td>
                <td className="px-4 py-2 whitespace-nowrap">{date(l.saleDate)}</td>
                <td className="px-4 py-2 whitespace-nowrap">{km(l.mileageKm)}</td>
                <td className="px-4 py-2">{l.grade}</td>
                <td className="px-4 py-2 whitespace-nowrap">{jpy(l.startPriceJpy)}</td>
                <td className="px-4 py-2">{l.bids}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={l.status} />
                </td>
              </tr>
            ))}
          </Table>
          <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(page) => setF({ ...f, page })} />
        </>
      )}
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
  const q = useQuery({ queryKey: ["auction-overview"], queryFn: () => api.get<OverviewData>("/api/auction/admin/overview") });
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
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <p className="mb-3 font-semibold">From client to paid order</p>
          <Bars rows={[{ step: "Clients", n: d.funnel.clients }, { step: "Clients who bid", n: d.funnel.bidders }, { step: "Bids", n: d.funnel.bids }, { step: "Bids won", n: d.funnel.won }, { step: "Orders", n: d.funnel.orders }, { step: "Paid orders", n: d.funnel.paid }]} label="step" value="n" />
        </Card>
        <Card padded={false}>
          <p className="px-5 pt-5 font-semibold">Bids by customer</p>
          {d.topBidders.length ? (
            <div className="scrollbar-thin overflow-x-auto">
              <table className="mt-2 w-full min-w-[360px] text-sm">
                <thead className="text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="px-5 py-2">Customer</th>
                    <th className="px-3 py-2 text-right">Bids</th>
                    <th className="px-3 py-2 text-right">Share</th>
                    <th className="px-5 py-2 text-right">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {d.topBidders.map((b) => (
                    <tr key={b.name}>
                      <td className="px-5 py-2 font-medium text-slate-900">{b.name}</td>
                      <td className="px-3 py-2 text-right">{b.bids}</td>
                      <td className="px-3 py-2 text-right">{b.share}%</td>
                      <td className="px-5 py-2 text-right whitespace-nowrap">{jpy(b.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 pb-5 text-sm text-slate-500">No bids yet.</p>
          )}
        </Card>
        <Card>
          <p className="mb-3 font-semibold">What customers did</p>
          {d.customerActions.length ? (
            <ul className="space-y-2 text-sm">
              {d.customerActions.map((a, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-x-3">
                  <span className="min-w-0">
                    <strong className="text-slate-900">{a.name}</strong> {a.kind === "bid" ? `bid ${jpy(a.amount)} on` : a.kind === "order" ? "ordered" : "asked about"}{" "}
                    <Link className="font-medium text-brand-700" to={`/auction/lots/${a.lot_id}`}>
                      lot {a.lot_no}
                    </Link>{" "}
                    <span className="text-slate-500">
                      {a.make} {a.model}
                    </span>
                  </span>
                  <span className="text-xs whitespace-nowrap text-slate-500">{ago(a.at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Nothing yet.</p>
          )}
        </Card>
        <Card>
          <p className="mb-3 font-semibold">What the desk did</p>
          {d.deskActions.length ? (
            <ul className="space-y-2 text-sm">
              {d.deskActions.map((a) => (
                <li key={a.id} className="flex flex-wrap justify-between gap-x-3">
                  <span className="min-w-0 text-slate-800">{a.summary}</span>
                  <span className="text-xs whitespace-nowrap text-slate-500">{ago(a.at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">The desk has not touched a bid, order or enquiry yet.</p>
          )}
        </Card>
        <Card>
          <p className="mb-3 font-semibold">Recent bids</p>
          <ul className="space-y-2 text-sm">
            {d.recentBids.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <Link className="min-w-0 font-medium text-brand-700" to={`/auction/lots/${b.lotId}`}>
                  Lot {b.lotNo} · {b.make} {b.model}
                </Link>
                <span className="flex items-center gap-2 text-xs text-slate-600">
                  {b.who} · <strong>{jpy(b.amountJpy)}</strong> <StatusBadge status={b.status} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <p className="mb-3 font-semibold">Recent orders</p>
          {d.recentOrders.length ? (
            <ul className="space-y-2 text-sm">
              {d.recentOrders.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <Link className="min-w-0 font-medium text-brand-700" to={`/auction/lots/${o.lotId}`}>
                    {o.orderNo} · {o.make} {o.model}
                  </Link>
                  <span className="flex items-center gap-2 text-xs text-slate-600">
                    {o.who} · <strong>{jpy(o.priceJpy)}</strong> <StatusBadge status={o.status} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No orders yet.</p>
          )}
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
        <Table head={can("auction.bids.manage") ? ["When", "Bidder", "Lot", "Vehicle", "Amount", "Note", "Status", ""] : ["When", "Bidder", "Lot", "Vehicle", "Amount", "Note", "Status"]}>
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
                    className="min-w-28"
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
              {can("auction.bids.manage") && (
                <td className="px-4 py-2 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={b.status === "won"}
                    title={b.status === "won" ? "A won bid has an order behind it" : undefined}
                    aria-label={`Delete bid on lot ${b.lot.lotNo}`}
                    onClick={async () => {
                      if (!window.confirm(`Delete this bid on lot ${b.lot.lotNo}?`)) return;
                      await api.del(`/api/auction/admin/bids/${b.id}`);
                      await qc.invalidateQueries({ queryKey: ["admin-bids"] });
                      await qc.invalidateQueries({ queryKey: ["auction-overview"] });
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              )}
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
              className="min-w-36"
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
