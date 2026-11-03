import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Bot, ChevronLeft, Download, FileSpreadsheet, Gavel, Inbox, Pause, Play, ShoppingBag, Trash2, Users } from "lucide-react";
import { api, qs } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ago, date, dateTime, jpy, km } from "../lib/format";
import { Badge, Button, Card, Empty, Field, Input, PageHeader, Pagination, Select, Skeleton, Stat, StatusBadge, Table, Tabs, Textarea, clsx } from "../ui";
import { LotImportModal } from "./LotImport";

type Tab = "overview" | "vehicles" | "bids" | "orders" | "enquiries" | "clients" | "feeds";

export function AuctionAdmin() {
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [importing, setImporting] = useState(false);
  const signal = useQuery({ queryKey: ["auction-overview"], queryFn: () => api.get<OverviewData>("/api/auction/admin/overview") }).data?.feed;
  const badges = useQuery({ queryKey: ["auction-badges"], queryFn: () => api.get<{ bids: number; enquiries: number }>("/api/auction/admin/badges"), refetchInterval: 60_000 }).data;
  const num = (n?: number) => (n ? ` (${n})` : "");
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
              Auctions →
            </Link>
            <Link to="/auction/statistics" className="inline-flex h-10 items-center rounded-xl bg-white px-4 text-sm font-semibold shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
              Past prices →
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
            ...(can("auction.bids.view") ? [{ value: "bids" as const, label: `Bids${num(badges?.bids)}` }] : []),
            ...(can("auction.enquiries.reply") ? [{ value: "enquiries" as const, label: `Enquiries${num(badges?.enquiries)}` }] : []),
            ...(can("auction.orders.manage") ? [{ value: "orders" as const, label: "Orders" }] : []),
            ...(can("auction.clients.view") ? [{ value: "clients" as const, label: "Clients" }] : []),
            ...(can("auction.lots.import") ? [{ value: "feeds" as const, label: "Data sources" }] : []),
          ]}
        />
      </div>
      {tab === "overview" && <Overview />}
      {tab === "vehicles" && <Vehicles />}
      {tab === "bids" && <Bids />}
      {tab === "orders" && <Orders />}
      {tab === "enquiries" && <Enquiries />}
      {tab === "clients" && <Clients />}
      {tab === "feeds" && <Feeds />}
      <LotImportModal open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}

interface OverviewData {
  lots: { upcoming: number; upcomingB: number; total: number };
  clients: number;
  pastResults: number;
  bids: { n: number; value: number; awaiting: number };
  orders: { n: number; pending: number; confirmed: number; pipeline: number };
  enquiries: { open: number };
  bidsByDay: { day: string; bids: number }[];
  topBidders: { name: string; email: string; bids: number; won: number; value: number; share: number }[];
  desk: { name: string; kind: string; lastSeenAt: string | null }[];
  funnel: { clients: number; enquired: number; bidders: number; orderers: number; bids: number; won: number; orders: number; paid: number };
  customerActions: { kind: string; name: string; at: string; lot_id: string; lot_no: number; make: string; model: string; amount: number | null }[];
  deskActions: { id: string; summary: string; at: string; name: string | null }[];
  recentBids: { id: string; bidNo: string | null; amountJpy: number; status: string; createdAt: string; who: string; lotId: string; lotNo: number; make: string; model: string }[];
  recentOrders: { id: string; orderNo: string; priceJpy: number; status: string; createdAt: string; who: string; lotId: string; lotNo: number; make: string; model: string }[];
  bidStates: { status: string; n: number }[];
  enquiryStates: { status: string; n: number }[];
  activity: { day: string; registrations: number; enquiries: number; bids: number }[];
  timeline: { kind: string; name: string; at: string; what: string; ref: string | null }[];
  journeys: { id: string; name: string; email: string; joined: string; enquiries: number; bids: number; offered: number; orders: number; last_seen: string }[];
  staff: { id: string; name: string; kind: string; is_active: boolean; last_seen_at: string | null; role: string | null; acts: number }[];
  deskKinds: { action: string; n: number }[];
  bidFlow: { name: string; counts: Record<string, number>; amount: number }[];
  roleReach: { name: string; perms: number }[];
  feed: { status: string; text: string; detail: string; newestAt: string | null };
}

