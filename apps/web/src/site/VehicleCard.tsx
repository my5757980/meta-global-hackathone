import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Check, Fuel, Gauge, Heart, Settings2, ShoppingCart } from "lucide-react";
import type { VehicleCard as V } from "../lib/site";
import { useAuth } from "../lib/auth";
import { km, usd } from "../lib/format";
import { isBuyer, useCart, useShopActions, useWishlist } from "../lib/shop";
import { Badge, clsx } from "../ui";

export function VehicleCard({ v }: { v: V }) {
  const { me } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const act = useShopActions();
  const cart = useCart();
  const wish = useWishlist();
  const [busy, setBusy] = useState<"cart" | "wish" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const discounted = v.discountPriceUsd != null && Number(v.discountPriceUsd) < Number(v.priceUsd);
  const off = discounted ? Math.round((1 - Number(v.discountPriceUsd) / Number(v.priceUsd)) * 100) : 0;
  const shops = !me || isBuyer(me.kind); // staff do not shop
  const inCart = !!cart.data?.items.some((x) => x.id === v.id);
  const saved = !!wish.data?.items.some((x) => x.id === v.id);
  const run = async (what: "cart" | "wish", fn: () => Promise<unknown>) => {
    if (!me) {
      nav(`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`);
      return;
    }
    setBusy(what);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const to = `/vehicles/${v.slug}`;
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <Link to={to} className="relative block aspect-[16/10] overflow-hidden bg-slate-100" tabIndex={-1} aria-hidden="true">
        <img src={v.image} alt="" loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-[1.03]" />
        <div className="absolute top-2 left-2 flex gap-1">
          {v.status === "reserved" && <Badge tone="amber">Reserved</Badge>}
          {discounted && <Badge tone="red">{off}% off</Badge>}
        </div>
        <span className="absolute right-2 bottom-2 rounded-lg bg-slate-900/70 px-2 py-0.5 text-[11px] font-semibold text-white">{v.stockNo}</span>
      </Link>
      {shops && (
        <button
          type="button"
          aria-label={saved ? `Remove ${v.title} from saved cars` : `Save ${v.title}`}
          aria-pressed={saved}
          disabled={busy === "wish"}
          onClick={() => void run("wish", () => act.toggleWishlist(v.id, saved))}
          className="absolute top-2 right-2 flex size-9 items-center justify-center rounded-full bg-white/95 text-slate-600 shadow ring-1 ring-slate-200 transition hover:text-rose-600 disabled:opacity-60"
        >
          <Heart className={clsx("size-4", saved && "fill-rose-500 text-rose-500")} />
        </button>
      )}
      <div className="flex flex-1 flex-col p-4">
        <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{v.brand}</p>
        <Link to={to} className="mt-0.5 line-clamp-2 min-h-[2.5rem] text-sm font-semibold text-slate-900 hover:text-brand-700">
          {v.title}
        </Link>
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
        <div className="mt-auto pt-4">
          {discounted && <p className="text-xs text-slate-400 line-through">{usd(v.priceUsd)}</p>}
          <p className="text-lg font-bold text-brand-700">{usd(discounted ? v.discountPriceUsd : v.priceUsd)}</p>
          <p className="text-[11px] text-slate-500">FOB Japan</p>
          <div className="mt-3 flex gap-2">
            {shops &&
              (inCart ? (
                <Link to="/cart" className="inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-2 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                  <Check className="size-4 shrink-0" /> In cart
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={v.status !== "available" || busy === "cart"}
                  onClick={() => void run("cart", () => act.addToCart(v.id))}
                  className="inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-2 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                >
                  <ShoppingCart className="size-4 shrink-0" /> {v.status === "available" ? "Add cart" : "Reserved"}
                </button>
              ))}
            <Link to={to} className="inline-flex h-9 items-center justify-center rounded-xl bg-brand-50 px-3 text-xs font-semibold text-brand-700 hover:bg-brand-100">
              View
            </Link>
          </div>
          {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}
        </div>
      </div>
    </div>
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
