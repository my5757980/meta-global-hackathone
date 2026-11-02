import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { safeNext } from "../lib/shop";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Briefcase, Crown, Headset, ShieldCheck, User, Wallet } from "lucide-react";
import { api } from "../lib/api";
import { useAuth, type Me } from "../lib/auth";
import { Button, Card, Field, Input } from "../ui";

const DEMO: Record<string, { label: string; who: string; icon: React.ReactNode; to: string }> = {
  customer: { label: "Customer", who: "Joseph Mwangi · Kenya", icon: <User className="size-5" />, to: "/account/invoices" },
  agent: { label: "Sales Agent", who: "Ayesha Raza", icon: <Headset className="size-5" />, to: "/crm" },
  supervisor: { label: "Supervisor", who: "Daniel Mensah · approves invoices", icon: <ShieldCheck className="size-5" />, to: "/crm/invoices" },
  manager: { label: "Manager", who: "Fatima Noor · FTE console", icon: <Briefcase className="size-5" />, to: "/fte" },
  accounts: { label: "Accounts", who: "Grace Wanjiru · payments", icon: <Wallet className="size-5" />, to: "/crm/invoices" },
  admin: { label: "Admin", who: "Kenji Watanabe", icon: <Crown className="size-5" />, to: "/crm" },
};

/** Lost password: staff use the recovery key they saved; customers get a one-time password from the team. */
function ForgotForm() {
  const [email, setEmail] = useState("");
  const [res, setRes] = useState<{ message: string; demoLink?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-6 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        setRes(null);
        try {
          setRes(await api.post<{ message: string; demoLink?: string }>("/api/auth/forgot", { email }));
        } catch (ex) {
          setErr((ex as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-sm font-semibold text-slate-900">Forgot your password?</p>
      <p className="text-xs text-slate-500">Type your account e-mail and we send a link to choose a new one.</p>
      <Field label="Account e-mail">
        <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
      </Field>
      {err && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}
      {res && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{res.message}</p>}
      {res?.demoLink && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This demo has no mail server, so here is the link the e-mail would carry:{" "}
          <Link to={res.demoLink} className="font-semibold underline">
            Choose a new password
          </Link>
        </p>
      )}
      <Button type="submit" variant="secondary" className="w-full" loading={busy}>
        Send the link
      </Button>
    </form>
  );
}

function RecoverForm() {
  const [f, setF] = useState({ email: "", recoveryKey: "", newPassword: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-6 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        try {
          const r = await api.post<{ message: string }>("/api/auth/recover", f);
          setMsg({ ok: true, text: r.message });
          setF({ email: "", recoveryKey: "", newPassword: "" });
        } catch (ex) {
          setMsg({ ok: false, text: (ex as Error).message });
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-sm font-semibold text-slate-900">Reset with your recovery key (staff)</p>
      <Field label="E-mail">
        <Input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="username" />
      </Field>
      <Field label="Recovery key" hint="The 16-character key you saved, e.g. ABCD-EFGH-JKLM-NPQR">
        <Input required value={f.recoveryKey} onChange={(e) => setF({ ...f, recoveryKey: e.target.value })} autoComplete="off" className="font-mono uppercase" />
      </Field>
      <Field label="New password (8+ characters)">
        <Input required type="password" minLength={8} value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} autoComplete="new-password" />
      </Field>
      {msg && <p className={`rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{msg.text}</p>}
      <Button type="submit" variant="secondary" className="w-full" loading={busy}>
        Reset password
      </Button>
    </form>
  );
}

export default function Login() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { refresh } = useAuth();
  const roles = useQuery({ queryKey: ["demo-roles"], queryFn: () => api.get<string[]>("/api/auth/demo-roles") });
  const [f, setF] = useState({ login: "", password: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);
  const [staffRecover, setStaffRecover] = useState(false);
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));

  const after = async (u: Me, to?: string) => {
    await refresh();
    await qc.invalidateQueries();
    // a buyer sent here from "Add to cart" / "Save" goes straight back to that car
    nav(u.kind !== "staff" && next ? next : (to ?? (u.kind === "staff" ? "/crm" : "/account")));
  };

  return (
    <div className="container-page grid gap-6 py-10 lg:grid-cols-2">
      <Card className="p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-500">Customers see their invoices, documents and shipping. Staff open the CRM, chat desk and FTE console.</p>
        <form
          className="mt-6 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy("login");
            setErr(null);
            try {
              const r = await api.post<{ user: Me }>("/api/auth/login", f);
              await after(r.user);
            } catch (ex) {
              setErr((ex as Error).message);
            } finally {
              setBusy(null);
            }
          }}
        >
          <Field label="E-mail or username">
            <Input required value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} autoComplete="username" />
          </Field>
          <Field label="Password">
            <Input required type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" />
          </Field>
          {err && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}
          <Button type="submit" className="w-full" loading={busy === "login"}>
            Sign in
          </Button>
          <p className="text-center text-sm text-slate-500">
            New here?{" "}
            <Link to={next ? `/register?next=${encodeURIComponent(next)}` : "/register"} className="font-semibold text-brand-700">
              Create an account
            </Link>
            {" · "}
            <button type="button" onClick={() => setForgot((v) => !v)} className="font-semibold text-brand-700">
              Forgot password?
            </button>
          </p>
        </form>
        {forgot && (
          <>
            <ForgotForm />
            <button type="button" onClick={() => setStaffRecover((v) => !v)} className="mt-3 text-sm font-semibold text-brand-700">
              Staff: use your recovery key
            </button>
            {staffRecover && <RecoverForm />}
          </>
        )}
      </Card>
      {roles.data && roles.data.length > 0 && (
        <Card className="border-violet-200 bg-gradient-to-br from-violet-50 to-white p-6 sm:p-8">
          <p className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
            <Bot className="size-3.5" /> Demo mode
          </p>
          <h2 className="mt-3 text-xl font-bold text-slate-900">Try every role in one click</h2>
          <p className="mt-1 text-sm text-slate-600">No passwords needed — each button signs you in as a seeded demo user of the fictional exporter.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {roles.data.map((r) => {
              const d = DEMO[r];
              if (!d) return null;
              return (
                <button
                  key={r}
                  disabled={!!busy}
                  onClick={async () => {
                    setBusy(r);
                    setErr(null);
                    try {
                      const res = await api.post<{ user: Me }>(`/api/auth/demo/${r}`);
                      await after(res.user, d.to);
                    } catch (ex) {
                      setErr((ex as Error).message);
                    } finally {
                      setBusy(null);
                    }
                  }}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-violet-300 hover:shadow disabled:opacity-60"
                >
                  <span className="rounded-xl bg-violet-100 p-2 text-violet-700">{d.icon}</span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-900">{d.label}</span>
                    <span className="block truncate text-xs text-slate-500">{busy === r ? "Signing in…" : d.who}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
