import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, ChevronLeft, Download, FileText, Gavel, History, Search, X, ZoomIn } from "lucide-react";
import { api, qs } from "../lib/api";
import { useAuth } from "../lib/auth";
import { date, jpy, km } from "../lib/format";
import { Badge, Button, Card, Empty, Field, Input, Modal, Pagination, Select, Skeleton, Table, Tabs, Textarea, clsx } from "../ui";
import { openChatWith } from "../chat/ChatWidget";
import { FteName, useFte } from "../lib/site";

interface Lot {
  id: string;
  saleDate: string;
  lotNo: number;
  hall: string;
  hallCode: string;
  make: string;
  model: string;
  modelCode: string;
  bodyType: string;
  grade: string;
  interiorGrade: string;
  year: number;
  color: string;
  transmission: string;
  fuel: string;
  drive: string;
  mileageKm: number;
  engineCc: number;
  equipment: string;
  startPriceJpy: number;
  avgPriceJpy: number | null;
  status: string;
  resultPriceJpy: number | null;
  highBidJpy: number | null;
  image?: string;
}
type FacetRow = { v: string; n: number; name?: string };
interface Facets {
  saleDates: FacetRow[];
  makes: FacetRow[];
  models: FacetRow[];
  modelCodes: FacetRow[];
  halls: FacetRow[];
  grades: FacetRow[];
  colors: FacetRow[];
  transmissions: FacetRow[];
}

const KEYS = ["saleDate", "make", "model", "modelCode", "hall", "grade", "color", "transmission", "lots", "yearMin", "mileageMax", "priceMax", "sort", "status", "page"] as const;

function AuctionGate({ children }: { children: React.ReactNode }) {
  const { me, loading, can } = useAuth();
  if (loading) return <div className="container-page py-16"><Skeleton className="h-40" /></div>;
  if (!me || !can("auction.access"))
    return (
      <div className="container-page py-16">
        <Empty icon={<Gavel className="size-8" />} title="The auction is for registered buyers" text="Sign in or create a free account to see this week's lots, auction sheets and past prices." action={<div className="flex gap-2"><Link to="/login" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Sign in</Link><Link to="/register" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold ring-1 ring-slate-200">Register</Link></div>} />
      </div>
    );
  return <>{children}</>;
}

function AuctionNav() {
  const items = [
    { to: "/auction", label: "Choose a car" },
    { to: "/auction/list", label: "All lots" },
    { to: "/auction/statistics", label: "Past prices" },
    { to: "/auction/me", label: "My bids & orders" },
  ];
  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="container-page scrollbar-thin flex gap-1 overflow-x-auto py-2">
        {items.map((i) => (
          <Link key={i.to} to={i.to} className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900">
            {i.label}
          </Link>
        ))}
        <span className="ml-auto hidden shrink-0 items-center gap-1 text-xs text-emerald-700 sm:flex">
          <span className="size-2 rounded-full bg-emerald-500" /> Auction is working
        </span>
      </div>
    </div>
  );
}

