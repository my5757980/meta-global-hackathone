import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { SlidersHorizontal, X } from "lucide-react";
import { api, qs } from "../lib/api";
import { useFte, type VehicleCard as V } from "../lib/site";
import { Button, Empty, Pagination, Select, Skeleton, clsx } from "../ui";
import { SearchBox } from "./SearchBox";
import { VehicleGrid } from "./VehicleCard";

interface Facets {
  brands: { name: string; slug: string; models: { name: string; slug: string }[] }[];
  bodyTypes: { name: string; count: number }[];
}
interface Country {
  code: string;
  name: string;
  rhdAllowed: boolean;
  inspectionRequired: boolean;
  inspectionFeeUsd: number;
  note: string | null;
}

const KEYS = ["q", "brand", "model", "country", "body", "fuel", "transmission", "drive", "steering", "color", "yearMin", "yearMax", "priceMin", "priceMax", "mileageMax", "sort", "page"] as const;
const CHIP: Partial<Record<(typeof KEYS)[number], string>> = { q: "Search", country: "Ship to", color: "Colour", yearMin: "Year from", yearMax: "Year to", priceMin: "Min price", priceMax: "Max price", mileageMax: "Max mileage" };

export default function Shop() {
  const fte = useFte();
  const [sp, setSp] = useSearchParams();
  const [open, setOpen] = useState(false);
  const params = useMemo(() => Object.fromEntries(KEYS.map((k) => [k, sp.get(k) ?? ""])) as Record<(typeof KEYS)[number], string>, [sp]);
  const facets = useQuery({ queryKey: ["facets"], queryFn: () => api.get<Facets>("/api/public/vehicles/facets"), staleTime: 300_000 });
  const list = useQuery({
    queryKey: ["vehicles", params],
    queryFn: () => api.get<{ items: V[]; total: number; page: number; pageSize: number }>(`/api/public/vehicles${qs({ ...params, pageSize: 24 })}`),
    placeholderData: keepPreviousData,
  });

  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v);
    else n.delete(k);
    if (k !== "page") n.delete("page");
    if (k === "brand") n.delete("model");
    setSp(n); // each change is a history entry: Back removes exactly one filter
  };
  const active = KEYS.filter((k) => k !== "page" && k !== "sort" && params[k]);
  const brand = facets.data?.brands.find((b) => b.slug === params.brand);
  const models = brand?.models ?? [];
  const countries = useQuery({ queryKey: ["countries"], queryFn: () => api.get<Country[]>("/api/public/countries"), staleTime: 3600_000 });
  const shipTo = countries.data?.find((c) => c.code === params.country);
  const chipLabel = (k: (typeof KEYS)[number]) => CHIP[k] ?? k.charAt(0).toUpperCase() + k.slice(1);
  const chipValue = (k: (typeof KEYS)[number]) => {
    const v = params[k];
    if (k === "brand") return brand?.name ?? v;
    if (k === "model") return models.find((m) => m.slug === v)?.name ?? v;
    if (k === "country") return shipTo?.name ?? v;
    if (k === "steering") return `${v}-hand drive`;
    if (k === "mileageMax") return `${Number(v).toLocaleString("en-US")} km`;
    if (k === "priceMax" || k === "priceMin") return `$${Number(v).toLocaleString("en-US")}`;
    return v;
  };

  const filters = (
    <div className="space-y-4">
      <SearchBox value={params.q} placeholder="Model, chassis, stock no." searchOnBlur onSearch={(q) => set("q", q)} />
      <Select value={params.brand} onChange={(e) => set("brand", e.target.value)} aria-label="Brand">
        <option value="">All brands</option>
        {facets.data?.brands.map((b) => (
          <option key={b.slug} value={b.slug}>
            {b.name}
          </option>
        ))}
      </Select>
      <Select value={params.model} onChange={(e) => set("model", e.target.value)} disabled={!params.brand} aria-label="Model">
        <option value="">{params.brand ? "All models" : "Choose a brand first"}</option>
        {models.map((m) => (
          <option key={m.slug} value={m.slug}>
            {m.name}
          </option>
        ))}
      </Select>
      <Select value={params.country} onChange={(e) => set("country", e.target.value)} aria-label="Ship to country">
        <option value="">Ship to any country</option>
        {countries.data?.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </Select>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Body type</p>
        <div className="flex flex-wrap gap-2">
          {(facets.data?.bodyTypes ?? []).map((b) => (
            <button key={b.name} onClick={() => set("body", params.body === b.name ? "" : b.name)} className={clsx("rounded-full px-3 py-1.5 text-xs font-semibold ring-1", params.body === b.name ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-700 ring-slate-200 hover:ring-brand-300")}>
              {b.name} <span className="opacity-60">{b.count}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
        <Select value={params.fuel} onChange={(e) => set("fuel", e.target.value)} aria-label="Fuel">
          <option value="">Any fuel</option>
          {["Petrol", "Diesel", "Hybrid", "Electric"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </Select>
        <Select value={params.transmission} onChange={(e) => set("transmission", e.target.value)} aria-label="Transmission">
          <option value="">Any gearbox</option>
          {["Automatic", "Manual", "CVT"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </Select>
        <Select value={params.drive} onChange={(e) => set("drive", e.target.value)} aria-label="Drive">
          <option value="">Any drive</option>
          {["2WD", "4WD", "AWD"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </Select>
        <Select value={params.steering} onChange={(e) => set("steering", e.target.value)} aria-label="Steering">
          <option value="">Any steering</option>
          <option value="Right">Right-hand</option>
          <option value="Left">Left-hand</option>
        </Select>
        <Select value={params.color} onChange={(e) => set("color", e.target.value)} aria-label="Colour">
          <option value="">Any colour</option>
          {["White", "Black", "Silver", "Gray", "Blue", "Red", "Green", "Brown", "Beige"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </Select>
        <Select value={params.mileageMax} onChange={(e) => set("mileageMax", e.target.value)} aria-label="Max mileage">
          <option value="">Any mileage</option>
          {[30000, 50000, 80000, 100000, 150000].map((x) => (
            <option key={x} value={x}>
              ≤ {x.toLocaleString("en-US")} km
            </option>
          ))}
        </Select>
        <Select value={params.yearMin} onChange={(e) => set("yearMin", e.target.value)} aria-label="Year from">
          <option value="">Year from</option>
          {[2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </Select>
        <Select value={params.priceMax} onChange={(e) => set("priceMax", e.target.value)} aria-label="Max price">
          <option value="">Max price</option>
          {[5000, 8000, 10000, 15000, 20000, 30000, 40000, 60000].map((x) => (
            <option key={x} value={x}>
              ${x.toLocaleString("en-US")}
            </option>
          ))}
        </Select>
      </div>
      {active.length > 0 && (
        <Button variant="ghost" size="sm" onClick={() => setSp(new URLSearchParams())}>
          Clear all filters
        </Button>
      )}
    </div>
  );

  return (
    <div className="container-page py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Cars in stock</h1>
          <p className="text-sm text-slate-500">{list.data ? `${list.data.total.toLocaleString("en-US")} ${list.data.total === 1 ? "car" : "cars"} ready to ship from Japan` : "Loading…"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" className="lg:hidden" onClick={() => setOpen(true)}>
            <SlidersHorizontal className="size-4" /> Filters {active.length ? `(${active.length})` : ""}
          </Button>
          <Select value={params.sort} onChange={(e) => set("sort", e.target.value)} className="w-44" aria-label="Sort">
            <option value="">Newest first</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            <option value="year_desc">Year: newest</option>
            <option value="mileage_asc">Mileage: lowest</option>
          </Select>
        </div>
      </div>
      {active.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {active.map((k) => (
            <button key={k} onClick={() => set(k, "")} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">
              {chipLabel(k)}: {chipValue(k)} <X className="size-3" />
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[17rem_1fr]">
        <aside className="hidden lg:block">
          <div className="scrollbar-thin sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">{filters}</div>
        </aside>
        <div>
          {shipTo && (
            <p className="mb-4 rounded-xl bg-brand-50 p-3 text-sm text-brand-900 ring-1 ring-brand-100">
              <strong>Shipping to {shipTo.name}:</strong> {shipTo.rhdAllowed ? "right-hand drive is accepted." : "right-hand drive is not accepted, so those cars are hidden."}{" "}
              {shipTo.inspectionRequired ? `A pre-shipment inspection is needed ($${shipTo.inspectionFeeUsd.toLocaleString("en-US")}).` : "No pre-shipment inspection is needed."} {shipTo.note ?? ""} <span className="text-brand-700">Demo rules: {fte} confirms them before you buy.</span>
            </p>
          )}
          {list.isLoading ? (
            <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-72" />
              ))}
            </div>
          ) : list.data && list.data.items.length ? (
            <>
              <div className={clsx(list.isFetching && "opacity-60 transition")}>
                <VehicleGrid items={list.data.items} />
              </div>
              <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={(p) => set("page", String(p))} />
            </>
          ) : (
            <Empty title="No cars match these filters" text={`Try removing a filter — or ask ${fte}, who also searches this week's auction lots.`} />
          )}
        </div>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold">Filters</p>
              <button onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Close filters">
                <X className="size-5" />
              </button>
            </div>
            {filters}
            <Button className="mt-4 w-full" onClick={() => setOpen(false)}>
              Show {list.data?.total ?? ""} {list.data?.total === 1 ? "car" : "cars"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
