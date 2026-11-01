import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { api, errText } from "../lib/api";
import { useAuth } from "../lib/auth";
import { absUrl } from "../lib/config";
import { useFetch } from "../lib/data";
import { date, usd } from "../lib/format";
import { useShop } from "../lib/shop";
import { C, useColors, useSite } from "../lib/site";
import { effectivePrice, type WebOrder } from "../lib/types";
import { Button, Card, Empty, ErrorBox, Field, Input, Screen, Skeleton, StatusBadge, T, VehicleTile } from "../ui";

/** Signed out → sign in; staff → explain; buyer → the screen. */
function useBuyerGate(what: string) {
  const nav = useNavigation<any>();
  const { me, isBuyer } = useAuth();
  if (!me)
    return (
      <Screen>
        <Empty icon="person-circle-outline" title={`Sign in to see your ${what}`} text="Use the same account as on the website." action={<Button title="Sign in or create account" onPress={() => nav.navigate("Auth", {})} />} />
      </Screen>
    );
  if (!isBuyer)
    return (
      <Screen>
        <Empty icon="briefcase-outline" title="Staff accounts do not shop" text="Sign in with a customer account." />
      </Screen>
    );
  return null;
}

/* ================================ Cart ================================ */
export function CartScreen() {
  const nav = useNavigation<any>();
  const col = useColors();
  const { site } = useSite();
  const shop = useShop();
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { refresh } = shop;
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  const gate = useBuyerGate("cart");
  if (gate) return gate;
  const cart = shop.cart;
  const remove = async (id: string) => {
    setBusy(id);
    setErr(null);
    try {
      await shop.removeFromCart(id);
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Screen
      onRefresh={async () => {
        setRefreshing(true);
        await refresh();
        setRefreshing(false);
      }}
      refreshing={refreshing}
    >
      {err ? <ErrorBox text={err} /> : null}
      {!cart ? (
        <View style={{ gap: 12 }}>
          <Skeleton h={90} />
          <Skeleton h={90} />
        </View>
      ) : !cart.items.length ? (
        <Empty icon="cart-outline" title="Your cart is empty" text="Add cars from the shop, then send one order request for all of them." action={<Button title="Browse stock" onPress={() => nav.navigate("ShopTab", { screen: "Shop", pop: true })} />} />
      ) : (
        <>
          <View style={{ gap: 10 }}>
            {cart.items.map((v) => {
              const ok = v.status === "available";
              return (
                <Card key={v.id} style={{ flexDirection: "row", gap: 12, alignItems: "center" }} onPress={() => nav.navigate("Vehicle", { slug: v.slug })}>
                  <Image source={{ uri: absUrl(v.image ?? "") }} style={st.thumb} contentFit="cover" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T lines={2} style={{ fontWeight: "700", color: C.ink }}>
                      {v.title}
                    </T>
                    <T style={{ color: C.muted, fontSize: 12 }}>{v.stockNo}</T>
                    {!ok ? <T style={{ color: C.red, fontSize: 12, fontWeight: "700", marginTop: 2 }}>{v.status === "sold" ? "Sold" : "Reserved by another buyer"} — remove it</T> : null}
                    <T style={[{ fontWeight: "800", marginTop: 4, color: col.brand }, !ok && { color: C.faint, textDecorationLine: "line-through" }]}>{usd(effectivePrice(v))}</T>
                  </View>
                  <Pressable accessibilityLabel={`Remove ${v.title}`} disabled={busy === v.id} onPress={() => void remove(v.id)} style={st.remove} hitSlop={6}>
                    <Ionicons name="trash-outline" size={20} color={C.red} />
                  </Pressable>
                </Card>
              );
            })}
          </View>
          <Card style={{ marginTop: 16 }}>
            <T style={{ color: C.muted }}>
              {cart.readyCount} car{cart.readyCount === 1 ? "" : "s"} ready
            </T>
            <T style={{ fontSize: 28, fontWeight: "800", color: col.brand }}>{usd(cart.totalUsd)}</T>
            <T style={{ color: C.muted, fontSize: 12 }}>FOB Japan. Freight to your port is quoted on the invoice.</T>
            <Button title="Checkout" icon="arrow-forward" disabled={!cart.readyCount} onPress={() => nav.navigate("Checkout")} style={{ marginTop: 14 }} />
            <Button title={`Ask ${site.ftEName} the C&F price`} variant="ghost" icon="chatbubble-ellipses-outline" onPress={() => nav.navigate("ChatTab", { screen: "Chat", params: { draft: `Hi ${site.ftEName}, can you give me the C&F price of the cars in my cart to my port?`, t: Date.now() }, pop: true })} style={{ marginTop: 6 }} />
          </Card>
        </>
      )}
    </Screen>
  );
}

/* ============================== Checkout ============================== */
export function CheckoutScreen() {
  const nav = useNavigation<any>();
  const col = useColors();
  const { site } = useSite();
  const shop = useShop();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ orderNo: string; totalUsd: number; items: number } | null>(null);
  const gate = useBuyerGate("cart");
  if (gate) return gate;

  if (done)
    return (
      <Screen>
        <Card style={{ alignItems: "center", paddingVertical: 28 }}>
          <Ionicons name="checkmark-circle" size={56} color={C.green} />
          <T style={{ fontSize: 22, fontWeight: "800", color: C.ink, marginTop: 8 }}>Order request sent</T>
          <T style={{ textAlign: "center", marginTop: 6, color: C.text }}>
            Your order number is <T style={{ fontWeight: "800", color: C.ink }}>{done.orderNo}</T> — {done.items} car{done.items === 1 ? "" : "s"}, {usd(done.totalUsd)} FOB.
          </T>
          <T style={{ textAlign: "center", marginTop: 10, color: C.muted, fontSize: 13, lineHeight: 19 }}>Nothing to pay yet. A colleague confirms the cars are still yours and sends the invoice with our bank details. You will see every step in My orders and in the chat.</T>
          <Button title="View my orders" onPress={() => nav.replace("Orders")} style={{ marginTop: 16, alignSelf: "stretch" }} />
          <Button title={`Chat with ${site.ftEName}`} variant="secondary" icon="chatbubbles-outline" onPress={() => nav.navigate("ChatTab", { screen: "Chat", pop: true })} style={{ marginTop: 8, alignSelf: "stretch" }} />
        </Card>
      </Screen>
    );

  const ready = shop.cart?.items.filter((v) => v.status === "available") ?? [];
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.post<{ orderNo: string; totalUsd: number; items: number }>("/api/shop/checkout", { notes: notes.trim() || undefined });
      setDone(r);
      void shop.refresh();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };
  if (!ready.length) return <Screen><Empty icon="cart-outline" title="Nothing to check out" text="Your cart has no available cars." /></Screen>;
  return (
    <Screen>
      <Card>
        <T style={{ fontWeight: "700", color: C.ink, marginBottom: 6 }}>Cars in this order request</T>
        {ready.map((v) => (
          <View key={v.id} style={st.line}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T lines={1} style={{ color: C.ink, fontWeight: "600" }}>
                {v.title}
              </T>
              <T style={{ color: C.muted, fontSize: 12 }}>{v.stockNo}</T>
            </View>
            <T style={{ fontWeight: "700", color: C.ink }}>{usd(effectivePrice(v))}</T>
          </View>
        ))}
        <View style={[st.line, { borderBottomWidth: 0 }]}>
          <T style={{ fontWeight: "700", color: C.ink }}>Total (FOB Japan)</T>
          <T style={{ fontWeight: "800", fontSize: 18, color: col.brand }}>{usd(shop.cart?.totalUsd ?? 0)}</T>
        </View>
      </Card>
      <Card style={{ marginTop: 12 }}>
        <Field label="Notes for our team (optional)" hint="Destination port, RoRo or container, consignee name…">
          <Input multiline maxLength={1000} value={notes} onChangeText={setNotes} />
        </Field>
        <T style={{ color: C.muted, fontSize: 12, lineHeight: 18 }}>This sends an order request — no payment now. We confirm availability, then send the invoice with bank details for the advance.</T>
        {err ? <View style={{ marginTop: 12 }}><ErrorBox text={err} /></View> : null}
        <Button title="Send order request" icon="paper-plane-outline" loading={busy} onPress={submit} style={{ marginTop: 14 }} />
      </Card>
    </Screen>
  );
}

