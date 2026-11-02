import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { api, errText } from "../lib/api";
import { useAuth } from "../lib/auth";
import { absUrl, getServer, isWeb, setServer, setToken } from "../lib/config";
import { useFetch } from "../lib/data";
import { downloadAndShare } from "../lib/download";
import { date, initials, usd } from "../lib/format";
import { useRestart } from "../lib/restart";
import { C, useColors, useSite } from "../lib/site";
import type { CustomerInvoice } from "../lib/types";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, ListRow, Markdown, Screen, SectionTitle, Skeleton, T } from "../ui";

/* ================================ Menu ================================ */
export function MenuScreen() {
  const nav = useNavigation<any>();
  const col = useColors();
  const { site } = useSite();
  const { me, isBuyer, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const go = (screen: string, params?: object) => () => nav.navigate(screen, params);
  return (
    <Screen>
      <Card>
        {me ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={[st.avatar, { backgroundColor: col.brand }]}>
              <T style={{ color: "#fff", fontWeight: "800" }}>{initials(me.name)}</T>
            </View>
            <View style={{ flex: 1 }}>
              <T lines={1} style={{ fontWeight: "800", color: C.ink, fontSize: 16 }}>
                {me.name}
              </T>
              <T lines={1} style={{ color: C.muted, fontSize: 13 }}>
                {me.email ?? me.phone ?? ""}
                {me.kind === "visitor" ? " · guest" : ""}
              </T>
            </View>
            {me.kind === "customer" ? <Button small variant="secondary" title="Edit" onPress={go("Profile")} /> : null}
          </View>
        ) : (
          <>
            <T style={{ fontWeight: "800", color: C.ink, fontSize: 16 }}>Welcome to {site.companyName}</T>
            <T style={{ color: C.muted, marginTop: 2 }}>Sign in to follow your orders, invoices and shipping.</T>
            <Button title="Sign in or create account" icon="log-in-outline" onPress={go("Auth")} style={{ marginTop: 12 }} />
          </>
        )}
        {me?.kind === "visitor" ? <T style={{ color: C.muted, fontSize: 12, marginTop: 10 }}>You are chatting as a guest. Create an account with the same e-mail to keep this conversation and see invoices.</T> : null}
      </Card>

      {isBuyer ? (
        <>
          <SectionTitle title="My account" />
          <Card style={{ padding: 0 }}>
            <ListRow icon="cube-outline" title="My orders" subtitle="Order requests from your cart" onPress={go("Orders")} />
            <ListRow icon="document-text-outline" title="My invoices" subtitle="Payments, documents and shipping" onPress={go("Invoices")} />
            <ListRow icon="heart-outline" title="Saved cars" onPress={go("Wishlist")} />
          </Card>
        </>
      ) : null}

      <SectionTitle title={site.companyName} />
      <Card style={{ padding: 0 }}>
        <ListRow icon="business-outline" title="About us" onPress={go("Page", { slug: "about" })} />
        <ListRow icon="list-outline" title="How to buy" onPress={go("Page", { slug: "how-to-buy" })} />
        <ListRow icon="construct-outline" title="Services" onPress={go("Services")} />
        <ListRow icon="ribbon-outline" title="Official partners" onPress={go("Partners")} />
        <ListRow icon="location-outline" title="Our locations" onPress={go("Locations")} />
        <ListRow icon="help-circle-outline" title="FAQ" onPress={go("Faq")} />
        <ListRow icon="newspaper-outline" title="Guides" onPress={go("Blog")} />
        <ListRow icon="card-outline" title="Bank details" onPress={go("Bank")} />
        <ListRow icon="mail-outline" title="Contact us" onPress={go("Contact")} />
        <ListRow icon="shield-checkmark-outline" title="Terms & privacy" onPress={go("Page", { slug: "terms" })} />
        <ListRow icon="camera-outline" title="Photo credits" onPress={() => void Linking.openURL(absUrl("/credits"))} />
      </Card>

      <SectionTitle title="App" />
      <Card style={{ padding: 0 }}>
        {!isWeb ? <ListRow icon="server-outline" title="Server address" subtitle={getServer() || "not set"} onPress={go("Server")} /> : null}
        {me ? (
          <ListRow
            icon="log-out-outline"
            title={busy ? "Signing out…" : "Sign out"}
            danger
            onPress={async () => {
              setBusy(true);
              await signOut();
              setBusy(false);
            }}
          />
        ) : null}
      </Card>

      <View style={{ alignItems: "center", marginTop: 20, gap: 4 }}>
        {site.address ? <T style={{ color: C.muted, fontSize: 12, textAlign: "center" }}>{site.address}</T> : null}
        {site.phone ? <T style={{ color: C.muted, fontSize: 12 }}>{site.phone}{site.email ? ` · ${site.email}` : ""}</T> : null}
        <T style={{ color: C.faint, fontSize: 11, marginTop: 6 }}>
          Version {Constants.expoConfig?.version ?? "1.0.0"} · Built with Muse Spark Open
        </T>
      </View>
    </Screen>
  );
}

