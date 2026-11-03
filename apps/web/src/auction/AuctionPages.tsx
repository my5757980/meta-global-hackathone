import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Bot, Check, ChevronLeft, ChevronRight, Copy, Download, FileText, Gavel, History, Printer, Search, X, ZoomIn } from "lucide-react";
import { api, qs } from "../lib/api";
import { useAuth } from "../lib/auth";
import { date, jpy, km } from "../lib/format";
import { Badge, Button, Card, Empty, Field, Input, Modal, Pagination, Select, Skeleton, Table, Tabs, Textarea, clsx } from "../ui";
import { openChatWith } from "../chat/ChatWidget";
import { FteName, useFte } from "../lib/site";
import { LanguagePicker, usePageLanguage } from "./Translate";

interface Lot {
  id: string;
  saleDate: string;
  saleTime: string | null;
  lotNo: number;
  hall: string;
  hallCode: string;
  make: string;
  model: string;
  modelCode: string;
  modelGrade: string | null;
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
  engineHp: number | null;
  equipment: string;
  startPriceJpy: number;
  avgPriceJpy: number | null;
  status: string;
  resultPriceJpy: number | null;
  highBidJpy: number | null;
  feed: string;
  image?: string;
  images?: string[];
  sheet?: string | null;
  endsAt?: string | null;
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
  bounds: { yearMin: number; yearMax: number; mileageMax: number; ccMax: number };
}

const KEYS = ["saleDate", "make", "model", "modelCode", "hall", "grade", "color", "transmission", "lots", "chassisModel", "chassisNo", "yearMin", "yearMax", "mileageMin", "mileageMax", "ccMin", "ccMax", "priceMax", "sort", "status", "page", "pageSize"] as const;
type Key = (typeof KEYS)[number];

const JAPANESE = new Set(["Toyota", "Nissan", "Honda", "Mazda", "Mitsubishi", "Subaru", "Suzuki", "Daihatsu", "Lexus", "Isuzu", "Hino"]);

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

/** Every lot closes on Tokyo time, so the auction shows Tokyo time wherever the reader is. */
function TokyoClock() {
  const fmt = useMemo(() => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }), []);
  const [t, setT] = useState(() => fmt.format(new Date()));
  useEffect(() => {
    const i = setInterval(() => setT(fmt.format(new Date())), 1000);
    return () => clearInterval(i);
  }, [fmt]);
  return (
    <span title="Japan Standard Time" className="notranslate shrink-0 text-xs whitespace-nowrap text-slate-500" data-keep>
      <strong className="text-slate-700">JST</strong> {t}
    </span>
  );
}

/** Staff see whether the demo feeds are running; buyers do not need to. */
function FeedLine() {
  const { can } = useAuth();
  const q = useQuery({ queryKey: ["feed-signal"], queryFn: () => api.get<{ status: string; text: string }>("/api/auction/signal"), enabled: can("auction.admin"), refetchInterval: 60_000 });
  if (!can("auction.admin") || !q.data) return null;
  const ok = q.data.status === "working";
  return (
    <span className={clsx("hidden shrink-0 items-center gap-1 text-xs sm:flex", ok ? "text-emerald-700" : "text-rose-700")}>
      <span className={clsx("size-2 rounded-full", ok ? "bg-emerald-500" : "bg-rose-500")} /> {q.data.text}
    </span>
  );
}

function AuctionNav() {
  usePageLanguage();
  const items = [
    { to: "/auction", label: "Choose a car" },
    { to: "/auction/list", label: "All lots" },
    { to: "/auction/statistics", label: "Past prices" },
    { to: "/auction/me", label: "My bids & orders" },
  ];
  return (
    <div className="border-b border-slate-200 bg-white print:hidden">
      <div className="container-page flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
        <div className="scrollbar-thin flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {items.map((i) => (
            <Link key={i.to} to={i.to} className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900">
              {i.label}
            </Link>
          ))}
        </div>
        <FeedLine />
        <TokyoClock />
        <LanguagePicker />
      </div>
    </div>
  );
}

