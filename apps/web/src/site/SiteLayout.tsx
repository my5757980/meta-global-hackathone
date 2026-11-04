import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Bot, ChevronDown, Clock, Facebook, Heart, Instagram, LayoutDashboard, Linkedin, LogOut, Mail, Menu, MessageCircle, Phone, Search, ShoppingCart, Twitter, User, X, Youtube } from "lucide-react";
import { api } from "../lib/api";
import { useAuth, usePresencePing } from "../lib/auth";
import { useLiveStream } from "../lib/sse";
import { useBrandTheme, useSite } from "../lib/site";
import { useGuestMerge, useShopCounts } from "../lib/shop";
import { clsx } from "../ui";
import { ChatWidget, DeskButton, openChatWith } from "../chat/ChatWidget";
import { useChatUnread } from "../lib/chatUnread";
import { CallLayer } from "../chat/calls";
import { MustChangePassword } from "../account/Security";
import { SearchBox } from "./SearchBox";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/shop", label: "Shop" },
  { to: "/auction", label: "Auction" },
  { to: "/services", label: "Services" },
  { to: "/how-to-buy", label: "How to buy" },
  { to: "/about", label: "About" },
  { to: "/blog", label: "Guides" },
  { to: "/contact", label: "Contact" },
];

export function Logo({ name, light }: { name?: string; light?: boolean }) {
  const site = useSite();
  return (
    <span className="flex items-center gap-2">
      <img src={site?.logoUrl || "/favicon.svg"} alt="" className="size-9 rounded-xl object-contain" />
      <span className="leading-tight">
        <span className={clsx("block text-base font-extrabold tracking-tight", light ? "text-white" : "text-slate-900")}>{name ?? ""}</span>
        <span className={clsx("block text-[11px] font-medium lg:hidden xl:block", light ? "text-brand-200" : "text-slate-500")}>Japanese cars · to your port</span>
      </span>
    </span>
  );
}

function CountDot({ n }: { n?: number }) {
  if (!n) return null;
  return <span className="absolute top-0.5 right-0.5 flex min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 text-[11px] font-bold text-slate-900">{n}</span>;
}

/** On a demo open to everyone: what they are looking at, on every page. */
export function PublicDemoLine() {
  const { publicDemoHours } = useAuth();
  if (!publicDemoHours) return null;
  return <p className="bg-amber-100 px-4 py-1 text-center text-xs font-medium text-amber-900">Public demo with fictional data. Try anything, even Admin: it puts itself back every {publicDemoHours} hours.</p>;
}

const CLOCKS = [
  ["Tokyo", "Asia/Tokyo"],
  ["Nairobi", "Africa/Nairobi"],
  ["Dubai", "Asia/Dubai"],
  ["London", "Europe/London"],
] as const;
const timeIn = (d: Date, zone: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: zone }).format(d);

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function useRate() {
  return useQuery({ queryKey: ["usd-jpy"], queryFn: () => api.get<{ usdJpy: number; date: string | null; source: string }>("/api/public/rate"), staleTime: 3600_000 });
}

/** Type dollars or yen and read the other, at the rate shown. */
function CurrencyBox({ rate, title }: { rate: number; title: string }) {
  const [open, setOpen] = useState(false);
  const [usd, setUsd] = useState("1000");
  const [jpy, setJpy] = useState(String(Math.round(1000 * rate)));
  return (
    <span className="relative">
      <button type="button" title={title} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="rounded bg-white/10 px-2 py-0.5 font-semibold text-white hover:bg-white/20">
        USD/JPY {rate.toFixed(2)}
      </button>
      {open && (
        <span className="absolute top-full right-0 z-50 mt-1 flex w-64 items-center gap-1.5 rounded-xl bg-white p-2 text-slate-800 shadow-lg ring-1 ring-slate-200">
          <label className="flex min-w-0 flex-1 items-center gap-1 text-xs font-semibold">
            USD
            <input aria-label="US dollars" type="number" className="h-8 w-full min-w-0 rounded-lg border border-slate-200 px-1.5 text-sm font-normal" value={usd} onChange={(e) => { setUsd(e.target.value); setJpy(e.target.value ? String(Math.round(Number(e.target.value) * rate)) : ""); }} />
          </label>
          <span aria-hidden="true">=</span>
          <label className="flex min-w-0 flex-1 items-center gap-1 text-xs font-semibold">
            JPY
            <input aria-label="Japanese yen" type="number" className="h-8 w-full min-w-0 rounded-lg border border-slate-200 px-1.5 text-sm font-normal" value={jpy} onChange={(e) => { setJpy(e.target.value); setUsd(e.target.value ? String(Math.round((Number(e.target.value) / rate) * 100) / 100) : ""); }} />
          </label>
        </span>
      )}
    </span>
  );
}

