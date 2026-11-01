import { Link, Navigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { date, usd } from "../lib/format";
import type { WebOrder } from "../lib/shop";
import { Card, Empty, LinkButton, Skeleton, StatusBadge } from "../ui";
import { AccountShell } from "./Account";

/** What each step means to the buyer, in plain words. */
const NEXT: Record<string, string> = {
  pending: "We are confirming the cars are still available.",
  approved: "Confirmed — the invoice with bank details is on its way.",
  confirmed: "Invoice sent — pay the advance to secure the cars.",
  paid: "Payment received — we are booking shipping.",
  shipped: "On the way to your port.",
  delivered: "Delivered. Thank you for buying with us!",
  cancelled: "This request was cancelled.",
};

export default function AccountOrders() {
  const { me, loading } = useAuth();
  const q = useQuery({ queryKey: ["my-orders"], queryFn: () => api.get<{ items: WebOrder[] }>("/api/shop/orders"), enabled: !!me && (me.kind === "customer" || me.kind === "visitor") });
  if (!loading && !me) return <Navigate to="/login?next=%2Faccount%2Forders" replace />;
  return (
    <AccountShell title="My orders">
      {q.isLoading ? (
        <Skeleton className="h-40" />
      ) : !q.data?.items.length ? (
        <Empty icon={<Package className="size-8" />} title="No orders yet" text="Order requests you send from the cart appear here with their status." action={<LinkButton to="/shop">Browse stock</LinkButton>} />
      ) : (
        <div className="space-y-3">
          {q.data.items.map((o) => (
            <Card key={o.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-slate-900">{o.orderNo}</p>
                  <p className="text-xs text-slate-500">{date(o.createdAt)} · {o.items.length} car{o.items.length === 1 ? "" : "s"}</p>
                </div>
                <div className="text-right">
                  <StatusBadge status={o.status} />
                  <p className="mt-1 font-bold text-brand-700">{usd(o.totalUsd)}</p>
                </div>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {o.items.map((i, k) => (
                  <li key={k} className="flex justify-between gap-3">
                    {i.slug ? <Link to={`/vehicles/${i.slug}`} className="min-w-0 truncate text-slate-700 hover:text-brand-700">{i.title}</Link> : <span className="min-w-0 truncate text-slate-700">{i.title}</span>}
                    <span className="shrink-0 text-slate-600">{usd(i.priceUsd)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">{NEXT[o.status] ?? ""}</p>
              {o.notes && <p className="mt-2 text-xs text-slate-500">Your note: {o.notes}</p>}
            </Card>
          ))}
        </div>
      )}
    </AccountShell>
  );
}