function Vehicles() {
  const [f, setF] = useState({ q: "", status: "", hall: "", page: 1 });
  const halls = useQuery({ queryKey: ["ahalls"], queryFn: () => api.get<{ id: string; name: string }[]>("/api/auction/halls"), staleTime: 3600_000 });
  const q = useQuery({ queryKey: ["admin-vehicles", f], queryFn: () => api.get<{ items: { id: string; lotNo: number; saleDate: string; make: string; model: string; modelCode: string; year: number; mileageKm: number; grade: string; startPriceJpy: number; resultPriceJpy: number | null; status: string; hall: string; bids: number; image: string }[]; total: number; page: number; pageSize: number }>(`/api/auction/admin/vehicles${qs(f)}`), placeholderData: keepPreviousData });
  return (
    <div>
      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <Field label="Search">
          <Input key="vehicles-search" placeholder="Make, model, lot no., chassis model or number" defaultValue={f.q} onKeyDown={(e) => e.key === "Enter" && setF({ ...f, q: (e.target as HTMLInputElement).value, page: 1 })} onBlur={(e) => e.target.value !== f.q && setF({ ...f, q: e.target.value, page: 1 })} />
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
          <Table head={["", "Lot", "Vehicle", "Hall", "Sale date", "Mileage", "Grade", "Price", "Bids", "Status", ""]}>
            {q.data.items.map((l) => (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="px-3 py-2"><img src={l.image} alt="" loading="lazy" className="h-10 w-14 rounded-md bg-slate-100 object-cover" /></td>
                <td className="px-4 py-2 font-semibold">{l.lotNo}</td>
                <td className="px-4 py-2">
                  {l.year} {l.make} {l.model} <span className="text-xs text-slate-500">{l.modelCode}</span>
                </td>
                <td className="px-4 py-2 whitespace-nowrap">{l.hall}</td>
                <td className="px-4 py-2 whitespace-nowrap">{date(l.saleDate)}</td>
                <td className="px-4 py-2 whitespace-nowrap">{km(l.mileageKm)}</td>
                <td className="px-4 py-2">{l.grade}</td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {jpy(l.startPriceJpy)}
                  {l.resultPriceJpy ? <span className="block text-xs font-semibold text-emerald-700">{jpy(l.resultPriceJpy)}</span> : null}
                </td>
                <td className="px-4 py-2">{l.bids}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={l.status} />
                </td>
                <td className="px-4 py-2">
                  <Link className="font-semibold text-brand-700" to={`/auction/lots/${l.id}`} target="_blank">View</Link>
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

// ---------- small charts: fixed colour per entity, always with a label and a count beside the mark ----------
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];

function Bars({ rows, label, value, extra }: { rows: Record<string, unknown>[]; label: string; value: string; extra?: (r: Record<string, unknown>) => string }) {
  const max = Math.max(1, ...rows.map((r) => Number(r[value]) || 0));
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2 text-sm" title={`${String(r[label])}: ${String(r[value])}`}>
          <span className="w-28 shrink-0 truncate text-slate-600">{String(r[label])}</span>
          <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
            <span className="block h-full rounded-r bg-brand-500" style={{ width: `${(Number(r[value]) / max) * 100}%` }} />
          </span>
          <span className="w-16 shrink-0 text-right font-semibold whitespace-nowrap">
            {String(r[value])}
            {extra ? <span className="ml-1 text-xs font-normal text-slate-500">{extra(r)}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

/** One whole split into a few parts: the ring, and beside it the same numbers as words. */
function Ring({ rows, unit }: { rows: { status: string; n: number }[]; unit: string }) {
  const total = rows.reduce((a, r) => a + r.n, 0);
  const R = 42;
  const C = 2 * Math.PI * R;
  const gap = total ? 2 : 0;
  let at = 0;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 110 110" className="size-28 shrink-0" role="img" aria-label={`${total} ${unit}: ${rows.map((r) => `${r.n} ${r.status}`).join(", ")}`}>
        <circle cx="55" cy="55" r={R} fill="none" stroke="#f1f5f9" strokeWidth="13" />
        {rows.map((r, i) => {
          const len = total ? (r.n / total) * C : 0;
          const el = r.n ? (
            <circle key={r.status} cx="55" cy="55" r={R} fill="none" stroke={SERIES[i % SERIES.length]} strokeWidth="13" strokeDasharray={`${Math.max(0, len - gap)} ${C - Math.max(0, len - gap)}`} strokeDashoffset={-at} transform="rotate(-90 55 55)">
              <title>{`${r.status}: ${r.n}`}</title>
            </circle>
          ) : null;
          at += len;
          return el;
        })}
        <text x="55" y="53" textAnchor="middle" className="fill-slate-900 text-[20px] font-bold">{total}</text>
        <text x="55" y="68" textAnchor="middle" className="fill-slate-500 text-[11px]">{unit}</text>
      </svg>
      <ul className="min-w-32 flex-1 space-y-1 text-sm">
        {rows.map((r, i) => (
          <li key={r.status} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: SERIES[i % SERIES.length] }} />
            <span className="min-w-0 flex-1 truncate text-slate-600 capitalize">{r.status}</span>
            <span className="font-semibold">{r.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Thirty days stay on the axis, quiet ones included, so a quiet week looks quiet. */
function ActivityChart({ rows }: { rows: OverviewData["activity"] }) {
  const series = [
    { key: "registrations" as const, label: "Registrations", color: SERIES[0]! },
    { key: "enquiries" as const, label: "Enquiries", color: SERIES[1]! },
    { key: "bids" as const, label: "Bids", color: SERIES[2]! },
  ];
  const W = 640;
  const H = 150;
  const max = Math.max(1, ...rows.flatMap((r) => series.map((s) => r[s.key])));
  const x = (i: number) => 8 + (i / Math.max(1, rows.length - 1)) * (W - 16);
  const y = (v: number) => H - 18 - (v / max) * (H - 30);
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-3 text-xs text-slate-600">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: s.color }} /> {s.label}</span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Registrations, enquiries and bids per day for 30 days">
        <line x1="8" x2={W - 8} y1={H - 18} y2={H - 18} stroke="#e2e8f0" />
        <text x="8" y="10" className="fill-slate-400 text-[11px]">{max}</text>
        {series.map((s) => (
          <polyline key={s.key} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={rows.map((r, i) => `${x(i)},${y(r[s.key])}`).join(" ")} />
        ))}
        {rows.map((r, i) => (
          <rect key={r.day} x={x(i) - 10} y="0" width="20" height={H} fill="transparent">
            <title>{`${r.day}: ${r.registrations} registrations, ${r.enquiries} enquiries, ${r.bids} bids`}</title>
          </rect>
        ))}
        {rows.length > 0 && <text x="8" y={H - 4} className="fill-slate-400 text-[11px]">{rows[0]!.day.slice(5)}</text>}
        {rows.length > 0 && <text x={W - 8} y={H - 4} textAnchor="end" className="fill-slate-400 text-[11px]">{rows.at(-1)!.day.slice(5)}</text>}
      </svg>
      <details className="mt-1 text-sm">
        <summary className="cursor-pointer text-xs font-semibold text-slate-600">Show as a table</summary>
        <div className="scrollbar-thin mt-1 max-h-48 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-slate-500"><tr><th className="py-1">Day</th><th>Registrations</th><th>Enquiries</th><th>Bids</th></tr></thead>
            <tbody>
              {[...rows].reverse().filter((r) => r.registrations + r.enquiries + r.bids > 0).map((r) => (
                <tr key={r.day} className="border-t border-slate-100"><td className="py-1">{r.day}</td><td>{r.registrations}</td><td>{r.enquiries}</td><td>{r.bids}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

const VERB: Record<string, string> = { registered: "registered", enquired: "asked about", bid: "bid on", ordered: "ordered" };
const ACTION_NAMES: Record<string, string> = { "bid.status": "Bid status changed", "bid.note": "Note left on a bid", "bid.deleted": "Bid removed", "bid.placed": "Bid placed", "enquiry.open": "Enquiry opened", "enquiry.replied": "Enquiry answered", "enquiry.status": "Enquiry status changed", "order.status": "Order status changed", "order.created": "Order placed" };
const FLOW = ["placed", "under review", "accepted", "won", "rejected", "lost"];

function Overview() {
  const q = useQuery({ queryKey: ["auction-overview"], queryFn: () => api.get<OverviewData>("/api/auction/admin/overview") });
  if (!q.data) return <Skeleton className="h-60" />;
  const d = q.data;
  const reg = Math.max(1, d.funnel.clients);
  const a = d.lots.upcoming - d.lots.upcomingB;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <Stat label="Auction" value={d.lots.upcoming.toLocaleString("en-US")} hint={`${a.toLocaleString("en-US")} + ${d.lots.upcomingB.toLocaleString("en-US")} still to be auctioned`} icon={<Gavel className="size-5" />} />
        <Stat label="Past prices" value={d.pastResults.toLocaleString("en-US")} hint="past auction results" icon={<Activity className="size-5" />} />
        <Stat label="Clients" value={d.clients} icon={<Users className="size-5" />} />
        <Stat label="Bids" value={d.bids.n} hint={`Value ${jpy(d.bids.value)}`} icon={<Activity className="size-5" />} />
        <Stat label="Awaiting review" value={d.bids.awaiting} icon={<Inbox className="size-5" />} />
        <Stat label="Open enquiries" value={d.enquiries.open} icon={<Inbox className="size-5" />} />
      </div>
      <h2 className="pt-2 font-semibold text-slate-900">Customers</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <p className="mb-3 font-semibold">Every bid we hold</p>
          <Ring rows={d.bidStates} unit="bids" />
        </Card>
        <Card>
          <p className="mb-3 font-semibold">Every enquiry we hold</p>
          <Ring rows={d.enquiryStates} unit="enquiries" />
        </Card>
        <Card>
          <p className="mb-3 font-semibold">How far customers get <span className="font-normal text-slate-500">(people, not events)</span></p>
          <Bars rows={[{ step: "Registered", n: d.funnel.clients }, { step: "Enquired", n: d.funnel.enquired }, { step: "Bid", n: d.funnel.bidders }, { step: "Ordered", n: d.funnel.orderers }]} label="step" value="n" extra={(r) => `${Math.round((Number(r.n) / reg) * 100)}%`} />
        </Card>
        <Card padded={false}>
          <p className="px-5 pt-5 font-semibold">Who bids most</p>
          {d.topBidders.length ? (
            <div className="scrollbar-thin overflow-x-auto">
              <table className="mt-2 w-full min-w-[420px] text-sm">
                <thead className="text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="px-5 py-2">Customer</th>
                    <th className="px-3 py-2 text-right">Bids</th>
                    <th className="px-3 py-2 text-right">Won</th>
                    <th className="px-3 py-2 text-right">Share</th>
                    <th className="px-5 py-2 text-right">Total offered</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {d.topBidders.map((b) => (
                    <tr key={b.name}>
                      <td className="px-5 py-2 font-medium text-slate-900">{b.name}<span className="block text-xs font-normal text-slate-500">{b.email}</span></td>
                      <td className="px-3 py-2 text-right">{b.bids}</td>
                      <td className="px-3 py-2 text-right">{b.won}</td>
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
      </div>
      <Card>
        <p className="mb-3 font-semibold">Activity, last 30 days</p>
        <ActivityChart rows={d.activity} />
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <p className="mb-3 font-semibold">What customers have been doing</p>
          {d.timeline.length ? (
            <ol className="space-y-2 text-sm">
              {d.timeline.map((t, i) => (
                <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="min-w-0">
                    <strong className="text-slate-900">{t.name}</strong> {VERB[t.kind] ?? t.kind} <span className="text-slate-600">{t.what}</span>{" "}
                    {t.kind === "bid" && t.ref ? <Link className="font-semibold text-brand-700" to={`/auction/lots/${t.ref}`}>Open</Link> : null}
                    {t.kind === "enquired" && t.ref ? <Link className="font-semibold text-brand-700" to={`/auction/admin/enquiries/${t.ref}`}>Open</Link> : null}
                  </span>
                  <span className="text-xs whitespace-nowrap text-slate-500">{ago(t.at)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-slate-500">Nothing yet.</p>
          )}
        </Card>
        <Card>
          <p className="mb-3 font-semibold">What the desk has been doing <span className="font-normal text-slate-500">(last 30 days)</span></p>
          {d.deskKinds.length ? (
            <Bars rows={d.deskKinds.map((k) => ({ action: ACTION_NAMES[k.action] ?? k.action, n: k.n }))} label="action" value="n" />
          ) : (
            <p className="text-sm text-slate-500">Nothing recorded yet.</p>
          )}
          {d.deskActions.length > 0 && (
            <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-sm">
              {d.deskActions.slice(0, 6).map((x) => (
                <li key={x.id} className="flex flex-wrap justify-between gap-x-3">
                  <span className="min-w-0 text-slate-800">{x.summary}</span>
                  <span className="text-xs whitespace-nowrap text-slate-500">{ago(x.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <div>
        <p className="mb-2 font-semibold text-slate-900">Every customer, start to finish</p>
        <Table head={["Customer", "Joined", "Enquiries", "Bids", "Offered", "Orders", "How far", "Last seen"]}>
          {d.journeys.map((j) => {
            const reached = 1 + (j.enquiries > 0 ? 1 : 0) + (j.bids > 0 ? 1 : 0) + (j.orders > 0 ? 1 : 0);
            return (
              <tr key={j.id}>
                <td className="px-4 py-2 font-medium">{j.name}<span className="block text-xs font-normal text-slate-500">{j.email}</span></td>
                <td className="px-4 py-2 whitespace-nowrap">{date(j.joined)}</td>
                <td className="px-4 py-2">{j.enquiries}</td>
                <td className="px-4 py-2">{j.bids}</td>
                <td className="px-4 py-2 whitespace-nowrap">{jpy(j.offered)}</td>
                <td className="px-4 py-2">{j.orders}</td>
                <td className="px-4 py-2">
                  <span className="flex gap-1" title={`${reached} of 4: registered, enquired, bid, ordered`}>
                    {[1, 2, 3, 4].map((n) => <i key={n} className={clsx("size-2.5 rounded-full", n <= reached ? "bg-brand-500" : "bg-slate-200")} />)}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs whitespace-nowrap">{ago(j.last_seen)}</td>
              </tr>
            );
          })}
        </Table>
      </div>
      <h2 className="pt-2 font-semibold text-slate-900">The desk</h2>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <Table head={["Person", "Role", "Last seen", "Actions, 30 days"]}>
            {d.staff.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2 font-medium whitespace-nowrap">{p.kind === "fte" ? <span className="inline-flex items-center gap-1 text-violet-700"><Bot className="size-4" /> {p.name}</span> : p.name}</td>
                <td className="px-4 py-2">{p.role ?? "—"}</td>
                <td className="px-4 py-2 text-xs whitespace-nowrap">{p.last_seen_at ? ago(p.last_seen_at) : "never"}</td>
                <td className="px-4 py-2">{p.is_active ? p.acts : <span className="text-xs text-slate-500">switched off</span>}</td>
              </tr>
            ))}
          </Table>
        </div>
        <Card>
          <p className="mb-3 font-semibold">How far each role reaches <span className="font-normal text-slate-500">(permissions)</span></p>
          <Bars rows={d.roleReach} label="name" value="perms" />
        </Card>
      </div>
      <h2 className="pt-2 font-semibold text-slate-900">Bids</h2>
      <div>
        <p className="mb-2 font-semibold text-slate-900">Every customer's bids, and how they went</p>
        <Table head={["Customer", "Bids", ...FLOW.map((x) => x[0]!.toUpperCase() + x.slice(1)), "Offered"]}>
          {d.bidFlow.map((f) => (
            <tr key={f.name}>
              <td className="px-4 py-2 font-medium whitespace-nowrap">{f.name}</td>
              <td className="px-4 py-2 font-semibold">{Object.values(f.counts).reduce((a2, b) => a2 + b, 0)}</td>
              {FLOW.map((st) => <td key={st} className="px-4 py-2">{f.counts[st] ?? 0}</td>)}
              <td className="px-4 py-2 whitespace-nowrap">{jpy(f.amount)}</td>
            </tr>
          ))}
        </Table>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <p className="mb-3 font-semibold">Bids by day</p>
          {d.bidsByDay.length ? <Bars rows={d.bidsByDay} label="day" value="bids" /> : <p className="text-sm text-slate-500">No bids yet.</p>}
        </Card>
        <Card>
          <p className="mb-3 font-semibold">Recent bids</p>
          <ul className="space-y-2 text-sm">
            {d.recentBids.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <Link className="min-w-0 font-medium text-brand-700" to={`/auction/lots/${b.lotId}`}>
                  {b.bidNo ?? "Bid"} · Lot {b.lotNo} · {b.make} {b.model}
                </Link>
                <span className="flex items-center gap-2 text-xs text-slate-600">
                  {b.who} · <strong>{jpy(b.amountJpy)}</strong> <StatusBadge status={b.status} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <h2 className="pt-2 font-semibold text-slate-900">Orders</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Orders" value={d.orders.n} icon={<ShoppingBag className="size-5" />} />
        <Stat label="Pending orders" value={d.orders.pending} icon={<ShoppingBag className="size-5" />} />
        <Stat label="Pipeline value" value={jpy(d.orders.pipeline)} icon={<ShoppingBag className="size-5" />} />
        <Stat label="Confirmed revenue" value={jpy(d.orders.confirmed)} icon={<ShoppingBag className="size-5" />} />
      </div>
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
  );
}

const STATES = ["placed", "under review", "accepted", "won", "rejected", "lost"];

interface BidRow {
  id: string;
  bidNo: string | null;
  amountJpy: number;
  overBidJpy: number | null;
  message: string | null;
  status: string;
  note: string | null;
  createdAt: string;
  who: string;
  whoEmail: string | null;
  whoKind: string;
  lot: { id: string; lotNo: number; make: string; model: string; year: number; saleDate: string; hall: string };
}

function BidNote({ b }: { b: BidRow }) {
  const qc = useQueryClient();
  const [note, setNote] = useState(b.note ?? "");
  return (
    <Input
      aria-label={`Note on ${b.bidNo ?? "this bid"}`}
      className="min-w-32"
      placeholder="note"
      value={note}
      onChange={(e) => setNote(e.target.value)}
      onBlur={async () => {
        if (note === (b.note ?? "")) return;
        await api.put(`/api/auction/admin/bids/${b.id}`, { note });
        await qc.invalidateQueries({ queryKey: ["admin-bids"] });
      }}
    />
  );
}

function Bids() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [day, setDay] = useState("");
  const [status, setStatus] = useState("");
  const q = useQuery({ queryKey: ["admin-bids", day, status], queryFn: () => api.get<{ day: string; isToday: boolean; total: number; accepted: number; counts: { status: string; n: number }[]; items: BidRow[] }>(`/api/auction/admin/bids${qs({ day, status })}`), placeholderData: keepPreviousData });
  const d = q.data;
  const label = d?.isToday ? "today" : d?.day;
  return (
    <div>
      <p className="mb-3 text-sm text-slate-500">{can("auction.bids.view_all") ? "Every bid placed on the auction list, by customers and by staff." : "Only your own bids (your role does not include seeing all bids)."}</p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          Day
          <Input type="date" aria-label="Day" className="w-40" value={d?.day ?? ""} max={new Date().toISOString().slice(0, 10)} onChange={(e) => { setDay(e.target.value); setStatus(""); }} />
        </label>
        {d && !d.isToday && (
          <Button size="sm" variant="secondary" onClick={() => { setDay(""); setStatus(""); }}>Today</Button>
        )}
        <button onClick={() => setStatus("")} aria-pressed={!status} className={clsx("rounded-xl px-3 py-1.5 text-sm font-semibold", !status ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200")}>All ({d?.total ?? 0})</button>
        {d?.counts.filter((c) => c.n > 0).map((c) => (
          <button key={c.status} onClick={() => setStatus(c.status)} aria-pressed={status === c.status} className={clsx("rounded-xl px-3 py-1.5 text-sm font-semibold capitalize", status === c.status ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200")}>{c.status} ({c.n})</button>
        ))}
        {can("auction.bids.export") && (
          <a href={`/api/auction/admin/bids.xlsx${qs({ day: d?.day })}`} className="ml-auto inline-flex h-9 items-center gap-2 rounded-xl bg-brand-600 px-3 text-sm font-semibold text-white hover:bg-brand-700">
            <Download className="size-4" /> Export accepted, {label} ({d?.accepted ?? 0})
          </a>
        )}
      </div>
      {!d ? (
        <Skeleton className="h-60" />
      ) : !d.items.length ? (
        <Empty title={d.total ? `No ${status} bids on this day` : d.isToday ? "No bids today" : `No bids on ${d.day}`} text={d.total ? undefined : "Pick another date above to look back."} />
      ) : (
        <Table head={can("auction.bids.manage") ? ["Bid", "Bidder", "Lot", "Vehicle", "Amount", "Placed", "Status", "Note", ""] : ["Bid", "Bidder", "Lot", "Vehicle", "Amount", "Placed", "Status", "Note"]}>
          {d.items.map((b) => (
            <tr key={b.id}>
              <td className="px-4 py-2 text-xs font-semibold whitespace-nowrap">{b.bidNo ?? "—"}</td>
              <td className="px-4 py-2 whitespace-nowrap">
                {b.whoKind === "fte" ? <span className="inline-flex items-center gap-1 font-semibold text-violet-700"><Bot className="size-4" /> {b.who}</span> : b.who}
                {b.whoKind === "staff" && <Badge tone="gray">staff</Badge>}
                <span className="block text-xs text-slate-500">{b.whoEmail}</span>
              </td>
              <td className="px-4 py-2">
                {b.lot.lotNo}
                <p className="text-xs text-slate-500">{b.lot.hall} · {date(b.lot.saleDate)}</p>
              </td>
              <td className="px-4 py-2">
                <Link className="font-medium text-brand-700" to={`/auction/lots/${b.lot.id}`} target="_blank">{b.lot.make} {b.lot.model}</Link> <span className="text-xs text-slate-500">{b.lot.year}</span>
                {b.message && <p className="text-xs text-slate-500">"{b.message}"</p>}
              </td>
              <td className="px-4 py-2 font-semibold whitespace-nowrap">{jpy(b.amountJpy)}{b.overBidJpy ? <span className="block text-xs font-normal text-slate-500">over {jpy(b.overBidJpy)}</span> : null}</td>
              <td className="px-4 py-2 text-xs whitespace-nowrap">{ago(b.createdAt)}</td>
              <td className="px-4 py-2">
                {can("auction.bids.manage") ? (
                  <Select
                    aria-label={`Status of ${b.bidNo ?? "this bid"}`}
                    className="min-w-32"
                    value={b.status}
                    onChange={async (e) => {
                      await api.put(`/api/auction/admin/bids/${b.id}`, { status: e.target.value });
                      await qc.invalidateQueries({ queryKey: ["admin-bids"] });
                    }}
                  >
                    {STATES.map((s) => <option key={s} value={s}>{s[0]!.toUpperCase() + s.slice(1)}</option>)}
                  </Select>
                ) : (
                  <StatusBadge status={b.status} />
                )}
              </td>
              <td className="px-4 py-2">{can("auction.bids.manage") ? <BidNote key={`${b.id}-${b.note ?? ""}`} b={b} /> : <span className="text-xs text-slate-600">{b.note}</span>}</td>
              {can("auction.bids.manage") && (
                <td className="px-4 py-2 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={b.status === "won"}
                    title={b.status === "won" ? "A won bid has an order behind it" : undefined}
                    aria-label={`Delete bid on lot ${b.lot.lotNo}`}
                    onClick={async () => {
                      if (!window.confirm(`Delete bid ${b.bidNo ?? ""} on lot ${b.lot.lotNo}? This cannot be undone.`)) return;
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

function Chips({ all, counts, value, onChange }: { all: number; counts: { status: string; n: number }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      <button onClick={() => onChange("")} aria-pressed={!value} className={clsx("rounded-xl px-3 py-1.5 text-sm font-semibold", !value ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200")}>All ({all})</button>
      {counts.filter((c) => c.n > 0).map((c) => (
        <button key={c.status} onClick={() => onChange(c.status)} aria-pressed={value === c.status} className={clsx("rounded-xl px-3 py-1.5 text-sm font-semibold capitalize", value === c.status ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200")}>{c.status} ({c.n})</button>
      ))}
    </div>
  );
}

function Orders() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const q = useQuery({ queryKey: ["admin-orders", status], queryFn: () => api.get<{ total: number; counts: { status: string; n: number }[]; items: { id: string; orderNo: string; status: string; priceJpy: number | null; createdAt: string; who: string; email: string | null; lot: { id: string; lotNo: number; make: string; model: string; year: number } }[] }>(`/api/auction/admin/orders${qs({ status })}`), placeholderData: keepPreviousData });
  if (!q.data) return <Skeleton className="h-60" />;
  return (
    <div>
      <Chips all={q.data.total} counts={q.data.counts} value={status} onChange={setStatus} />
      {!q.data.items.length ? (
        <Empty title="No orders here" />
      ) : (
        <Table head={["Order", "Client", "Vehicle", "Amount", "Placed", "Status"]}>
          {q.data.items.map((o) => (
            <tr key={o.id}>
              <td className="px-4 py-2 font-semibold whitespace-nowrap">{o.orderNo}</td>
              <td className="px-4 py-2">{o.who}<span className="block text-xs text-slate-500">{o.email}</span></td>
              <td className="px-4 py-2">
                <Link className="font-medium text-brand-700" to={`/auction/lots/${o.lot.id}`} target="_blank">{o.lot.make} {o.lot.model}</Link> <span className="text-xs text-slate-500">{o.lot.year} · lot {o.lot.lotNo}</span>
              </td>
              <td className="px-4 py-2 whitespace-nowrap">{jpy(o.priceJpy)}</td>
              <td className="px-4 py-2 text-xs whitespace-nowrap">{ago(o.createdAt)}</td>
              <td className="px-4 py-2">
                <Select
                  aria-label={`Status of ${o.orderNo}`}
                  className="min-w-36"
                  value={o.status}
                  onChange={async (e) => {
                    await api.put(`/api/auction/admin/orders/${o.id}`, { status: e.target.value });
                    await qc.invalidateQueries({ queryKey: ["admin-orders"] });
                  }}
                >
                  {["pending", "approved", "confirmed", "paid", "shipped", "delivered", "completed", "cancelled"].map((s) => (
                    <option key={s} value={s}>{s[0]!.toUpperCase() + s.slice(1)}</option>
                  ))}
                </Select>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

function Enquiries() {
  const [status, setStatus] = useState("");
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["admin-enq", status], queryFn: () => api.get<{ total: number; counts: { status: string; n: number }[]; items: { id: string; enqNo: string; message: string; reply: string | null; status: string; createdAt: string; who: string; email: string | null; lot: { id: string; lotNo: number; make: string; model: string } }[] }>(`/api/auction/admin/enquiries${qs({ status })}`), placeholderData: keepPreviousData });
  if (!q.data) return <Skeleton className="h-60" />;
  return (
    <div>
      <Chips all={q.data.total} counts={q.data.counts} value={status} onChange={setStatus} />
      {!q.data.items.length ? (
        <Empty title="No enquiries here yet" />
      ) : (
        <Table head={["Enquiry", "Client", "Vehicle", "Question", "Asked", "Status"]}>
          {q.data.items.map((e) => (
            <tr key={e.id} className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/auction/admin/enquiries/${e.id}`)}>
              <td className="px-4 py-2 font-semibold whitespace-nowrap"><Link className="text-brand-700" to={`/auction/admin/enquiries/${e.id}`}>{e.enqNo}</Link></td>
              <td className="px-4 py-2">{e.who}<span className="block text-xs text-slate-500">{e.email}</span></td>
              <td className="px-4 py-2">{e.lot.make} {e.lot.model} <span className="text-xs text-slate-500">lot {e.lot.lotNo}</span></td>
              <td className="max-w-72 truncate px-4 py-2 text-slate-600">{e.message}</td>
              <td className="px-4 py-2 text-xs whitespace-nowrap">{ago(e.createdAt)}</td>
              <td className="px-4 py-2"><StatusBadge status={e.status} /></td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

export function AuctionEnquiryPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-enq-one", id], queryFn: () => api.get<{ enquiry: { id: string; enqNo: string; message: string; reply: string | null; status: string; createdAt: string; repliedAt: string | null }; repliedByName: string | null; repliedByKind: string | null; client: { name: string; email: string | null; phone: string | null }; lot: { id: string; lotNo: number; make: string; model: string; year: number; grade: string; hall: string; saleDate: string }; others: { id: string; enqNo: string; status: string; createdAt: string; make: string; model: string }[] }>(`/api/auction/admin/enquiries/${id}`) });
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (q.isLoading) return <Skeleton className="h-96" />;
  if (!q.data) return <Empty title="No enquiry with that number" text="It may have been removed." action={<Link className="font-semibold text-brand-700" to="/auction/admin">Back to the auction admin</Link>} />;
  const d = q.data;
  const e = d.enquiry;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Link to="/auction/admin" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700">
          <ChevronLeft className="size-4" /> Auction admin
        </Link>
        <StatusBadge status={e.status} />
      </div>
      <h1 className="mb-4 text-2xl font-bold text-slate-900">Enquiry {e.enqNo}</h1>
      {msg && <p role="status" className={clsx("mb-3 rounded-xl px-3 py-2 text-sm", msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700")}>{msg.text}</p>}
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <p className="mb-3 font-semibold text-slate-900">The conversation</p>
          <div className="space-y-3">
            <div className="rounded-2xl rounded-tl-md bg-slate-50 p-3 text-sm ring-1 ring-slate-100">
              <p className="flex flex-wrap justify-between gap-2 text-xs font-semibold text-slate-700"><span>{d.client.name}</span><span className="font-normal text-slate-500">{dateTime(e.createdAt)}</span></p>
              <p className="mt-1 whitespace-pre-wrap text-slate-800">{e.message}</p>
            </div>
            {e.reply ? (
              <div className="ml-6 rounded-2xl rounded-tr-md bg-emerald-50 p-3 text-sm ring-1 ring-emerald-100">
                <p className="flex flex-wrap justify-between gap-2 text-xs font-semibold text-emerald-900">
                  <span className="inline-flex items-center gap-1">{d.repliedByKind === "fte" && <Bot className="size-3.5" />} {d.repliedByName ?? "The desk"}</span>
                  <span className="font-normal text-emerald-800">{e.repliedAt ? dateTime(e.repliedAt) : ""}</span>
                </p>
                <p className="mt-1 whitespace-pre-wrap text-emerald-950">{e.reply}</p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No reply sent yet.</p>
            )}
          </div>
          <form
            className="mt-4 space-y-2"
            onSubmit={async (ev) => {
              ev.preventDefault();
              setMsg(null);
              try {
                const r = await api.post<{ status: string }>(`/api/auction/admin/enquiries/${e.id}/reply`, { reply: text || undefined, status: status || undefined });
                setText("");
                setStatus("");
                setMsg({ ok: true, text: text ? "Reply saved and sent to the client." : `Enquiry set to ${r.status}.` });
                await qc.invalidateQueries();
              } catch (ex) {
                setMsg({ ok: false, text: (ex as Error).message });
              }
            }}
          >
            <Textarea aria-label="Reply" rows={4} value={text} onChange={(ev) => setText(ev.target.value)} placeholder={e.reply ? "Replace the reply…" : "Write your reply…"} />
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-40">
                <Select aria-label="Status" value={status || e.status} onChange={(ev) => setStatus(ev.target.value)}>
                  {["open", "answered", "closed"].map((s) => <option key={s} value={s}>{s[0]!.toUpperCase() + s.slice(1)}</option>)}
                </Select>
              </div>
              <Button type="submit" disabled={!text.trim() && !status}>Save</Button>
            </div>
          </form>
        </Card>
        <div className="space-y-4">
          <Card>
            <p className="mb-2 font-semibold text-slate-900">Client</p>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Name</dt><dd className="font-medium">{d.client.name}</dd></div>
              {d.client.email && <div className="flex justify-between gap-3"><dt className="text-slate-500">E-mail</dt><dd className="min-w-0 truncate"><a className="text-brand-700" href={`mailto:${d.client.email}`}>{d.client.email}</a></dd></div>}
              {d.client.phone && <div className="flex justify-between gap-3"><dt className="text-slate-500">Phone</dt><dd>{d.client.phone}</dd></div>}
            </dl>
          </Card>
          <Card>
            <p className="mb-2 font-semibold text-slate-900">Vehicle</p>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Vehicle</dt><dd><Link className="font-medium text-brand-700" to={`/auction/lots/${d.lot.id}`} target="_blank">{d.lot.make} {d.lot.model}</Link></dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Year</dt><dd>{d.lot.year}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Grade</dt><dd>{d.lot.grade}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Lot</dt><dd>{d.lot.lotNo}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Hall</dt><dd>{d.lot.hall}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Auction</dt><dd>{date(d.lot.saleDate)}</dd></div>
            </dl>
          </Card>
          {d.others.length > 0 && (
            <Card>
              <p className="mb-2 font-semibold text-slate-900">Their other enquiries ({d.others.length})</p>
              <ul className="space-y-1.5 text-sm">
                {d.others.map((o) => (
                  <li key={o.id} className="flex flex-wrap justify-between gap-2">
                    <Link className="font-medium text-brand-700" to={`/auction/admin/enquiries/${o.id}`}>{o.make} {o.model}</Link>
                    <span className="text-xs text-slate-500">{date(o.createdAt)} · {o.status}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Clients() {
  const q = useQuery({ queryKey: ["admin-clients"], queryFn: () => api.get<{ registered: number; withOrders: number; totalOrderValue: number; items: { id: string; name: string; email: string; phone: string; countryCode: string; company: string; isActive: boolean; createdAt: string; bids: number; orders: number; orderValue: number; enquiries: number }[] }>("/api/auction/admin/clients") });
  if (!q.data) return <Skeleton className="h-60" />;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Registered" value={q.data.registered} icon={<Users className="size-5" />} />
        <Stat label="With orders" value={q.data.withOrders} icon={<ShoppingBag className="size-5" />} />
        <Stat label="Total order value" value={jpy(q.data.totalOrderValue)} icon={<ShoppingBag className="size-5" />} />
      </div>
      <Table head={["Client", "Phone", "Company", "Country", "Bids", "Orders", "Order value", "Enquiries", "Joined", "Status"]}>
        {q.data.items.map((c) => (
          <tr key={c.id}>
            <td className="px-4 py-2">
              <p className="font-semibold whitespace-nowrap">{c.name}</p>
              <p className="text-xs text-slate-500">{c.email}</p>
            </td>
            <td className="px-4 py-2 whitespace-nowrap">{c.phone || "—"}</td>
            <td className="px-4 py-2">{c.company}</td>
            <td className="px-4 py-2">{c.countryCode}</td>
            <td className="px-4 py-2">{c.bids}</td>
            <td className="px-4 py-2">{c.orders}</td>
            <td className="px-4 py-2 whitespace-nowrap">{c.orderValue > 0 ? jpy(c.orderValue) : "—"}</td>
            <td className="px-4 py-2">{c.enquiries}</td>
            <td className="px-4 py-2 text-xs whitespace-nowrap">{date(c.createdAt)}</td>
            <td className="px-4 py-2">{c.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Disabled</Badge>}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

/** Where the lots come from. In this demo that is two made-up feeds; a real business would see its suppliers here. */
function Feeds() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-feeds"], queryFn: () => api.get<{ status: string; text: string; everyMinutes: number; feeds: { key: string; onSale: number; newestAt: string | null; paused: boolean; lastAt: string | null; added: number; working: boolean }[] }>("/api/auction/admin/feeds"), refetchInterval: 30_000 });
  const [msg, setMsg] = useState<string | null>(null);
  if (!q.data) return <Skeleton className="h-40" />;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin-feeds"] });
    void qc.invalidateQueries({ queryKey: ["auction-overview"] });
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        <strong className={q.data.status === "working" ? "text-emerald-700" : "text-rose-700"}>{q.data.text}.</strong> Two demo feeds bring new lots of fictional cars {q.data.everyMinutes > 0 ? `every ${q.data.everyMinutes} minutes` : "only when you run them"}. A real business would connect its own auction suppliers here.
      </p>
      {msg && <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {q.data.feeds.map((f) => (
          <Card key={f.key}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-slate-900">Feed {f.key}</p>
              <span className={clsx("inline-flex items-center gap-1.5 text-sm font-semibold", f.working ? "text-emerald-700" : "text-rose-700")}>
                <span className={clsx("size-2 rounded-full", f.working ? "bg-emerald-500" : "bg-rose-500")} /> {f.working ? "Working" : "Not working"}
              </span>
            </div>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Lots on sale from it</dt><dd className="font-semibold">{f.onSale.toLocaleString("en-US")}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Newest lot</dt><dd>{f.newestAt ? ago(f.newestAt) : "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Last run</dt><dd>{f.lastAt ? ago(f.lastAt) : "not yet"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Added since the demo started</dt><dd>{f.added}</dd></div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  await api.put(`/api/auction/admin/feeds/${f.key}`, { paused: !f.paused });
                  setMsg(`Feed ${f.key} ${f.paused ? "restarted" : "paused"}.`);
                  refresh();
                }}
              >
                {f.paused ? <Play className="size-4" /> : <Pause className="size-4" />} {f.paused ? "Restart" : "Pause"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={f.paused}
                onClick={async () => {
                  const r = await api.post<{ added: number }>(`/api/auction/admin/feeds/${f.key}/run`);
                  setMsg(`Feed ${f.key} brought ${r.added} new lot(s).`);
                  refresh();
                }}
              >
                Run now
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
