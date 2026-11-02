import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Banknote, Bot, ChevronLeft, ChevronRight, ClipboardCheck, FileText, Gavel, Landmark, Play, Quote, ShieldCheck, Ship, Star, WalletCards } from "lucide-react";
import { api } from "../lib/api";
import { date } from "../lib/format";
import type { VehicleCard as V } from "../lib/site";
import { Button, Select, Skeleton, clsx } from "../ui";
import { VehicleGrid } from "./VehicleCard";
import { openChatWith } from "../chat/ChatWidget";

interface HomeData {
  site: { companyName: string; ftEName: string };
  sections: { key: string; title: string; subtitle: string | null; data: any }[];
  lists: Record<string, V[]>;
  testimonials: { name: string; country: string; text: string; rating: number }[];
  blog: { slug: string; title: string; excerpt: string; coverUrl: string; publishedAt: string }[];
  faqs: { question: string; answer: string }[];
  brands: { name: string; slug: string }[];
  bodyTypes: { name: string; count: number }[];
  steering: { name: string; count: number }[];
}

const ICONS: Record<string, React.ReactNode> = {
  Banknote: <Banknote className="size-6" />,
  Landmark: <Landmark className="size-6" />,
  WalletCards: <WalletCards className="size-6" />,
  ShieldCheck: <ShieldCheck className="size-6" />,
  Bot: <Bot className="size-6" />,
  Ship: <Ship className="size-6" />,
  FileText: <FileText className="size-6" />,
};

const carImg = (body: string, color: string) => `/api/media/car?body=${encodeURIComponent(body)}&color=${encodeURIComponent(COLOR_HEX[color] ?? "#b8bcc2")}&view=side`;
const COLOR_HEX: Record<string, string> = { "Pearl White": "#f4f4f2", Silver: "#b8bcc2", Black: "#1c1d21", "Dark Blue": "#1f3a63" };

