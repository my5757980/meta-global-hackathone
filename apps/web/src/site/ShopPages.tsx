import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, CheckCircle2, Heart, ShoppingCart, Trash2 } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usd } from "../lib/format";
import { effectivePrice, isBuyer, useCart, useShopActions, useWishlist } from "../lib/shop";
import { useFte } from "../lib/site";
import { Badge, Button, Card, Empty, Field, Input, LinkButton, Select, Skeleton, Textarea } from "../ui";
import { VehicleCard } from "./VehicleCard";
import { openChatWith } from "../chat/ChatWidget";

/** Signed-out → sign in and come back; staff → explain; otherwise render the page. */
function BuyerGate({ next, children }: { next: string; children: React.ReactNode }) {
  const { me, loading } = useAuth();
  if (loading) return <div className="container-page py-10"><Skeleton className="h-60" /></div>;
  if (me && !isBuyer(me.kind)) return <div className="container-page py-10"><Empty title="Staff accounts do not shop" text="Sign in with a customer account to save cars and place an order request." /></div>;
  return <>{children}</>;
}

const errText = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong — please try again");

/* ============================== Wishlist ============================== */
export function WishlistView() {
  return (
    <BuyerGate next="/wishlist">
      <WishlistInner />
    </BuyerGate>
  );
}

