import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { safeNext } from "../lib/shop";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, Card, Field, Input, Select } from "../ui";

export default function Register() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const qc = useQueryClient();
  const { refresh } = useAuth();
  const countries = useQuery({ queryKey: ["countries"], queryFn: () => api.get<{ code: string; name: string }[]>("/api/public/countries"), staleTime: 3600_000 });
  const [f, setF] = useState({ name: "", company: "", email: "", phone: "", countryCode: "", password: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="container-page max-w-xl py-10">
      <Card className="p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Create your account</h1>
        <p className="mt-1 text-sm text-slate-500">Follow your invoices, payments, documents and shipping — and chat with us from any device.</p>
        <form
          className="mt-6 grid gap-4 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            try {
              await api.post("/api/auth/register", { ...f, countryCode: f.countryCode || undefined, company: f.company || undefined });
              await refresh();
              await qc.invalidateQueries();
              nav(next ?? "/account");
            } catch (ex) {
              setErr((ex as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Full name">
            <Input required minLength={2} value={f.name} onChange={set("name")} autoComplete="name" />
          </Field>
          <Field label="Company (optional)">
            <Input value={f.company} onChange={set("company")} autoComplete="organization" />
          </Field>
          <Field label="E-mail">
            <Input required type="email" value={f.email} onChange={set("email")} autoComplete="email" />
          </Field>
          <Field label="Phone / WhatsApp">
            <Input required minLength={6} value={f.phone} onChange={set("phone")} autoComplete="tel" />
          </Field>
          <Field label="Country">
            <Select value={f.countryCode} onChange={set("countryCode")}>
              <option value="">Choose…</option>
              {countries.data?.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Password" hint="At least 8 characters">
            <Input required type="password" minLength={8} value={f.password} onChange={set("password")} autoComplete="new-password" />
          </Field>
          {err && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2">{err}</p>}
          <Button type="submit" loading={busy} className="sm:col-span-2">
            Create account
          </Button>
          <p className="text-center text-sm text-slate-500 sm:col-span-2">
            Already have an account?{" "}
            <Link to="/login" className="font-semibold text-brand-700">
              Sign in
            </Link>
          </p>
        </form>
      </Card>
    </div>
  );
}
