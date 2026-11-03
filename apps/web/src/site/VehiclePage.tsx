import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Bot, Calendar, Check, ChevronLeft, ChevronRight, Cog, Fuel, Gauge, Heart, MapPin, ShoppingCart, X } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { km, usd } from "../lib/format";
import { isBuyer, useCart, useShopActions, useWishlist } from "../lib/shop";
import { useFte, type VehicleCard as V } from "../lib/site";
import { Badge, Button, Card, Empty, LinkButton, Skeleton } from "../ui";
import { VehicleGrid } from "./VehicleCard";
import { openChatWith } from "../chat/ChatWidget";

interface Vehicle extends V {
  refNo: string;
  modelCode: string;
  chassisNo: string;
  month: number;
  engineCc: number;
  steering: string;
  grade: string | null;
  doors: number;
  seats: number;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  m3: number;
  features: string[];
  specRows?: { name: string; value: string }[];
  description: string;
  shortDesc: string;
  images: string[];
  videoUrl: string | null;
}

export default function VehiclePage() {
  const fte = useFte();
  const { slug } = useParams();
  const q = useQuery({ queryKey: ["vehicle", slug], queryFn: () => api.get<{ vehicle: Vehicle; related: V[] }>(`/api/public/vehicles/${slug}`) });
  const [img, setImg] = useState(0);
  const [viewer, setViewer] = useState(false);
  if (q.isLoading)
    return (
      <div className="container-page grid gap-6 py-8 lg:grid-cols-2">
        <Skeleton className="aspect-[16/10]" />
        <Skeleton className="h-96" />
      </div>
    );
  if (!q.data) return <div className="container-page py-16"><Empty title="This car is not available" action={<Link to="/shop" className="font-semibold text-brand-700">Back to the shop</Link>} /></div>;
  const v = q.data.vehicle;
  const discounted = v.discountPriceUsd != null && Number(v.discountPriceUsd) < Number(v.priceUsd);
  const specs: [string, React.ReactNode][] = [
    ["Stock no.", v.stockNo],
    ["Ref no.", v.refNo],
    ["Make / model", `${v.brand} ${v.model}`],
    ["Chassis code", v.modelCode],
    ["Year / month", `${v.year} / ${String(v.month ?? 1).padStart(2, "0")}`],
    ["Grade", v.grade],
    ["Mileage", km(v.mileageKm)],
    ["Engine", v.engineCc ? `${v.engineCc.toLocaleString("en-US")} cc` : v.fuel === "Electric" ? "Electric" : null],
    ["Fuel", v.fuel],
    ["Transmission", v.transmission],
    ["Drive", v.drive],
    ["Steering", `${v.steering}-hand drive`],
    ["Body type", v.bodyType],
    ["Colour", v.color],
    ["Doors / seats", v.doors != null || v.seats != null ? `${v.doors ?? "—"} / ${v.seats ?? "—"}` : null],
    ["Dimensions", v.lengthMm != null && v.widthMm != null && v.heightMm != null ? `${v.lengthMm} × ${v.widthMm} × ${v.heightMm} mm` : null],
    ["Volume (freight)", v.m3 != null && Number(v.m3) > 0 ? `${Number(v.m3).toFixed(2)} m³` : null],
    ["Location", v.location],
  ];
  return (
    <div className="container-page py-6">
      <nav className="mb-4 text-sm text-slate-500">
        <Link to="/shop" className="inline-flex items-center gap-1 hover:text-brand-700">
          <ChevronLeft className="size-4" /> Back to stock
        </Link>
      </nav>
      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div>
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <button onClick={() => setViewer(true)} className="block w-full" aria-label="Open full-screen photos">
              <img src={v.images[img]} alt={v.title} className="aspect-[16/10] w-full object-cover" />
            </button>
            {v.images.length > 1 && (
              <>
                <button onClick={() => setImg((img - 1 + v.images.length) % v.images.length)} className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow" aria-label="Previous photo">
                  <ChevronLeft className="size-5" />
                </button>
                <button onClick={() => setImg((img + 1) % v.images.length)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow" aria-label="Next photo">
                  <ChevronRight className="size-5" />
                </button>
              </>
            )}
            <span className="absolute bottom-2 left-2 rounded-lg bg-slate-900/70 px-2 py-0.5 text-xs text-white">
              {img + 1} / {v.images.length}
              {v.images[img]?.startsWith("/api/media/car") ? " · illustration" : v.images[img]?.startsWith("/cars/") ? " · photo of this model" : ""}
            </span>
          </div>
          <div className="scrollbar-thin mt-3 flex gap-2 overflow-x-auto">
            {v.images.map((src, i) => (
              <button key={src} onClick={() => setImg(i)} className={`shrink-0 overflow-hidden rounded-xl ring-2 ${i === img ? "ring-brand-500" : "ring-transparent"}`}>
                <img src={src} alt="" className="h-16 w-28 object-cover" />
              </button>
            ))}
          </div>
          {v.videoUrl ? <VehicleVideo url={v.videoUrl} /> : null}
          <Card className="mt-6">
            <h2 className="text-lg font-semibold text-slate-900">Specifications</h2>
            <dl className="mt-3 grid gap-x-6 sm:grid-cols-2">
              {specs.map(([k, val]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-slate-100 py-2 text-sm">
                  <dt className="shrink-0 text-slate-500">{k}</dt>
                  <dd className="text-right font-medium text-slate-900">{val}</dd>
                </div>
              ))}
            </dl>
          </Card>
          {!!v.specRows?.length && (
            <Card>
              <p className="mb-2 font-semibold text-slate-900">More specifications</p>
              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {v.specRows.map((r) => (
                  <div key={r.name} className="flex justify-between gap-3 border-b border-slate-100 py-1">
                    <dt className="text-slate-500">{r.name}</dt>
                    <dd className="text-right font-medium text-slate-900">{r.value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}
          {v.features?.length > 0 && (
            <Card className="mt-4">
              <h2 className="text-lg font-semibold text-slate-900">Features</h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {v.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-slate-700">
                    <Check className="size-4 text-emerald-600" /> {f}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card className="mt-4">
            <h2 className="text-lg font-semibold text-slate-900">Description</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">{v.description}</p>
          </Card>
        </div>
        <div>
          <Card className="lg:sticky lg:top-20">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={v.status === "available" ? "green" : "amber"}>{v.status === "available" ? "Available" : v.status === "reserved" ? "Reserved" : "Sold"}</Badge>
              <Badge tone="gray">{v.stockNo}</Badge>
            </div>
            <h1 className="mt-3 text-xl font-bold text-slate-900 sm:text-2xl">{v.title}</h1>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-600 sm:grid-cols-4">
              <span className="flex items-center gap-1.5"><Calendar className="size-4 text-slate-400" /> {v.year}</span>
              <span className="flex items-center gap-1.5"><Gauge className="size-4 text-slate-400" /> {km(v.mileageKm)}</span>
              <span className="flex items-center gap-1.5"><Fuel className="size-4 text-slate-400" /> {v.fuel}</span>
              <span className="flex items-center gap-1.5"><Cog className="size-4 text-slate-400" /> {v.transmission}</span>
            </div>
            <div className="mt-5 rounded-2xl bg-slate-50 p-4">
              {discounted && <p className="text-sm text-slate-400 line-through">{usd(v.priceUsd)}</p>}
              <p className="text-3xl font-extrabold text-brand-700">{usd(discounted ? v.discountPriceUsd : v.priceUsd)}</p>
              <p className="text-xs text-slate-500">FOB Japan · <MapPin className="inline size-3" /> {v.location}</p>
            </div>
            <Button size="lg" className="mt-4 w-full" onClick={() => openChatWith(`Hi ${fte}, what is the C&F price of ${v.stockNo} (${v.title}) to my port?`)}>
              <Bot className="size-5" /> Ask {fte} the price to my port
            </Button>
            <ShopButtons v={v} />
            <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm font-semibold text-brand-700">
              <button onClick={() => openChatWith(`I'd like to reserve ${v.stockNo}.`)} className="hover:underline">Reserve with {fte}</button>
              <button onClick={() => openChatWith(`Please tell me about the condition of ${v.stockNo}.`)} className="hover:underline">Ask about its condition</button>
            </div>
            <p className="mt-4 text-xs text-slate-500">C&F quotes include inspection (where required) and freight to your port. Import duty and port charges at destination are paid locally.</p>
          </Card>
        </div>
      </div>
      {q.data.related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-xl font-bold text-slate-900">Related vehicles</h2>
          <VehicleGrid items={q.data.related.slice(0, 4)} />
        </section>
      )}
      {viewer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setViewer(false)}>
          <button className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white" aria-label="Close viewer">
            <X className="size-6" />
          </button>
          <img src={v.images[img]} alt={v.title} className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

/** The car's video: a YouTube link plays in place, a video file in the browser's player, anything else opens as a link. */
function VehicleVideo({ url }: { url: string }) {
  const youtube = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/.exec(url)?.[1];
  return (
    <Card className="mt-6">
      <h2 className="mb-3 text-lg font-semibold text-slate-900">Video</h2>
      {youtube ? (
        <iframe className="aspect-video w-full rounded-xl" src={`https://www.youtube-nocookie.com/embed/${youtube}`} title="Vehicle video" loading="lazy" allowFullScreen />
      ) : /\.(mp4|webm)(\?|$)/i.test(url) ? (
        <video className="aspect-video w-full rounded-xl bg-black" src={url} controls preload="metadata" />
      ) : (
        <a href={url} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 hover:underline">Watch the video</a>
      )}
    </Card>
  );
}

/** Cart and wishlist on the vehicle page. Signed out → sign in and come back here; staff do not shop. */
function ShopButtons({ v }: { v: { id: string; slug: string; status: string } }) {
  const { me } = useAuth();
  const nav = useNavigate();
  const cart = useCart();
  const wish = useWishlist();
  const act = useShopActions();
  const [busy, setBusy] = useState<"cart" | "wish" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (me && !isBuyer(me.kind)) return null;
  const inCart = !!cart.data?.items.some((i) => i.id === v.id);
  const saved = !!wish.data?.items.some((i) => i.id === v.id);
  const run = async (k: "cart" | "wish", fn: () => Promise<void>) => {
    setBusy(k);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Something went wrong — please try again");
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      {v.status === "available" && (
        <Button
          className="mt-2 w-full"
          loading={busy === "cart"}
          onClick={() =>
            run("cart", async () => {
              if (!inCart) await act.addToCart(v.id);
              nav("/checkout");
            })
          }
        >
          Buy now
        </Button>
      )}
      <div className="mt-2 grid grid-cols-2 gap-2">
        {inCart ? (
          <LinkButton to="/cart" variant="secondary">
            <Check className="size-4" /> In cart
          </LinkButton>
        ) : (
          <Button variant="secondary" disabled={v.status !== "available"} loading={busy === "cart"} onClick={() => run("cart", () => act.addToCart(v.id))}>
            <ShoppingCart className="size-4" /> {v.status === "available" ? "Add to cart" : v.status === "sold" ? "Sold" : "Reserved"}
          </Button>
        )}
        <Button variant="secondary" aria-pressed={saved} loading={busy === "wish"} onClick={() => run("wish", () => act.toggleWishlist(v.id, saved))}>
          <Heart className={saved ? "size-4 fill-rose-500 text-rose-500" : "size-4"} /> {saved ? "Saved" : "Save"}
        </Button>
      </div>
      {err && <p className="mt-2 text-sm font-semibold text-rose-600">{err}</p>}
    </>
  );
}
