import { useEffect, useState } from "react";
import { FlatList, Linking, Pressable, Share, StyleSheet, useWindowDimensions, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { errText } from "../lib/api";
import { useAuth } from "../lib/auth";
import { absUrl } from "../lib/config";
import { useFetch } from "../lib/data";
import { km } from "../lib/format";
import { useShop } from "../lib/shop";
import { C, useColors, useSite } from "../lib/site";
import type { VehicleCard, VehicleDetail } from "../lib/types";
import { Badge, Button, Card, Chip, ErrorBox, Markdown, Price, Screen, SectionTitle, Skeleton, StatusBadge, T, VehicleTile } from "../ui";
import { PictureViewer } from "./ChatScreen";

export default function VehicleScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { width } = useWindowDimensions();
  const col = useColors();
  const { site } = useSite();
  const q = useFetch<{ vehicle: VehicleDetail; related: VehicleCard[] }>(`/api/public/vehicles/${encodeURIComponent(route.params?.slug ?? "")}`);
  const v = q.data?.vehicle;
  const [shot, setShot] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);

  useEffect(() => {
    if (v)
      nav.setOptions({
        title: v.stockNo,
        headerRight: () => (
          <Pressable accessibilityRole="button" accessibilityLabel="Share this car" hitSlop={10} onPress={() => void Share.share({ message: `${v.title}: ${absUrl(`/vehicles/${v.slug}`)}` })}>
            <Ionicons name="share-social-outline" size={22} color={C.muted} />
          </Pressable>
        ),
      });
  }, [v, nav]);

  const askSora = (draft: string) => nav.navigate("ChatTab", { screen: "Chat", params: { draft, t: Date.now() }, pop: true });

  if (q.loading && !v)
    return (
      <Screen padded={false}>
        <Skeleton h={(width * 10) / 16} style={{ borderRadius: 0 }} />
        <View style={{ padding: 16, gap: 10 }}>
          <Skeleton h={24} />
          <Skeleton h={18} w={160} />
          <Skeleton h={120} />
        </View>
      </Screen>
    );
  if (!v)
    return (
      <Screen>
        <ErrorBox text={q.error ?? "This car is not available"} onRetry={q.reload} />
      </Screen>
    );

  const images = v.images.length ? v.images : v.image ? [v.image] : [];
  const specs: [string, string | null][] = [
    ["Stock no.", v.stockNo],
    ["Make / model", `${v.brand} ${v.model}`],
    ["Chassis code", v.modelCode],
    ["Grade", v.grade ?? null],
    ["Year / month", `${v.year}${v.month ? ` / ${String(v.month).padStart(2, "0")}` : ""}`],
    ["Mileage", km(v.mileageKm)],
    ["Engine", v.engineCc ? `${v.engineCc.toLocaleString()} cc` : v.fuel === "Electric" ? "Electric" : null],
    ["Fuel", v.fuel],
    ["Transmission", v.transmission],
    ["Drive", v.drive],
    ["Steering", `${v.steering}-hand drive`],
    ["Body type", v.bodyType],
    ["Colour", v.color],
    ["Doors / seats", v.doors != null || v.seats != null ? `${v.doors ?? "—"} / ${v.seats ?? "—"}` : null],
    ["Dimensions", v.lengthMm && v.widthMm && v.heightMm ? `${v.lengthMm} × ${v.widthMm} × ${v.heightMm} mm` : null],
    ["Volume (freight)", v.m3 ? `${Number(v.m3).toFixed(2)} m³` : null],
    ["Location", v.location ?? null],
  ];

  return (
    <Screen padded={false} onRefresh={q.reload} refreshing={q.refreshing}>
      {viewer !== null && images.length ? <PictureViewer shots={images} at={Math.min(viewer, images.length - 1)} onClose={() => setViewer(null)} /> : null}
      <View>
        <FlatList
          horizontal
          pagingEnabled
          data={images}
          keyExtractor={(u, i) => `${i}${u}`}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setShot(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item, index }) => <Pressable accessibilityRole="imagebutton" accessibilityLabel="Open the picture" onPress={() => setViewer(index)}><Image source={{ uri: absUrl(item) }} style={{ width, aspectRatio: 16 / 10, backgroundColor: "#e2e8f0" }} contentFit="cover" transition={150} /></Pressable>}
        />
        {images.length > 1 ? (
          <View style={st.counter}>
            <T style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>
              {shot + 1} / {images.length}
            </T>
          </View>
        ) : null}
      </View>

      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <StatusBadge status={v.status} />
          <T style={{ color: C.muted, fontSize: 13 }}>{v.stockNo}</T>
        </View>
        <T style={{ marginTop: 8, fontSize: 21, fontWeight: "800", color: C.ink }}>{v.title}</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {[String(v.year), km(v.mileageKm), v.fuel, v.transmission].map((x) => (
            <Badge key={x} label={x} tone="gray" />
          ))}
        </View>

        <Card style={{ marginTop: 14 }}>
          <Price v={v} big />
          <T style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>FOB Japan{v.location ? ` · ${v.location}` : ""}</T>
          <Button title={`Ask ${site.ftEName} the price to my port`} icon="chatbubble-ellipses-outline" onPress={() => askSora(`Hi ${site.ftEName}, what is the C&F price of ${v.stockNo} (${v.title}) to my port?`)} style={{ marginTop: 14 }} />
          <ShopButtons v={v} />
          {v.videoUrl ? <Button title="Watch the video" icon="play-circle-outline" variant="secondary" onPress={() => void Linking.openURL(absUrl(v.videoUrl!))} style={{ marginTop: 10 }} /> : null}
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 18, marginTop: 12 }}>
            <Pressable onPress={() => askSora(`I'd like to reserve ${v.stockNo}.`)} hitSlop={8}>
              <T style={{ color: col.brand, fontWeight: "700", fontSize: 14 }}>Reserve with {site.ftEName}</T>
            </Pressable>
            <Pressable onPress={() => askSora(`Please tell me about the condition of ${v.stockNo}.`)} hitSlop={8}>
              <T style={{ color: col.brand, fontWeight: "700", fontSize: 14 }}>Ask about its condition</T>
            </Pressable>
          </View>
        </Card>

        <SectionTitle title="Specifications" />
        <Card style={{ padding: 0 }}>
          {specs.map(([k, val], i) => (
            <View key={k} style={[st.spec, i % 2 ? { backgroundColor: "#f8fafc" } : null]}>
              <T style={{ color: C.muted, fontSize: 13, flex: 1 }}>{k}</T>
              <T style={{ color: C.ink, fontWeight: "600", fontSize: 13, flex: 1.3, textAlign: "right" }}>{val ?? "—"}</T>
            </View>
          ))}
        </Card>

        {v.features?.length ? (
          <>
            <SectionTitle title="Features" />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {v.features.map((x) => (
                <Chip key={x} label={x} />
              ))}
            </View>
          </>
        ) : null}

        {v.description || v.shortDesc ? (
          <>
            <SectionTitle title="Description" />
            <Card>
              <Markdown text={v.description || v.shortDesc || ""} />
            </Card>
          </>
        ) : null}

        <T style={{ marginTop: 14, color: C.muted, fontSize: 12, lineHeight: 18 }}>C&F quotes include inspection (where required) and freight to your port. Import duty and port charges at destination are paid locally.</T>

        {q.data?.related.length ? (
          <>
            <SectionTitle title="Related vehicles" />
            <FlatList
              horizontal
              data={q.data.related}
              keyExtractor={(x) => x.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12 }}
              renderItem={({ item }) => <VehicleTile v={item} width={230} onPress={() => nav.push("Vehicle", { slug: item.slug })} />}
            />
          </>
        ) : null}
      </View>
    </Screen>
  );
}

