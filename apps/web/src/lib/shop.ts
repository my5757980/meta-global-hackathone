import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useAuth } from "./auth";
import type { VehicleCard } from "./site";

/** Only buyers shop: customers, and chat visitors (who keep the same row when they register). */
export const isBuyer = (kind?: string | null) => kind === "customer" || kind === "visitor";

export interface CartData {
  items: VehicleCard[];
  totalUsd: number;
  readyCount: number;
}
export interface OrderLine {
  vehicleId: string | null;
  title: string;
  priceUsd: number;
  slug: string | null;
}
export interface WebOrder {
  id: string;
  orderNo: string;
  status: string;
  paymentMethod: string;
  paidAt: string | null;
  totalUsd: number;
  paidUsd: number | null;
  payNowUsd: number | null;
  payPercent: number | null;
  notes: string | null;
  createdAt: string;
  items: OrderLine[];
}

export const effectivePrice = (v: { priceUsd: number; discountPriceUsd: number | null }) => Number(v.discountPriceUsd ?? v.priceUsd);

/** Only follow `next` to a path on this site (never "//evil.example"). */
export function safeNext(v: string | null | undefined): string | null {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : null;
}

const GUEST_CART = "guest-cart";
const GUEST_WISH = "guest-wishlist";
const readIds = (k: string): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(k) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};
const writeIds = (k: string, ids: string[]) => {
  try {
    localStorage.setItem(k, JSON.stringify(ids));
  } catch {
    /* no storage: the visitor's cart lasts as long as the page */
  }
};
export const guestCartIds = () => readIds(GUEST_CART);

/** After signing in, what a visitor collected joins their account. */
export function useGuestMerge() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const kind = me?.kind;
  useEffect(() => {
    if (!isBuyer(kind)) return;
    const cart = readIds(GUEST_CART);
    const wishlist = readIds(GUEST_WISH);
    if (!cart.length && !wishlist.length) return;
    void api.post("/api/shop/merge", { cart, wishlist }).then(() => {
      writeIds(GUEST_CART, []);
      writeIds(GUEST_WISH, []);
      void qc.invalidateQueries({ queryKey: ["shop"] });
    });
  }, [kind, qc]);
}

export function useShopCounts() {
  const { me } = useAuth();
  return useQuery({ queryKey: ["shop", "counts", me?.id ?? "guest"], queryFn: () => (me ? api.get<{ cart: number; wishlist: number }>("/api/shop/counts") : Promise.resolve({ cart: readIds(GUEST_CART).length, wishlist: readIds(GUEST_WISH).length })), enabled: !me || isBuyer(me?.kind), staleTime: 30_000 });
}

export function useWishlist() {
  const { me } = useAuth();
  return useQuery({ queryKey: ["shop", "wishlist", me?.id ?? "guest"], queryFn: () => (me ? api.get<{ items: VehicleCard[] }>("/api/shop/wishlist") : api.get<{ items: VehicleCard[] }>(`/api/shop/guest-list?ids=${readIds(GUEST_WISH).join(",")}`)), enabled: !me || isBuyer(me?.kind) });
}

export function useCart() {
  const { me } = useAuth();
  return useQuery({ queryKey: ["shop", "cart", me?.id ?? "guest"], queryFn: () => (me ? api.get<CartData>("/api/shop/cart") : api.get<CartData>(`/api/shop/guest-list?ids=${readIds(GUEST_CART).join(",")}`)), enabled: !me || isBuyer(me?.kind) });
}

export function useShopActions() {
  const qc = useQueryClient();
  const { me } = useAuth();
  const refresh = () => qc.invalidateQueries({ queryKey: ["shop"] });
  return {
    addToCart: async (vehicleId: string) => {
      if (me) await api.post("/api/shop/cart", { vehicleId });
      else writeIds(GUEST_CART, [...new Set([...readIds(GUEST_CART), vehicleId])].slice(0, 10));
      await refresh();
    },
    removeFromCart: async (vehicleId: string) => {
      if (me) await api.del(`/api/shop/cart/${vehicleId}`);
      else writeIds(GUEST_CART, readIds(GUEST_CART).filter((x) => x !== vehicleId));
      await refresh();
    },
    toggleWishlist: async (vehicleId: string, saved: boolean) => {
      if (me) {
        if (saved) await api.del(`/api/shop/wishlist/${vehicleId}`);
        else await api.post("/api/shop/wishlist", { vehicleId });
      } else if (saved) writeIds(GUEST_WISH, readIds(GUEST_WISH).filter((x) => x !== vehicleId));
      else writeIds(GUEST_WISH, [...new Set([...readIds(GUEST_WISH), vehicleId])].slice(0, 40));
      await refresh();
    },
    refresh,
  };
}
