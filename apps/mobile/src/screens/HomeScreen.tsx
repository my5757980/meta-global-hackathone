import { useCallback, useState } from "react";
import { FlatList, Linking, Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { setStatusBarStyle } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { api, errText } from "../lib/api";
import { useAuth } from "../lib/auth";
import { absUrl } from "../lib/config";
import { useFetch } from "../lib/data";
import { date } from "../lib/format";
import { C, useColors, useSite } from "../lib/site";
import type { VehicleCard } from "../lib/types";
import { Button, Card, Chip, ErrorBox, Input, Screen, SectionTitle, Skeleton, T, VehicleTile } from "../ui";

interface HomeData {
  sections: { id: string; key: string; title: string; subtitle: string | null; data: Record<string, unknown> }[];
  lists: Record<string, VehicleCard[]>;
  testimonials: { id: string; name: string; country: string | null; text: string; rating: number }[];
  bodyTypes: { name: string; count: number }[];
  steering: { name: string; count: number }[];
  brands: { name: string; slug: string }[];
  blog: { slug: string; title: string; excerpt: string | null; coverUrl: string | null; publishedAt: string | null }[];
  faqs: { id?: string; question: string; answer: string }[];
}
type Slide = { title: string; subtitle: string; cta?: string };

export default function HomeScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const col = useColors();
  const { site } = useSite();
  const q = useFetch<HomeData>("/api/public/home");
  const rate = useFetch<{ usdJpy: number }>("/api/public/rate");
  const sec = (k: string) => q.data?.sections.find((s) => s.key === k);
  const items = <X,>(k: string) => (sec(k)?.data.items as X[] | undefined) ?? [];
  // neither city changes its clocks in the year, so this needs no time-zone library
  const clock = (offsetHours: number) => new Date(Date.now() + offsetHours * 3600_000).toISOString().slice(11, 16);
  const [search, setSearch] = useState("");
  const { me } = useAuth();
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [news, setNews] = useState<{ ok: boolean; text: string } | null>(null);
  const [joining, setJoining] = useState(false);
  const join = async () => {
    setJoining(true);
    setNews(null);
    try {
      const r = await api.post<{ message: string }>("/api/public/newsletter", { email: email.trim() });
      setNews({ ok: true, text: r.message });
      setEmail("");
    } catch (e) {
      setNews({ ok: false, text: errText(e) });
    } finally {
      setJoining(false);
    }
  };
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
            {site.logoUrl ? <Image source={{ uri: absUrl(site.logoUrl) }} style={{ width: 30, height: 30 }} contentFit="contain" accessibilityLabel={site.companyName} /> : <Ionicons name="car-sport" size={20} color={col.brand} />}
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
        <T lines={1} style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 8 }}>
          Tokyo {clock(9)} · Nairobi {clock(3)}
          {rate.data ? ` · USD/JPY ${rate.data.usdJpy.toFixed(2)}` : ""}
        </T>
        <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
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

        {items<{ label: string; value: string }>("stats").length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {items<{ label: string; value: string }>("stats").map((x) => (
              <Card key={x.label} style={{ flexBasis: "48%", flexGrow: 1 }}>
                <T style={{ fontSize: 20, fontWeight: "800", color: col.brand }}>{x.value}</T>
                <T style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{x.label}</T>
              </Card>
            ))}
          </View>
        ) : null}

        {q.data?.brands?.length ? (
          <>
            <SectionTitle title="Shop by brand" />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {q.data.brands.map((b) => (
                <Chip key={b.slug} label={b.name} onPress={() => toShop({ brand: b.slug })} />
              ))}
            </View>
          </>
        ) : null}

        {q.data?.steering?.length ? (
          <>
            <SectionTitle title={sec("steering")?.title ?? "Shop by steering"} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {q.data.steering.map((x) => (
                <Chip key={x.name} label={`${x.name}-hand · ${x.count}`} onPress={() => toShop({ steering: x.name })} />
              ))}
            </View>
          </>
        ) : null}

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

        {items<{ title: string; text: string }>("why").length ? (
          <>
            <SectionTitle title={sec("why")?.title ?? "Why choose us"} />
            <View style={{ gap: 8 }}>
              {items<{ title: string; text: string }>("why").map((x) => (
                <Card key={x.title}>
                  <T style={{ fontWeight: "800", color: C.ink }}>{x.title}</T>
                  <T style={{ color: C.muted, marginTop: 3, fontSize: 13, lineHeight: 19 }}>{x.text}</T>
                </Card>
              ))}
            </View>
          </>
        ) : null}

        {items<{ title: string; text: string; link?: string }>("payment").length ? (
          <>
            <SectionTitle title={sec("payment")?.title ?? "Pick your payment method"} />
            <View style={{ gap: 8 }}>
              {items<{ title: string; text: string; link?: string }>("payment").map((x) => (
                <Card key={x.title} onPress={x.link === "/bank-details" ? () => nav.navigate("Bank") : x.link === "/how-to-buy" ? () => nav.navigate("Page", { slug: "how-to-buy" }) : x.link === "/contact" ? () => nav.navigate("Contact") : undefined}>
                  <T style={{ fontWeight: "800", color: C.ink }}>{x.title}</T>
                  <T style={{ color: C.muted, marginTop: 3, fontSize: 13, lineHeight: 19 }}>{x.text}</T>
                </Card>
              ))}
            </View>
          </>
        ) : null}

        {items<{ title: string; text: string }>("we_bid").length ? (
          <>
            <SectionTitle title={sec("we_bid")?.title ?? "We bid for you"} />
            {sec("we_bid")?.subtitle ? <T style={{ color: C.muted, marginTop: -6, marginBottom: 10, fontSize: 13 }}>{sec("we_bid")!.subtitle}</T> : null}
            <Card>
              {items<{ title: string; text: string }>("we_bid").map((x, i) => (
                <View key={x.title} style={{ flexDirection: "row", gap: 10, marginTop: i ? 10 : 0 }}>
                  <T style={{ fontWeight: "800", color: col.brand, width: 18 }}>{i + 1}</T>
                  <View style={{ flex: 1 }}>
                    <T style={{ fontWeight: "700", color: C.ink }}>{x.title}</T>
                    <T style={{ color: C.muted, fontSize: 13, lineHeight: 19 }}>{x.text}</T>
                  </View>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {items<{ title: string; text: string }>("steps").length ? (
          <>
            <SectionTitle title={sec("steps")?.title ?? "How it works"} />
            <Card>
              {items<{ title: string; text: string }>("steps").map((x, i) => (
                <View key={x.title} style={{ flexDirection: "row", gap: 10, marginTop: i ? 10 : 0 }}>
                  <T style={{ fontWeight: "800", color: col.brand, width: 18 }}>{i + 1}</T>
                  <View style={{ flex: 1 }}>
                    <T style={{ fontWeight: "700", color: C.ink }}>{x.title}</T>
                    <T style={{ color: C.muted, fontSize: 13, lineHeight: 19 }}>{x.text}</T>
                  </View>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {items<{ title: string; country: string; image?: string; videoUrl?: string }>("videos").length ? (
          <>
            <SectionTitle title={sec("videos")?.title ?? "From our clients"} />
            <FlatList
              horizontal
              data={items<{ title: string; country: string; image?: string; videoUrl?: string }>("videos")}
              keyExtractor={(v) => v.title}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12 }}
              renderItem={({ item }) => (
                <Card style={{ width: 240, padding: 0, overflow: "hidden" }} onPress={item.videoUrl ? () => void Linking.openURL(item.videoUrl!) : undefined}>
                  {item.image ? <Image source={{ uri: absUrl(item.image) }} style={{ width: 240, height: 135 }} contentFit="cover" accessibilityLabel={item.title} /> : null}
                  <View style={{ padding: 12 }}>
                    <T style={{ fontWeight: "700", color: C.ink }}>{item.title}</T>
                    <T style={{ color: C.muted, fontSize: 12 }}>{item.country}</T>
                  </View>
                </Card>
              )}
            />
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

        {items<{ name: string; short: string }>("member_of").length ? (
          <>
            <SectionTitle title={sec("member_of")?.title ?? "Member of"} />
            <View style={{ gap: 8 }}>
              {items<{ name: string; short: string }>("member_of").map((m) => (
                <Card key={m.name}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={st.short}>
                      <T style={{ fontWeight: "800", fontSize: 12, color: C.text }}>{m.short}</T>
                    </View>
                    <T style={{ flex: 1, color: C.text, fontSize: 13 }}>{m.name}</T>
                  </View>
                </Card>
              ))}
            </View>
          </>
        ) : null}

        {sec("register") && !me ? (
          <Card style={{ marginTop: 22, backgroundColor: col.brand, borderColor: col.brand }}>
            <T style={{ color: "#fff", fontWeight: "800", fontSize: 18 }}>{sec("register")!.title}</T>
            {sec("register")!.subtitle ? <T style={{ color: "rgba(255,255,255,0.85)", marginTop: 4, lineHeight: 20 }}>{sec("register")!.subtitle}</T> : null}
            <Button title="Register now" variant="accent" onPress={() => nav.navigate("Auth", { mode: "register" })} style={{ marginTop: 12 }} />
          </Card>
        ) : null}

        {q.data?.blog?.length ? (
          <>
            <SectionTitle title={sec("guides")?.title ?? "Latest guides"} action={<Button small variant="ghost" title="All guides" onPress={() => nav.navigate("Blog")} />} />
            <View style={{ gap: 8 }}>
              {q.data.blog.map((b) => (
                <Card key={b.slug} onPress={() => nav.navigate("BlogPost", { slug: b.slug })}>
                  {b.publishedAt ? <T style={{ color: C.muted, fontSize: 12 }}>{date(b.publishedAt)}</T> : null}
                  <T style={{ fontWeight: "700", color: C.ink, marginTop: 2 }}>{b.title}</T>
                  {b.excerpt ? <T lines={2} style={{ color: C.muted, fontSize: 13, lineHeight: 19, marginTop: 2 }}>{b.excerpt}</T> : null}
                </Card>
              ))}
            </View>
          </>
        ) : null}

        {q.data?.faqs?.length ? (
          <>
            <SectionTitle title={sec("faq")?.title ?? "FAQ"} action={<Button small variant="ghost" title="All" onPress={() => nav.navigate("Faq")} />} />
            <Card style={{ padding: 0 }}>
              {q.data.faqs.map((f) => (
                <Pressable key={f.question} accessibilityRole="button" onPress={() => setOpenFaq(openFaq === f.question ? null : f.question)} style={st.link}>
                  <View style={{ flex: 1 }}>
                    <T style={{ fontWeight: "600", color: C.ink }}>{f.question}</T>
                    {openFaq === f.question ? <T style={{ color: C.muted, fontSize: 13, lineHeight: 19, marginTop: 4 }}>{f.answer}</T> : null}
                  </View>
                  <Ionicons name={openFaq === f.question ? "chevron-up" : "chevron-down"} size={18} color={C.faint} />
                </Pressable>
              ))}
            </Card>
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
        <SectionTitle title="Ask our team" />
        <Card>
          <T style={{ color: C.muted, fontSize: 13, marginBottom: 10 }}>A question about a car, a port or a payment? We are one tap away.</T>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {site.whatsapp ? <Button small title="WhatsApp" icon="logo-whatsapp" variant="secondary" style={{ flex: 1 }} onPress={() => void Linking.openURL(`https://wa.me/${site.whatsapp.replace(/\D/g, "")}`)} /> : null}
            {site.phone ? <Button small title="Call" icon="call-outline" variant="secondary" style={{ flex: 1 }} onPress={() => void Linking.openURL(`tel:${site.phone.replace(/\s/g, "")}`)} /> : null}
            {site.email ? <Button small title="E-mail" icon="mail-outline" variant="secondary" style={{ flex: 1 }} onPress={() => void Linking.openURL(`mailto:${site.email}`)} /> : null}
          </View>
        </Card>
        <SectionTitle title="Our newsletter" />
        <Card>
          <T style={{ color: C.muted, fontSize: 13 }}>New stock and shipping news, now and then.</T>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            <Input value={email} onChangeText={setEmail} placeholder="Your e-mail" keyboardType="email-address" autoCapitalize="none" style={{ flex: 1 }} />
            <Button title="Sign up" loading={joining} onPress={() => void join()} />
          </View>
          {news ? <T style={{ color: news.ok ? C.green : "#be123c", fontSize: 13, marginTop: 8 }}>{news.text}</T> : null}
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
  short: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center" },
  link: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line },
});
