import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";
import { useAuth } from "./auth";
import type { CartData, VehicleCard } from "./types";

const GUEST_CART = "guest-cart";
const GUEST_WISH = "guest-wishlist";
const readIds = async (k: string): Promise<string[]> => {
  try {
    const v = JSON.parse((await AsyncStorage.getItem(k)) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};
const writeIds = (k: string, ids: string[]) => AsyncStorage.setItem(k, JSON.stringify(ids)).catch(() => {});

/** Cart and saved cars, shared by every screen (and the Cart tab badge). Same API as the website. A guest's lists live on the phone until they have an account. */
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
    if (!me) {
      const [c, w] = await Promise.all([readIds(GUEST_CART), readIds(GUEST_WISH)]);
      const [cd, wd] = await Promise.all([api.get<CartData>(`/api/shop/guest-list?ids=${c.join(",")}`).catch(() => null), api.get<{ items: VehicleCard[] }>(`/api/shop/guest-list?ids=${w.join(",")}`).catch(() => null)]);
      setCart(cd);
      setWishlist(wd?.items ?? []);
      return;
    }
    if (!isBuyer) {
      setCart(null);
      setWishlist([]);
      return;
    }
    const [gc, gw] = await Promise.all([readIds(GUEST_CART), readIds(GUEST_WISH)]);
    if (gc.length || gw.length) {
      // signed in: what they collected as a guest joins the account
      await api.post("/api/shop/merge", { cart: gc, wishlist: gw }).catch(() => {});
      await Promise.all([writeIds(GUEST_CART, []), writeIds(GUEST_WISH, [])]);
    }
    const [c, w] = await Promise.all([api.get<CartData>("/api/shop/cart").catch(() => null), api.get<{ items: VehicleCard[] }>("/api/shop/wishlist").catch(() => null)]);
    if (c) setCart(c);
    if (w) setWishlist(w.items);
  }, [isBuyer, me]);

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
        if (me) await api.post("/api/shop/cart", { vehicleId: id });
        else await writeIds(GUEST_CART, [...new Set([...(await readIds(GUEST_CART)), id])].slice(0, 10));
        await refresh();
      },
      removeFromCart: async (id) => {
        if (me) await api.del(`/api/shop/cart/${id}`);
        else await writeIds(GUEST_CART, (await readIds(GUEST_CART)).filter((x) => x !== id));
        await refresh();
      },
      toggleSaved: async (id) => {
        if (me) {
          if (savedIds.has(id)) await api.del(`/api/shop/wishlist/${id}`);
          else await api.post("/api/shop/wishlist", { vehicleId: id });
        } else {
          const cur = await readIds(GUEST_WISH);
          await writeIds(GUEST_WISH, savedIds.has(id) ? cur.filter((x) => x !== id) : [...new Set([...cur, id])].slice(0, 40));
        }
        await refresh();
      },
      refresh,
    };
  }, [cart, wishlist, refresh, me]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShop(): ShopCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useShop outside ShopProvider");
  return c;
}