/* ================================ Sign in ================================ */
export function AuthScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const col = useColors();
  const { signIn, register, demo, demoMode } = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [f, setF] = useState({ login: "", password: "", name: "", email: "", phone: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const done = () => (nav.canGoBack() ? nav.goBack() : nav.navigate("HomeTab"));
  const run = async (k: string, fn: () => Promise<void>) => {
    setBusy(k);
    setErr(null);
    try {
      await fn();
      done();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Screen>
      {route.params?.reason ? <T style={{ color: C.text, marginBottom: 12, fontWeight: "600" }}>{route.params.reason}</T> : null}
      <View style={st.segment}>
        {(["in", "up"] as const).map((m) => (
          <Pressable key={m} onPress={() => setMode(m)} style={[st.segBtn, mode === m && { backgroundColor: col.brand }]}>
            <T style={{ fontWeight: "700", color: mode === m ? "#fff" : C.text }}>{m === "in" ? "Sign in" : "Create account"}</T>
          </Pressable>
        ))}
      </View>
      <Card style={{ marginTop: 12 }}>
        {err ? <ErrorBox text={err} /> : null}
        {mode === "in" ? (
          <>
            <Field label="E-mail or username">
              <Input value={f.login} onChangeText={(login) => setF({ ...f, login })} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
            </Field>
            <Field label="Password">
              <Input value={f.password} onChangeText={(password) => setF({ ...f, password })} secureTextEntry autoComplete="password" onSubmitEditing={() => void run("in", () => signIn(f.login.trim(), f.password))} />
            </Field>
            <Button title="Sign in" loading={busy === "in"} disabled={!f.login.trim() || !f.password} onPress={() => run("in", () => signIn(f.login.trim(), f.password))} />
            <Button title="Forgot password?" variant="ghost" small onPress={() => nav.navigate("Forgot")} style={{ marginTop: 6 }} />
          </>
        ) : (
          <>
            <Field label="Full name">
              <Input value={f.name} onChangeText={(name) => setF({ ...f, name })} autoComplete="name" />
            </Field>
            <Field label="E-mail">
              <Input value={f.email} onChangeText={(email) => setF({ ...f, email })} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
            </Field>
            <Field label="Phone / WhatsApp">
              <Input value={f.phone} onChangeText={(phone) => setF({ ...f, phone })} keyboardType="phone-pad" autoComplete="tel" />
            </Field>
            <Field label="Password" hint="At least 8 characters">
              <Input value={f.password} onChangeText={(password) => setF({ ...f, password })} secureTextEntry autoComplete="new-password" />
            </Field>
            <Button
              title="Create account"
              loading={busy === "up"}
              disabled={f.name.trim().length < 2 || !f.email.includes("@") || f.phone.trim().length < 6 || f.password.length < 8}
              onPress={() => run("up", () => register({ name: f.name.trim(), email: f.email.trim().toLowerCase(), phone: f.phone.trim(), password: f.password }))}
            />
          </>
        )}
      </Card>
      {demoMode ? (
        <Card style={{ marginTop: 12 }}>
          <T style={{ fontWeight: "700", color: C.ink }}>Just looking?</T>
          <T style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>Sign in as the demo buyer to see orders, invoices and the chat.</T>
          <Button title="Try the demo customer" variant="secondary" icon="sparkles-outline" loading={busy === "demo"} onPress={() => run("demo", demo)} style={{ marginTop: 10 }} />
        </Card>
      ) : null}
    </Screen>
  );
}

/* ================================ Profile ================================ */
export function ProfileScreen() {
  const nav = useNavigation<any>();
  const { refresh } = useAuth();
  const q = useFetch<{ name: string; email: string; phone: string | null; company: string | null; city: string | null; address: string | null }>("/api/account/profile");
  const [f, setF] = useState({ name: "", phone: "", company: "", city: "", address: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (q.data) setF({ name: q.data.name ?? "", phone: q.data.phone ?? "", company: q.data.company ?? "", city: q.data.city ?? "", address: q.data.address ?? "" });
  }, [q.data]);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.put("/api/account/profile", { name: f.name.trim(), phone: f.phone.trim(), company: f.company.trim() || undefined, city: f.city.trim() || undefined, address: f.address.trim() || undefined });
      await refresh();
      nav.goBack();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };
  if (q.loading) return <Screen><Skeleton h={260} /></Screen>;
  return (
    <Screen>
      <Card>
        {err || q.error ? <ErrorBox text={(err ?? q.error)!} /> : null}
        <Field label="Full name"><Input value={f.name} onChangeText={(name) => setF({ ...f, name })} /></Field>
        <Field label="E-mail" hint="Contact us to change your e-mail."><Input value={q.data?.email ?? ""} editable={false} style={{ backgroundColor: "#f8fafc", color: C.muted }} /></Field>
        <Field label="Phone / WhatsApp"><Input value={f.phone} onChangeText={(phone) => setF({ ...f, phone })} keyboardType="phone-pad" /></Field>
        <Field label="Company"><Input value={f.company} onChangeText={(company) => setF({ ...f, company })} /></Field>
        <Field label="City"><Input value={f.city} onChangeText={(city) => setF({ ...f, city })} /></Field>
        <Field label="Address"><Input value={f.address} onChangeText={(address) => setF({ ...f, address })} multiline /></Field>
        <Button title="Save" icon="checkmark" loading={busy} disabled={f.name.trim().length < 2 || f.phone.trim().length < 6} onPress={save} />
      </Card>
      <ChangePassword />
    </Screen>
  );
}

function ChangePassword() {
  const [f, setF] = useState({ current: "", next: "", again: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (f.next !== f.again) return setMsg({ ok: false, text: "The two new passwords are not the same." });
    setBusy(true);
    setMsg(null);
    try {
      await api.post("/api/auth/password", { current: f.current, next: f.next });
      setF({ current: "", next: "", again: "" });
      setMsg({ ok: true, text: "Password changed." });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <SectionTitle title="Change password" />
      <Card>
        <Field label="Current password"><Input value={f.current} onChangeText={(current) => setF({ ...f, current })} secureTextEntry autoComplete="password" /></Field>
        <Field label="New password" hint="At least 8 characters"><Input value={f.next} onChangeText={(next) => setF({ ...f, next })} secureTextEntry autoComplete="new-password" /></Field>
        <Field label="New password again"><Input value={f.again} onChangeText={(again) => setF({ ...f, again })} secureTextEntry autoComplete="new-password" /></Field>
        {msg ? <T style={{ color: msg.ok ? C.green : C.red, fontWeight: "600", marginBottom: 10 }}>{msg.text}</T> : null}
        <Button title="Save new password" icon="key-outline" variant="secondary" loading={busy} disabled={!f.current || f.next.length < 8 || !f.again} onPress={() => void save()} />
      </Card>
    </>
  );
}

/* ================================ Forgotten password ================================ */
export function ForgotScreen() {
  const nav = useNavigation<any>();
  const [email, setEmail] = useState("");
  const [res, setRes] = useState<{ message: string; demoLink?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    setErr(null);
    setRes(null);
    try {
      setRes(await api.post<{ message: string; demoLink?: string }>("/api/auth/forgot", { email: email.trim() }));
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const token = res?.demoLink?.split("token=")[1];
  return (
    <Screen>
      <Card>
        <T style={{ fontWeight: "800", color: C.ink, fontSize: 16 }}>Forgot your password?</T>
        <T style={{ color: C.muted, marginTop: 4, marginBottom: 12 }}>Type your account e-mail and we send a link to choose a new one.</T>
        {err ? <ErrorBox text={err} /> : null}
        <Field label="Account e-mail"><Input value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" /></Field>
        <Button title="Send the link" loading={busy} disabled={!email.includes("@")} onPress={() => void send()} />
        {res ? <T style={{ color: C.green, fontWeight: "600", marginTop: 12 }}>{res.message}</T> : null}
        {token ? (
          <>
            <T style={{ color: C.muted, marginTop: 10 }}>This demo has no mail server, so here is what the e-mail would open:</T>
            <Button title="Choose a new password" variant="secondary" onPress={() => nav.navigate("ResetPassword", { token })} style={{ marginTop: 8 }} />
          </>
        ) : null}
      </Card>
    </Screen>
  );
}

export function ResetPasswordScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const [f, setF] = useState({ next: "", again: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (f.next !== f.again) return setMsg({ ok: false, text: "The two passwords are not the same." });
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.post<{ message: string }>("/api/auth/reset", { token: route.params?.token, newPassword: f.next });
      setMsg({ ok: true, text: r.message });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <Card>
        {msg ? <T style={{ color: msg.ok ? C.green : C.red, fontWeight: "600", marginBottom: 10 }}>{msg.text}</T> : null}
        {msg?.ok ? (
          <Button title="Go to sign in" onPress={() => nav.navigate("Auth")} />
        ) : (
          <>
            <Field label="New password" hint="At least 8 characters"><Input value={f.next} onChangeText={(next) => setF({ ...f, next })} secureTextEntry autoComplete="new-password" /></Field>
            <Field label="New password again"><Input value={f.again} onChangeText={(again) => setF({ ...f, again })} secureTextEntry autoComplete="new-password" /></Field>
            <Button title="Save new password" loading={busy} disabled={f.next.length < 8 || !f.again} onPress={() => void save()} />
          </>
        )}
      </Card>
    </Screen>
  );
}

/* ================================ Partners + locations ================================ */
export function PartnersScreen() {
  const q = useFetch<{ id: string; name: string; logoUrl: string | null; url: string | null }[]>("/api/public/partners");
  if (q.loading) return <Screen><Skeleton h={200} /></Screen>;
  return (
    <Screen onRefresh={q.reload} refreshing={q.refreshing}>
      {q.error ? <ErrorBox text={q.error} onRetry={q.reload} /> : null}
      <Card style={{ padding: 0 }}>
        {q.data?.map((p) => (
          <ListRow key={p.id} icon="ribbon-outline" title={p.name} onPress={p.url ? () => void Linking.openURL(p.url!) : undefined} />
        ))}
      </Card>
    </Screen>
  );
}

export function LocationsScreen() {
  const q = useFetch<{ id: string; name: string; address: string; phone: string | null; email: string | null; mapUrl: string | null }[]>("/api/public/locations");
  if (q.loading) return <Screen><Skeleton h={200} /></Screen>;
  return (
    <Screen onRefresh={q.reload} refreshing={q.refreshing}>
      {q.error ? <ErrorBox text={q.error} onRetry={q.reload} /> : null}
      <View style={{ gap: 10 }}>
        {q.data?.map((l) => (
          <Card key={l.id}>
            <T style={{ fontWeight: "800", color: C.ink }}>{l.name}</T>
            <T style={{ color: C.text, marginTop: 4 }}>{l.address}</T>
            {l.phone ? <T style={{ color: C.muted, marginTop: 2 }}>{l.phone}</T> : null}
            {l.email ? <T style={{ color: C.muted, marginTop: 2 }}>{l.email}</T> : null}
            {l.mapUrl ? <Button small variant="secondary" title="Open the map" icon="map-outline" onPress={() => void Linking.openURL(l.mapUrl!)} style={{ marginTop: 10, alignSelf: "flex-start" }} /> : null}
          </Card>
        ))}
      </View>
    </Screen>
  );
}

/* ================================ Server address ================================ */
export function ServerScreen({ standalone, onSaved }: { standalone?: boolean; onSaved?: () => void }) {
  const restart = useRestart();
  const [url, setUrl] = useState(getServer() || "http://");
  const [state, setState] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const clean = () => url.trim().replace(/\/+$/, "");
  const test = async (): Promise<boolean> => {
    setBusy("test");
    setState(null);
    try {
      const r = await fetch(`${clean()}/api/health`);
      const j = (await r.json()) as { ok?: boolean; model?: string | null };
      if (!j.ok) throw new Error();
      setState({ tone: "ok", text: `Connected${j.model ? ` · AI: ${j.model}` : ""}` });
      return true;
    } catch {
      setState({ tone: "bad", text: "No AutoFTE server answered at that address. Check it, and that the phone is on the same network." });
      return false;
    } finally {
      setBusy(null);
    }
  };
  const save = async () => {
    if (!(await test())) return;
    setBusy("save");
    if (clean() !== getServer()) await setToken(null); // a session belongs to one server
    await setServer(clean());
    setBusy(null);
    (onSaved ?? restart)();
  };
  return (
    <Screen style={standalone ? { paddingTop: 72 } : undefined}>
      {standalone ? (
        <View style={{ alignItems: "center", marginBottom: 18 }}>
          <Ionicons name="car-sport" size={42} color={C.brand} />
          <T style={{ fontSize: 22, fontWeight: "800", color: C.ink, marginTop: 6 }}>Connect to your company</T>
          <T style={{ color: C.muted, textAlign: "center", marginTop: 4 }}>Enter the address of the AutoFTE server (the computer running the website).</T>
        </View>
      ) : null}
      <Card>
        <Field label="Server address" hint="For example http://192.168.1.20:8787 on the same Wi-Fi, or https://cars.example.com">
          <Input value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        </Field>
        {state ? (
          <View style={[st.note, { backgroundColor: state.tone === "ok" ? C.greenBg : C.redBg }]}>
            <Ionicons name={state.tone === "ok" ? "checkmark-circle" : "alert-circle"} size={18} color={state.tone === "ok" ? C.green : C.red} />
            <T style={{ flex: 1, color: state.tone === "ok" ? C.green : C.red, fontWeight: "600" }}>{state.text}</T>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button title="Test" variant="secondary" loading={busy === "test"} onPress={() => void test()} style={{ flex: 1 }} />
          <Button title="Save & connect" loading={busy === "save"} onPress={() => void save()} style={{ flex: 2 }} />
        </View>
      </Card>
    </Screen>
  );
}

/* ================================ Content ================================ */
export function PageScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const q = useFetch<{ title: string; body: string }>(`/api/public/pages/${encodeURIComponent(route.params?.slug ?? "")}`);
  useEffect(() => {
    if (q.data) nav.setOptions({ title: q.data.title });
  }, [q.data, nav]);
  return (
    <Screen onRefresh={q.reload} refreshing={q.refreshing}>
      {q.error ? <ErrorBox text={q.error} onRetry={q.reload} /> : null}
      {q.loading ? <Skeleton h={300} /> : q.data ? <Card><Markdown text={q.data.body} /></Card> : null}
    </Screen>
  );
}

export function BlogScreen() {
  const nav = useNavigation<any>();
  const q = useFetch<{ slug: string; title: string; excerpt: string; publishedAt: string | null }[]>("/api/public/blog");
  return (
    <Screen onRefresh={q.reload} refreshing={q.refreshing}>
      {q.error ? <ErrorBox text={q.error} onRetry={q.reload} /> : null}
      {q.loading ? (
        <Skeleton h={200} />
      ) : !q.data?.length ? (
        <Empty icon="newspaper-outline" title="No guides yet" />
      ) : (
        <View style={{ gap: 12 }}>
          {q.data.map((p) => (
            <Card key={p.slug} onPress={() => nav.navigate("BlogPost", { slug: p.slug })}>
              <T style={{ fontWeight: "800", color: C.ink, fontSize: 16 }}>{p.title}</T>
              {p.publishedAt ? <T style={{ color: C.faint, fontSize: 12, marginTop: 2 }}>{date(p.publishedAt)}</T> : null}
              <T lines={3} style={{ color: C.text, marginTop: 6, lineHeight: 20 }}>
                {p.excerpt}
              </T>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

export function BlogPostScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const q = useFetch<{ title: string; body: string; publishedAt: string | null }>(`/api/public/blog/${encodeURIComponent(route.params?.slug ?? "")}`);
  useEffect(() => {
    if (q.data) nav.setOptions({ title: q.data.title });
  }, [q.data, nav]);
  return (
    <Screen>
      {q.error ? <ErrorBox text={q.error} onRetry={q.reload} /> : null}
      {q.loading ? (
        <Skeleton h={300} />
      ) : q.data ? (
        <Card>
          <T style={{ fontSize: 21, fontWeight: "800", color: C.ink }}>{q.data.title}</T>
          {q.data.publishedAt ? <T style={{ color: C.faint, fontSize: 12, marginTop: 2, marginBottom: 10 }}>{date(q.data.publishedAt)}</T> : null}
          <Markdown text={q.data.body} />
        </Card>
      ) : null}
    </Screen>
  );
}

export function FaqScreen() {
  const q = useFetch<{ id: string; question: string; answer: string; category: string }[]>("/api/public/faqs");
  const [open, setOpen] = useState<string | null>(null);
  const groups = new Map<string, NonNullable<typeof q.data>>();
  for (const f of q.data ?? []) groups.set(f.category, [...(groups.get(f.category) ?? []), f]);
  return (
    <Screen onRefresh={q.reload} refreshing={q.refreshing}>
      {q.error ? <ErrorBox text={q.error} onRetry={q.reload} /> : null}
      {q.loading ? <Skeleton h={260} /> : null}
      {[...groups.entries()].map(([cat, items]) => (
        <View key={cat}>
          <SectionTitle title={cat} />
          <Card style={{ padding: 0 }}>
            {items.map((f) => (
              <Pressable key={f.id} onPress={() => setOpen(open === f.id ? null : f.id)} style={st.faq}>
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <T style={{ flex: 1, fontWeight: "700", color: C.ink }}>{f.question}</T>
                  <Ionicons name={open === f.id ? "chevron-up" : "chevron-down"} size={18} color={C.faint} />
                </View>
                {open === f.id ? <T style={{ marginTop: 8, color: C.text, lineHeight: 21 }}>{f.answer}</T> : null}
              </Pressable>
            ))}
          </Card>
        </View>
      ))}
    </Screen>
  );
}

export function ServicesScreen() {
  const col = useColors();
  const q = useFetch<{ id: string; title: string; body: string }[]>("/api/public/services");
  return (
    <Screen onRefresh={q.reload} refreshing={q.refreshing}>
      {q.error ? <ErrorBox text={q.error} onRetry={q.reload} /> : null}
      {q.loading ? <Skeleton h={260} /> : null}
      <View style={{ gap: 12 }}>
        {(q.data ?? []).map((x) => (
          <Card key={x.id}>
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
              <Ionicons name="checkmark-done-circle" size={22} color={col.brand} />
              <T style={{ flex: 1, fontWeight: "800", color: C.ink }}>{x.title}</T>
            </View>
            <T style={{ marginTop: 6, color: C.text, lineHeight: 21 }}>{x.body}</T>
          </Card>
        ))}
      </View>
    </Screen>
  );
}

export function BankScreen() {
  const { site } = useSite();
  const b = site.bank;
  const rows: [string, string][] = [
    ["Bank", b.bankName],
    ["Branch", b.branch],
    ["SWIFT", b.swift],
    ["Account name", b.accountName],
    ["Account no.", b.accountNo],
  ];
  return (
    <Screen>
      <Card style={{ padding: 0 }}>
        {rows.map(([k, v]) => (
          <View key={k} style={st.kv}>
            <T style={{ color: C.muted, flex: 1 }}>{k}</T>
            <T selectable style={{ color: C.ink, fontWeight: "700", flex: 1.4, textAlign: "right" }}>
              {v || "—"}
            </T>
          </View>
        ))}
      </Card>
      <T style={{ color: C.muted, fontSize: 13, marginTop: 12, lineHeight: 19 }}>Pay only against an approved invoice, and put the invoice number in the transfer reference. We never change bank details by chat or e-mail — if anyone asks you to pay elsewhere, call us first.</T>
    </Screen>
  );
}

export function ContactScreen() {
  const { me } = useAuth();
  const { site } = useSite();
  const [f, setF] = useState({ name: me?.name ?? "", email: me?.email ?? "", phone: me?.phone ?? "", subject: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const send = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.post("/api/public/contact", { name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim() || undefined, subject: f.subject.trim() || undefined, message: f.message.trim() });
      setSent(true);
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };
  if (sent)
    return (
      <Screen>
        <Empty icon="checkmark-circle-outline" title="Message sent" text="Thank you — our team will reply by e-mail. For a faster answer, use the chat." />
      </Screen>
    );
  return (
    <Screen>
      <Card style={{ padding: 0, marginBottom: 12 }}>
        {site.phone ? <ListRow icon="call-outline" title={site.phone} subtitle="Call us" onPress={() => void Linking.openURL(`tel:${site.phone.replace(/\s/g, "")}`)} /> : null}
        {site.whatsapp ? <ListRow icon="logo-whatsapp" title={site.whatsapp} subtitle="WhatsApp" onPress={() => void Linking.openURL(`https://wa.me/${site.whatsapp.replace(/\D/g, "")}`)} /> : null}
        {site.email ? <ListRow icon="mail-outline" title={site.email} subtitle="E-mail" onPress={() => void Linking.openURL(`mailto:${site.email}`)} /> : null}
      </Card>
      <Card>
        {err ? <ErrorBox text={err} /> : null}
        <Field label="Your name"><Input value={f.name} onChangeText={(name) => setF({ ...f, name })} /></Field>
        <Field label="E-mail"><Input value={f.email} onChangeText={(email) => setF({ ...f, email })} autoCapitalize="none" keyboardType="email-address" /></Field>
        <Field label="Phone (optional)"><Input value={f.phone} onChangeText={(phone) => setF({ ...f, phone })} keyboardType="phone-pad" /></Field>
        <Field label="Subject (optional)"><Input value={f.subject} onChangeText={(subject) => setF({ ...f, subject })} /></Field>
        <Field label="Message"><Input value={f.message} onChangeText={(message) => setF({ ...f, message })} multiline /></Field>
        <Button title="Send message" icon="paper-plane-outline" loading={busy} disabled={f.name.trim().length < 2 || !f.email.includes("@") || f.message.trim().length < 5} onPress={send} />
      </Card>
    </Screen>
  );
}

/* ================================ Invoices ================================ */
const INV: Record<string, { label: string; tone: "amber" | "green" | "blue" | "gray" }> = {
  awaiting_approval: { label: "Waiting for approval", tone: "amber" },
  approved: { label: "Approved — pay advance", tone: "green" },
  sent: { label: "Confirmed", tone: "blue" },
};

export function InvoicesScreen() {
  const nav = useNavigation<any>();
  const col = useColors();
  const q = useFetch<CustomerInvoice[]>("/api/account/invoices");
  return (
    <Screen onRefresh={q.reload} refreshing={q.refreshing}>
      {q.error ? <ErrorBox text={q.error} onRetry={q.reload} /> : null}
      {q.loading ? (
        <Skeleton h={160} />
      ) : !q.data?.length ? (
        <Empty icon="document-text-outline" title="No invoices yet" text="When our supervisor approves an invoice for you, it appears here with payments, documents and shipping progress." />
      ) : (
        <View style={{ gap: 12 }}>
          {q.data.map((inv) => {
            const st0 = INV[inv.status] ?? { label: inv.status, tone: "gray" as const };
            const last = inv.vehicles[0]?.progress.at(-1);
            return (
              <Card key={inv.id} onPress={() => nav.navigate("Invoice", { id: inv.id })}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <T style={{ fontWeight: "800", color: C.ink }}>{inv.number}</T>
                  <Badge label={st0.label} tone={st0.tone} />
                </View>
                <T style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
                  {date(inv.createdAt)}
                  {inv.port ? ` · to ${inv.port}` : ""} · {inv.vehicles.length} vehicle{inv.vehicles.length === 1 ? "" : "s"}
                </T>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 10 }}>
                  <T style={{ color: C.text }}>Total {usd(inv.totals.total)}</T>
                  <T style={{ color: inv.totals.balance > 0 ? C.amber : C.green, fontWeight: "700" }}>{inv.totals.balance > 0 ? `Balance ${usd(inv.totals.balance)}` : "Paid in full"}</T>
                </View>
                {last ? <T style={{ color: col.brand, fontSize: 12, marginTop: 6, fontWeight: "600" }}>Latest: {last.stage}</T> : null}
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

export function InvoiceScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const col = useColors();
  const q = useFetch<CustomerInvoice>(`/api/account/invoices/${encodeURIComponent(route.params?.id ?? "")}`);
  const inv = q.data;
  const [fetching, setFetching] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const fetchFile = async (key: string, path: string, name: string, mime?: string) => {
    setFetching(key);
    setFetchError(null);
    try {
      await downloadAndShare(path, name, mime);
    } catch {
      setFetchError(`Could not download ${name}. Check your connection and try again.`);
    } finally {
      setFetching(null);
    }
  };
  useEffect(() => {
    if (inv) nav.setOptions({ title: inv.number });
  }, [inv, nav]);
  if (q.loading) return <Screen><Skeleton h={300} /></Screen>;
  if (!inv) return <Screen><ErrorBox text={q.error ?? "Invoice not found"} onRetry={q.reload} /></Screen>;
  return (
    <Screen onRefresh={q.reload} refreshing={q.refreshing}>
      <Card>
        <T style={{ color: C.muted, fontSize: 12 }}>Consignee</T>
        <T style={{ fontWeight: "700", color: C.ink }}>{inv.consigneeName}</T>
        <View style={st.totals}>
          {(
            [
              ["Total", inv.totals.total],
              [`Advance (${inv.advancePercent}%)`, inv.totals.advance],
              ["Paid", inv.totals.paid],
              ["Balance", inv.totals.balance],
            ] as const
          ).map(([k, v]) => (
            <View key={k} style={{ width: "50%", paddingVertical: 6 }}>
              <T style={{ color: C.muted, fontSize: 12 }}>{k}</T>
              <T style={{ fontWeight: "800", color: k === "Balance" && v > 0 ? C.amber : C.ink, fontSize: 16 }}>{usd(v)}</T>
            </View>
          ))}
        </View>
        {inv.status === "approved" || inv.status === "sent" ? <Button title="Invoice PDF" icon="download-outline" variant="secondary" loading={fetching === "pdf"} onPress={() => void fetchFile("pdf", `/api/account/invoices/${inv.id}/pdf`, `${inv.number}.pdf`, "application/pdf")} style={{ marginTop: 10 }} /> : null}
      </Card>
      {fetchError ? <ErrorBox text={fetchError} /> : null}
      {inv.vehicles.map((v) => (
        <View key={v.id}>
          <SectionTitle title={v.label} />
          <Card>
            <T style={{ color: C.muted, fontSize: 12 }}>
              {v.color} · chassis {v.chassisNo} · C&F {usd(v.cnfUsd)}
            </T>
            <T style={{ fontWeight: "700", color: C.ink, marginTop: 10, marginBottom: 6 }}>Shipping progress</T>
            {v.progress.length ? (
              v.progress.map((p, i) => (
                <View key={i} style={{ flexDirection: "row", gap: 10, paddingVertical: 4 }}>
                  <Ionicons name={i === v.progress.length - 1 ? "radio-button-on" : "checkmark-circle"} size={18} color={i === v.progress.length - 1 ? col.brand : C.green} />
                  <View style={{ flex: 1 }}>
                    <T style={{ fontWeight: "600", color: C.ink }}>{p.stage}</T>
                    <T style={{ color: C.muted, fontSize: 12 }}>
                      {date(p.date)}
                      {p.note ? ` · ${p.note}` : ""}
                    </T>
                  </View>
                </View>
              ))
            ) : (
              <T style={{ color: C.muted }}>Not started yet.</T>
            )}
            {v.documents.length ? (
              <>
                <T style={{ fontWeight: "700", color: C.ink, marginTop: 10 }}>Documents</T>
                {v.documents.map((d) => (
                  <Pressable key={d.id} accessibilityRole="button" accessibilityLabel={`Download ${d.name}`} disabled={!!fetching} onPress={() => void fetchFile(d.id, `/api/account/files/${d.fileId}`, d.name, d.mime)} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 }}>
                    <Ionicons name={fetching === d.id ? "hourglass-outline" : "download-outline"} size={18} color={col.brand} />
                    <T style={{ flex: 1, color: C.text, fontSize: 13 }}>
                      {d.folder}: {d.name}
                    </T>
                  </Pressable>
                ))}
              </>
            ) : null}
          </Card>
        </View>
      ))}
      {inv.payments.length ? (
        <>
          <SectionTitle title="Payments" />
          <Card style={{ padding: 0 }}>
            {inv.payments.map((p, i) => (
              <View key={i} style={st.kv}>
                <T style={{ color: C.muted, flex: 1 }}>{date(p.date)}</T>
                <T style={{ color: C.ink, fontWeight: "700" }}>{usd(p.amountUsd)}</T>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const st = StyleSheet.create({
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  segment: { flexDirection: "row", backgroundColor: "#e2e8f0", borderRadius: 14, padding: 4 },
  segBtn: { flex: 1, minHeight: 44, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  note: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, padding: 10, marginBottom: 12 },
  faq: { padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  kv: { flexDirection: "row", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  totals: { flexDirection: "row", flexWrap: "wrap", marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderColor: C.line, paddingTop: 6 },
});
