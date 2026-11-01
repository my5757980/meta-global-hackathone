import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";
import { useAuth } from "./auth";
import type { CartData, VehicleCard } from "./types";

/** Cart and saved cars, shared by every screen (and the Cart tab badge). Same API as the website. */
interface ShopCtx {
  cart: CartData | null;
  wishlist: VehicleCard[];
  inCart: (id: string) => boolean;
  saved: (id: string) => boolean;
  addToCart: (id: string) => Promise<void>;
  removeFromCart: (id: string) => Promise<void>;
  toggleSaved: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}
const Ctx = createContext<ShopCtx | null>(null);

export function ShopProvider({ children }: { children: ReactNode }) {
  const { me, isBuyer } = useAuth();
  const [cart, setCart] = useState<CartData | null>(null);
  const [wishlist, setWishlist] = useState<VehicleCard[]>([]);

  const refresh = useCallback(async () => {
    if (!isBuyer) {
      setCart(null);
      setWishlist([]);
      return;
    }
    const [c, w] = await Promise.all([api.get<CartData>("/api/shop/cart").catch(() => null), api.get<{ items: VehicleCard[] }>("/api/shop/wishlist").catch(() => null)]);
    if (c) setCart(c);
    if (w) setWishlist(w.items);
  }, [isBuyer]);

  useEffect(() => {
    void refresh();
  }, [refresh, me?.id]);

  const value = useMemo<ShopCtx>(() => {
    const cartIds = new Set(cart?.items.map((i) => i.id) ?? []);
    const savedIds = new Set(wishlist.map((i) => i.id));
    return {
      cart,
      wishlist,
      inCart: (id) => cartIds.has(id),
      saved: (id) => savedIds.has(id),
      addToCart: async (id) => {
        await api.post("/api/shop/cart", { vehicleId: id });
        await refresh();
      },
      removeFromCart: async (id) => {
        await api.del(`/api/shop/cart/${id}`);
        await refresh();
      },
      toggleSaved: async (id) => {
        if (savedIds.has(id)) await api.del(`/api/shop/wishlist/${id}`);
        else await api.post("/api/shop/wishlist", { vehicleId: id });
        await refresh();
      },
      refresh,
    };
  }, [cart, wishlist, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShop(): ShopCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useShop outside ShopProvider");
  return c;
}
