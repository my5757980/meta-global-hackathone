import { Link } from "react-router";
import { Fuel, Gauge, Settings2 } from "lucide-react";
import type { VehicleCard as V } from "../lib/site";
import { km, usd } from "../lib/format";
import { Badge } from "../ui";

export function VehicleCard({ v }: { v: V }) {
  const discounted = v.discountPriceUsd != null && Number(v.discountPriceUsd) < Number(v.priceUsd);
  return (
    <Link to={`/vehicles/${v.slug}`} className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative aspect-[16/10] overflow-hidden bg-slate-100">
        <img src={v.image} alt={v.title} loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-[1.03]" />
        <div className="absolute top-2 left-2 flex gap-1">
          {v.status === "reserved" && <Badge tone="amber">Reserved</Badge>}
          {discounted && <Badge tone="red">Price drop</Badge>}
        </div>
        <span className="absolute right-2 bottom-2 rounded-lg bg-slate-900/70 px-2 py-0.5 text-[11px] font-semibold text-white">{v.stockNo}</span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold text-slate-900">{v.title}</p>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
          <span className="flex items-center gap-1 whitespace-nowrap">
            <Gauge className="size-3.5 shrink-0 text-slate-400" /> {km(v.mileageKm)}
          </span>
          <span className="flex items-center gap-1 whitespace-nowrap">
            <Fuel className="size-3.5 shrink-0 text-slate-400" /> {v.fuel}
          </span>
          <span className="flex items-center gap-1 whitespace-nowrap">
            <Settings2 className="size-3.5 shrink-0 text-slate-400" /> {v.transmission}
          </span>
        </div>
        <div className="mt-auto flex items-end justify-between gap-2 pt-4">
          <div>
            {discounted && <p className="text-xs text-slate-400 line-through">{usd(v.priceUsd)}</p>}
            <p className="text-lg font-bold text-brand-700">{usd(discounted ? v.discountPriceUsd : v.priceUsd)}</p>
            <p className="text-[11px] text-slate-500">FOB Japan</p>
          </div>
          <span className="rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 group-hover:bg-brand-600 group-hover:text-white">View</span>
        </div>
      </div>
    </Link>
  );
}

export function VehicleGrid({ items }: { items: V[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((v) => (
        <VehicleCard key={v.id} v={v} />
      ))}
    </div>
  );
}
