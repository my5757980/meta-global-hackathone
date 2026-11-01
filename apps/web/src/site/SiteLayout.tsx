import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { Bot, ChevronDown, Heart, LayoutDashboard, LogOut, Mail, Menu, Phone, Search, ShoppingCart, User, X } from "lucide-react";
import { useAuth, usePresencePing } from "../lib/auth";
import { useLiveStream } from "../lib/sse";
import { useSite } from "../lib/site";
import { useShopCounts } from "../lib/shop";
import { clsx } from "../ui";
import { ChatWidget } from "../chat/ChatWidget";
import { CallLayer } from "../chat/calls";
import { MustChangePassword } from "../account/Security";

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
  return (
    <span className="flex items-center gap-2">
      <img src="/favicon.svg" alt="" className="size-9 rounded-xl" />
      <span className="leading-tight">
        <span className={clsx("block text-base font-extrabold tracking-tight", light ? "text-white" : "text-slate-900")}>{name ?? "Hikari Motors"}</span>
        <span className={clsx("block text-[11px] font-medium", light ? "text-brand-200" : "text-slate-500")}>Japanese cars · to your port</span>
      </span>
    </span>
  );
}

function CountDot({ n }: { n?: number }) {
  if (!n) return null;
  return <span className="absolute top-0.5 right-0.5 flex min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-bold text-slate-900">{n}</span>;
}

export function SiteLayout() {
  const site = useSite();
  const { me, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const nav = useNavigate();
  const loc = useLocation();
  const counts = useShopCounts();
  useLiveStream(!!me);
  usePresencePing(!!me && me.kind === "staff");
  useEffect(() => {
    setOpen(false);
    window.scrollTo({ top: 0 });
  }, [loc.pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <div className="hidden bg-brand-800 text-xs text-brand-100 md:block">
        <div className="container-page flex h-9 items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <span className="flex items-center gap-1.5">
              <Phone className="size-3.5" /> {site?.phone}
            </span>
            <span className="flex items-center gap-1.5">
              <Mail className="size-3.5" /> {site?.email}
            </span>
          </div>
          <span className="flex items-center gap-1.5">
            <Bot className="size-3.5" /> {site?.ftEName ?? "Sora"}, our AI sales executive, answers 24/7 · Built with Muse Spark Open
          </span>
        </div>
      </div>
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/90 backdrop-blur">
        <div className="container-page flex h-16 items-center gap-3">
          <Link to="/" className="shrink-0">
            <Logo name={site?.companyName} />
          </Link>
          <nav className="ml-4 hidden items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => clsx("rounded-lg px-3 py-2 text-sm font-semibold transition", isActive ? "text-brand-700" : "text-slate-600 hover:text-slate-900")}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <form
            className="ml-auto hidden max-w-xs flex-1 md:block"
            onSubmit={(e) => {
              e.preventDefault();
              nav(`/shop?q=${encodeURIComponent(q)}`);
            }}
          >
            <label className="relative block">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search model, chassis code, stock no." className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pr-3 pl-9 text-sm focus:border-brand-500 focus:bg-white focus:outline-none" />
            </label>
          </form>
          <div className="ml-auto flex items-center gap-1 md:ml-2">
            <Link to="/shop" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden" aria-label="Search">
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
                  <span className="hidden max-w-28 truncate sm:inline">{me.name.split(" ")[0]}</span>
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
      {loc.pathname !== "/chat" && (!me || me.kind !== "staff") && <ChatWidget />}
      {me && <CallLayer />}
      <MustChangePassword />
    </div>
  );
}

function Footer() {
  const site = useSite();
  return (
    <footer className="mt-16 bg-slate-900 text-slate-300">
      <div className="container-page grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo name={site?.companyName} light />
          <p className="mt-3 text-sm text-slate-400">{site?.tagline}</p>
          <p className="mt-3 text-xs text-slate-500">Demo company for the AutoFTE hackathon project. All data is fictional.</p>
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
          <p className="mb-3 text-sm font-semibold text-white">Contact</p>
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
        © {new Date().getFullYear()} {site?.companyName ?? "Hikari Motors"} (demo) · Powered by AutoFTE · <Link to="/terms" className="hover:text-slate-300">Terms</Link> · <Link to="/privacy" className="hover:text-slate-300">Privacy</Link>
      </div>
    </footer>
  );
}
