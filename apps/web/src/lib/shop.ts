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
  totalUsd: number;
  notes: string | null;
  createdAt: string;
  items: OrderLine[];
}

export const effectivePrice = (v: { priceUsd: number; discountPriceUsd: number | null }) => Number(v.discountPriceUsd ?? v.priceUsd);

/** Only follow `next` to a path on this site (never "//evil.example"). */
export function safeNext(v: string | null | undefined): string | null {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : null;
}

export function useShopCounts() {
  const { me } = useAuth();
  return useQuery({ queryKey: ["shop", "counts"], queryFn: () => api.get<{ cart: number; wishlist: number }>("/api/shop/counts"), enabled: isBuyer(me?.kind), staleTime: 30_000 });
}

export function useWishlist() {
  const { me } = useAuth();
  return useQuery({ queryKey: ["shop", "wishlist"], queryFn: () => api.get<{ items: VehicleCard[] }>("/api/shop/wishlist"), enabled: isBuyer(me?.kind) });
}

export function useCart() {
  const { me } = useAuth();
  return useQuery({ queryKey: ["shop", "cart"], queryFn: () => api.get<CartData>("/api/shop/cart"), enabled: isBuyer(me?.kind) });
}

export function useShopActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["shop"] });
  return {
    addToCart: async (vehicleId: string) => {
      await api.post("/api/shop/cart", { vehicleId });
      await refresh();
    },
    removeFromCart: async (vehicleId: string) => {
      await api.del(`/api/shop/cart/${vehicleId}`);
      await refresh();
    },
    toggleWishlist: async (vehicleId: string, saved: boolean) => {
      if (saved) await api.del(`/api/shop/wishlist/${vehicleId}`);
      else await api.post("/api/shop/wishlist", { vehicleId });
      await refresh();
    },
    refresh,
  };
}
