import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Navigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Heart, MessageCircle, Package, User } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, Card, Field, Input, Skeleton, clsx } from "../ui";

export function AccountShell({ title, back, children }: { title: string; back?: ReactNode; children: ReactNode }) {
  const { me } = useAuth();
  const links = [
    { to: "/account", label: "Profile", icon: <User className="size-4" />, end: true },
    { to: "/account/orders", label: "My orders", icon: <Package className="size-4" /> },
    { to: "/account/invoices", label: "My invoices", icon: <FileText className="size-4" /> },
    { to: "/wishlist", label: "Saved cars", icon: <Heart className="size-4" /> },
    { to: "/chat", label: "Chat with us", icon: <MessageCircle className="size-4" /> },
  ];
  return (
    <div className="container-page py-8">
      {back && <div className="mb-3">{back}</div>}
      <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
        <aside>
          <Card padded={false} className="p-2">
            <p className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{me?.name}</p>
            <nav className="flex gap-1 overflow-x-auto lg:flex-col">
              {links.map((l) => (
                <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => clsx("flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold", isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50")}>
                  {l.icon} {l.label}
                </NavLink>
              ))}
            </nav>
          </Card>
        </aside>
        <div className="min-w-0">
          <h1 className="mb-4 text-2xl font-bold text-slate-900">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function Account() {
  const { me, loading, refresh } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["profile"], queryFn: () => api.get<{ name: string; email: string; phone: string; company: string | null; countryCode: string | null; city: string | null; address: string | null; kind: string }>("/api/account/profile"), enabled: !!me });
  const [f, setF] = useState({ name: "", phone: "", company: "", city: "", address: "" });
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (q.data) setF({ name: q.data.name ?? "", phone: q.data.phone ?? "", company: q.data.company ?? "", city: q.data.city ?? "", address: q.data.address ?? "" });
  }, [q.data]);
  if (!loading && !me) return <Navigate to="/login" replace />;
  if (me?.kind === "staff") return <Navigate to="/crm" replace />;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <AccountShell title="My profile">
      {q.isLoading ? (
        <Skeleton className="h-60" />
      ) : me?.kind === "visitor" ? (
        <Card>
          <p className="text-sm text-slate-600">You are chatting as a guest ({me.email}). Create an account with the same e-mail to keep your conversation and see invoices.</p>
        </Card>
      ) : (
        <Card>
          <div className="mb-5 flex flex-wrap items-center gap-4 border-b border-slate-100 pb-5">
            {me?.avatarUrl ? <img src={me.avatarUrl} alt="Your profile" className="size-20 rounded-full object-cover ring-1 ring-slate-200" /> : <span className="flex size-20 items-center justify-center rounded-full bg-slate-100 text-slate-400"><User className="size-8" /></span>}
            <div>
              <p className="text-sm font-semibold text-slate-900">Profile picture</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <label className="inline-flex h-9 cursor-pointer items-center rounded-xl bg-white px-3 text-sm font-semibold shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
                  Choose a picture
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    aria-label="Profile picture"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      setMsg(null);
                      const form = new FormData();
                      form.append("file", file);
                      try {
                        await api.post("/api/account/avatar", form);
                        await refresh();
                        setMsg("Picture saved.");
                      } catch (ex) {
                        setMsg((ex as Error).message);
                      }
                    }}
                  />
                </label>
                {me?.avatarUrl && (
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      await api.del("/api/account/avatar");
                      await refresh();
                    }}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </div>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setMsg(null);
              try {
                await api.put("/api/account/profile", { ...f, company: f.company || undefined, city: f.city || undefined, address: f.address || undefined });
                await qc.invalidateQueries({ queryKey: ["profile"] });
                setMsg("Saved.");
              } catch (ex) {
                setMsg((ex as Error).message);
              }
            }}
          >
            <Field label="Full name">
              <Input value={f.name} onChange={set("name")} required minLength={2} />
            </Field>
            <Field label="E-mail">
              <Input value={q.data?.email ?? ""} disabled />
            </Field>
            <Field label="Phone / WhatsApp">
              <Input value={f.phone} onChange={set("phone")} required minLength={6} />
            </Field>
            <Field label="Company">
              <Input value={f.company} onChange={set("company")} />
            </Field>
            <Field label="City">
              <Input value={f.city} onChange={set("city")} />
            </Field>
            <Field label="Address">
              <Input value={f.address} onChange={set("address")} />
            </Field>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Button type="submit">Save changes</Button>
              {msg && <span className="text-sm text-slate-600">{msg}</span>}
            </div>
          </form>
        </Card>
      )}
    </AccountShell>
  );
}