/** Welcome: pick a maker, then a model, then the list. */
export function AuctionWelcome() {
  const [make, setMake] = useState<string | null>(null);
  const nav = useNavigate();
  const f = useQuery({ queryKey: ["afacets", make], queryFn: () => api.get<Facets>(`/api/auction/facets${qs({ make })}`) });
  return (
    <AuctionGate>
      <AuctionNav />
      <div className="container-page py-8">
        <h1 className="text-2xl font-bold text-slate-900">This week's auctions</h1>
        <p className="text-sm text-slate-500">Choose a manufacturer, then a model. Every lot has its inspection sheet — or ask <FteName /> to read it for you.</p>
        <form
          className="mt-4 flex max-w-xl gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = new FormData(e.currentTarget).get("q") as string;
            if (v.trim()) nav(/^[\d,\s]+$/.test(v) ? `/auction/list?lots=${encodeURIComponent(v)}` : `/auction/list?modelCode=${encodeURIComponent(v.trim())}`);
          }}
        >
          <Input name="q" placeholder="Lot number(s) e.g. 4522, 6155 — or chassis code e.g. GDJ150W" />
          <Button type="submit">
            <Search className="size-4" /> Find
          </Button>
        </form>
        {!make ? (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {f.data?.makes.map((m) => (
              <button key={m.v} onClick={() => setMake(m.v)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-brand-300 hover:shadow">
                <p className="font-semibold text-slate-900">{m.v}</p>
                <p className="text-sm text-slate-500">{m.n} lots</p>
              </button>
            ))}
            {f.isLoading && Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
          </div>
        ) : (
          <div className="mt-6">
            <button onClick={() => setMake(null)} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
              <ChevronLeft className="size-4" /> All manufacturers
            </button>
            <h2 className="mb-3 text-lg font-semibold">{make} models</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <Link to={`/auction/list?make=${encodeURIComponent(make)}`} className="rounded-2xl border border-brand-200 bg-brand-50 p-4 font-semibold text-brand-700">
                All {make} →
              </Link>
              {f.data?.models.map((m) => (
                <Link key={m.v} to={`/auction/list?make=${encodeURIComponent(make)}&model=${encodeURIComponent(m.v)}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-brand-300">
                  <p className="font-semibold text-slate-900">{m.v}</p>
                  <p className="text-sm text-slate-500">{m.n} lots</p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </AuctionGate>
  );
}

export function AuctionList() {
  const fte = useFte();
  const { can } = useAuth();
  const [sp, setSp] = useSearchParams();
  const params = useMemo(() => Object.fromEntries(KEYS.map((k) => [k, sp.get(k) ?? ""])) as Record<(typeof KEYS)[number], string>, [sp]);
  const facets = useQuery({ queryKey: ["afacets-list", params], queryFn: () => api.get<Facets>(`/api/auction/facets${qs({ ...params, page: undefined })}`), placeholderData: keepPreviousData });
  const list = useQuery({ queryKey: ["alots", params], queryFn: () => api.get<{ items: Lot[]; total: number; page: number; pageSize: number }>(`/api/auction/lots${qs(params)}`), placeholderData: keepPreviousData });
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    if (v && n.get(k) !== v) n.set(k, v);
    else n.delete(k);
    if (k !== "page") n.delete("page");
    if (k === "make") {
      n.delete("model");
      n.delete("modelCode");
    }
    if (k === "model") n.delete("modelCode");
    setSp(n); // one history entry per tick: Back removes exactly one filter
  };
  const facet = (title: string, key: (typeof KEYS)[number], rows: FacetRow[] | undefined, label?: (r: FacetRow) => string) =>
    rows && rows.length > 0 ? (
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
        <div className="scrollbar-thin max-h-44 space-y-0.5 overflow-y-auto pr-1">
          {rows.map((r) => (
            <label key={r.v} className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm hover:bg-slate-50">
              <span className="flex min-w-0 items-center gap-2">
                <input type="checkbox" checked={params[key] === r.v} onChange={() => set(key, r.v)} className="accent-brand-600" />
                <span className="truncate">{label ? label(r) : r.v}</span>
              </span>
              <span className="text-xs text-slate-400">{r.n}</span>
            </label>
          ))}
        </div>
      </div>
    ) : null;
  const active = KEYS.filter((k) => !["page", "sort", "status"].includes(k) && params[k]);
  return (
    <AuctionGate>
      <AuctionNav />
      <div className="container-page py-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Auction lots</h1>
            <p className="text-sm text-slate-500">{list.data ? `${list.data.total.toLocaleString("en-US")} lots` : "…"} · demo data from fictional auction halls</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {can("auction.lots.view_sold") && (
              <Select className="w-40" value={params.status} onChange={(e) => set("status", e.target.value)}>
                <option value="">Upcoming</option>
                <option value="concluded">Concluded (archive)</option>
                <option value="all">All</option>
              </Select>
            )}
            <Select className="w-44" value={params.sort} onChange={(e) => set("sort", e.target.value)}>
              <option value="">Sale date / lot</option>
              <option value="price_asc">Start price ↑</option>
              <option value="price_desc">Start price ↓</option>
              <option value="year_desc">Year: newest</option>
              <option value="mileage_asc">Mileage: lowest</option>
            </Select>
          </div>
        </div>
        {active.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {active.map((k) => (
              <button key={k} onClick={() => set(k, "")} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">
                {k}: {k === "hall" ? facets.data?.halls.find((h) => h.v === params.hall)?.name ?? params[k] : params[k]} <X className="size-3" />
              </button>
            ))}
          </div>
        )}
        <div className="grid gap-5 lg:grid-cols-[16rem_1fr]">
          <aside className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-20 lg:self-start">
            <Input placeholder="Lot no(s): 4522, 6155" defaultValue={params.lots} key={params.lots} onKeyDown={(e) => e.key === "Enter" && set("lots", (e.target as HTMLInputElement).value)} />
            {facet("Auction date", "saleDate", facets.data?.saleDates, (r) => date(r.v))}
            {facet("Make", "make", facets.data?.makes)}
            {facet("Model", "model", facets.data?.models)}
            {facet("Chassis model", "modelCode", facets.data?.modelCodes)}
            {facet("Auction hall", "hall", facets.data?.halls, (r) => r.name ?? r.v)}
            {facet("Grade", "grade", facets.data?.grades)}
            {facet("Colour", "color", facets.data?.colors)}
            {facet("Gearbox", "transmission", facets.data?.transmissions)}
            <div className="grid grid-cols-2 gap-2">
              <Select value={params.yearMin} onChange={(e) => set("yearMin", e.target.value)} aria-label="Year from">
                <option value="">Year from</option>
                {[2022, 2020, 2018, 2016, 2014, 2012].map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </Select>
              <Select value={params.mileageMax} onChange={(e) => set("mileageMax", e.target.value)} aria-label="Max mileage">
                <option value="">Any km</option>
                {[30000, 60000, 100000, 150000].map((x) => (
                  <option key={x} value={x}>
                    ≤ {x / 1000}k km
                  </option>
                ))}
              </Select>
            </div>
          </aside>
          <div>
            {list.isLoading ? (
              <Skeleton className="h-96" />
            ) : !list.data?.items.length ? (
              <Empty title="No lots match" text={`Remove a filter, or ask ${fte} to watch the auctions for you.`} />
            ) : (
              <>
                <div className={clsx("overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm", list.isFetching && "opacity-60")}>
                  {list.data.items.map((l) => (
                    <Link key={l.id} to={`/auction/lots/${l.id}`} className="flex gap-3 border-b border-slate-100 p-3 hover:bg-slate-50">
                      <img src={l.image} alt="" className="h-20 w-32 shrink-0 rounded-xl object-cover sm:h-24 sm:w-40" loading="lazy" />
                      <div className="grid min-w-0 flex-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[1.4fr_1fr_1fr]">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">
                            {l.year} {l.make} {l.model}
                          </p>
                          <p className="text-xs text-slate-500">
                            Lot <strong className="text-slate-800">{l.lotNo}</strong> · {l.hall} · {date(l.saleDate)}
                          </p>
                          <p className="text-xs text-slate-500">{l.modelCode}</p>
                        </div>
                        <div className="text-xs text-slate-600">
                          <p>
                            Grade <Badge tone={["R", "RA", "2", "3"].includes(l.grade) ? "amber" : "green"}>{l.grade}</Badge> · Int. {l.interiorGrade}
                          </p>
                          <p className="mt-1">{km(l.mileageKm)} · {l.transmission} · {l.color}</p>
                        </div>
                        <div className="sm:text-right">
                          <p className="text-xs text-slate-500">Start</p>
                          <p className="font-bold text-brand-700">{jpy(l.startPriceJpy)}</p>
                          {l.status !== "upcoming" && <p className="text-xs text-slate-500">{l.status === "sold" ? `Sold ${jpy(l.resultPriceJpy)}` : `Not sold (high bid ${jpy(l.highBidJpy)})`}</p>}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
                <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={(p) => set("page", String(p))} />
              </>
            )}
          </div>
        </div>
      </div>
    </AuctionGate>
  );
}

interface LotDetail {
  lot: Lot;
  photos: string[];
  sheet: string;
  history: { count: number; soldCount: number; avgSoldJpy: number; minSoldJpy: number; maxSoldJpy: number; window: { from: string; to: string }; recent: { id: string; saleDate: string; hall: string; year: number; grade: string; mileageKm: number; finalPriceJpy: number; sold: number }[] };
  myBids: { id: string; amountJpy: number; status: string; createdAt: string }[];
  soraReading: { verdict?: string; grade?: string; reasons?: string[]; damage?: { code: string; panel: string; meaning: string }[] } | null;
  biddingOpen: boolean;
}

export function AuctionLotPage() {
  const fte = useFte();
  const { id } = useParams();
  const qc = useQueryClient();
  const { can } = useAuth();
  const q = useQuery({ queryKey: ["alot", id], queryFn: () => api.get<LotDetail>(`/api/auction/lots/${id}`) });
  const [img, setImg] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [bid, setBid] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [enq, setEnq] = useState(false);
  const [enqText, setEnqText] = useState("");
  if (q.isLoading) return <AuctionGate><div className="container-page py-8"><Skeleton className="h-96" /></div></AuctionGate>;
  if (!q.data) return <AuctionGate><div className="container-page py-16"><Empty title="This lot is not available" text="Concluded lots are kept for staff only." /></div></AuctionGate>;
  const { lot: l, history: h } = q.data;
  const images = [...q.data.photos, q.data.sheet];
  return (
    <AuctionGate>
      <AuctionNav />
      <div className="container-page py-6">
        <Link to="/auction/list" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700">
          <ChevronLeft className="size-4" /> Lots
        </Link>
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <button onClick={() => setZoom(true)} className="block w-full" aria-label="Open full size">
                <img src={images[img]} alt="" className={clsx("w-full bg-slate-50", img === images.length - 1 ? "aspect-[5/7] object-contain" : "aspect-[16/10] object-cover")} />
              </button>
              <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-lg bg-slate-900/70 px-2 py-1 text-xs text-white">
                <ZoomIn className="size-3.5" /> Full size
              </span>
            </div>
            <div className="scrollbar-thin mt-3 flex gap-2 overflow-x-auto">
              {images.map((src, i) => (
                <button key={src} onClick={() => setImg(i)} className={clsx("shrink-0 overflow-hidden rounded-xl ring-2", i === img ? "ring-brand-500" : "ring-transparent")}>
                  <img src={src} alt="" className="h-16 w-24 bg-white object-cover" />
                  {i === images.length - 1 && <span className="block bg-amber-100 text-center text-[10px] font-semibold text-amber-800">Auction sheet</span>}
                </button>
              ))}
            </div>
            <Card className="mt-4">
              <p className="mb-2 flex items-center gap-2 font-semibold text-slate-900">
                <History className="size-4" /> What this model sold for (last 93 days)
              </p>
              {h.count ? (
                <>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-slate-50 p-2"><p className="text-xs text-slate-500">Average</p><p className="font-bold">{jpy(h.avgSoldJpy)}</p></div>
                    <div className="rounded-xl bg-slate-50 p-2"><p className="text-xs text-slate-500">Lowest</p><p className="font-bold">{jpy(h.minSoldJpy)}</p></div>
                    <div className="rounded-xl bg-slate-50 p-2"><p className="text-xs text-slate-500">Highest</p><p className="font-bold">{jpy(h.maxSoldJpy)}</p></div>
                  </div>
                  <ul className="mt-3 divide-y divide-slate-100 text-sm">
                    {h.recent.slice(0, 6).map((r) => (
                      <li key={r.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                        <span className="text-slate-600">{date(r.saleDate)} · {r.hall} · {r.year} · Gr {r.grade} · {km(r.mileageKm)}</span>
                        <span className="font-semibold">{r.sold ? jpy(r.finalPriceJpy) : <span className="text-slate-500">not sold (high bid {jpy(r.finalPriceJpy)})</span>}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-slate-500">No recent results for this model.</p>
              )}
            </Card>
          </div>
          <div className="space-y-4">
            <Card>
              <div className="flex flex-wrap gap-2">
                <Badge tone="blue">Lot {l.lotNo}</Badge>
                <Badge tone="gray">{l.hall}</Badge>
                <Badge tone="gray">{date(l.saleDate)}</Badge>
              </div>
              <h1 className="mt-2 text-xl font-bold text-slate-900">
                {l.year} {l.make} {l.model}
              </h1>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {[
                  ["Chassis model", l.modelCode],
                  ["Grade / interior", `${l.grade} / ${l.interiorGrade}`],
                  ["Mileage", km(l.mileageKm)],
                  ["Engine", `${l.engineCc} cc ${l.fuel}`],
                  ["Gearbox / drive", `${l.transmission} / ${l.drive}`],
                  ["Colour", l.color],
                  ["Start price", jpy(l.startPriceJpy)],
                  ["Recent average", jpy(l.avgPriceJpy)],
                ].map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="text-right font-medium text-slate-900">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-xs text-slate-500">Equipment: {l.equipment}</p>
              <Button className="mt-4 w-full" variant="secondary" onClick={() => openChatWith(`${fte}, please check the auction sheet of lot ${l.lotNo} (${l.hall}, ${l.saleDate}) and tell me if it is a good car.`)}>
                <Bot className="size-4 text-violet-600" /> Ask <FteName /> to read the sheet
              </Button>
              {q.data.soraReading && (
                <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm">
                  <p className="font-semibold text-violet-900">
                    <FteName />'s reading: <span className="uppercase">{q.data.soraReading.verdict}</span> · grade {q.data.soraReading.grade}
                  </p>
                  <p className="text-violet-900/80">{q.data.soraReading.reasons?.slice(0, 3).join(" · ")}</p>
                </div>
              )}
            </Card>
            <Card>
              <p className="flex items-center gap-2 font-semibold text-slate-900">
                <Gavel className="size-4" /> Bid
              </p>
              {q.data.biddingOpen && can("auction.bids.place") ? (
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setMsg(null);
                    try {
                      await api.post(`/api/auction/lots/${l.id}/bids`, { amountJpy: Number(bid) });
                      setBid("");
                      setMsg("Your bid is in. You'll see the result after the sale day.");
                      await qc.invalidateQueries({ queryKey: ["alot", id] });
                    } catch (ex) {
                      setMsg((ex as Error).message);
                    }
                  }}
                >
                  <Input type="number" min={l.startPriceJpy} step={1000} placeholder={`From ¥${l.startPriceJpy.toLocaleString("en-US")}`} value={bid} onChange={(e) => setBid(e.target.value)} />
                  <Button type="submit">Place bid</Button>
                </form>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Bidding is closed for this lot.</p>
              )}
              {msg && <p className="mt-2 text-sm text-slate-700">{msg}</p>}
              {q.data.myBids.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm">
                  {q.data.myBids.map((b) => (
                    <li key={b.id} className="flex justify-between">
                      <span className="text-slate-500">Your bid · {date(b.createdAt)}</span>
                      <span className="font-semibold">{jpy(b.amountJpy)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEnq(true)}>
                  Ask a question
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    try {
                      const o = await api.post<{ orderNo: string }>(`/api/auction/lots/${l.id}/order`);
                      setMsg(`Order ${o.orderNo} placed — our team will confirm it.`);
                    } catch (ex) {
                      setMsg((ex as Error).message);
                    }
                  }}
                >
                  Order this lot
                </Button>
                <a href={`/api/auction/lots/${l.id}/download.zip`} className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
                  <Download className="size-4" /> Photos + sheet (ZIP)
                </a>
                <a href={`/api/auction/lots/${l.id}/spec.pdf`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
                  <FileText className="size-4" /> Spec PDF
                </a>
              </div>
            </Card>
          </div>
        </div>
      </div>
      {zoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setZoom(false)}>
          <img src={images[img]} alt="" className="max-h-full max-w-full bg-white object-contain" />
        </div>
      )}
      <Modal
        open={enq}
        onClose={() => setEnq(false)}
        title={`Question about lot ${l.lotNo}`}
        footer={
          <Button
            onClick={async () => {
              await api.post(`/api/auction/lots/${l.id}/enquiries`, { message: enqText });
              setEnq(false);
              setEnqText("");
              setMsg("Your question was sent. The answer appears in My bids & orders.");
            }}
          >
            Send
          </Button>
        }
      >
        <Field label="Your question">
          <Textarea rows={4} value={enqText} onChange={(e) => setEnqText(e.target.value)} />
        </Field>
      </Modal>
    </AuctionGate>
  );
}

export function AuctionStatistics() {
  const [sp, setSp] = useSearchParams();
  const p = Object.fromEntries(["make", "model", "yearMin", "yearMax", "grade", "sold", "page"].map((k) => [k, sp.get(k) ?? ""]));
  const q = useQuery({ queryKey: ["astats", p], queryFn: () => api.get<{ items: { id: string; saleDate: string; hall: string; lotNo: number; make: string; model: string; modelCode: string; year: number; engineCc: number; mileageKm: number; grade: string; color: string; startPriceJpy: number; finalPriceJpy: number; sold: number }[]; total: number; page: number; pageSize: number; window: { from: string; to: string } }>(`/api/auction/stats${qs(p)}`), placeholderData: keepPreviousData });
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v);
    else n.delete(k);
    if (k !== "page") n.delete("page");
    setSp(n);
  };
  return (
    <AuctionGate>
      <AuctionNav />
      <div className="container-page py-6">
        <h1 className="text-2xl font-bold text-slate-900">Past auction prices</h1>
        <p className="text-sm text-slate-500">{q.data ? `${q.data.total.toLocaleString("en-US")} results · ${date(q.data.window.from)} → ${date(q.data.window.to)} (rolling 93 days)` : "…"}</p>
        <div className="my-4 flex flex-wrap gap-2">
          <Input className="w-36" placeholder="Make" defaultValue={p.make} onKeyDown={(e) => e.key === "Enter" && set("make", (e.target as HTMLInputElement).value)} />
          <Input className="w-44" placeholder="Model" defaultValue={p.model} onKeyDown={(e) => e.key === "Enter" && set("model", (e.target as HTMLInputElement).value)} />
          <Select className="w-32" value={p.yearMin} onChange={(e) => set("yearMin", e.target.value)}>
            <option value="">Year from</option>
            {[2022, 2020, 2018, 2016, 2014, 2012].map((y) => (
              <option key={y}>{y}</option>
            ))}
          </Select>
          <Select className="w-28" value={p.grade} onChange={(e) => set("grade", e.target.value)}>
            <option value="">Any grade</option>
            {["6", "5", "4.5", "4", "3.5", "3", "R", "RA"].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </Select>
          <Tabs
            value={p.sold}
            onChange={(v) => set("sold", v)}
            items={[
              { value: "", label: "All" },
              { value: "1", label: "Sold" },
              { value: "0", label: "Not sold" },
            ]}
          />
        </div>
        {!q.data ? (
          <Skeleton className="h-80" />
        ) : (
          <>
            <Table head={["Date", "Hall", "Lot", "Vehicle", "Year", "Mileage", "Grade", "Start", "Result"]}>
              {q.data.items.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 whitespace-nowrap">{date(r.saleDate)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{r.hall}</td>
                  <td className="px-4 py-2">
                    <Link className="font-semibold text-brand-700" to={`/auction/statistics/${r.id}`}>
                      {r.lotNo}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    {r.make} {r.model} <span className="text-xs text-slate-500">{r.modelCode}</span>
                  </td>
                  <td className="px-4 py-2">{r.year}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{km(r.mileageKm)}</td>
                  <td className="px-4 py-2">{r.grade}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{jpy(r.startPriceJpy)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{r.sold ? <strong>{jpy(r.finalPriceJpy)}</strong> : <span className="text-slate-500">Not sold · high bid {jpy(r.finalPriceJpy)}</span>}</td>
                </tr>
              ))}
            </Table>
            <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(n) => set("page", String(n))} />
          </>
        )}
      </div>
    </AuctionGate>
  );
}

export function AuctionStatDetail() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ["astat", id], queryFn: () => api.get<{ result: { saleDate: string; hall: string; lotNo: number; make: string; model: string; modelCode: string; year: number; engineCc: number; mileageKm: number; grade: string; color: string; transmission: string; startPriceJpy: number; finalPriceJpy: number; sold: number }; history: LotDetail["history"] }>(`/api/auction/stats/${id}`) });
  const r = q.data?.result;
  return (
    <AuctionGate>
      <AuctionNav />
      <div className="container-page py-6">
        <Link to="/auction/statistics" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700">
          <ChevronLeft className="size-4" /> Past prices
        </Link>
        {!r ? (
          <Skeleton className="h-60" />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h1 className="text-xl font-bold text-slate-900">
                {r.year} {r.make} {r.model}
              </h1>
              <p className="text-sm text-slate-500">
                Lot {r.lotNo} · {r.hall} · {date(r.saleDate)}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-y-1.5 text-sm">
                {[
                  ["Chassis model", r.modelCode],
                  ["Engine", `${r.engineCc} cc`],
                  ["Mileage", km(r.mileageKm)],
                  ["Grade", r.grade],
                  ["Colour", r.color],
                  ["Gearbox", r.transmission],
                  ["Start price", jpy(r.startPriceJpy)],
                  [r.sold ? "Sold for" : "Highest bid (not sold)", jpy(r.finalPriceJpy)],
                ].map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="text-right font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
            <Card>
              <p className="font-semibold text-slate-900">Same model, last 93 days</p>
              <p className="mt-1 text-sm text-slate-600">
                {q.data!.history.soldCount} sold of {q.data!.history.count} · average {jpy(q.data!.history.avgSoldJpy)}
              </p>
            </Card>
          </div>
        )}
      </div>
    </AuctionGate>
  );
}

export function AuctionMe() {
  const q = useQuery({ queryKey: ["ame"], queryFn: () => api.get<{ bids: { id: string; amountJpy: number; status: string; createdAt: string; lot: { lotNo: number; make: string; model: string; year: number; saleDate: string } }[]; orders: { id: string; orderNo: string; status: string; priceJpy: number; createdAt: string; lot: { lotNo: number; make: string; model: string } }[]; enquiries: { id: string; enqNo: string; message: string; reply: string | null; status: string; createdAt: string; lot: { lotNo: number; make: string; model: string } }[] }>("/api/auction/me") });
  return (
    <AuctionGate>
      <AuctionNav />
      <div className="container-page space-y-6 py-6">
        <h1 className="text-2xl font-bold text-slate-900">My bids & orders</h1>
        <Card>
          <p className="mb-2 font-semibold">Bids</p>
          {q.data?.bids.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {q.data.bids.map((b) => (
                <li key={b.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    Lot {b.lot.lotNo} · {b.lot.year} {b.lot.make} {b.lot.model} · sale {date(b.lot.saleDate)}
                  </span>
                  <span className="font-semibold">
                    {jpy(b.amountJpy)} <Badge tone="blue">{b.status}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No bids yet.</p>
          )}
        </Card>
        <Card>
          <p className="mb-2 font-semibold">Orders</p>
          {q.data?.orders.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {q.data.orders.map((o) => (
                <li key={o.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    {o.orderNo} · Lot {o.lot.lotNo} {o.lot.make} {o.lot.model}
                  </span>
                  <Badge tone="violet">{o.status}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No orders yet.</p>
          )}
        </Card>
        <Card>
          <p className="mb-2 font-semibold">Questions</p>
          {q.data?.enquiries.length ? (
            <ul className="space-y-3 text-sm">
              {q.data.enquiries.map((e) => (
                <li key={e.id} className="rounded-xl border border-slate-200 p-3">
                  <p className="font-semibold">
                    {e.enqNo} · Lot {e.lot.lotNo} {e.lot.make} {e.lot.model} <Badge tone={e.status === "answered" ? "green" : "amber"}>{e.status}</Badge>
                  </p>
                  <p className="mt-1 text-slate-700">{e.message}</p>
                  {e.reply && <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-emerald-900">{e.reply}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No questions yet.</p>
          )}
        </Card>
      </div>
    </AuctionGate>
  );
}

export function RedirectAuction() {
  return <Navigate to="/auction" replace />;
}
