import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { api } from "../lib/api";
import { Button, Card, Field, Input } from "../ui";

/** The page a reset link opens. The link works once, for one hour. */
export default function ResetPassword() {
  const [sp] = useSearchParams();
  const token = sp.get("token") ?? "";
  const [f, setF] = useState({ next: "", again: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="container-page max-w-lg py-10">
      <Card className="p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Choose a new password</h1>
        {msg?.ok ? (
          <>
            <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg.text}</p>
            <Link to="/login" className="mt-4 inline-block font-semibold text-brand-700">
              Go to sign in →
            </Link>
          </>
        ) : !token ? (
          <p className="mt-4 text-sm text-slate-600">
            This page opens from a reset link. <Link to="/login" className="font-semibold text-brand-700">Ask for one on the sign-in page</Link>.
          </p>
        ) : (
          <form
            className="mt-5 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (f.next !== f.again) return setMsg({ ok: false, text: "The two passwords are not the same" });
              setBusy(true);
              setMsg(null);
              try {
                const r = await api.post<{ message: string }>("/api/auth/reset", { token, newPassword: f.next });
                setMsg({ ok: true, text: r.message });
              } catch (ex) {
                setMsg({ ok: false, text: (ex as Error).message });
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="New password (8+ characters)">
              <Input required type="password" minLength={8} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} autoComplete="new-password" />
            </Field>
            <Field label="New password again">
              <Input required type="password" minLength={8} value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} autoComplete="new-password" />
            </Field>
            {msg && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{msg.text}</p>}
            <Button type="submit" className="w-full" loading={busy}>
              Save new password
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