/** Browse by brand, from the header. */
function BrandMenu() {
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["catalog-facets"], queryFn: () => api.get<{ brands: { name: string; slug: string; logoUrl?: string | null }[] }>("/api/public/facets"), enabled: open, staleTime: 3600_000 });
  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
        Brand <ChevronDown className="size-4" />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 w-80 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
          <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Browse by brand</p>
          <div className="grid grid-cols-2 gap-1">
            {q.data?.brands.slice(0, 16).map((b) => (
              <Link key={b.slug} to={`/shop?brand=${encodeURIComponent(b.slug)}`} onClick={() => setOpen(false)} className="truncate rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                {b.name}
              </Link>
            ))}
          </div>
          <Link to="/shop" onClick={() => setOpen(false)} className="mt-2 block rounded-lg bg-slate-50 px-2 py-1.5 text-center text-sm font-semibold text-brand-700">View all brands</Link>
        </div>
      )}
    </div>
  );
}

/** World clocks and the yen rate, on every page. */
/** Beside the account link on a desk, in the slide-out menu on a phone: "Live chat" for a buyer, "Chat desk" for staff, with what is waiting. */
function LiveChatLink({ className, onGo }: { className?: string; onGo?: () => void }) {
  const { me, can } = useAuth();
  const staff = me?.kind === "staff";
  const n = useChatUnread(!!me && (!staff || can("chat.desk")));
  if (staff && !can("chat.desk")) return null;
  return (
    <Link
      to={staff ? "/desk" : "/chat"}
      title="Chat with a person online"
      className={className}
      onClick={(e) => {
        onGo?.();
        if (staff || e.metaKey || e.ctrlKey || e.shiftKey || window.location.pathname === "/chat") return;
        e.preventDefault(); // an ordinary click stays on the page being read
        openChatWith();
      }}
    >
      <MessageCircle className="size-4" />
      <span>{staff ? "Chat desk" : "Live chat"}</span>
      {n > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-bold text-white">{n > 99 ? "99+" : n}</span>}
    </Link>
  );
}

function TopBar() {
  const site = useSite();
  const now = useNow();
  const rate = useRate().data;
  const rateText = rate ? `USD/JPY ${rate.usdJpy.toFixed(2)}` : "";
  const rateTitle = rate?.source === "ecb" ? `European Central Bank reference rate, ${rate.date}` : "The company's working rate";
  return (
    <>
      <div className="flex h-7 items-center justify-center gap-2 bg-brand-800 text-[11px] whitespace-nowrap text-brand-100 md:hidden">
        <span>Tokyo {timeIn(now, "Asia/Tokyo")}</span>
        <span aria-hidden="true">·</span>
        <span>Nairobi {timeIn(now, "Africa/Nairobi")}</span>
        {rateText && <span aria-hidden="true">·</span>}
        <span title={rateTitle}>{rateText}</span>
      </div>
      <div className="hidden bg-brand-800 text-xs text-brand-100 md:block">
        <div className="container-page flex h-9 items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <Phone className="size-3.5" /> {site?.phone}
            </span>
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <Mail className="size-3.5" /> {site?.email}
            </span>
            <span className="hidden items-center gap-1.5 whitespace-nowrap xl:flex">
              <Clock className="size-3.5" /> {site?.hours}
            </span>
          </div>
          <div className="flex items-center gap-4 whitespace-nowrap">
            <LiveChatLink className="inline-flex items-center gap-1.5 font-semibold text-white hover:underline" />
            {CLOCKS.map(([city, zone], i) => (
              <span key={city} className={clsx(i > 1 && "hidden lg:inline")}>
                {city} <strong className="font-semibold text-white">{timeIn(now, zone)}</strong>
              </span>
            ))}
            {rate && <CurrencyBox rate={rate.usdJpy} title={rateTitle} />}
          </div>
        </div>
      </div>
    </>
  );
}

export function SiteLayout() {
  const site = useSite();
  const { me, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  const counts = useShopCounts();
  useGuestMerge();
  useBrandTheme();
  useLiveStream(!!me);
  usePresencePing(!!me && me.kind === "staff");
  useEffect(() => {
    setOpen(false);
    window.scrollTo({ top: 0 });
  }, [loc.pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <PublicDemoLine />
      <TopBar />
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/90 backdrop-blur">
        <div className="container-page flex h-16 items-center gap-3">
          <Link to="/" className="shrink-0">
            <Logo name={site?.companyName} />
          </Link>
          <nav className="ml-4 hidden items-center gap-1 lg:flex">
            {NAV.slice(0, 2).map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => clsx("rounded-lg px-2 py-2 text-sm font-semibold whitespace-nowrap transition xl:px-3", isActive ? "text-brand-700" : "text-slate-600 hover:text-slate-900")}>
                {n.label}
              </NavLink>
            ))}
            <BrandMenu />
            {NAV.slice(2).map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => clsx("rounded-lg px-2 py-2 text-sm font-semibold whitespace-nowrap transition xl:px-3", isActive ? "text-brand-700" : "text-slate-600 hover:text-slate-900")}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto hidden max-w-xs flex-1 md:block lg:hidden">
            <SearchBox placeholder="Search cars" inputClassName="bg-slate-50 focus:bg-white" listClassName="right-0 w-[26rem] max-w-[calc(100vw-2rem)]" onSearch={(q) => nav(`/shop?q=${encodeURIComponent(q)}`)} />
          </div>
          <div className="ml-auto flex items-center gap-1 md:ml-2 lg:ml-auto">
            <Link to="/shop" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden lg:inline-flex" aria-label="Search">
              <Search className="size-5" />
            </Link>
            <Link to="/wishlist" className="relative hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100 sm:inline-flex" aria-label="Saved cars">
              <Heart className="size-5" />
              <CountDot n={counts.data?.wishlist} />
            </Link>
            <Link to="/cart" className="relative inline-flex rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Cart">
              <ShoppingCart className="size-5" />
              <CountDot n={counts.data?.cart} />
            </Link>
            {me ? (
              <div className="group relative">
                <button className="flex items-center gap-1 rounded-xl px-2 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                  <User className="size-5" />
                  <span className="hidden max-w-28 truncate xl:inline">{me.name.split(" ")[0]}</span>
                  <ChevronDown className="size-4" />
                </button>
                <div className="invisible absolute right-0 mt-1 w-56 rounded-2xl border border-slate-200 bg-white p-2 opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                  {me.kind === "staff" ? (
                    <Link to="/crm" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">
                      <LayoutDashboard className="size-4" /> Staff workspace
                    </Link>
                  ) : (
                    <>
                      <Link to="/account" className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-50">
                        My account
                      </Link>
                      <Link to="/account/invoices" className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-50">
                        My invoices
                      </Link>
                    </>
                  )}
                  <button onClick={() => void logout()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50">
                    <LogOut className="size-4" /> Sign out
                  </button>
                </div>
              </div>
            ) : (
              <Link to="/login" className="hidden rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 sm:inline-flex">
                Sign in
              </Link>
            )}
            <button className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Menu">
              <Menu className="size-6" />
            </button>
          </div>
        </div>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="ml-auto flex h-full w-[min(20rem,85vw)] flex-col bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <Logo name={site?.companyName} />
              <button onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => clsx("rounded-xl px-3 py-3 text-base font-semibold", isActive ? "bg-brand-50 text-brand-700" : "text-slate-700")}>
                {n.label}
              </NavLink>
            ))}
            <LiveChatLink onGo={() => setOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-3 text-base font-semibold text-slate-700 hover:bg-slate-50" />
            <div className="mt-auto space-y-2">
              {me ? (
                <Link to={me.kind === "staff" ? "/crm" : "/account"} className="block rounded-xl bg-brand-600 px-4 py-3 text-center font-semibold text-white">
                  {me.kind === "staff" ? "Staff workspace" : "My account"}
                </Link>
              ) : (
                <Link to="/login" className="block rounded-xl bg-brand-600 px-4 py-3 text-center font-semibold text-white">
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      {loc.pathname !== "/chat" && (me?.kind === "staff" ? <DeskButton /> : <ChatWidget />)}
      {me && <CallLayer />}
      <MustChangePassword />
    </div>
  );
}

function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="w-full max-w-md"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        try {
          const r = await api.post<{ message: string }>("/api/public/newsletter", { email });
          setMsg({ ok: true, text: r.message });
          setEmail("");
        } catch (ex) {
          setMsg({ ok: false, text: (ex as Error).message });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex gap-2">
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your e-mail" aria-label="Your e-mail" className="h-10 min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-slate-400 focus:border-white/40 focus:outline-none" />
        <button type="submit" disabled={busy} className="h-10 shrink-0 rounded-xl bg-accent-500 px-4 text-sm font-semibold text-slate-900 hover:bg-accent-400 disabled:opacity-60">
          Sign up
        </button>
      </div>
      {msg && <p className={clsx("mt-2 text-xs", msg.ok ? "text-emerald-300" : "text-rose-300")}>{msg.text}</p>}
    </form>
  );
}