/** Cart + save. Signed out → sign in, then come straight back here. Staff do not shop. */
function ShopButtons({ v }: { v: VehicleDetail }) {
  const nav = useNavigation<any>();
  const { me, isBuyer } = useAuth();
  const shop = useShop();
  const [busy, setBusy] = useState<"cart" | "save" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (me && !isBuyer) return null;
  const inCart = shop.inCart(v.id);
  const saved = shop.saved(v.id);
  const run = async (k: "cart" | "save", fn: () => Promise<void>) => {
    setBusy(k);
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
    <>
      {v.status === "available" ? (
        <Button
          title="Buy now"
          icon="flash-outline"
          loading={busy === "cart"}
          style={{ marginTop: 10 }}
          onPress={() =>
            run("cart", async () => {
              if (!inCart) await shop.addToCart(v.id);
              nav.navigate("Checkout");
            })
          }
        />
      ) : null}
      <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
        {inCart ? (
          <Button title="In cart" icon="checkmark" variant="secondary" onPress={() => nav.navigate("CartTab", { screen: "Cart", pop: true })} style={{ flex: 1 }} />
        ) : (
          <Button title={v.status === "available" ? "Add to cart" : v.status === "sold" ? "Sold" : "Reserved"} icon="cart-outline" variant="secondary" disabled={v.status !== "available"} loading={busy === "cart"} onPress={() => run("cart", () => shop.addToCart(v.id))} style={{ flex: 1 }} />
        )}
        <Button title={saved ? "Saved" : "Save"} icon={saved ? "heart" : "heart-outline"} variant="secondary" loading={busy === "save"} onPress={() => run("save", () => shop.toggleSaved(v.id))} style={{ flex: 1 }} />
      </View>
      {err ? <T style={{ color: C.red, fontWeight: "600", marginTop: 8 }}>{err}</T> : null}
    </>
  );
}

const st = StyleSheet.create({
  counter: { position: "absolute", right: 12, bottom: 12, backgroundColor: "rgba(15,23,42,0.7)", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  spec: { flexDirection: "row", gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
});