export default function Home() {
  const q = useQuery({ queryKey: ["home"], queryFn: () => api.get<HomeData>("/api/public/home") });
  const d = q.data;
  const sec = (k: string) => d?.sections.find((s) => s.key === k);
  return (
    <div>
      <Hero data={sec("hero")?.data} brands={d?.brands ?? []} fte={d?.site.ftEName ?? "Sora"} />
      {sec("stats") && (
        <section className="container-page -mt-8 relative z-10">
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg sm:grid-cols-4 sm:p-6">
            {sec("stats")!.data.items.map((s: { label: string; value: string }) => (
              <div key={s.label} className="text-center">
                <p className="text-2xl font-extrabold text-brand-700 sm:text-3xl">{s.value}</p>
                <p className="text-xs font-medium text-slate-500 sm:text-sm">{s.label}</p>
              </div>
            ))}
          </div>
        </section>
      )}
      {d && (
        <section className="container-page mt-10">
          <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-2">
            {d.brands.map((b) => (
              <Link key={b.slug} to={`/shop?brand=${b.slug}`} className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-brand-300 hover:text-brand-700">
                {b.name}
              </Link>
            ))}
          </div>
        </section>
      )}
      {sec("steering") && d && d.steering.length > 0 && (
        <section className="container-page mt-10">
          <h2 className="text-2xl font-bold text-slate-900">{sec("steering")!.title}</h2>
          {sec("steering")!.subtitle && <p className="text-sm text-slate-500">{sec("steering")!.subtitle}</p>}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {d.steering.map((x) => (
              <Link key={x.name} to={`/shop?steering=${x.name}`} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-brand-300 hover:shadow-md">
                <span>
                  <span className="block text-lg font-semibold text-slate-900">{x.name}-hand drive</span>
                  <span className="text-sm text-slate-500">{x.count} cars in stock</span>
                </span>
                <ArrowRight className="size-5 shrink-0 text-brand-600" />
              </Link>
            ))}
          </div>
        </section>
      )}
      <ListSection title={sec("best_sellers")?.title} subtitle={sec("best_sellers")?.subtitle} items={d?.lists.best_sellers} loading={q.isLoading} />
      <SoraBand name={d?.site.ftEName ?? "Sora"} />
      {sec("why") && (
        <section className="container-page mt-16">
          <h2 className="text-center text-2xl font-bold text-slate-900 sm:text-3xl">{sec("why")!.title}</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {sec("why")!.data.items.map((w: { icon: string; title: string; text: string }) => (
              <div key={w.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 inline-flex rounded-xl bg-brand-50 p-2.5 text-brand-600">{ICONS[w.icon]}</div>
                <p className="font-semibold text-slate-900">{w.title}</p>
                <p className="mt-1 text-sm text-slate-600">{w.text}</p>
              </div>
            ))}
          </div>
        </section>
      )}
      <ListSection title={sec("upcoming")?.title} subtitle={sec("upcoming")?.subtitle} items={d?.lists.upcoming} loading={q.isLoading} />
      {sec("payment") && (
        <section className="container-page mt-16">
          <h2 className="text-center text-2xl font-bold text-slate-900 sm:text-3xl">{sec("payment")!.title}</h2>
          {sec("payment")!.subtitle && <p className="mx-auto mt-1 max-w-2xl text-center text-sm text-slate-500">{sec("payment")!.subtitle}</p>}
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {sec("payment")!.data.items.map((p: { icon: string; title: string; text: string; link?: string; cta?: string }) => (
              <div key={p.title} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 inline-flex w-fit rounded-xl bg-brand-50 p-2.5 text-brand-600">{ICONS[p.icon]}</div>
                <p className="font-semibold text-slate-900">{p.title}</p>
                <p className="mt-1 flex-1 text-sm text-slate-600">{p.text}</p>
                {p.link && (
                  <Link to={p.link} className="mt-3 text-sm font-semibold text-brand-700">
                    {p.cta ?? "See more"} →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      <ListSection title={sec("luxury")?.title} subtitle={sec("luxury")?.subtitle} items={d?.lists.luxury} loading={q.isLoading} />
      <ListSection title={sec("commercial")?.title} subtitle={sec("commercial")?.subtitle} items={d?.lists.commercial} loading={q.isLoading} />
      {sec("steps") && (
        <section className="mt-16 bg-brand-700 py-14 text-white">
          <div className="container-page">
            <h2 className="text-center text-2xl font-bold sm:text-3xl">{sec("steps")!.title}</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {sec("steps")!.data.items.map((st: { title: string; text: string }, i: number) => (
                <div key={st.title} className="rounded-2xl bg-white/10 p-6 ring-1 ring-white/15">
                  <span className="inline-flex size-10 items-center justify-center rounded-full bg-accent-500 font-bold text-slate-900">{i + 1}</span>
                  <p className="mt-3 text-lg font-semibold">{st.title}</p>
                  <p className="mt-1 text-sm text-brand-100">{st.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
      {sec("we_bid") && (
        <section className="container-page mt-16">
          <div className="grid items-center gap-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
                <Gavel className="size-3.5" /> Japan's auctions
              </span>
              <h2 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">{sec("we_bid")!.title}</h2>
              <p className="mt-2 text-slate-600">{sec("we_bid")!.subtitle}</p>
              <Link to="/auction" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700">
                See auction lots <ArrowRight className="size-4" />
              </Link>
            </div>
            <ol className="grid gap-3 sm:grid-cols-2">
              {sec("we_bid")!.data.items.map((it: { title: string; text: string }, i: number) => (
                <li key={it.title} className="rounded-2xl bg-slate-50 p-4">
                  <span className="inline-flex size-8 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{i + 1}</span>
                  <p className="mt-2 font-semibold text-slate-900">{it.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{it.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}
      <ListSection title={sec("new_arrivals")?.title} subtitle={sec("new_arrivals")?.subtitle} items={d?.lists.new_arrivals} loading={q.isLoading} />
      {d && (
        <section className="container-page mt-16">
          <h2 className="text-2xl font-bold text-slate-900">{sec("body_types")?.title ?? "Search by body type"}</h2>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {d.bodyTypes.map((b) => (
              <Link key={b.name} to={`/shop?body=${b.name}`} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md">
                <img src={`/api/media/car?body=${b.name}&color=%23b8bcc2&view=side`} alt="" className="aspect-[16/9] w-full object-cover" loading="lazy" />
                <div className="flex flex-wrap items-center justify-between gap-x-2 px-3 py-2">
                  <span className="font-semibold text-slate-800">{b.name}</span>
                  <span className="text-xs text-slate-500">{b.count} cars</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
      {sec("videos") && (
        <section className="container-page mt-16">
          <h2 className="text-2xl font-bold text-slate-900">{sec("videos")!.title}</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {sec("videos")!.data.items.map((v: { title: string; country: string; body: string; color: string }) => (
              <div key={v.title} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="relative">
                  <img src={carImg(v.body, v.color)} alt="" className="aspect-video w-full object-cover" loading="lazy" />
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex size-12 items-center justify-center rounded-full bg-white/90 text-brand-700 shadow">
                      <Play className="size-5 fill-current" />
                    </span>
                  </span>
                </div>
                <div className="p-4">
                  <p className="font-semibold text-slate-900">{v.title}</p>
                  <p className="text-sm text-slate-500">{v.country}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {d && d.testimonials.length > 0 && <Testimonials items={d.testimonials} />}
      {sec("member_of") && (
        <section className="container-page mt-16">
          <h2 className="text-center text-xl font-bold text-slate-900">{sec("member_of")!.title}</h2>
          <div className="mt-5 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:grid-cols-4">
            {sec("member_of")!.data.items.map((m: { name: string; short: string }) => (
              <div key={m.name} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-extrabold text-slate-600">{m.short}</span>
                <span className="text-xs font-medium text-slate-600">{m.name}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      {sec("register") && (
        <section className="container-page mt-16">
          <div className="flex flex-col items-start justify-between gap-4 rounded-3xl bg-gradient-to-r from-brand-600 to-brand-800 p-8 text-white sm:flex-row sm:items-center">
            <div>
              <h2 className="text-2xl font-bold">{sec("register")!.title}</h2>
              <p className="mt-1 max-w-xl text-brand-100">{sec("register")!.subtitle}</p>
            </div>
            <Link to="/register" className="rounded-xl bg-accent-500 px-6 py-3 font-semibold text-slate-900 hover:bg-accent-400">
              Register now
            </Link>
          </div>
        </section>
      )}
      {d && d.blog.length > 0 && (
        <section className="container-page mt-16">
          <div className="flex items-end justify-between">
            <h2 className="text-2xl font-bold text-slate-900">{sec("guides")?.title ?? "Latest guides"}</h2>
            <Link to="/blog" className="text-sm font-semibold text-brand-700">
              All guides →
            </Link>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {d.blog.map((b) => (
              <Link key={b.slug} to={`/blog/${b.slug}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md">
                <img src={b.coverUrl} alt="" className="aspect-video w-full object-cover" loading="lazy" />
                <div className="p-4">
                  <p className="text-xs text-slate-500">{date(b.publishedAt)}</p>
                  <p className="mt-1 font-semibold text-slate-900">{b.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{b.excerpt}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
      {d && d.faqs.length > 0 && (
        <section className="container-page mt-16 max-w-3xl">
          <h2 className="text-center text-2xl font-bold text-slate-900">{sec("faq")?.title ?? "FAQ"}</h2>
          <div className="mt-6 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
            {d.faqs.map((f) => (
              <details key={f.question} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-slate-900">
                  {f.question}
                  <ChevronRight className="size-4 shrink-0 transition group-open:rotate-90" />
                </summary>
                <p className="mt-2 text-sm text-slate-600">{f.answer}</p>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Hero({ data, brands, fte }: { fte: string; data?: { slides: { title: string; subtitle: string; cta: string; link: string; body: string; color: string }[] }; brands: { name: string; slug: string }[] }) {
  const [i, setI] = useState(0);
  const slides = data?.slides ?? [];
  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % slides.length), 7000);
    return () => clearInterval(t);
  }, [slides.length]);
  const s = slides[i];
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-brand-900 via-brand-800 to-brand-600 pb-20 text-white">
      <div className="container-page grid items-center gap-8 pt-10 lg:grid-cols-2 lg:pt-16">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-white/20">
            <Bot className="size-3.5" /> {fte}, AI sales executive · online now
          </span>
          <h1 className="mt-4 text-3xl font-extrabold leading-tight sm:text-5xl">{s?.title ?? "Japanese quality, delivered to your port"}</h1>
          <p className="mt-4 max-w-xl text-base text-brand-100 sm:text-lg">{s?.subtitle}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to={s?.link ?? "/shop"} className="inline-flex items-center gap-2 rounded-xl bg-accent-500 px-5 py-3 font-semibold text-slate-900 hover:bg-accent-400">
              {s?.cta ?? "Browse stock"} <ArrowRight className="size-4" />
            </Link>
            <button onClick={() => openChatWith(`Hi ${fte}, I'm looking for a car.`)} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 font-semibold ring-1 ring-white/25 hover:bg-white/20">
              <Bot className="size-4" /> Ask {fte}
            </button>
          </div>
          {slides.length > 1 && (
            <div className="mt-6 flex items-center gap-2">
              <button className="rounded-full p-1.5 hover:bg-white/10" aria-label="Previous slide" onClick={() => setI((i - 1 + slides.length) % slides.length)}>
                <ChevronLeft className="size-4" />
              </button>
              {slides.map((_, k) => (
                <span key={k} className={clsx("h-1.5 rounded-full transition-all", k === i ? "w-6 bg-accent-500" : "w-1.5 bg-white/40")} />
              ))}
              <button className="rounded-full p-1.5 hover:bg-white/10" aria-label="Next slide" onClick={() => setI((i + 1) % slides.length)}>
                <ChevronRight className="size-4" />
              </button>
            </div>
          )}
        </div>
        <div className="relative">
          {s && <img key={i} src={carImg(s.body, s.color)} alt="" className="w-full rounded-3xl shadow-2xl ring-1 ring-white/10" />}
        </div>
      </div>
      <div className="container-page mt-10">
        <QuickSearch brands={brands} />
      </div>
    </section>
  );
}

function QuickSearch({ brands }: { brands: { name: string; slug: string }[] }) {
  const nav = useNavigate();
  const [f, setF] = useState({ brand: "", model: "", body: "", priceMax: "", yearMin: "", mileageMax: "", transmission: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLSelectElement>) => setF({ ...f, [k]: e.target.value, ...(k === "brand" ? { model: "" } : {}) });
  const facets = useQuery({ queryKey: ["facets"], queryFn: () => api.get<{ brands: { slug: string; models: { name: string; slug: string }[] }[] }>("/api/public/vehicles/facets"), staleTime: 300_000 });
  const models = facets.data?.brands.find((b) => b.slug === f.brand)?.models ?? [];
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const p = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
        nav(`/shop?${p.toString()}`);
      }}
      className="grid gap-3 rounded-2xl bg-white p-4 text-slate-800 shadow-xl sm:grid-cols-2 lg:grid-cols-4"
    >
      <Select value={f.brand} onChange={set("brand")} aria-label="Brand">
        <option value="">Any brand</option>
        {brands.map((b) => (
          <option key={b.slug} value={b.slug}>
            {b.name}
          </option>
        ))}
      </Select>
      <Select value={f.model} onChange={set("model")} disabled={!f.brand} aria-label="Model">
        <option value="">{f.brand ? "Any model" : "Choose a brand first"}</option>
        {models.map((m) => (
          <option key={m.slug} value={m.slug}>
            {m.name}
          </option>
        ))}
      </Select>
      <Select value={f.body} onChange={set("body")} aria-label="Body type">
        <option value="">Any body type</option>
        {["SUV", "Sedan", "Hatchback", "Pickup", "Van", "Wagon", "Minivan", "Truck"].map((b) => (
          <option key={b}>{b}</option>
        ))}
      </Select>
      <Select value={f.priceMax} onChange={set("priceMax")} aria-label="Max price">
        <option value="">Any price</option>
        {[5000, 8000, 10000, 15000, 20000, 30000, 50000].map((p) => (
          <option key={p} value={p}>
            Up to ${p.toLocaleString("en-US")}
          </option>
        ))}
      </Select>
      <Select value={f.yearMin} onChange={set("yearMin")} aria-label="Year from">
        <option value="">Any year</option>
        {[2022, 2020, 2018, 2016, 2014].map((y) => (
          <option key={y} value={y}>
            From {y}
          </option>
        ))}
      </Select>
      <Select value={f.mileageMax} onChange={set("mileageMax")} aria-label="Max mileage">
        <option value="">Any mileage</option>
        {[30000, 50000, 80000, 100000, 150000].map((x) => (
          <option key={x} value={x}>
            Up to {x.toLocaleString("en-US")} km
          </option>
        ))}
      </Select>
      <Select value={f.transmission} onChange={set("transmission")} aria-label="Transmission">
        <option value="">Any transmission</option>
        <option>Automatic</option>
        <option>Manual</option>
        <option>CVT</option>
      </Select>
      <Button type="submit" className="w-full">
        Search cars
      </Button>
    </form>
  );
}

function ListSection({ title, subtitle, items, loading }: { title?: string; subtitle?: string | null; items?: V[]; loading: boolean }) {
  if (!loading && !items?.length) return null;
  return (
    <section className="container-page mt-16">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
        <Link to="/shop" className="shrink-0 text-sm font-semibold text-brand-700">
          View all →
        </Link>
      </div>
      {loading ? (
        <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, k) => (
            <Skeleton key={k} className="h-72" />
          ))}
        </div>
      ) : (
        <VehicleGrid items={items!.slice(0, 8)} />
      )}
    </section>
  );
}

function SoraBand({ name }: { name: string }) {
  return (
    <section className="container-page mt-16">
      <div className="grid items-center gap-6 overflow-hidden rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-brand-50 p-6 sm:p-10 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
            <Bot className="size-3.5" /> Digital FTE · built with Muse Spark Open
          </span>
          <h2 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">Meet {name}, our AI sales executive</h2>
          <p className="mt-2 text-slate-600">
            {name} answers in your language at any hour, finds real cars from stock and auctions, reads the auction sheet for you and quotes the exact price to your port. A human supervisor approves every invoice.
          </p>
          <ul className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            {["Exact C&F to 220+ ports", "Auction sheets explained", "Voice notes in Urdu & English", "Invoice approved by a person"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <ClipboardCheck className="size-4 text-emerald-600" /> {t}
              </li>
            ))}
          </ul>
          <Button className="mt-6" onClick={() => openChatWith(`Hi ${name}, I need a car for my business.`)}>
            <Bot className="size-4" /> Chat with {name}
          </Button>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-lg ring-1 ring-slate-200">
          <div className="space-y-3 text-sm">
            <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-3 py-2 text-white">Hilux, diesel 4WD, to Mombasa — budget $25,000?</div>
            <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-slate-100 px-3 py-2 text-slate-800">
              I found 3 Hilux. <strong>HK-10003</strong> 2017 GR Sport, 9,400 km — <strong>C&F Mombasa $23,239</strong> incl. inspection and freight. Shall I reserve it?
            </div>
            <div className="ml-auto max-w-[70%] rounded-2xl rounded-br-md bg-brand-600 px-3 py-2 text-white">Yes please 👍</div>
            <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-emerald-50 px-3 py-2 text-emerald-800 ring-1 ring-emerald-200">Invoice request sent to our supervisor ✓</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Testimonials({ items }: { items: { name: string; country: string; text: string; rating: number }[] }) {
  return (
    <section className="container-page mt-16">
      <h2 className="text-center text-2xl font-bold text-slate-900">What buyers say</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((t) => (
          <figure key={t.name} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <Quote className="size-6 text-brand-200" />
            <blockquote className="mt-2 text-sm text-slate-700">{t.text}</blockquote>
            <figcaption className="mt-4 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900">
                {t.name} <span className="font-normal text-slate-500">· {t.country}</span>
              </span>
              <span className="flex text-accent-500">
                {Array.from({ length: t.rating }).map((_, k) => (
                  <Star key={k} className="size-3.5 fill-current" />
                ))}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
