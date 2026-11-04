import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Bell, BellRing, Bot, Car, Contact, FileText, Gavel, Globe, Images, KeyRound, LayoutDashboard, LayoutList, LogOut, Mail, Menu, MessagesSquare, Newspaper, Package, Palette, PanelsTopLeft, ShieldCheck, Tags, Users, X } from "lucide-react";
import { api } from "../lib/api";
import { useAuth, usePresencePing } from "../lib/auth";
import { CompanyName, useBrandTheme, useFte, useSite } from "../lib/site";
import { useLiveEvent, useLiveStream } from "../lib/sse";
import { ago } from "../lib/format";
import { askDesktopNotify, desktopNotifyState, notifyDesktop } from "../lib/desktopNotify";
import { CallLayer } from "../chat/calls";
import { MessageCards } from "../chat/ChatWidget";
import { MustChangePassword, SecurityModal } from "../account/Security";
import type { ChatMsg } from "../chat/ChatThread";
import { Avatar, Spinner, clsx } from "../ui";
import { PublicDemoLine } from "../site/SiteLayout";

/** OS pop-ups for new chat messages and notifications while the tab is in the background. */
function useDesktopAlerts(meId: string | undefined) {
  const nav = useNavigate();
  const onMessage = useCallback(
    (m: ChatMsg) => {
      if (!meId || !m.senderUserId || m.senderUserId === meId || m.kind === "system" || m.kind === "call") return;
      const what = m.kind === "image" ? "📷 Picture" : m.kind === "voice" ? "🎤 Voice note" : m.body.replace(/[*#_`>]/g, "");
      notifyDesktop(m.sender?.name ?? "New message", what, () => nav(`/desk?c=${m.conversationId}`), { tag: m.conversationId });
    },
    [meId, nav],
  );
  const onNotification = useCallback((n: { title: string; body: string | null; link: string | null }) => notifyDesktop(n.title, n.body ?? "", () => n.link && nav(n.link)), [nav]);
  useLiveEvent("message", onMessage);
  useLiveEvent("notification", onNotification);
}

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

/** The team is one tap away on every staff page: the list opens here and a name opens that conversation at the desk. */
function TeamChatButton() {
  const { can } = useAuth();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const team = useQuery({ queryKey: ["team"], queryFn: () => api.get<{ id: string; name: string; title?: string | null; online?: boolean; kind: string }[]>("/api/chat/team"), enabled: open && can("chat.desk") });
  if (!can("chat.desk") || pathname.startsWith("/desk")) return null;
  return (
    <div className="fixed right-4 bottom-4 z-40 print:hidden">
      {open && (
        <div className="scrollbar-thin mb-2 max-h-80 w-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
          <p className="px-2 py-1 text-sm font-semibold text-slate-900">Team chat</p>
          {team.data?.map((p) => (
            <button
              key={p.id}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50"
              onClick={async () => {
                const c = await api.post<{ id: string }>("/api/chat/dm", { userId: p.id });
                setOpen(false);
                nav(`/desk?c=${c.id}`);
              }}
            >
              <span className={`size-2 shrink-0 rounded-full ${p.online ? "bg-emerald-500" : "bg-slate-300"}`} />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
            </button>
          ))}
          {team.data && !team.data.length && <p className="px-2 py-1 text-sm text-slate-500">No colleagues yet.</p>}
        </div>
      )}
      <button aria-label="Team chat" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="ml-auto flex size-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg hover:bg-brand-700">
        <MessagesSquare className="size-5" />
      </button>
    </div>
  );
}

export function StaffLayout() {
  const { me, loading, can, logout } = useAuth();
  const go = useNavigate();
  const [menu, setMenu] = useState(false);
  const [security, setSecurity] = useState(false);
  const loc = useLocation();
  const site = useSite();
  const fte = useFte();
  useBrandTheme();
  useLiveStream(!!me);
  usePresencePing(!!me);
  useDesktopAlerts(me?.id);
  useEffect(() => setMenu(false), [loc.pathname]);
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  if (!me) return <Navigate to="/login" replace />;
  if (me.kind !== "staff") return <Navigate to="/account" replace />;

  const groups: { title: string; items: { to: string; label: string; icon: React.ReactNode; show: boolean; end?: boolean }[] }[] = [
    {
      title: "Sales",
      items: [
        { to: "/crm", label: "Dashboard", icon: <LayoutDashboard className="size-4" />, show: can("crm.access"), end: true },
        { to: "/crm/leads", label: can("crm.leads.view_all") ? "All leads" : "My leads", icon: <Users className="size-4" />, show: can("crm.access") },
        { to: "/crm/invoices", label: "Invoices", icon: <FileText className="size-4" />, show: can("crm.access") },
        { to: "/crm/units", label: "Units", icon: <Car className="size-4" />, show: can("crm.access") },
        { to: "/crm/reports", label: "Reports", icon: <BarChart3 className="size-4" />, show: can("crm.reports.view") },
      ],
    },
    {
      title: "Admin",
      items: [{ to: "/crm/users", label: "Users", icon: <ShieldCheck className="size-4" />, show: can("crm.users.view") }],
    },
    {
      title: "Customers",
      items: [
        { to: "/desk", label: "Chat desk", icon: <MessagesSquare className="size-4" />, show: can("chat.desk") },
        { to: "/auction/admin", label: "Auction admin", icon: <Gavel className="size-4" />, show: can("auction.admin") },
      ],
    },
    {
      title: "Website",
      items: [
        { to: "/admin", label: "Overview", icon: <PanelsTopLeft className="size-4" />, show: can("website.admin"), end: true },
        { to: "/admin/vehicles", label: "Vehicles", icon: <Car className="size-4" />, show: can("website.vehicles.manage") },
        { to: "/admin/orders", label: "Orders", icon: <Package className="size-4" />, show: can("website.orders.manage") },
        { to: "/admin/customers", label: "Customers", icon: <Contact className="size-4" />, show: can("website.customers.view") },
        { to: "/admin/brands", label: "Brands & models", icon: <Tags className="size-4" />, show: can("website.vehicles.manage") },
        { to: "/admin/home", label: "Home page", icon: <Globe className="size-4" />, show: can("website.content.manage") },
        { to: "/admin/pages", label: "Pages", icon: <FileText className="size-4" />, show: can("website.content.manage") },
        { to: "/admin/content", label: "Site content", icon: <LayoutList className="size-4" />, show: can("website.content.manage") },
        { to: "/admin/messages", label: "Messages", icon: <Mail className="size-4" />, show: can("website.content.manage") },
        { to: "/admin/newsletter", label: "Newsletter", icon: <Newspaper className="size-4" />, show: can("website.content.manage") },
        { to: "/admin/media", label: "Media library", icon: <Images className="size-4" />, show: can("website.vehicles.manage") || can("website.content.manage") || can("website.settings.manage") },
        { to: "/admin/settings", label: "Branding", icon: <Palette className="size-4" />, show: can("website.settings.manage") },
        { to: "/admin/roles", label: "Roles", icon: <KeyRound className="size-4" />, show: can("auction.roles.view") },
      ],
    },
    {
      title: "Digital FTE",
      items: [{ to: "/fte", label: "Digital workforce", icon: <Bot className="size-4" />, show: can("fte.console") }],
    },
  ];

  const nav = (
    <nav className="mb-5 space-y-5">
      {groups.map((g) =>
        g.items.some((i) => i.show) ? (
          <div key={g.title}>
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.title}</p>
            {g.items
              .filter((i) => i.show)
              .map((i) => (
                <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => clsx("flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold", isActive ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white")}>
                  {i.icon} {i.label}
                </NavLink>
              ))}
          </div>
        ) : null,
      )}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-100">
      <aside className="scrollbar-thin fixed inset-y-0 left-0 z-30 hidden w-60 flex-col overflow-y-auto bg-slate-900 p-4 lg:flex">
        <Link to="/" className="mb-6 flex items-center gap-2 px-2">
          <img src={site?.logoUrl || "/favicon.svg"} alt="" className="size-8 rounded-lg object-contain" />
          <span className="leading-tight">
            <span className="block text-sm font-bold text-white"><CompanyName /></span>
            <span className="block text-[11px] text-slate-400">AutoFTE workspace</span>
          </span>
        </Link>
        {nav}
        <div className="mt-auto shrink-0 rounded-xl bg-white/5 p-3 text-[11px] text-slate-400 ring-1 ring-white/10">
          <Bot className="mb-1 size-4 text-violet-300" />
          Eight Digital FTEs work 24/7 on Muse Spark Open. People set their limits.
        </div>
      </aside>
      {menu && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 lg:hidden" onClick={() => setMenu(false)}>
          <div className="scrollbar-thin h-full w-64 overflow-y-auto bg-slate-900 p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between">
              <span className="font-bold text-white"><CompanyName /></span>
              <button onClick={() => setMenu(false)} className="rounded-lg p-1 text-slate-300" aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            {nav}
          </div>
        </div>
      )}
      <div className="lg:pl-60">
        <PublicDemoLine />
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/90 px-3 backdrop-blur sm:px-5">
          <button className="rounded-lg p-2 hover:bg-slate-100 lg:hidden" onClick={() => setMenu(true)} aria-label="Menu">
            <Menu className="size-5" />
          </button>
          <div className="hidden items-center gap-1 md:flex">
            <TopLink to="/crm" icon={<LayoutDashboard className="size-4" />} label="CRM" show={can("crm.access")} />
            <TopLink to="/desk" icon={<MessagesSquare className="size-4" />} label="Chat" show={can("chat.desk")} />
            <TopLink to="/fte" icon={<Bot className="size-4" />} label="FTEs" show={can("fte.console")} />
            <TopLink to="/admin" icon={<PanelsTopLeft className="size-4" />} label="Site admin" show={can("website.admin")} />
            <TopLink to="/" icon={<Globe className="size-4" />} label="Website" show />
            <TopLink to="/auction/admin" icon={<Gavel className="size-4" />} label="Auction" show={can("auction.admin")} />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
            <button onClick={() => setSecurity(true)} className="flex items-center gap-2 rounded-xl px-2 py-1 text-left hover:bg-slate-100" title="My account security">
              <span className="relative shrink-0">
                <Avatar name={me.name} kind="staff" size={30} />
                {!me.hasRecoveryKey && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-amber-500 ring-2 ring-white xl:hidden" title="Set a recovery key" />}
              </span>
              <div className="hidden leading-tight whitespace-nowrap xl:block">
                <p className="text-sm font-semibold text-slate-900">{me.name}</p>
                <p className="text-[11px] text-slate-500">
                  {me.roleName}
                  {!me.hasRecoveryKey && <span className="ml-1 text-amber-600">· set recovery key</span>}
                </p>
              </div>
            </button>
            <button onClick={() => void logout()} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Sign out">
              <LogOut className="size-4" />
            </button>
          </div>
        </header>
        <main className="p-3 sm:p-6">
          <Outlet />
        </main>
      </div>
      <CallLayer desk />
      <TeamChatButton />
      {me && can("chat.desk") && <MessageCards meId={me.id} shut peopleOnly skip={(c) => loc.pathname.startsWith("/desk") && new URLSearchParams(loc.search).get("c") === c} onOpen={(c) => go(`/desk?c=${c}`)} />}
      <SecurityModal open={security} onClose={() => setSecurity(false)} />
      <MustChangePassword />
    </div>
  );
}

function TopLink({ to, icon, label, show }: { to: string; icon: React.ReactNode; label: string; show: boolean }) {
  if (!show) return null;
  return (
    <NavLink to={to} end={to === "/"} className={({ isActive }) => clsx("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold whitespace-nowrap [&>svg]:shrink-0", isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100")}>
      {icon} {label}
    </NavLink>
  );
}

function NotificationBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => api.get<{ items: Notif[]; unread: number }>("/api/crm/notifications") });
  const onNotif = useCallback(() => void qc.invalidateQueries({ queryKey: ["notifications"] }), [qc]);
  useLiveEvent("notification", onNotif);
  const [alerts, setAlerts] = useState(desktopNotifyState());
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Notifications">
        <Bell className="size-5" />
        {!!q.data?.unread && <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-bold text-white">{q.data.unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[min(22rem,90vw)] rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="font-semibold text-slate-900">Notifications</p>
            <button
              className="text-xs font-semibold text-brand-700"
              onClick={async () => {
                await api.post("/api/crm/notifications/read");
                await qc.invalidateQueries({ queryKey: ["notifications"] });
              }}
            >
              Mark all read
            </button>
          </div>
          {alerts === "default" && (
            <button onClick={async () => setAlerts(await askDesktopNotify())} className="flex w-full items-center gap-2 border-b border-slate-100 bg-amber-50 px-4 py-2 text-left text-xs font-semibold text-amber-800 hover:bg-amber-100">
              <BellRing className="size-4" /> Turn on desktop alerts for new chats, calls and approvals
            </button>
          )}
          {alerts === "denied" && <p className="border-b border-slate-100 px-4 py-2 text-[11px] text-slate-500">Desktop alerts are blocked in this browser's site settings.</p>}
          <div className="scrollbar-thin max-h-96 overflow-y-auto">
            {q.data?.items.length ? (
              q.data.items.map((n) => (
                <Link key={n.id} to={n.link ?? "#"} onClick={() => setOpen(false)} className={clsx("block border-b border-slate-50 px-4 py-3 hover:bg-slate-50", !n.readAt && "bg-brand-50/40")}>
                  <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                  {n.body && <p className="line-clamp-2 text-xs text-slate-600">{n.body}</p>}
                  <p className="mt-0.5 text-[11px] text-slate-400">{ago(n.createdAt)}</p>
                </Link>
              ))
            ) : (
              <p className="px-4 py-6 text-center text-sm text-slate-500">Nothing yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
