import { useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, Field, Input, Modal } from "../ui";

function ChangePasswordForm({ currentLabel, onDone }: { currentLabel: string; onDone?: () => void }) {
  const { refresh } = useAuth();
  const [f, setF] = useState({ current: "", next: "", again: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (f.next !== f.again) return setMsg({ ok: false, text: "The two new passwords are not the same" });
        setBusy(true);
        setMsg(null);
        try {
          await api.post("/api/auth/password", { current: f.current, next: f.next });
          setF({ current: "", next: "", again: "" });
          setMsg({ ok: true, text: "Password changed." });
          await refresh();
          onDone?.();
        } catch (ex) {
          setMsg({ ok: false, text: (ex as Error).message });
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label={currentLabel}>
        <Input required type="password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} autoComplete="current-password" />
      </Field>
      <Field label="New password (8+ characters)">
        <Input required type="password" minLength={8} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} autoComplete="new-password" />
      </Field>
      <Field label="New password again">
        <Input required type="password" minLength={8} value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} autoComplete="new-password" />
      </Field>
      {msg && <p className={`rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{msg.text}</p>}
      <Button type="submit" loading={busy}>
        Save new password
      </Button>
    </form>
  );
}

function ChangeEmailForm() {
  const { me, refresh } = useAuth();
  const [f, setF] = useState({ email: "", password: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        try {
          await api.post("/api/auth/email", f);
          setF({ email: "", password: "" });
          setMsg({ ok: true, text: "E-mail changed. Use the new one to sign in." });
          await refresh();
        } catch (ex) {
          setMsg({ ok: false, text: (ex as Error).message });
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-sm text-slate-600">
        You sign in with <strong className="break-all text-slate-900">{me?.email}</strong>
      </p>
      <Field label="New e-mail">
        <Input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />
      </Field>
      <Field label="Your password">
        <Input required type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" />
      </Field>
      {msg && <p className={`rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{msg.text}</p>}
      <Button type="submit" variant="secondary" loading={busy}>
        Save new e-mail
      </Button>
    </form>
  );
}

/** First sign-in with a one-time password from staff: choose your own before anything else. */
export function MustChangePassword() {
  const { me, logout } = useAuth();
  if (!me?.mustChangePassword) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/70 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <p className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <KeyRound className="size-5 text-brand-600" /> Choose your own password
        </p>
        <p className="mt-1 mb-4 text-sm text-slate-600">Hi {me.name.split(" ")[0]} — you signed in with a one-time password. Set a password only you know to continue.</p>
        <ChangePasswordForm currentLabel="One-time password" />
        <button onClick={() => void logout()} className="mt-3 text-xs text-slate-500 hover:text-slate-700">
          Sign out
        </button>
      </div>
    </div>
  );
}

/** Staff: change password and make a recovery key (shown once). */
export function SecurityModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, refresh, demoMode } = useAuth();
  const [pw, setPw] = useState("");
  const [key, setKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const makeKey = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.post<{ recoveryKey: string }>("/api/auth/recovery-key", { password: pw });
      setKey(r.recoveryKey);
      setPw("");
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={() => {
        setKey(null);
        onClose();
      }}
      title="My account security"
    >
      <div className="space-y-6">
        {demoMode && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">The one-click demo accounts have no password you can type. To try these forms, make a new user on the Users page and sign in with their one-time password.</p>}
        <section>
          <p className="mb-3 font-semibold text-slate-900">Change password</p>
          <ChangePasswordForm currentLabel="Current password" />
        </section>
        <section className="border-t border-slate-100 pt-5">
          <p className="mb-3 font-semibold text-slate-900">Change e-mail</p>
          <ChangeEmailForm />
        </section>
        {me?.kind === "staff" && (
          <section className="border-t border-slate-100 pt-5">
            <p className="flex items-center gap-2 font-semibold text-slate-900">
              <ShieldCheck className="size-4 text-emerald-600" /> Recovery key {me.hasRecoveryKey ? <span className="text-xs font-normal text-emerald-700">· set</span> : <span className="text-xs font-normal text-amber-700">· not set</span>}
            </p>
            <p className="mt-1 text-sm text-slate-600">If you lose your password, the key lets you set a new one from the sign-in page. Keep it somewhere safe — it is shown only once and works once.</p>
            {key ? (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-xs font-semibold text-emerald-800">Your recovery key — save it now:</p>
                <p className="mt-1 font-mono text-lg font-bold tracking-wider text-emerald-900 select-all">{key}</p>
                <Button size="sm" variant="secondary" className="mt-2" onClick={() => void navigator.clipboard?.writeText(key)}>
                  Copy
                </Button>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <Field label="Your password" className="min-w-[12rem] flex-1">
                  <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
                </Field>
                <Button variant="secondary" loading={busy} disabled={!pw} onClick={() => void makeKey()}>
                  {me.hasRecoveryKey ? "Replace recovery key" : "Make recovery key"}
                </Button>
              </div>
            )}
            {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
          </section>
        )}
      </div>
    </Modal>
  );
}