function WishlistInner() {
  const q = useWishlist();
  const cart = useCart();
  const act = useShopActions();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const inCart = new Set(cart.data?.items.map((i) => i.id) ?? []);
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setErr(null);
    try { await fn(); } catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  };
  return (
    <div className="container-page py-8">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Saved cars</h1>
      <p className="mb-5 text-sm text-slate-500">Cars you saved. Prices and availability are live.</p>
      {err && <p className="mb-4 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 ring-1 ring-rose-100">{err}</p>}
      {q.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-72" />)}</div>
      ) : !q.data?.items.length ? (
        <Empty icon={<Heart className="size-8" />} title="No saved cars yet" text="Tap Save on any car to keep it here." action={<LinkButton to="/shop">Browse stock</LinkButton>} />
      ) : (
        <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {q.data.items.map((v) => (
            <div key={v.id} className="flex flex-col gap-2">
              <VehicleCard v={v} />
              <div className="grid grid-cols-[1fr_auto] gap-2">
                {v.status !== "available" ? (
                  <Badge tone="gray" className="justify-center py-2">{v.status === "sold" ? "Sold" : "Reserved"}</Badge>
                ) : inCart.has(v.id) ? (
                  <LinkButton to="/cart" variant="secondary" size="sm"><ShoppingCart className="size-4" /> In cart</LinkButton>
                ) : (
                  <Button size="sm" loading={busy === `c${v.id}`} onClick={() => run(`c${v.id}`, () => act.addToCart(v.id))}><ShoppingCart className="size-4" /> Add to cart</Button>
                )}
                <Button size="sm" variant="ghost" aria-label="Remove from saved" loading={busy === `w${v.id}`} onClick={() => run(`w${v.id}`, () => act.toggleWishlist(v.id, true))}><Trash2 className="size-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================ Cart ================================ */
export function CartView() {
  return (
    <BuyerGate next="/cart">
      <CartInner />
    </BuyerGate>
  );
}

function CartInner() {
  const fte = useFte();
  const q = useCart();
  const act = useShopActions();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const remove = async (id: string) => {
    setBusy(id);
    setErr(null);
    try { await act.removeFromCart(id); } catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  };
  const items = q.data?.items ?? [];
  return (
    <div className="container-page py-8">
      <h1 className="mb-5 text-2xl font-bold text-slate-900">Your cart</h1>
      {err && <p className="mb-4 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 ring-1 ring-rose-100">{err}</p>}
      {q.isLoading ? (
        <Skeleton className="h-60" />
      ) : !items.length ? (
        <Empty icon={<ShoppingCart className="size-8" />} title="Your cart is empty" text="Add cars from the shop, then send one order request for all of them." action={<LinkButton to="/shop">Browse stock</LinkButton>} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-3">
            {items.map((v) => {
              const ok = v.status === "available";
              return (
                <Card key={v.id} padded={false} className="flex items-center gap-3 p-3">
                  <Link to={`/vehicles/${v.slug}`} className="shrink-0">
                    <img src={v.image} alt="" className="h-16 w-24 rounded-xl object-cover ring-1 ring-slate-200 sm:h-20 sm:w-32" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link to={`/vehicles/${v.slug}`} className="line-clamp-2 text-sm font-semibold text-slate-900 hover:text-brand-700">{v.title}</Link>
                    <p className="text-xs text-slate-500">{v.stockNo} · {v.year}</p>
                    {!ok && <p className="mt-1 text-xs font-semibold text-rose-600">{v.status === "sold" ? "Sold" : "Reserved by another buyer"} — remove it to continue</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={ok ? "font-bold text-slate-900" : "font-bold text-slate-400 line-through"}>{usd(effectivePrice(v))}</p>
                    <button onClick={() => void remove(v.id)} disabled={busy === v.id} className="mt-1 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"><Trash2 className="size-3.5" /> Remove</button>
                  </div>
                </Card>
              );
            })}
          </div>
          <Card className="h-fit lg:sticky lg:top-24">
            <p className="text-sm text-slate-500">{q.data!.readyCount} car{q.data!.readyCount === 1 ? "" : "s"} ready</p>
            <p className="mt-1 text-3xl font-extrabold text-brand-700">{usd(q.data!.totalUsd)}</p>
            <p className="text-xs text-slate-500">FOB Japan. Freight to your port is quoted on the invoice.</p>
            <LinkButton to="/checkout" size="lg" className={q.data!.readyCount ? "mt-4 w-full" : "pointer-events-none mt-4 w-full opacity-50"}>Checkout</LinkButton>
            <Button variant="ghost" className="mt-2 w-full" onClick={() => openChatWith(`Hi ${fte}, can you give me the C&F price of the cars in my cart to my port?`)}><Bot className="size-4" /> Ask {fte} the C&F price</Button>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ============================== Checkout ============================== */
export function CheckoutView() {
  return (
    <BuyerGate next="/checkout">
      <CheckoutInner />
    </BuyerGate>
  );
}

const PERCENTS = [10, 25, 50, 75, 100];

function CheckoutInner() {
  const fte = useFte();
  const q = useCart();
  const qc = useQueryClient();
  const { me, refresh } = useAuth();
  const nav = useNavigate();
  const options = useQuery({ queryKey: ["pay-options"], queryFn: () => api.get<{ provider: "paypal" | "demo" | null }>("/api/shop/pay-options") });
  const countries = useQuery({ queryKey: ["countries"], queryFn: () => api.get<{ code: string; name: string; ports: { id: string; name: string }[] }[]>("/api/public/countries"), staleTime: 3600_000 });
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => api.get<{ name: string; email: string; phone: string; countryCode: string | null; city: string | null }>("/api/account/profile"), enabled: !!me && me.kind === "customer" });
  const [f, setF] = useState({ name: "", email: "", phone: "", countryCode: "", city: "", port: "", notes: "", password: "", confirm: "" });
  const [percent, setPercent] = useState(100);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ orderNo: string; totalUsd: number; items: number; payNowUsd: number; remainingUsd: number } | null>(null);
  useEffect(() => {
    const p = profile.data;
    if (p) setF((x) => ({ ...x, name: x.name || p.name || "", email: x.email || p.email || "", phone: x.phone || p.phone || "", countryCode: x.countryCode || p.countryCode || "", city: x.city || p.city || "" }));
  }, [profile.data]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  if (done)
    return (
      <div className="container-page py-12">
        <Card className="mx-auto max-w-lg text-center">
          <CheckCircle2 className="mx-auto size-12 text-emerald-500" />
          <h1 className="mt-3 text-2xl font-bold text-slate-900">Order request sent</h1>
          <p className="mt-1 text-sm text-slate-600">
            Your order number is <span className="font-bold text-slate-900">{done.orderNo}</span>: {done.items} car{done.items === 1 ? "" : "s"}, {usd(done.totalUsd)} FOB.
          </p>
          <p className="mt-3 text-sm text-slate-500">Nothing to pay yet. Our team confirms the cars are still yours and sends the invoice with our bank details. You will see every step in your account and in the chat.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <LinkButton to="/account/orders">View my orders</LinkButton>
            <LinkButton to="/chat" variant="secondary"><Bot className="size-4" /> Chat with {fte}</LinkButton>
          </div>
        </Card>
      </div>
    );

  const ready = q.data?.items.filter((v) => v.status === "available") ?? [];
  const subtotal = ready.reduce((a, v) => a + effectivePrice(v), 0);
  const floor = subtotal <= 3000 ? 25 : 0.01;
  const typed = Number(amount) || 0;
  const asked = typed > 0 && subtotal > 0 ? (typed / subtotal) * 100 : percent;
  const effective = Math.min(100, Math.max(asked, floor));
  const payNow = effective >= 100 ? subtotal : Math.round(subtotal * effective) / 100;
  const remaining = Math.round((subtotal - payNow) * 100) / 100;
  const raised = asked < floor;
  const ports = countries.data?.find((c) => c.code === f.countryCode)?.ports ?? [];
  const submit = async (pay?: "online") => {
    setErr(null);
    if (!me && f.password !== f.confirm) {
      setErr("The two passwords are not the same");
      return;
    }
    setBusy(true);
    try {
      const body = {
        notes: f.notes.trim() || undefined,
        pay,
        name: f.name || undefined,
        email: f.email || undefined,
        phone: f.phone || undefined,
        countryCode: f.countryCode || undefined,
        city: f.city.trim() || undefined,
        port: f.port.trim() || undefined,
        payPercent: typed > 0 ? undefined : percent,
        payNowUsd: typed > 0 ? typed : undefined,
        password: me ? undefined : f.password,
        vehicleIds: me ? undefined : ready.map((v) => v.id),
      };
      const r = await api.post<{ orderId: string; orderNo: string; totalUsd: number; items: number; payNowUsd: number; remainingUsd: number }>("/api/shop/checkout", body);
      if (!me) {
        // the account now exists: what was in this browser is on it
        try {
          localStorage.removeItem("guest-cart");
        } catch {
          /* nothing stored */
        }
        await refresh();
      }
      void qc.invalidateQueries({ queryKey: ["shop"] });
      void qc.invalidateQueries({ queryKey: ["my-orders"] });
      if (pay) {
        const p = await api.post<{ approveUrl: string | null }>(`/api/shop/orders/${r.orderId}/pay`, {});
        if (p.approveUrl) window.location.assign(p.approveUrl);
        else nav(`/pay/${r.orderId}`);
        return;
      }
      setDone(r);
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const canSend = !!(f.name.trim() && f.email.trim() && f.phone.trim() && f.countryCode && (me || f.password.length >= 8));
  return (
    <div className="container-page py-8">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Checkout</h1>
      <p className="mb-5 text-sm text-slate-500">Tell us where to reach you and how much you pay now.</p>
      {q.isLoading ? (
        <Skeleton className="h-60" />
      ) : !ready.length ? (
        <Empty icon={<ShoppingCart className="size-8" />} title="Nothing to check out" text="Your cart has no available cars." action={<LinkButton to="/cart">Back to cart</LinkButton>} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <Card>
            <p className="mb-3 text-sm font-semibold text-slate-700">Buyer details</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name"><Input required value={f.name} onChange={set("name")} autoComplete="name" /></Field>
              <Field label="E-mail"><Input required type="email" value={f.email} onChange={set("email")} disabled={!!me && me.kind === "customer"} autoComplete="email" /></Field>
              <Field label="Phone / WhatsApp"><Input required value={f.phone} onChange={set("phone")} autoComplete="tel" /></Field>
              <Field label="Destination country">
                <Select value={f.countryCode} onChange={set("countryCode")}>
                  <option value="">Choose a country</option>
                  {countries.data?.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="City"><Input value={f.city} onChange={set("city")} autoComplete="address-level2" /></Field>
              <Field label="Preferred port">
                <Input value={f.port} onChange={set("port")} list="checkout-ports" placeholder="Mombasa, Kingston, Karachi" />
                <datalist id="checkout-ports">{ports.map((p) => <option key={p.id} value={p.name} />)}</datalist>
              </Field>
              <Field label="Payment percentage">
                <Select value={String(percent)} onChange={(e) => { setPercent(Number(e.target.value)); setAmount(""); }}>
                  {PERCENTS.map((n) => <option key={n} value={n}>{n}%</option>)}
                </Select>
              </Field>
              <Field label="Pay now amount (USD)" hint="Or type your own amount">
                <Input type="number" min={1} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(payNow)} />
              </Field>
              {!me && (
                <>
                  <Field label="Account password" hint="8 or more characters. Your account is made with this order."><Input type="password" minLength={8} value={f.password} onChange={set("password")} autoComplete="new-password" /></Field>
                  <Field label="Confirm password"><Input type="password" minLength={8} value={f.confirm} onChange={set("confirm")} autoComplete="new-password" /></Field>
                </>
              )}
            </div>
            {!me && <p className="mt-2 text-xs text-slate-500">Already have an account? <Link to="/login?next=%2Fcheckout" className="font-semibold text-brand-700">Sign in</Link> and your cart comes with you.</p>}
            <label className="mt-4 block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Additional notes <span className="font-normal text-slate-400">(optional)</span></span>
              <Textarea rows={3} maxLength={1000} value={f.notes} onChange={set("notes")} placeholder="Shipment timing, inspection needs, documents you need" />
            </label>
          </Card>
          <Card className="h-fit">
            <p className="mb-2 text-sm font-semibold text-slate-700">Order summary</p>
            <ul className="divide-y divide-slate-100">
              {ready.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 text-sm text-slate-800"><span className="block truncate font-medium">{v.title}</span><span className="text-xs text-slate-500">{v.stockNo}</span></span>
                  <span className="shrink-0 font-semibold text-slate-900">{usd(effectivePrice(v))}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Subtotal (FOB Japan)</dt><dd className="font-semibold" data-testid="subtotal">{usd(subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Pay now ({Math.round(effective)}%)</dt><dd className="font-bold text-brand-700" data-testid="pay-now">{usd(payNow)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Remaining</dt><dd className="font-semibold" data-testid="remaining">{usd(remaining)}</dd></div>
            </dl>
            {raised && <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800">For orders of $3,000 or less, the least you can pay now is 25%.</p>}
            <p className="mt-2 text-xs text-slate-500">The final invoice can add freight, inspection, documents and destination charges once our team confirms your route.</p>
            {err && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{err}</p>}
            {options.data?.provider && (
              <Button size="lg" className="mt-4 w-full" disabled={busy || !canSend} onClick={() => void submit("online")}>
                {options.data.provider === "paypal" ? "Pay with PayPal or card" : "Pay online (demo)"}
              </Button>
            )}
            <Button size="lg" variant={options.data?.provider ? "secondary" : "primary"} className="mt-2 w-full" loading={busy} disabled={!canSend} onClick={() => void submit()}>Submit order for checking</Button>
            <p className="mt-2 text-xs text-slate-500">Submitting sends the order with nothing to pay yet. We confirm the cars, then send the invoice with bank details.</p>
          </Card>
        </div>
      )}
    </div>
  );
}
