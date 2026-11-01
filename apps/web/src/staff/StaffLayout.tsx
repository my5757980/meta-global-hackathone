import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Bell, BellRing, Bot, Car, FileText, Gavel, Globe, LayoutDashboard, LogOut, Mail, Menu, MessagesSquare, Palette, PanelsTopLeft, ShieldCheck, Users, X } from "lucide-react";
import { api } from "../lib/api";
import { useAuth, usePresencePing } from "../lib/auth";
import { useLiveEvent, useLiveStream } from "../lib/sse";
import { ago } from "../lib/format";
import { askDesktopNotify, desktopNotifyState, notifyDesktop } from "../lib/desktopNotify";
import { CallLayer } from "../chat/calls";
import { MustChangePassword, SecurityModal } from "../account/Security";
import type { ChatMsg } from "../chat/ChatThread";
import { Avatar, Spinner, clsx } from "../ui";

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

export function StaffLayout() {
  const { me, loading, can, logout } = useAuth();
  const [menu, setMenu] = useState(false);
  const [security, setSecurity] = useState(false);
  const loc = useLocation();
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
      items: [{ to: "/crm/users", label: "Users", icon: <ShieldCheck className="size-4" />, show: can("crm.users.manage") }],
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
        { to: "/admin/home", label: "Home page", icon: <Globe className="size-4" />, show: can("website.content.manage") },
        { to: "/admin/pages", label: "Pages", icon: <FileText className="size-4" />, show: can("website.content.manage") },
        { to: "/admin/messages", label: "Messages", icon: <Mail className="size-4" />, show: can("website.content.manage") },
        { to: "/admin/settings", label: "Branding", icon: <Palette className="size-4" />, show: can("website.settings.manage") },
      ],
    },
    {
      title: "Digital FTE",
      items: [{ to: "/fte", label: "Sora console", icon: <Bot className="size-4" />, show: can("fte.console") }],
    },
  ];

  const nav = (
    <nav className="space-y-5">
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
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-slate-900 p-4 lg:flex">
        <Link to="/" className="mb-6 flex items-center gap-2 px-2">
          <img src="/favicon.svg" alt="" className="size-8 rounded-lg" />
          <span className="leading-tight">
            <span className="block text-sm font-bold text-white">Hikari Motors</span>
            <span className="block text-[11px] text-slate-400">AutoFTE workspace</span>
          </span>
        </Link>
        {nav}
        <div className="mt-auto rounded-xl bg-white/5 p-3 text-[11px] text-slate-400 ring-1 ring-white/10">
          <Bot className="mb-1 size-4 text-violet-300" />
          Sora works 24/7 on Muse Spark Open. Every invoice still needs a Supervisor.
        </div>
      </aside>
      {menu && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 lg:hidden" onClick={() => setMenu(false)}>
          <div className="h-full w-64 bg-slate-900 p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between">
              <span className="font-bold text-white">Hikari Motors</span>
              <button onClick={() => setMenu(false)} className="rounded-lg p-1 text-slate-300" aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            {nav}
          </div>
        </div>
      )}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/90 px-3 backdrop-blur sm:px-5">
          <button className="rounded-lg p-2 hover:bg-slate-100 lg:hidden" onClick={() => setMenu(true)} aria-label="Menu">
            <Menu className="size-5" />
          </button>
          <div className="hidden items-center gap-1 sm:flex">
            <TopLink to="/crm" icon={<LayoutDashboard className="size-4" />} label="CRM" show={can("crm.access")} />
            <TopLink to="/desk" icon={<MessagesSquare className="size-4" />} label="Chat" show={can("chat.desk")} />
            <TopLink to="/fte" icon={<Bot className="size-4" />} label="Sora" show={can("fte.console")} />
            <TopLink to="/admin" icon={<PanelsTopLeft className="size-4" />} label="Site admin" show={can("website.admin")} />
            <TopLink to="/" icon={<Globe className="size-4" />} label="Website" show />
            <TopLink to="/auction/admin" icon={<Gavel className="size-4" />} label="Auction" show={can("auction.admin")} />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
            <button onClick={() => setSecurity(true)} className="flex items-center gap-2 rounded-xl px-2 py-1 text-left hover:bg-slate-100" title="My account security">
              <Avatar name={me.name} kind="staff" size={30} />
              <div className="hidden leading-tight sm:block">
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
      <CallLayer />
      <SecurityModal open={security} onClose={() => setSecurity(false)} />
      <MustChangePassword />
    </div>
  );
}

function TopLink({ to, icon, label, show }: { to: string; icon: React.ReactNode; label: string; show: boolean }) {
  if (!show) return null;
  return (
    <NavLink to={to} end={to === "/"} className={({ isActive }) => clsx("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold", isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100")}>
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
        {!!q.data?.unread && <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">{q.data.unread}</span>}
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