function Footer() {
  const site = useSite();
  const facets = useQuery({ queryKey: ["facets"], queryFn: () => api.get<{ brands: { name: string; slug: string }[]; bodyTypes: { name: string; count: number }[] }>("/api/public/vehicles/facets"), staleTime: 300_000 });
  const offices = useQuery({ queryKey: ["locations"], queryFn: () => api.get<{ id: string; name: string; city?: string | null; country?: string | null }[]>("/api/public/locations"), staleTime: 3600_000 });
  const social = [
    { href: site?.socialFacebook, label: "Facebook", icon: <Facebook className="size-4" /> },
    { href: site?.socialInstagram, label: "Instagram", icon: <Instagram className="size-4" /> },
    { href: site?.socialYoutube, label: "YouTube", icon: <Youtube className="size-4" /> },
    { href: site?.socialX, label: "X", icon: <Twitter className="size-4" /> },
    { href: site?.socialLinkedin, label: "LinkedIn", icon: <Linkedin className="size-4" /> },
  ].filter((x) => x.href);
  return (
    <footer className="mt-16 bg-slate-900 text-slate-300">
      <div className="border-b border-white/10">
        <div className="container-page flex flex-col items-start justify-between gap-3 py-6 sm:flex-row sm:items-center">
          <div>
            <p className="font-semibold text-white">Hear about new stock first</p>
            <p className="text-sm text-slate-400">Join the list. You can ask us to take you off at any time.</p>
          </div>
          <NewsletterForm />
        </div>
      </div>
      <div className="container-page grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <div>
          <Logo name={site?.companyName} light />
          <p className="mt-3 text-sm text-slate-400">{site?.tagline}</p>
          {site?.footerSentence ? <p className="mt-3 text-xs text-slate-500">{site.footerSentence}</p> : null}
          {social.length > 0 && (
            <div className="mt-4 flex gap-2">
              {social.map((x) => (
                <a key={x.label} href={x.href} target="_blank" rel="noreferrer" aria-label={x.label} className="flex size-9 items-center justify-center rounded-lg bg-white/5 text-slate-300 ring-1 ring-white/10 hover:text-white">
                  {x.icon}
                </a>
              ))}
            </div>
          )}
        </div>
        <div>
          <p className="mb-3 text-sm font-semibold text-white">Buy</p>
          <ul className="space-y-2 text-sm">
            <li><Link to="/shop" className="hover:text-white">Cars in stock</Link></li>
            <li><Link to="/how-to-buy" className="hover:text-white">How to buy</Link></li>
            <li><Link to="/bank-details" className="hover:text-white">Bank details</Link></li>
            <li><Link to="/faq" className="hover:text-white">FAQ</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-sm font-semibold text-white">Company</p>
          <ul className="space-y-2 text-sm">
            <li><Link to="/about" className="hover:text-white">About us</Link></li>
            <li><Link to="/services" className="hover:text-white">Services</Link></li>
            <li><Link to="/partners" className="hover:text-white">Official partners</Link></li>
            <li><Link to="/locations" className="hover:text-white">Our locations</Link></li>
            <li><Link to="/blog" className="hover:text-white">Guides</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-sm font-semibold text-white">By type</p>
          <ul className="space-y-2 text-sm">
            {facets.data?.bodyTypes.slice(0, 7).map((b) => (
              <li key={b.name}><Link to={`/shop?body=${encodeURIComponent(b.name)}`} className="hover:text-white">{b.name}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-3 text-sm font-semibold text-white">By brand</p>
          <ul className="space-y-2 text-sm">
            {facets.data?.brands.slice(0, 7).map((b) => (
              <li key={b.slug}><Link to={`/shop?brand=${b.slug}`} className="hover:text-white">{b.name}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-3 text-sm font-semibold text-white">Global offices</p>
          <ul className="space-y-2 text-sm text-slate-400">
            {offices.data?.slice(0, 6).map((o) => (
              <li key={o.id}><Link to="/locations" className="hover:text-white">{o.name}</Link></li>
            ))}
          </ul>
          <p className="mt-5 mb-3 text-sm font-semibold text-white">Contact</p>
          <ul className="space-y-2 text-sm text-slate-400">
            <li>{site?.address}</li>
            <li>{site?.phone}</li>
            <li>{site?.email}</li>
          </ul>
          <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-300 ring-1 ring-white/10">
            <Bot className="size-4 text-violet-300" /> Built with Muse Spark Open
          </div>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-slate-500">
        {site?.copyrightLine || `© ${new Date().getFullYear()} ${site?.companyName ?? "Hikari Motors"} (demo)`} · Powered by AutoFTE · <Link to="/terms" className="hover:text-slate-300">Terms</Link> · <Link to="/privacy" className="hover:text-slate-300">Privacy</Link> · <Link to="/credits" className="hover:text-slate-300">Photo credits</Link> · <Link to="/app" className="hover:text-slate-300">Android app</Link>
      </div>
    </footer>
  );
}