/* ============================== My orders ============================== */
const NEXT: Record<string, string> = {
  pending: "We are confirming the cars are still available.",
  approved: "Confirmed — the invoice with bank details is on its way.",
  confirmed: "Invoice sent — pay the advance to secure the cars.",
  paid: "Payment received — we are booking shipping.",
  shipped: "On the way to your port.",
  delivered: "Delivered. Thank you for buying with us!",
  cancelled: "This request was cancelled.",
};

export function OrdersScreen() {
  const nav = useNavigation<any>();
  const col = useColors();
  const { isBuyer } = useAuth();
  const q = useFetch<{ items: WebOrder[] }>(isBuyer ? "/api/shop/orders" : null);
  const gate = useBuyerGate("orders");
  if (gate) return gate;
  return (
    <Screen onRefresh={q.reload} refreshing={q.refreshing}>
      {q.error ? <ErrorBox text={q.error} onRetry={q.reload} /> : null}
      {q.loading ? (
        <Skeleton h={140} />
      ) : !q.data?.items.length ? (
        <Empty icon="cube-outline" title="No orders yet" text="Order requests you send from the cart appear here with their status." action={<Button title="Browse stock" onPress={() => nav.navigate("ShopTab", { screen: "Shop" })} />} />
      ) : (
        <View style={{ gap: 12 }}>
          {q.data.items.map((o) => (
            <Card key={o.id}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <View>
                  <T style={{ fontWeight: "800", color: C.ink }}>{o.orderNo}</T>
                  <T style={{ color: C.muted, fontSize: 12 }}>
                    {date(o.createdAt)} · {o.items.length} car{o.items.length === 1 ? "" : "s"}
                  </T>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <StatusBadge status={o.status} />
                  <T style={{ fontWeight: "800", color: col.brand }}>{usd(o.totalUsd)}</T>
                </View>
              </View>
              <View style={{ marginTop: 10, gap: 4 }}>
                {o.items.map((i, k) => (
                  <Pressable key={k} disabled={!i.slug} onPress={() => i.slug && nav.navigate("Vehicle", { slug: i.slug })} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <T lines={1} style={{ flex: 1, color: i.slug ? col.brand : C.text, fontSize: 13 }}>
                      {i.title}
                    </T>
                    <T style={{ color: C.text, fontSize: 13 }}>{usd(i.priceUsd)}</T>
                  </Pressable>
                ))}
              </View>
              <View style={st.next}>
                <T style={{ color: C.text, fontSize: 12 }}>{NEXT[o.status] ?? ""}</T>
              </View>
              {o.notes ? <T style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>Your note: {o.notes}</T> : null}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

/* ============================== Saved cars ============================== */
export function WishlistScreen() {
  const nav = useNavigation<any>();
  const shop = useShop();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { refresh } = shop;
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  const gate = useBuyerGate("saved cars");
  if (gate) return gate;
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Screen>
      {err ? <ErrorBox text={err} /> : null}
      {!shop.wishlist.length ? (
        <Empty icon="heart-outline" title="No saved cars yet" text="Tap Save on any car to keep it here." action={<Button title="Browse stock" onPress={() => nav.navigate("ShopTab", { screen: "Shop" })} />} />
      ) : (
        <View style={{ gap: 14 }}>
          {shop.wishlist.map((v) => (
            <View key={v.id} style={{ gap: 8 }}>
              <VehicleTile v={v} onPress={() => nav.navigate("Vehicle", { slug: v.slug })} />
              <View style={{ flexDirection: "row", gap: 10 }}>
                {v.status !== "available" ? (
                  <Button title={v.status === "sold" ? "Sold" : "Reserved"} variant="secondary" disabled style={{ flex: 1 }} />
                ) : shop.inCart(v.id) ? (
                  <Button title="In cart" icon="checkmark" variant="secondary" onPress={() => nav.navigate("CartTab", { screen: "Cart" })} style={{ flex: 1 }} />
                ) : (
                  <Button title="Add to cart" icon="cart-outline" loading={busy === `c${v.id}`} onPress={() => run(`c${v.id}`, () => shop.addToCart(v.id))} style={{ flex: 1 }} />
                )}
                <Button title="Remove" icon="trash-outline" variant="secondary" loading={busy === `w${v.id}`} onPress={() => run(`w${v.id}`, () => shop.toggleSaved(v.id))} style={{ flex: 1 }} />
              </View>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  thumb: { width: 96, height: 64, borderRadius: 10, backgroundColor: "#e2e8f0" },
  remove: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: C.redBg },
  line: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  next: { marginTop: 10, backgroundColor: "#f8fafc", borderRadius: 10, padding: 10 },
});
