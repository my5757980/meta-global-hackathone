import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { setStatusBarStyle } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFetch } from "../lib/data";
import { C, useColors, useSite } from "../lib/site";
import type { VehicleCard } from "../lib/types";
import { Button, Card, Chip, ErrorBox, Input, Screen, SectionTitle, Skeleton, T, VehicleTile } from "../ui";

interface HomeData {
  sections: { id: string; key: string; title: string; subtitle: string | null; data: Record<string, unknown> }[];
  lists: Record<string, VehicleCard[]>;
  testimonials: { id: string; name: string; country: string | null; text: string; rating: number }[];
  bodyTypes: { name: string; count: number }[];
}
type Slide = { title: string; subtitle: string; cta?: string };

export default function HomeScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const col = useColors();
  const { site } = useSite();
  const q = useFetch<HomeData>("/api/public/home");
  const [search, setSearch] = useState("");
  const toShop = (params: Record<string, string>) => nav.navigate("ShopTab", { screen: "Shop", params: { ...params, t: Date.now() }, pop: true });
  // the header is the brand colour: white status icons here, dark everywhere else
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle("light");
      return () => setStatusBarStyle("dark");
    }, []),
  );
  const hero = (q.data?.sections.find((s) => s.key === "hero")?.data.slides as Slide[] | undefined)?.[0];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[st.header, { paddingTop: insets.top + 10, backgroundColor: col.brand }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={st.mark}>
            <Ionicons name="car-sport" size={20} color={col.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <T lines={1} style={{ color: "#fff", fontWeight: "800", fontSize: 18 }}>
              {site.companyName}
            </T>
            <T lines={1} style={{ color: "rgba(255,255,255,0.8)", fontSize: 12 }}>
              {site.tagline}
            </T>
          </View>
          <Pressable accessibilityLabel={`Chat with ${site.ftEName}`} onPress={() => nav.navigate("ChatTab", { screen: "Chat", pop: true })} style={st.headerBtn}>
            <Ionicons name="chatbubble-ellipses" size={20} color="#fff" />
          </Pressable>
        </View>
        <View style={{ marginTop: 12, flexDirection: "row", gap: 8 }}>
          <Input
            value={search}
            onChangeText={setSearch}
            placeholder="Search model, chassis code, stock no."
            returnKeyType="search"
            onSubmitEditing={() => toShop({ q: search.trim() })}
            style={{ flex: 1, borderWidth: 0 }}
          />
          <Button title="" icon="search" variant="accent" onPress={() => toShop({ q: search.trim() })} style={{ width: 52, paddingHorizontal: 0 }} />
        </View>
      </View>

      <Screen onRefresh={q.reload} refreshing={q.refreshing}>
        {q.error ? <ErrorBox text={q.error} onRetry={q.reload} /> : null}

        <Card style={{ backgroundColor: "#fff" }}>
          <T style={{ fontSize: 20, fontWeight: "800", color: C.ink }}>{hero?.title ?? "Japanese quality, delivered to your port"}</T>
          <T style={{ marginTop: 6, color: C.muted, lineHeight: 21 }}>{hero?.subtitle ?? site.tagline}</T>
          <Button title="Browse stock" icon="car-sport-outline" onPress={() => toShop({})} style={{ marginTop: 14 }} />
        </Card>

        <Card style={{ marginTop: 12, backgroundColor: "#f5f3ff", borderColor: "#ddd6fe" }} onPress={() => nav.navigate("ChatTab", { screen: "Chat", pop: true })}>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <View style={[st.ai, { backgroundColor: C.violet }]}>
              <T style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>AI</T>
            </View>
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: "800", color: C.ink }}>Ask {site.ftEName}, our AI sales executive</T>
              <T style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>Prices to your port, any hour — in your language.</T>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.violet} />
          </View>
        </Card>

        {q.loading && !q.data ? (
          <View style={{ marginTop: 22, gap: 12 }}>
            <Skeleton h={22} w={180} />
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Skeleton h={230} w={240} />
              <Skeleton h={230} w={120} />
            </View>
          </View>
        ) : null}

        {q.data?.sections
          .filter((s) => q.data!.lists[s.key]?.length)
          .map((s) => (
            <View key={s.key}>
              <SectionTitle title={s.title} action={<Button small variant="ghost" title="See all" onPress={() => toShop({})} />} />
              {s.subtitle ? <T style={{ color: C.muted, marginTop: -6, marginBottom: 10, fontSize: 13 }}>{s.subtitle}</T> : null}
              <FlatList
                horizontal
                data={q.data!.lists[s.key]}
                keyExtractor={(v) => v.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 12, paddingRight: 4 }}
                renderItem={({ item }) => <VehicleTile v={item} width={240} onPress={() => nav.navigate("Vehicle", { slug: item.slug })} />}
              />
            </View>
          ))}

        {q.data?.bodyTypes.length ? (
          <>
            <SectionTitle title="Search by body type" />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {q.data.bodyTypes.map((b) => (
                <Chip key={b.name} label={`${b.name} · ${b.count}`} onPress={() => toShop({ body: b.name })} />
              ))}
            </View>
          </>
        ) : null}

        {q.data?.testimonials.length ? (
          <>
            <SectionTitle title="What buyers say" />
            <FlatList
              horizontal
              data={q.data.testimonials}
              keyExtractor={(t) => t.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12 }}
              renderItem={({ item }) => (
                <Card style={{ width: 260 }}>
                  <T style={{ color: col.accent, letterSpacing: 2 }}>{"★".repeat(Math.max(1, Math.min(5, item.rating)))}</T>
                  <T lines={5} style={{ marginTop: 6, color: C.text, lineHeight: 20 }}>
                    “{item.text}”
                  </T>
                  <T style={{ marginTop: 8, fontWeight: "700", color: C.ink }}>
                    {item.name}
                    {item.country ? <T style={{ fontWeight: "400", color: C.muted }}> · {item.country}</T> : null}
                  </T>
                </Card>
              )}
            />
          </>
        ) : null}

        <SectionTitle title="Buying from Japan" />
        <Card style={{ padding: 0 }}>
          {[
            { t: "How to buy", s: "Choose, pay the advance, we ship", slug: "how-to-buy", icon: "list-outline" as const },
            { t: "About us", s: site.companyName, slug: "about", icon: "business-outline" as const },
          ].map((x) => (
            <Pressable key={x.slug} onPress={() => nav.navigate("Page", { slug: x.slug })} style={st.link}>
              <Ionicons name={x.icon} size={18} color={col.brand} />
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: "600", color: C.ink }}>{x.t}</T>
                <T style={{ fontSize: 12, color: C.muted }}>{x.s}</T>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.faint} />
            </Pressable>
          ))}
        </Card>
        <T style={{ textAlign: "center", color: C.faint, fontSize: 12, marginTop: 18 }}>Built with Muse Spark Open</T>
      </Screen>
    </View>
  );
}

const st = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 14 },
  mark: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  headerBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.14)" },
  ai: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  link: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line },
});
