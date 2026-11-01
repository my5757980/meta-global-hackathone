import { useState } from "react";
import { Link, Navigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, CheckCircle2, Heart, ShoppingCart, Trash2 } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usd } from "../lib/format";
import { effectivePrice, isBuyer, useCart, useShopActions, useWishlist } from "../lib/shop";
import { Badge, Button, Card, Empty, LinkButton, Skeleton, Textarea } from "../ui";
import { VehicleCard } from "./VehicleCard";
import { openChatWith } from "../chat/ChatWidget";

/** Signed-out → sign in and come back; staff → explain; otherwise render the page. */
function BuyerGate({ next, children }: { next: string; children: React.ReactNode }) {
  const { me, loading } = useAuth();
  if (loading) return <div className="container-page py-10"><Skeleton className="h-60" /></div>;
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  if (!isBuyer(me.kind)) return <div className="container-page py-10"><Empty title="Staff accounts do not shop" text="Sign in with a customer account to save cars and place an order request." /></div>;
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
            <Button variant="ghost" className="mt-2 w-full" onClick={() => openChatWith("Hi Sora, can you give me the C&F price of the cars in my cart to my port?")}><Bot className="size-4" /> Ask Sora the C&F price</Button>
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

function CheckoutInner() {
  const q = useCart();
  const qc = useQueryClient();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ orderNo: string; totalUsd: number; items: number } | null>(null);

  if (done)
    return (
      <div className="container-page py-12">
        <Card className="mx-auto max-w-lg text-center">
          <CheckCircle2 className="mx-auto size-12 text-emerald-500" />
          <h1 className="mt-3 text-2xl font-bold text-slate-900">Order request sent</h1>
          <p className="mt-1 text-sm text-slate-600">
            Your order number is <span className="font-bold text-slate-900">{done.orderNo}</span> — {done.items} car{done.items === 1 ? "" : "s"}, {usd(done.totalUsd)} FOB.
          </p>
          <p className="mt-3 text-sm text-slate-500">Nothing to pay yet. A colleague confirms the cars are still yours and sends the invoice with our bank details. You will see every step in your account and in the chat.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <LinkButton to="/account/orders">View my orders</LinkButton>
            <LinkButton to="/chat" variant="secondary"><Bot className="size-4" /> Chat with Sora</LinkButton>
          </div>
        </Card>
      </div>
    );

  const ready = q.data?.items.filter((v) => v.status === "available") ?? [];
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.post<{ orderNo: string; totalUsd: number; items: number }>("/api/shop/checkout", { notes: notes.trim() || undefined });
      setDone(r);
      void qc.invalidateQueries({ queryKey: ["shop"] });
      void qc.invalidateQueries({ queryKey: ["my-orders"] });
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="container-page py-8">
      <h1 className="mb-5 text-2xl font-bold text-slate-900">Checkout</h1>
      {q.isLoading ? (
        <Skeleton className="h-60" />
      ) : !ready.length ? (
        <Empty icon={<ShoppingCart className="size-8" />} title="Nothing to check out" text="Your cart has no available cars." action={<LinkButton to="/cart">Back to cart</LinkButton>} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <Card>
            <p className="mb-3 text-sm font-semibold text-slate-700">Cars in this order request</p>
            <ul className="divide-y divide-slate-100">
              {ready.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 text-sm text-slate-800"><span className="block truncate font-medium">{v.title}</span><span className="text-xs text-slate-500">{v.stockNo}</span></span>
                  <span className="shrink-0 font-semibold text-slate-900">{usd(effectivePrice(v))}</span>
                </li>
              ))}
            </ul>
            <label className="mt-4 block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Notes for our team <span className="font-normal text-slate-400">(optional)</span></span>
              <Textarea rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Destination port, RoRo or container, consignee name…" />
            </label>
          </Card>
          <Card className="h-fit">
            <p className="text-sm text-slate-500">Total (FOB Japan)</p>
            <p className="mt-1 text-3xl font-extrabold text-brand-700">{usd(q.data!.totalUsd)}</p>
            <p className="mt-2 text-xs text-slate-500">This sends an order request — no payment now. We confirm availability, then send the invoice with bank details for the advance.</p>
            {err && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{err}</p>}
            <Button size="lg" className="mt-4 w-full" loading={busy} onClick={submit}>Send order request</Button>
          </Card>
        </div>
      )}
    </div>
  );
}