/** Welcome: pick a maker, then a model, then the list. */
export function AuctionWelcome() {
  const [make, setMake] = useState<string | null>(null);
  const nav = useNavigate();
  const f = useQuery({ queryKey: ["afacets", make], queryFn: () => api.get<Facets>(`/api/auction/facets${qs({ make })}`) });
  const total = f.data?.makes.reduce((a, m) => a + m.n, 0);
  const tile = (m: FacetRow) => (
    <button key={m.v} onClick={() => setMake(m.v)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-brand-300 hover:shadow">
      <p className="font-semibold text-slate-900">{m.v}</p>
      <p className="text-sm text-slate-500">{m.n} lots</p>
    </button>
  );
  const jp = f.data?.makes.filter((m) => JAPANESE.has(m.v)) ?? [];
  const other = f.data?.makes.filter((m) => !JAPANESE.has(m.v)) ?? [];
  return (
    <AuctionGate>
      <AuctionNav />
      <div className="container-page py-8">
        <h1 className="text-2xl font-bold text-slate-900">This week's auctions</h1>
        <p className="text-sm text-slate-500">
          {total ? `${total.toLocaleString("en-US")} lots across ${f.data?.halls.length ?? 0} auction halls. ` : ""}Choose a manufacturer, then a model. Every lot has its inspection sheet, or ask <FteName /> to read it for you.
        </p>
        <form
          className="mt-4 flex max-w-xl gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = new FormData(e.currentTarget).get("q") as string;
            if (v.trim()) nav(/^[\d,\s]+$/.test(v) ? `/auction/list?lots=${encodeURIComponent(v)}` : `/auction/list?chassisModel=${encodeURIComponent(v.trim())}`);
          }}
        >
          <Input name="q" placeholder="Lot no. or chassis code" title="For example: 4522, 6155 or GDJ150W" />
          <Button type="submit">
            <Search className="size-4" /> Find
          </Button>
        </form>
        {!make ? (
          <div className="mt-6 space-y-5">
            {f.isLoading && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>}
            {jp.length > 0 && (
              <div>
                <h2 className="mb-2 text-sm font-semibold text-slate-700">Japanese</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{jp.map(tile)}</div>
              </div>
            )}
            {other.length > 0 && (
              <div>
                <h2 className="mb-2 text-sm font-semibold text-slate-700">Other manufacturers</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{other.map(tile)}</div>
              </div>
            )}
            <p className="text-sm text-slate-500">
              Looking for something specific? <Link className="font-semibold text-brand-700" to="/auction/list">Browse every lot</Link>.
            </p>
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

const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { month: "2-digit", day: "2-digit", weekday: "short", timeZone: "UTC" });

function useTimeLeft(endsAt: string | null | undefined, serverNow: string | undefined) {
  const skew = useMemo(() => (serverNow ? new Date(serverNow).getTime() - Date.now() : 0), [serverNow]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(i);
  }, []);
  if (!endsAt) return null;
  void tick;
  const ms = new Date(endsAt).getTime() - (Date.now() + skew);
  if (ms <= 0) return "time passed";
  const m = Math.floor(ms / 60_000);
  if (m >= 1440) return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h left`;
  return `${Math.floor(m / 60)}h ${m % 60}m left`;
}
function TimeLeft({ endsAt, serverNow }: { endsAt?: string | null; serverNow?: string }) {
  const t = useTimeLeft(endsAt, serverNow);
  return t ? <span className={clsx("block text-xs", t === "time passed" ? "text-amber-700" : "text-emerald-700")}>{t}</span> : null;
}

/** Two handles on one track, or two boxes when the reader wants an exact figure. A handle at the end of its track means no limit. */
function RangeFilter({ label, lo, hi, step, from, to, comma, onCommit }: { label: string; lo: number; hi: number; step: number; from: string; to: string; comma?: boolean; onCommit: (from: string, to: string) => void }) {
  const [typing, setTyping] = useState(false);
  const [a, setA] = useState(from ? Number(from) : lo);
  const [b, setB] = useState(to ? Number(to) : hi);
  useEffect(() => {
    setA(from ? Number(from) : lo);
    setB(to ? Number(to) : hi);
  }, [from, to, lo, hi]);
  const show = (n: number) => (comma ? n.toLocaleString("en-US") : String(n));
  const commit = (x = a, y = b) => onCommit(x > lo ? String(x) : "", y < hi ? String(y) : "");
  const span = Math.max(1, hi - lo);
  const thumb = "pointer-events-none absolute inset-x-0 top-0 h-5 w-full appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-brand-600 [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-600";
  return (
    <div>
      <button type="button" onClick={() => setTyping((v) => !v)} aria-expanded={typing} className="flex w-full items-center justify-between gap-2 text-left text-xs font-semibold text-slate-600 hover:text-brand-700">
        <span>{label}</span>
        <span className="font-normal text-slate-500">{a > lo || b < hi ? `${show(a)} – ${show(b)}` : "Any"}</span>
      </button>
      {typing ? (
        <div className="mt-1 grid grid-cols-2 gap-1.5">
          <Input aria-label={`${label} from`} type="number" placeholder="From" min={lo} max={hi} step={step} value={a > lo ? a : ""} onChange={(e) => setA(e.target.value ? Number(e.target.value) : lo)} onBlur={() => commit()} onKeyDown={(e) => e.key === "Enter" && commit()} />
          <Input aria-label={`${label} to`} type="number" placeholder="To" min={lo} max={hi} step={step} value={b < hi ? b : ""} onChange={(e) => setB(e.target.value ? Number(e.target.value) : hi)} onBlur={() => commit()} onKeyDown={(e) => e.key === "Enter" && commit()} />
        </div>
      ) : (
        <div className="relative mt-1 h-5">
          <span className="absolute inset-x-0 top-2 h-1 rounded-full bg-slate-200" />
          <span className="absolute top-2 h-1 rounded-full bg-brand-500" style={{ left: `${((a - lo) / span) * 100}%`, right: `${100 - ((b - lo) / span) * 100}%` }} />
          <input aria-label={`${label} from`} type="range" className={thumb} min={lo} max={hi} step={step} value={a} onChange={(e) => setA(Math.min(Number(e.target.value), b))} onPointerUp={() => commit()} onKeyUp={() => commit()} />
          <input aria-label={`${label} to`} type="range" className={thumb} min={lo} max={hi} step={step} value={b} onChange={(e) => setB(Math.max(Number(e.target.value), a))} onPointerUp={() => commit()} onKeyUp={() => commit()} />
        </div>
      )}
    </div>
  );
}

export function AuctionList() {
  const fte = useFte();
  const { can } = useAuth();
  const [sp, setSp] = useSearchParams();
  const params = useMemo(() => Object.fromEntries(KEYS.map((k) => [k, sp.get(k) ?? ""])) as Record<Key, string>, [sp]);
  const [hidden, setHidden] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  // the list and its counts keep themselves up to date while the page is open
  const facets = useQuery({ queryKey: ["afacets-list", params], queryFn: () => api.get<Facets>(`/api/auction/facets${qs({ ...params, page: undefined, pageSize: undefined })}`), placeholderData: keepPreviousData, refetchInterval: 30_000 });
  const list = useQuery({ queryKey: ["alots", params], queryFn: () => api.get<{ items: Lot[]; total: number; totalA: number; totalB: number; page: number; pageSize: number; serverNow: string }>(`/api/auction/lots${qs(params)}`), refetchInterval: 30_000, placeholderData: keepPreviousData });
  const put = useCallback(
    (changes: Partial<Record<Key, string>>) => {
      const n = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(changes)) {
        if (v) n.set(k, v);
        else n.delete(k);
      }
      if (!("page" in changes)) n.delete("page");
      if ("make" in changes) {
        n.delete("model");
        n.delete("modelCode");
      }
      if ("model" in changes) n.delete("modelCode");
      setSp(n); // one history entry per tick: Back removes exactly one filter
    },
    [sp, setSp],
  );
  const ticked = (k: Key) => (params[k] ? params[k].split(",") : []);
  const tick = (k: Key, v: string) => {
    const cur = ticked(k);
    put({ [k]: (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]).join(",") });
  };
  const column = (title: string, key: Key, rows: FacetRow[] | undefined, label?: (r: FacetRow) => string) => (
    <div className="min-w-0">
      <p className="mb-1.5 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{title}</p>
      <div className="scrollbar-thin max-h-52 space-y-0.5 overflow-y-auto pr-1">
        {rows?.map((r) => (
          <label key={r.v} className="flex min-h-7 cursor-pointer items-center justify-between gap-2 rounded-lg px-1.5 py-0.5 text-sm hover:bg-slate-50">
            <span className="flex min-w-0 items-center gap-2">
              <input type="checkbox" checked={ticked(key).includes(r.v)} onChange={() => tick(key, r.v)} className="accent-brand-600" />
              <span className="truncate">{label ? label(r) : r.v}</span>
            </span>
            <span className="text-xs text-slate-500">{r.n}</span>
          </label>
        ))}
        {!rows?.length && <p className="px-1.5 text-xs text-slate-500">Nothing to choose yet.</p>}
      </div>
    </div>
  );
  const b = facets.data?.bounds;
  const thisYear = new Date().getUTCFullYear();
  const yLo = Math.min(Math.max(b?.yearMin ?? 2000, 1950), thisYear);
  const yHi = Math.max(yLo, Math.min(b?.yearMax ?? thisYear, thisYear + 1));
  const mHi = Math.ceil(Math.min(b?.mileageMax ?? 300000, 500000) / 10000) * 10000 || 300000;
  const cHi = Math.ceil(Math.min(b?.ccMax ?? 6000, 10000) / 500) * 500 || 6000;
  const active = KEYS.some((k) => !["page", "pageSize", "sort", "status"].includes(k) && params[k]);
  const sortBy = (asc: string, desc: string, text: string) => {
    const on = params.sort === asc || params.sort === desc;
    return (
      <button type="button" onClick={() => put({ sort: params.sort === desc ? asc : desc })} className={clsx("inline-flex items-center gap-0.5 font-semibold whitespace-nowrap hover:text-brand-700", on && "text-brand-700")}>
        {text}
        {params.sort === asc ? <ArrowUp className="size-3" /> : params.sort === desc ? <ArrowDown className="size-3" /> : null}
      </button>
    );
  };
  const result = (l: Lot) =>
    l.status === "sold" ? (
      <span className="font-semibold text-slate-900">Sold {jpy(l.resultPriceJpy)}</span>
    ) : l.status === "unsold" ? (
      <span className="text-slate-600">Not sold{l.highBidJpy ? ` · high bid ${jpy(l.highBidJpy)}` : ""}</span>
    ) : l.status === "withdrawn" ? (
      <span className="text-slate-600">Withdrawn</span>
    ) : (
      <span className="text-emerald-700">Available</span>
    );
  return (
    <AuctionGate>
      <AuctionNav />
      <div className="container-page py-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-slate-900">Japan auto auction</h1>
          <Button variant="secondary" size="sm" aria-expanded={!hidden} onClick={() => setHidden((h) => !h)}>
            {hidden ? "Show search +" : "Hide search −"}
          </Button>
        </div>
        {!hidden && (
          <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <form
              key={`${params.lots}|${params.chassisModel}|${params.chassisNo}`}
              className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto]"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                put({ lots: String(f.get("lots") ?? "").trim(), chassisModel: String(f.get("chassisModel") ?? "").trim(), chassisNo: String(f.get("chassisNo") ?? "").trim() });
              }}
            >
              <Field label="Search by lot number" hint="Several: 4501, 4359">
                <Input name="lots" placeholder="4501, 4359" defaultValue={params.lots} />
              </Field>
              <Field label="Search by chassis model" hint="The short code, like GDJ150W">
                <Input name="chassisModel" placeholder="GDJ150W" defaultValue={params.chassisModel} />
              </Field>
              <Field label="Search by chassis number" hint="Finds every lot of that model: sheets carry the code, not the number">
                <Input name="chassisNo" placeholder="GDJ150W-1234567" defaultValue={params.chassisNo} />
              </Field>
              <Field label="Auction hall">
                <Select value={ticked("hall").length === 1 ? ticked("hall")[0] : ""} onChange={(e) => put({ hall: e.target.value })}>
                  <option value="">All halls</option>
                  {facets.data?.halls.map((h) => (
                    <option key={h.v} value={h.v}>
                      {h.name} ({h.n})
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-end gap-2">
                <Button type="submit">
                  <Search className="size-4" /> Search
                </Button>
                <Button type="button" variant="secondary" onClick={() => setSp(new URLSearchParams())}>
                  Reset
                </Button>
              </div>
            </form>
            <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
              {column("Auction date", "saleDate", facets.data?.saleDates, (r) => shortDay(r.v))}
              <div className="min-w-0">
                <p className="mb-1.5 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">Make</p>
                <div className="scrollbar-thin max-h-52 space-y-0.5 overflow-y-auto pr-1">
                  {facets.data?.makes.map((m) => (
                    <button key={m.v} type="button" aria-pressed={params.make === m.v} onClick={() => put({ make: params.make === m.v ? "" : m.v })} className={clsx("flex min-h-7 w-full items-center justify-between gap-2 rounded-lg px-1.5 py-0.5 text-left text-sm hover:bg-slate-50", params.make === m.v && "bg-brand-50 font-semibold text-brand-700")}>
                      <span className="truncate">{m.v}</span>
                      <span className="text-xs text-slate-500">{m.n}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="min-w-0">
                <p className="mb-1.5 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">Model</p>
                <div className="scrollbar-thin max-h-52 space-y-0.5 overflow-y-auto pr-1">
                  {facets.data?.models.map((m) => (
                    <label key={m.v} className="flex min-h-7 cursor-pointer items-center justify-between gap-2 rounded-lg px-1.5 py-0.5 text-sm hover:bg-slate-50">
                      <span className="flex min-w-0 items-center gap-2">
                        <input type="radio" name="model" checked={params.model === m.v} onChange={() => put({ model: m.v })} onClick={() => params.model === m.v && put({ model: "" })} className="accent-brand-600" />
                        <span className="truncate">{m.v}</span>
                      </span>
                      <span className="text-xs text-slate-500">{m.n}</span>
                    </label>
                  ))}
                  {!facets.data?.models.length && <p className="px-1.5 text-xs text-slate-500">Pick a make first.</p>}
                </div>
              </div>
              <div className="min-w-0 space-y-2">
                <p className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">More filters</p>
                <RangeFilter label="Year" lo={yLo} hi={yHi} step={1} from={params.yearMin} to={params.yearMax} onCommit={(x, y) => put({ yearMin: x, yearMax: y })} />
                <RangeFilter label="Mileage (km)" comma lo={0} hi={mHi} step={1000} from={params.mileageMin} to={params.mileageMax} onCommit={(x, y) => put({ mileageMin: x, mileageMax: y })} />
                <RangeFilter label="Engine (cc)" comma lo={0} hi={cHi} step={100} from={params.ccMin} to={params.ccMax} onCommit={(x, y) => put({ ccMin: x, ccMax: y })} />
                <div className="grid grid-cols-2 gap-1.5">
                  <Select aria-label="Transmission" value={ticked("transmission").length === 1 ? ticked("transmission")[0] : ""} onChange={(e) => put({ transmission: e.target.value })}>
                    <option value="">Gearbox</option>
                    {facets.data?.transmissions.map((r) => <option key={r.v} value={r.v}>{r.v}</option>)}
                  </Select>
                  <Select aria-label="Colour" value={ticked("color").length === 1 ? ticked("color")[0] : ""} onChange={(e) => put({ color: e.target.value })}>
                    <option value="">Colour</option>
                    {facets.data?.colors.map((r) => <option key={r.v} value={r.v}>{r.v}</option>)}
                  </Select>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold text-slate-600">Auction grade</p>
                  <div className="flex flex-wrap gap-x-2.5 gap-y-1">
                    {facets.data?.grades.map((g) => (
                      <label key={g.v} className="flex min-h-7 cursor-pointer items-center gap-1 text-sm">
                        <input type="checkbox" checked={ticked("grade").includes(g.v)} onChange={() => tick("grade", g.v)} className="accent-brand-600" /> {g.v}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              {column("Chassis model", "modelCode", facets.data?.modelCodes)}
              {column("Auction", "hall", facets.data?.halls, (r) => r.name ?? r.v)}
            </div>
          </div>
        )}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span>
              Total records: <strong className="text-slate-900">{list.data ? list.data.total.toLocaleString("en-US") : "…"}</strong>
              {list.data && list.data.totalB > 0 && list.data.totalA > 0 && <span className="text-slate-500"> = {list.data.totalA.toLocaleString("en-US")} + {list.data.totalB.toLocaleString("en-US")}</span>}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700" title="This list updates by itself">
              <span className="size-1.5 rounded-full bg-emerald-500" /> Live
            </span>
            <span className="text-xs text-slate-500">demo data from fictional halls</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {active && (
              <Button size="sm" variant="ghost" onClick={() => setSp(new URLSearchParams())}>
                <X className="size-4" /> Clear filters
              </Button>
            )}
            {can("auction.lots.view_sold") && (
              <Select className="w-40" aria-label="Which lots" value={params.status} onChange={(e) => put({ status: e.target.value })}>
                <option value="">Upcoming</option>
                <option value="concluded">Concluded (archive)</option>
                <option value="all">All</option>
              </Select>
            )}
            <div className="w-36 lg:hidden">
              <Select aria-label="Sort" value={params.sort} onChange={(e) => put({ sort: e.target.value })}>
                <option value="">Sale date</option>
                <option value="price_low">Price: low first</option>
                <option value="price_high">Price: high first</option>
                <option value="year_new">Year: newest</option>
                <option value="mileage">Mileage: lowest</option>
                <option value="cond_high">Grade: best</option>
              </Select>
            </div>
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              Per page
              <select className="h-9 rounded-lg border border-slate-200 bg-white px-1.5 text-sm" value={params.pageSize || "20"} onChange={(e) => put({ pageSize: e.target.value })}>
                {[20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
        </div>
        {list.isLoading ? (
          <Skeleton className="h-96" />
        ) : !list.data?.items.length ? (
          <Empty title={params.lots || params.chassisModel || params.chassisNo ? "Nothing matches that search" : "No lots match those filters"} text={params.chassisModel || params.chassisNo ? "Chassis search takes the short model code printed beside the engine size, like GDJ150W." : `Widen the year, mileage or engine range, or ask ${fte} to watch the auctions for you.`} action={<Button variant="secondary" onClick={() => setSp(new URLSearchParams())}>Reset filters</Button>} />
        ) : (
          <>
            {/* wide: the auction's own table; narrow: one card a lot */}
            <div className={clsx("scrollbar-thin hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm lg:block", list.isFetching && "opacity-60")}>
              <table className="w-full min-w-[1040px] text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Photo</th>
                    <th className="px-3 py-2">{sortBy("lot_asc", "lot_desc", "Lot number")}</th>
                    <th className="px-3 py-2">{sortBy("date_asc", "date_desc", "Auction date")}<span className="block font-normal">Hall</span></th>
                    <th className="px-3 py-2"><span className="font-semibold">Model</span><span className="block font-normal">{sortBy("year_old", "year_new", "Year")}</span></th>
                    <th className="px-3 py-2 font-semibold">Chassis no.<span className="block font-normal">Model grade</span></th>
                    <th className="px-3 py-2">{sortBy("cc_low", "cc_high", "Engine cc")}</th>
                    <th className="px-3 py-2">{sortBy("mileage", "mileage_high", "Mileage km")}</th>
                    <th className="px-3 py-2 font-semibold">Gearbox<span className="block font-normal">Colour</span></th>
                    <th className="px-3 py-2">{sortBy("cond_low", "cond_high", "Grade")}</th>
                    <th className="px-3 py-2">{sortBy("price_low", "price_high", "Start price")}</th>
                    <th className="px-3 py-2 font-semibold">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.data.items.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          {(l.images ?? []).slice(0, 2).map((src) => (
                            <button key={src} aria-label="Open the picture" onClick={() => setZoom(src)}>
                              <img src={src} alt="" loading="lazy" className="h-12 w-16 rounded-md bg-slate-100 object-cover" />
                            </button>
                          ))}
                          {l.sheet && (
                            <button aria-label="Open the auction sheet" onClick={() => setZoom(l.sheet!)}>
                              <img src={l.sheet} alt="" loading="lazy" className="h-12 w-9 rounded-md bg-slate-100 object-cover ring-1 ring-slate-200" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <Link to={`/auction/lots/${l.id}`} className="font-bold text-brand-700 hover:underline">{l.lotNo}</Link>
                        <span className="mt-0.5 flex gap-0.5">
                          {["A", "B", "C", "D"].map((L, i) =>
                            l.images?.[i] ? (
                              <button key={L} onClick={() => setZoom(l.images![i]!)} className="size-5 rounded bg-slate-100 text-[11px] font-semibold text-slate-700 hover:bg-brand-100">{L}</button>
                            ) : (
                              <span key={L} className="flex size-5 items-center justify-center rounded bg-slate-50 text-[11px] text-slate-300">{L}</span>
                            ),
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="font-medium">{date(l.saleDate)}{l.saleTime ? <span className="text-xs font-normal text-slate-500"> ({l.saleTime} JST)</span> : null}</span>
                        <TimeLeft endsAt={l.endsAt} serverNow={list.data!.serverNow} />
                        <span className="block text-xs text-slate-500">{l.hall}</span>
                      </td>
                      <td className="px-3 py-2">
                        <Link to={`/auction/lots/${l.id}`} className="font-medium text-slate-900 hover:text-brand-700">{l.make} {l.model}</Link>
                        <span className="block text-xs text-slate-500">{l.year}</span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{l.modelCode}<span className="block text-xs text-slate-500">{l.modelGrade}</span></td>
                      <td className="px-3 py-2">{l.engineCc.toLocaleString("en-US")}</td>
                      <td className="px-3 py-2">{l.mileageKm.toLocaleString("en-US")}</td>
                      <td className="px-3 py-2">{l.transmission}<span className="block text-xs text-slate-500">{l.color}</span></td>
                      <td className="px-3 py-2"><Badge tone={["R", "RA", "2", "3"].includes(l.grade) ? "amber" : "green"}>{l.grade}</Badge></td>
                      <td className="px-3 py-2 font-semibold whitespace-nowrap">{jpy(l.startPriceJpy)}</td>
                      <td className="px-3 py-2 text-xs">{result(l)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={clsx("overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:hidden", list.isFetching && "opacity-60")}>
              {list.data.items.map((l) => (
                <Link key={l.id} to={`/auction/lots/${l.id}`} className="flex gap-3 border-b border-slate-100 p-3 hover:bg-slate-50">
                  <img src={l.image} alt="" className="h-20 w-28 shrink-0 rounded-xl object-cover" loading="lazy" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="truncate font-semibold text-slate-900">{l.year} {l.make} {l.model}</p>
                    <p className="text-xs text-slate-500">Lot <strong className="text-slate-800">{l.lotNo}</strong> · {l.hall}</p>
                    <p className="text-xs text-slate-500">{date(l.saleDate)}{l.saleTime ? ` ${l.saleTime} JST` : ""} · {l.modelCode}</p>
                    <p className="text-xs text-slate-600">Grade {l.grade} · {km(l.mileageKm)} · {l.transmission}</p>
                    <TimeLeft endsAt={l.endsAt} serverNow={list.data!.serverNow} />
                    <p className="flex flex-wrap items-baseline justify-between gap-2"><span className="font-bold text-brand-700">{jpy(l.startPriceJpy)}</span><span className="text-xs">{result(l)}</span></p>
                  </div>
                </Link>
              ))}
            </div>
            <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={(p) => put({ page: String(p) })} />
          </>
        )}
      </div>
      {zoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" role="dialog" aria-label="Full size picture" onClick={() => setZoom(null)}>
          <img src={zoom} alt="" className="max-h-full max-w-full bg-white object-contain" />
        </div>
      )}
    </AuctionGate>
  );
}

interface LotDetail {
  lot: Lot;
  photos: string[];
  sheet: string | null;
  history: { count: number; soldCount: number; avgSoldJpy: number; minSoldJpy: number; maxSoldJpy: number; window: { from: string; to: string }; recent: { id: string; saleDate: string; hall: string; year: number; grade: string; mileageKm: number; finalPriceJpy: number; sold: number }[] };
  myBids: { id: string; bidNo: string | null; amountJpy: number; status: string; createdAt: string; note: string | null }[];
  soraReading: { verdict?: string; grade?: string; reasons?: string[]; damage?: { code: string; panel: string; meaning: string }[] } | null;
  biddingOpen: boolean;
  endsAt: string | null;
  serverNow: string;
  saleMayHaveRun: boolean;
  prevId: string | null;
  nextId: string | null;
  related: { id: string; lotNo: number; make: string; model: string; year: number; mileageKm: number; startPriceJpy: number; image: string }[];
  fees: { transportCarJpy: number; transportTruckJpy: number; clearanceJpy: number; radiationJpy: number; handlingJpy: number; serviceJpy: number; lcJpy: number; vanningJpy: number; inspection: Record<string, number> };
  marks: [string, string][];
  makers: string[];
  isCustomer: boolean;
}

/** The marks on the sheet, spelled out. */
function SheetLegend({ marks }: { marks: [string, string][] }) {
  return (
    <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" open>
      <summary className="cursor-pointer font-semibold text-slate-900">Understanding the auction sheet</summary>
      <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {marks.map(([c, m]) => (
          <div key={c} className="flex gap-2">
            <dt className="w-8 shrink-0 font-bold text-slate-900">{c}</dt>
            <dd className="text-slate-600">{m}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** Year of manufacture from a chassis number, and our own lots of that model. */
function ProductionLookup({ code, make, makers }: { code: string; make: string; makers: string[] }) {
  const [type, setType] = useState(code.split("-").at(-1) ?? code);
  const [no, setNo] = useState("");
  const [maker, setMaker] = useState(makers.includes(make.toUpperCase()) ? make.toUpperCase() : "");
  const [res, setRes] = useState<{ found: boolean; message?: string; yearMonth?: string; modelName?: string; gradeCode?: string; seats?: number; engineNo?: string; grade?: string; paintCode?: string; trimCode?: string; body?: string; drive?: string; catalogNo?: string } | null>(null);
  const [stock, setStock] = useState<{ id: string; lotNo: number; saleDate: string; make: string; model: string; year: number; grade: string; mileageKm: number; startPriceJpy: number; hall: string }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const check = async () => {
    setErr(null);
    setStock(null);
    try {
      setRes(await api.get(`/api/auction/chassis-lookup${qs({ code: type, number: no, maker })}`));
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const ours = async () => {
    setErr(null);
    setRes(null);
    try {
      setStock((await api.get<{ items: NonNullable<typeof stock> }>(`/api/auction/our-stock${qs({ code: type })}`)).items);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <Card>
      <p className="font-semibold text-slate-900">Production year</p>
      <p className="text-sm text-slate-500">Year of manufacture from a chassis number. Demo register.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto_auto]">
        <Input aria-label="Chassis code" placeholder="GDJ150W" value={type} onChange={(e) => setType(e.target.value)} />
        <Input aria-label="Chassis number" placeholder="1234567" value={no} onChange={(e) => setNo(e.target.value)} />
        <Select aria-label="Maker" value={maker} onChange={(e) => setMaker(e.target.value)}>
          <option value="">Maker</option>
          {makers.map((m) => <option key={m} value={m}>{m}</option>)}
        </Select>
        <Button variant="secondary" disabled={type.trim().length < 2} onClick={() => void check()}>Check</Button>
        <Button variant="ghost" disabled={type.trim().length < 2} onClick={() => void ours()}>Our stock</Button>
      </div>
      {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
      {res && !res.found && <p className="mt-2 text-sm text-slate-600">{res.message}</p>}
      {res?.found && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          {[["Year / month", res.yearMonth], ["Model name", res.modelName], ["Grade code", res.gradeCode], ["Seats", res.seats], ["Engine no.", res.engineNo], ["Grade", res.grade], ["Paint code", res.paintCode], ["Trim code", res.trimCode], ["Body", res.body], ["Drive", res.drive], ["Catalogue no.", res.catalogNo]].map(([k, v]) => (
            <div key={String(k)}>
              <dt className="text-xs text-slate-500">{k}</dt>
              <dd className="font-medium text-slate-900">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {stock && (
        <div className="mt-3">
          {stock.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {stock.map((l) => (
                <li key={l.id}>
                  <Link to={`/auction/lots/${l.id}`} className="flex flex-wrap justify-between gap-2 py-1.5 hover:text-brand-700">
                    <span>Lot {l.lotNo} · {l.year} {l.make} {l.model} · {l.hall} · {date(l.saleDate)}</span>
                    <span className="font-semibold">{jpy(l.startPriceJpy)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No lots of that model on sale this week.</p>
          )}
        </div>
      )}
    </Card>
  );
}

function FobTable({ fees, start, onTotal }: { fees: LotDetail["fees"]; start: number; onTotal?: (n: number) => void }) {
  const [bid, setBid] = useState(String(start));
  const [kind, setKind] = useState<"car" | "truck">("car");
  const [inspect, setInspect] = useState("None");
  const [lc, setLc] = useState(false);
  const [van, setVan] = useState(false);
  const transport = kind === "truck" ? fees.transportTruckJpy : fees.transportCarJpy;
  const total = (Number(bid) || 0) + transport + fees.clearanceJpy + (fees.inspection[inspect] ?? 0) + (lc ? fees.lcJpy : 0) + (van ? fees.vanningJpy : 0) + fees.radiationJpy + fees.handlingJpy;
  useEffect(() => onTotal?.(total), [total, onTotal]);
  const row = (label: React.ReactNode, value: React.ReactNode) => (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-1.5 text-sm">
      <span className="min-w-0 text-slate-600">{label}</span>
      <span className="shrink-0 font-medium text-slate-900">{value}</span>
    </div>
  );
  return (
    <Card>
      <p className="font-semibold text-slate-900">Auction FOB price</p>
      <div className="mt-2">
        {row(<label htmlFor="fob-bid">Your bidding amount (JPY)</label>, <Input id="fob-bid" className="w-32 text-right" type="number" step={1000} value={bid} onChange={(e) => setBid(e.target.value)} />)}
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-slate-100 py-1.5 text-sm">
          <label className="flex min-h-7 items-center gap-1.5"><input type="radio" name="fob-kind" checked={kind === "car"} onChange={() => setKind("car")} className="accent-brand-600" /> Car, SUV, van</label>
          <label className="flex min-h-7 items-center gap-1.5"><input type="radio" name="fob-kind" checked={kind === "truck"} onChange={() => setKind("truck")} className="accent-brand-600" /> Truck</label>
        </div>
        {row("Domestic transport", transport.toLocaleString("en-US"))}
        {row("Customs clearance", fees.clearanceJpy.toLocaleString("en-US"))}
        {row(
          <span className="flex items-center gap-2">
            Inspection
            <select aria-label="Inspection body" className="h-8 rounded-lg border border-slate-200 bg-white px-1 text-sm" value={inspect} onChange={(e) => setInspect(e.target.value)}>
              {Object.keys(fees.inspection).map((k) => <option key={k}>{k}</option>)}
            </select>
          </span>,
          (fees.inspection[inspect] ?? 0).toLocaleString("en-US"),
        )}
        {row(<label className="flex min-h-7 items-center gap-2">L/C <input type="checkbox" checked={lc} onChange={(e) => setLc(e.target.checked)} className="accent-brand-600" /></label>, (lc ? fees.lcJpy : 0).toLocaleString("en-US"))}
        {row(<label className="flex min-h-7 items-center gap-2">Vanning <input type="checkbox" checked={van} onChange={(e) => setVan(e.target.checked)} className="accent-brand-600" /></label>, (van ? fees.vanningJpy : 0).toLocaleString("en-US"))}
        {row("Radiation check", fees.radiationJpy.toLocaleString("en-US"))}
        {row("Yard handling", fees.handlingJpy.toLocaleString("en-US"))}
        <div className="flex justify-between gap-3 pt-2 text-sm font-bold text-slate-900">
          <span>FOB cost</span>
          <span data-testid="fob-total">¥{total.toLocaleString("en-US")}</span>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">An estimate. Auction charges are quoted by our desk on the day.</p>
    </Card>
  );
}

export function AuctionLotPage() {
  const fte = useFte();
  const { id } = useParams();
  const qc = useQueryClient();
  const { can, me } = useAuth();
  const q = useQuery({ queryKey: ["alot", id], queryFn: () => api.get<LotDetail>(`/api/auction/lots/${id}`) });
  const [img, setImg] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [bid, setBid] = useState("");
  const [over, setOver] = useState("");
  const [message, setMessage] = useState("");
  const [agree, setAgree] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [enqText, setEnqText] = useState("");
  const [ordering, setOrdering] = useState(false);
  const [orderOk, setOrderOk] = useState(false);
  const left = useTimeLeft(q.data?.endsAt, q.data?.serverNow);
  useEffect(() => {
    setImg(0);
    setMsg(null);
  }, [id]);
  if (q.isLoading) return <AuctionGate><div className="container-page py-8"><Skeleton className="h-96" /></div></AuctionGate>;
  if (!q.data) return <AuctionGate><div className="container-page py-16"><Empty title="This lot is not available" text="Concluded lots are kept for staff only." /></div></AuctionGate>;
  const d = q.data;
  const { lot: l, history: h } = d;
  const sheetAt = d.sheet ? d.photos.length : -1;
  const images = d.sheet ? [...d.photos, d.sheet] : d.photos;
  const f = d.fees;
  const amount = Number(bid) || 0;
  const approxFob = amount > 0 ? amount + (Number(over) || 0) + f.transportCarJpy + f.clearanceJpy + f.radiationJpy + f.handlingJpy + f.serviceJpy : null;
  const specs: [string, React.ReactNode][] = [
    ["Sale day", date(l.saleDate)],
    ...(l.saleTime ? ([["Auction time", <span key="t">{l.saleTime} JST{left ? <span className="ml-1 text-xs font-normal text-emerald-700">({left})</span> : null}</span>]] as [string, React.ReactNode][]) : []),
    ["Lot number", l.lotNo],
    ["Auction hall", l.hall],
    ["Make", l.make],
    ["Model", l.model],
    ["Year", l.year],
    ["Chassis model", l.modelCode],
    ["Transmission", l.transmission],
    ["Engine", `${l.engineCc.toLocaleString("en-US")} cc ${l.fuel}`],
    ...(l.engineHp ? ([["Engine power", `${l.engineHp} hp`]] as [string, React.ReactNode][]) : []),
    ["Mileage", km(l.mileageKm)],
    ["Colour", l.color],
    ["Drive", l.drive],
    ["Start price", jpy(l.startPriceJpy)],
    ...(l.resultPriceJpy ? ([["Sold for", jpy(l.resultPriceJpy)]] as [string, React.ReactNode][]) : []),
    ["Status", l.status === "upcoming" ? "Available" : l.status === "unsold" ? "Not sold" : l.status[0]!.toUpperCase() + l.status.slice(1)],
    ["Auction grade", `${l.grade} / interior ${l.interiorGrade}`],
    ...(l.modelGrade ? ([["Model grade", l.modelGrade]] as [string, React.ReactNode][]) : []),
    ["Recent average", jpy(l.avgPriceJpy)],
  ];
  return (
    <AuctionGate>
      <AuctionNav />
      <div className="container-page space-y-4 py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Link to="/auction/list" className="mb-1 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700 print:hidden">
              <ChevronLeft className="size-4" /> Lots
            </Link>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{l.make} {l.model} <span className="font-normal text-slate-500">{l.year}</span></h1>
            {l.modelGrade && <p className="text-sm text-slate-500">{l.modelGrade}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              <Printer className="size-4" /> Print
            </Button>
            <a href={`/api/auction/lots/${l.id}/spec.pdf`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
              <FileText className="size-4" /> PDF
            </a>
            <p className="ml-2 text-sm text-slate-600">Start price <strong className="text-lg text-brand-700">{jpy(l.startPriceJpy)}</strong></p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <div className="flex gap-1">
            {["A", "B", "C", "D"].map((L, i) =>
              d.photos[i] ? (
                <button key={L} aria-label={`Show picture ${L}`} onClick={() => setImg(i)} className={clsx("size-8 rounded-lg text-sm font-semibold", img === i ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-brand-100")}>{L}</button>
              ) : (
                <span key={L} className="flex size-8 items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-300">{L}</span>
              ),
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/auction/list${qs({ make: l.make, model: l.model })}`} className="text-sm font-semibold text-brand-700 hover:underline">
              Find others like this →
            </Link>
            {d.prevId ? <Link to={`/auction/lots/${d.prevId}`} className="inline-flex h-8 items-center gap-1 rounded-xl bg-white px-3 text-sm font-semibold shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"><ChevronLeft className="size-4" /> Previous</Link> : <span className="inline-flex h-8 items-center gap-1 rounded-xl bg-slate-50 px-3 text-sm text-slate-400"><ChevronLeft className="size-4" /> Previous</span>}
            {d.nextId ? <Link to={`/auction/lots/${d.nextId}`} className="inline-flex h-8 items-center gap-1 rounded-xl bg-white px-3 text-sm font-semibold shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">Next <ChevronRight className="size-4" /></Link> : <span className="inline-flex h-8 items-center gap-1 rounded-xl bg-slate-50 px-3 text-sm text-slate-400">Next <ChevronRight className="size-4" /></span>}
          </div>
        </div>
        <Card>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-5">
            {specs.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className="font-medium break-words text-slate-900">{v}</dd>
              </div>
            ))}
          </dl>
          {l.equipment && <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500">Equipment: {l.equipment}</p>}
        </Card>
        {msg && <p role="status" className={clsx("rounded-xl px-3 py-2 text-sm", msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700")}>{msg.text}</p>}
        <div className="print:hidden">
          <ProductionLookup code={l.modelCode} make={l.make} makers={d.makers} />
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div className="min-w-0 space-y-4">
            <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <button onClick={() => setZoom(true)} className="block w-full" aria-label="Open full size">
                <img src={images[img]} alt="" className={clsx("w-full bg-slate-50", img === sheetAt ? "aspect-[5/7] object-contain" : "aspect-[16/10] object-cover")} />
              </button>
              <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-lg bg-slate-900/70 px-2 py-1 text-xs text-white">
                <ZoomIn className="size-3.5" /> Full size
              </span>
            </div>
            <div className="scrollbar-thin flex gap-2 overflow-x-auto">
              {images.map((src, i) => (
                <button key={src} onClick={() => setImg(i)} className={clsx("shrink-0 overflow-hidden rounded-xl ring-2", i === img ? "ring-brand-500" : "ring-transparent")}>
                  <img src={src} alt="" className="h-16 w-24 bg-white object-cover" />
                  {i === sheetAt && <span className="block bg-amber-100 text-center text-[11px] font-semibold text-amber-800">Auction sheet</span>}
                </button>
              ))}
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-semibold">Deadlines</p>
              <p>Bid: 2 hours before the sale</p>
              <p>Cancel a bid: 1 hour before the sale</p>
            </div>
            {d.sheet ? (
              <Button className="w-full print:hidden" variant="secondary" onClick={() => openChatWith(`${fte}, please check the auction sheet of lot ${l.lotNo} (${l.hall}, ${l.saleDate}) and tell me if it is a good car.`)}>
                <Bot className="size-4 text-violet-600" /> Ask <FteName /> to read the sheet
              </Button>
            ) : (
              <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">No auction sheet was supplied for this lot yet.</p>
            )}
            {d.soraReading && (
              <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm">
                <p className="font-semibold text-violet-900">
                  <FteName />'s reading: <span className="uppercase">{d.soraReading.verdict}</span> · grade {d.soraReading.grade}
                </p>
                <p className="text-violet-900/80">{d.soraReading.reasons?.slice(0, 3).join(" · ")}</p>
              </div>
            )}
            <SheetLegend marks={d.marks} />
            <Card>
              <p className="mb-2 flex items-center gap-2 font-semibold text-slate-900">
                <History className="size-4" /> What this model sold for (last 93 days)
              </p>
              {h.count ? (
                <>
                  <div className="grid grid-cols-1 gap-2 text-center min-[440px]:grid-cols-3">
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
          <div className="min-w-0 space-y-4 print:hidden">
            <Card>
              <p className="flex items-center gap-2 font-semibold text-slate-900">
                <Gavel className="size-4" /> Make a bid
              </p>
              {d.biddingOpen && can("auction.bids.place") ? (
                <form
                  className="mt-3 space-y-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setMsg(null);
                    try {
                      const r = await api.post<{ bidNo: string }>(`/api/auction/lots/${l.id}/bids`, { amountJpy: Number(bid), overBidJpy: over ? Number(over) : null, message: message || undefined, agree });
                      setBid("");
                      setOver("");
                      setMessage("");
                      setAgree(false);
                      setMsg({ ok: true, text: `Bid ${r.bidNo} placed at ¥${amount.toLocaleString("en-US")}. It is now with our auction desk.` });
                      await qc.invalidateQueries({ queryKey: ["alot", id] });
                    } catch (ex) {
                      setMsg({ ok: false, text: (ex as Error).message });
                    }
                  }}
                >
                  <p className="text-sm text-slate-600">Start price <strong>{jpy(l.startPriceJpy)}</strong>. Bid any amount; our desk confirms every bid.</p>
                  {d.saleMayHaveRun && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800">{l.saleTime ? "This lot's auction time has passed. You can still bid, and our desk will confirm whether the car is still available." : "This hall publishes no time and today is the sale day. You can still bid, and our desk will confirm whether the car is still available."}</p>}
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Your bid (JPY)">
                      <Input type="number" min={1} step="any" required value={bid} onChange={(e) => setBid(e.target.value)} placeholder={String(l.startPriceJpy)} />
                    </Field>
                    <Field label="Over bid (JPY)">
                      <Input type="number" min={0} step={1000} value={over} onChange={(e) => setOver(e.target.value)} />
                    </Field>
                  </div>
                  <dl className="space-y-1 text-sm">
                    <div className="flex justify-between"><dt className="text-slate-500">Auction charges</dt><dd>Ask rate</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">Service charges</dt><dd>¥{f.serviceJpy.toLocaleString("en-US")}</dd></div>
                    <div className="flex justify-between font-semibold"><dt>Approx. FOB</dt><dd data-testid="approx-fob">{approxFob ? `¥${approxFob.toLocaleString("en-US")}` : "—"}</dd></div>
                  </dl>
                  <Field label={`Message (${message.length} / 1000)`}>
                    <Textarea rows={3} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Anything our desk should know" />
                  </Field>
                  <label className="flex min-h-7 items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-1 accent-brand-600" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                    <span>I agree to the <Link to="/terms" className="font-semibold text-brand-700" target="_blank">Terms & Conditions</Link></span>
                  </label>
                  <Button type="submit" className="w-full" disabled={!amount}>Make bid</Button>
                </form>
              ) : (
                <p className="mt-2 text-sm text-slate-500">This lot is no longer in the auction. Bidding is closed.</p>
              )}
              {d.myBids.length > 0 && (
                <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-sm">
                  {d.myBids.map((b) => (
                    <li key={b.id}>
                      <p className="flex flex-wrap justify-between gap-2">
                        <span className="text-slate-500">{b.bidNo ?? "Your bid"} · {date(b.createdAt)}</span>
                        <span className="font-semibold">{jpy(b.amountJpy)} <Badge tone={b.status === "rejected" || b.status === "lost" ? "red" : b.status === "accepted" || b.status === "won" ? "green" : "blue"}>{b.status}</Badge></span>
                      </p>
                      {b.note && <p className="text-xs text-slate-600">{b.note}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <FobTable key={l.id} fees={f} start={l.startPriceJpy} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setOrdering(true)} disabled={!d.biddingOpen}>
                Order this lot
              </Button>
              <a href={`/api/auction/lots/${l.id}/download.zip`} className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
                <Download className="size-4" /> All images + PDF in ZIP
              </a>
            </div>
            <Card>
              <p className="font-semibold text-slate-900">Send an enquiry</p>
              {d.isCustomer ? (
                <form
                  className="mt-2 space-y-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setMsg(null);
                    try {
                      const r = await api.post<{ enqNo: string }>(`/api/auction/lots/${l.id}/enquiries`, { message: enqText });
                      setEnqText("");
                      setMsg({ ok: true, text: `Enquiry ${r.enqNo} sent. The answer appears in My bids & orders.` });
                    } catch (ex) {
                      setMsg({ ok: false, text: (ex as Error).message });
                    }
                  }}
                >
                  <Textarea aria-label="Your question" rows={3} value={enqText} onChange={(e) => setEnqText(e.target.value)} placeholder="Ask about condition, shipping or total cost" />
                  <Button type="submit" size="sm" disabled={enqText.trim().length < 3}>Send enquiry</Button>
                </form>
              ) : (
                <p className="mt-1 text-sm text-slate-500">Buyers' enquiries on this lot arrive in the <Link to="/auction/admin" className="font-semibold text-brand-700">auction admin</Link>.</p>
              )}
            </Card>
          </div>
        </div>
        {d.related.length > 0 && (
          <div className="print:hidden">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-900">More {l.make} {l.model}</h2>
              <Link to={`/auction/list${qs({ make: l.make, model: l.model })}`} className="text-sm font-semibold text-brand-700">View all →</Link>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {d.related.map((r) => (
                <Link key={r.id} to={`/auction/lots/${r.id}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:border-brand-300">
                  <img src={r.image} alt="" loading="lazy" className="aspect-[16/10] w-full bg-slate-50 object-cover" />
                  <div className="p-3 text-sm">
                    <p className="font-semibold text-slate-900">Lot {r.lotNo} · {r.year}</p>
                    <p className="text-xs text-slate-500">{km(r.mileageKm)}</p>
                    <p className="mt-1 font-bold text-brand-700">{jpy(r.startPriceJpy)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
      {zoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setZoom(false)}>
          <img src={images[img]} alt="" className="max-h-full max-w-full bg-white object-contain" />
        </div>
      )}
      <Modal
        open={ordering}
        onClose={() => setOrdering(false)}
        title="Confirm your order"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOrdering(false)}>Cancel</Button>
            <Button
              disabled={!orderOk}
              onClick={async () => {
                try {
                  const o = await api.post<{ orderNo: string }>(`/api/auction/lots/${l.id}/order`, { agree: orderOk });
                  setOrdering(false);
                  setOrderOk(false);
                  setMsg({ ok: true, text: `Order ${o.orderNo} placed. Our team will confirm it.` });
                } catch (ex) {
                  setMsg({ ok: false, text: (ex as Error).message });
                  setOrdering(false);
                }
              }}
            >
              Place order
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
            {[["Vehicle", `${l.year} ${l.make} ${l.model}`], ["Lot number", l.lotNo], ["Auction house", l.hall], ["Auction date", date(l.saleDate)], ["Inspection grade", l.grade], ["Chassis model", l.modelCode], ["Mileage", km(l.mileageKm)], ["Engine", `${l.engineCc} cc`]].map(([k, v]) => (
              <div key={String(k)}>
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className="font-medium text-slate-900">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="font-semibold text-slate-900">Buyer</p>
            <p className="text-slate-600">{me?.name} · {me?.email}{me?.phone ? ` · ${me.phone}` : ""}</p>
          </div>
          <dl className="space-y-1">
            <div className="flex justify-between"><dt className="text-slate-500">Vehicle price</dt><dd className="font-semibold">{jpy(l.avgPriceJpy)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Auction and service fees</dt><dd>Quoted on confirmation</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Shipping</dt><dd>Quoted on confirmation</dd></div>
            <div className="flex justify-between border-t border-slate-100 pt-1 font-semibold"><dt>Payable now</dt><dd>¥0</dd></div>
          </dl>
          <p className="text-xs text-slate-500">Nothing is charged today. We send a full cost quote before anything is due.</p>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1 accent-brand-600" checked={orderOk} onChange={(e) => setOrderOk(e.target.checked)} />
            <span>I understand this is a request to purchase and fees are quoted before payment.</span>
          </label>
        </div>
      </Modal>
    </AuctionGate>
  );
}

interface StatRow {
  id: string;
  saleDate: string;
  hall: string;
  lotNo: number;
  make: string;
  model: string;
  modelCode: string;
  modelGrade: string | null;
  equipment: string | null;
  year: number;
  engineCc: number;
  mileageKm: number;
  grade: string;
  color: string;
  transmission: string;
  startPriceJpy: number;
  finalPriceJpy: number;
  sold: number;
  avgSameCodeJpy: number | null;
  soldSameCode: number;
  image: string | null;
}

const STAT_KEYS = ["make", "model", "chassis", "lots", "yearMin", "yearMax", "months", "grade", "color", "sold", "hall", "engine", "sort", "page", "pageSize"];

export function AuctionStatistics() {
  const [sp, setSp] = useSearchParams();
  const p = useMemo(() => Object.fromEntries(STAT_KEYS.map((k) => [k, sp.get(k) ?? ""])), [sp]);
  const facets = useQuery({ queryKey: ["afacets-stats"], queryFn: () => api.get<Facets>("/api/auction/facets"), staleTime: 3600_000 });
  const halls = useQuery({ queryKey: ["ahalls"], queryFn: () => api.get<{ id: string; name: string }[]>("/api/auction/halls"), staleTime: 3600_000 });
  const q = useQuery({ queryKey: ["astats", p], queryFn: () => api.get<{ items: StatRow[]; total: number; soldCount: number; avgSoldJpy: number; page: number; pageSize: number; window: { from: string; to: string }; canExport: boolean }>(`/api/auction/stats${qs(p)}`), placeholderData: keepPreviousData });
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v);
    else n.delete(k);
    if (k !== "page") n.delete("page");
    setSp(n);
  };
  const box = (k: string, label: string, placeholder: string, cls = "") => (
    <Input key={`${k}-${p[k]}`} aria-label={label} className={cls} placeholder={placeholder} defaultValue={p[k]} onKeyDown={(e) => e.key === "Enter" && set(k, (e.target as HTMLInputElement).value.trim())} onBlur={(e) => e.target.value.trim() !== p[k] && set(k, e.target.value.trim())} />
  );
  return (
    <AuctionGate>
      <AuctionNav />
      <div className="container-page py-6">
        <h1 className="text-2xl font-bold text-slate-900">Past auction prices</h1>
        <p className="text-sm text-slate-500">{q.data ? `${date(q.data.window.from)} → ${date(q.data.window.to)} (rolling 93 days)` : "…"}</p>
        <div className="my-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <Select aria-label="Maker" value={p.make} onChange={(e) => set("make", e.target.value)}>
            <option value="">All makers</option>
            {facets.data?.makes.map((m) => <option key={m.v}>{m.v}</option>)}
          </Select>
          {box("model", "Model name", "Model name, like Prius")}
          {box("chassis", "Chassis no. or model code", "Chassis no. or model code")}
          {box("lots", "Lot numbers", "Lot no. (1234, 5678)")}
          <div className="grid grid-cols-2 gap-2">
            {box("yearMin", "Year from", "Year from")}
            {box("yearMax", "Year to", "to")}
          </div>
          <Select aria-label="Dates" value={p.months} onChange={(e) => set("months", e.target.value)}>
            <option value="">All dates</option>
            <option value="1">Last 1 month</option>
            <option value="2">Last 2 months</option>
            <option value="3">Last 3 months</option>
          </Select>
          <Select aria-label="Sold or not" value={p.sold} onChange={(e) => set("sold", e.target.value)}>
            <option value="">Sold and unsold</option>
            <option value="1">Sold only</option>
            <option value="0">Not sold only</option>
          </Select>
          <Select aria-label="Condition" value={p.grade} onChange={(e) => set("grade", e.target.value)}>
            <option value="">Any condition</option>
            {["6", "5", "4.5", "4", "3.5", "3", "2", "R", "RA"].map((g) => <option key={g}>{g}</option>)}
          </Select>
          <Select aria-label="Colour" value={p.color} onChange={(e) => set("color", e.target.value)}>
            <option value="">Any colour</option>
            {facets.data?.colors.map((c) => <option key={c.v}>{c.v}</option>)}
          </Select>
          <Select aria-label="Hall" value={p.hall} onChange={(e) => set("hall", e.target.value)}>
            <option value="">All halls</option>
            {halls.data?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </Select>
          <Select aria-label="Engine" value={p.engine} onChange={(e) => set("engine", e.target.value)}>
            <option value="">Any engine</option>
            <option value="-1000">Up to 1,000 cc</option>
            <option value="1001-1500">1,001 to 1,500 cc</option>
            <option value="1501-2000">1,501 to 2,000 cc</option>
            <option value="2001-3000">2,001 to 3,000 cc</option>
            <option value="3001-">Over 3,000 cc</option>
          </Select>
          <Select aria-label="Sort" value={p.sort} onChange={(e) => set("sort", e.target.value)}>
            <option value="">Newest sale first</option>
            <option value="price_desc">Price: high to low</option>
            <option value="price_asc">Price: low to high</option>
            <option value="year_desc">Year: newest</option>
            <option value="mileage_asc">Mileage: lowest</option>
            <option value="lot">Lot number</option>
          </Select>
        </div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            {q.data && (
              <span>
                <strong className="text-slate-900">{q.data.total.toLocaleString("en-US")}</strong> results, <strong className="text-slate-900">{q.data.soldCount.toLocaleString("en-US")}</strong> of them sold{q.data.soldCount ? <>, average sale price <strong className="text-slate-900">{jpy(q.data.avgSoldJpy)}</strong></> : null}
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700"><span className="size-1.5 rounded-full bg-emerald-500" /> Live</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setSp(new URLSearchParams())}>Reset</Button>
            {q.data?.canExport && (
              <a href={`/api/auction/stats.csv${qs({ ...p, page: undefined, pageSize: undefined })}`} title="This list as a spreadsheet, up to 10,000 rows. Staff only." className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
                <Download className="size-4" /> Download CSV
              </a>
            )}
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              Show
              <select className="h-8 rounded-lg border border-slate-200 bg-white px-1.5 text-sm" value={p.pageSize || "20"} onChange={(e) => set("pageSize", e.target.value)}>
                {[20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
        </div>
        {!q.data ? (
          <Skeleton className="h-80" />
        ) : !q.data.items.length ? (
          <Empty title="No past sales match" text="Try a wider search: a maker on its own, or a shorter chassis code." />
        ) : (
          <>
            <Table head={["Photo", "Date", "Hall", "Lot", "Vehicle", "Model grade", "Year", "Mileage", "Gearbox / colour", "Grade", "Start", "Result", "Average, same code"]}>
              {q.data.items.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">{r.image ? <img src={r.image} alt="" loading="lazy" className="h-10 w-14 rounded-md bg-slate-100 object-cover" /> : <span className="block h-10 w-14 rounded-md bg-slate-100" />}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{date(r.saleDate)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.hall}</td>
                  <td className="px-3 py-2">
                    <Link className="font-semibold text-brand-700" to={`/auction/statistics/${r.id}`}>{r.lotNo}</Link>
                  </td>
                  <td className="px-3 py-2">{r.make} {r.model} <span className="block text-xs text-slate-500">{r.modelCode}</span></td>
                  <td className="px-3 py-2">{r.modelGrade ?? "—"}</td>
                  <td className="px-3 py-2">{r.year}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{km(r.mileageKm)}</td>
                  <td className="px-3 py-2">{r.transmission}<span className="block text-xs text-slate-500">{r.color}</span></td>
                  <td className="px-3 py-2">{r.grade}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{jpy(r.startPriceJpy)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.sold ? <strong>{jpy(r.finalPriceJpy)}</strong> : <span className="text-slate-500">Not sold · high bid {jpy(r.finalPriceJpy)}</span>}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.avgSameCodeJpy ? <>{jpy(r.avgSameCodeJpy)}<span className="block text-xs text-slate-500">{r.soldSameCode} sold</span></> : "—"}</td>
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
  const q = useQuery({ queryKey: ["astat", id], queryFn: () => api.get<{ result: StatRow; history: LotDetail["history"]; prevId: string | null; nextId: string | null; marks: [string, string][]; makers: string[]; photo: string | null }>(`/api/auction/stats/${id}`) });
  const [copied, setCopied] = useState(false);
  const r = q.data?.result;
  const info = r ? `Lot ${r.lotNo}, ${r.hall}, ${r.saleDate}: ${r.year} ${r.make} ${r.model} (${r.modelCode}), ${r.mileageKm.toLocaleString("en-US")} km, grade ${r.grade}. ${r.sold ? `Sold for ¥${r.finalPriceJpy.toLocaleString("en-US")}` : `Not sold, high bid ¥${r.finalPriceJpy.toLocaleString("en-US")}`}.` : "";
  return (
    <AuctionGate>
      <AuctionNav />
      <div className="container-page space-y-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link to="/auction/statistics" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700">
            <ChevronLeft className="size-4" /> Past prices
          </Link>
          {q.data && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard?.writeText(info);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />} Copy info
              </Button>
              {q.data.prevId ? <Link to={`/auction/statistics/${q.data.prevId}`} className="inline-flex h-8 items-center gap-1 rounded-xl bg-white px-3 text-sm font-semibold shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"><ChevronLeft className="size-4" /> Previous</Link> : null}
              {q.data.nextId ? <Link to={`/auction/statistics/${q.data.nextId}`} className="inline-flex h-8 items-center gap-1 rounded-xl bg-white px-3 text-sm font-semibold shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">Next <ChevronRight className="size-4" /></Link> : null}
            </div>
          )}
        </div>
        {!r ? (
          <Skeleton className="h-60" />
        ) : (
          <>
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
                    ["Model grade", r.modelGrade ?? "—"],
                    ["Equipment", r.equipment ?? "—"],
                    ["Engine", `${r.engineCc} cc`],
                    ["Mileage", km(r.mileageKm)],
                    ["Condition", r.grade],
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
              <div className="space-y-4">
                {q.data!.photo ? <img src={q.data!.photo} alt="" className="aspect-[16/10] w-full rounded-2xl bg-slate-50 object-cover" /> : <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">No photograph for this sale</p>}
                <Card>
                  <p className="font-semibold text-slate-900">Same model, last 93 days</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {q.data!.history.soldCount} sold of {q.data!.history.count} · average {jpy(q.data!.history.avgSoldJpy)}
                  </p>
                </Card>
              </div>
            </div>
            <ProductionLookup code={r.modelCode} make={r.make} makers={q.data!.makers} />
            <SheetLegend marks={q.data!.marks} />
          </>
        )}
      </div>
    </AuctionGate>
  );
}

export function AuctionMe() {
  const { can } = useAuth();
  const q = useQuery({ queryKey: ["ame"], queryFn: () => api.get<{ onSale: number; pastResults: number; account: { name: string; email: string | null; phone: string | null; memberSince: string }; bids: { id: string; bidNo: string | null; amountJpy: number; status: string; note: string | null; createdAt: string; lot: { lotNo: number; make: string; model: string; year: number; saleDate: string } }[]; orders: { id: string; orderNo: string; status: string; priceJpy: number; createdAt: string; lot: { lotNo: number; make: string; model: string } }[]; enquiries: { id: string; enqNo: string; message: string; reply: string | null; status: string; createdAt: string; lot: { lotNo: number; make: string; model: string } }[] }>("/api/auction/me") });
  const d = q.data;
  const tile = (k: string, v: React.ReactNode, s: React.ReactNode) => (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold text-slate-500">{k}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{v}</p>
      <p className="text-xs text-slate-500">{s}</p>
    </div>
  );
  return (
    <AuctionGate>
      <AuctionNav />
      <div className="container-page space-y-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-slate-900">My bids & orders</h1>
          <Link to="/auction" className="inline-flex h-9 items-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white">Browse auctions</Link>
        </div>
        {d && (
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-5">
            {tile("Bids placed", d.bids.length, `${d.bids.filter((b) => ["placed", "under review", "accepted"].includes(b.status)).length} still live`)}
            {tile("Orders placed", d.orders.length, `${d.orders.filter((o) => ["pending", "approved", "confirmed"].includes(o.status)).length} in progress`)}
            {tile("Enquiries", d.enquiries.length, `${d.enquiries.filter((e) => e.status === "new" || e.status === "open").length} awaiting a reply`)}
            {tile("Lots available", d.onSale.toLocaleString("en-US"), "updated through the day")}
            {tile("Past prices", d.pastResults.toLocaleString("en-US"), <Link className="font-semibold text-brand-700" to="/auction/statistics">past auction results</Link>)}
          </div>
        )}
        <Card>
          <p className="mb-2 font-semibold">Bids</p>
          {d?.bids.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {d.bids.map((b) => (
                <li key={b.id} className="py-2">
                  <p className="flex flex-wrap justify-between gap-2">
                    <span>
                      <strong>{b.bidNo ?? "Bid"}</strong> · Lot {b.lot.lotNo} · {b.lot.year} {b.lot.make} {b.lot.model} · sale {date(b.lot.saleDate)}
                    </span>
                    <span className="font-semibold">
                      {jpy(b.amountJpy)} <Badge tone={b.status === "rejected" || b.status === "lost" ? "red" : b.status === "accepted" || b.status === "won" ? "green" : "blue"}>{b.status}</Badge>
                    </span>
                  </p>
                  {b.note && <p className="text-xs text-slate-600">{b.note}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No bids yet. Open any lot and place a bid.</p>
          )}
        </Card>
        <Card>
          <p className="mb-2 font-semibold">Orders</p>
          {d?.orders.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {d.orders.map((o) => (
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
          {d?.enquiries.length ? (
            <ul className="space-y-3 text-sm">
              {d.enquiries.map((e) => (
                <li key={e.id} className="rounded-xl border border-slate-200 p-3">
                  <p className="font-semibold">
                    {e.enqNo} · Lot {e.lot.lotNo} {e.lot.make} {e.lot.model} <Badge tone={e.status === "answered" ? "green" : e.status === "closed" ? "gray" : "amber"}>{e.status}</Badge>
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
        {d && (
          <Card>
            <p className="mb-2 font-semibold">Account</p>
            <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
              {[["Name", d.account.name], ["E-mail", d.account.email ?? "—"], ["Phone", d.account.phone ?? "—"], ["Member since", date(d.account.memberSince)]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-slate-100 py-1">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="min-w-0 truncate font-medium text-slate-900">{v}</dd>
                </div>
              ))}
            </dl>
            {can("auction.admin") && <p className="mt-2 text-xs text-slate-500">You are signed in as staff: your bids are shown to you and to those allowed to see everyone's.</p>}
          </Card>
        )}
      </div>
    </AuctionGate>
  );
}

export function RedirectAuction() {
  return <Navigate to="/auction" replace />;
}

void useRef;
void Tabs;
