import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, errText, qs } from "../lib/api";
import { useFetch } from "../lib/data";
import { C, useColors } from "../lib/site";
import type { VehicleCard } from "../lib/types";
import { Button, Chip, Empty, ErrorBox, Input, Skeleton, T, VehicleTile } from "../ui";

interface Filters {
  brand?: string;
  model?: string;
  grade?: string;
  body?: string;
  fuel?: string;
  transmission?: string;
  steering?: string;
  color?: string;
  yearMin?: string;
  mileageMax?: string;
  priceMin?: string;
  priceMax?: string;
  sort?: string;
}
interface Facets {
  brands: { id: string; name: string; slug: string; models: { name: string; slug: string; grades: string[] }[] }[];
  bodyTypes: { name: string; count: number }[];
}
const SORTS = [
  { v: "newest", l: "Newest" },
  { v: "featured", l: "Featured" },
  { v: "price_asc", l: "Price: low to high" },
  { v: "price_desc", l: "Price: high to low" },
  { v: "year_desc", l: "Newest year" },
  { v: "mileage_asc", l: "Lowest mileage" },
];
const FUELS = ["Petrol", "Diesel", "Hybrid", "Electric"];
const GEARS = ["Automatic", "Manual", "CVT"];
const COLOURS = ["White", "Black", "Silver", "Gray", "Blue", "Red", "Green", "Brown", "Beige"];
const YEARS = ["2023", "2022", "2021", "2020", "2019", "2018", "2017", "2016", "2015"];
const MILES = ["30000", "50000", "80000", "100000", "150000"];
const PAGE = 20;

export default function ShopScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const col = useColors();
  const { width } = useWindowDimensions();
  const cols = width >= 640 ? 2 : 1;
  const [q, setQ] = useState<string>(route.params?.q ?? "");
  const [f, setF] = useState<Filters>({ body: route.params?.body, brand: route.params?.brand, steering: route.params?.steering });
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<VehicleCard[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<"loading" | "ready" | "more" | "refresh">("loading");
  const [error, setError] = useState<string | null>(null);
  const facets = useFetch<Facets>("/api/public/vehicles/facets");
  const seq = useRef(0);

  // a search or body type tapped on Home arrives as params
  useEffect(() => {
    if (route.params?.q !== undefined) setQ(route.params.q);
    if (route.params?.body !== undefined) setF((x) => ({ ...x, body: route.params.body || undefined }));
    if (route.params?.brand !== undefined) setF((x) => ({ ...x, brand: route.params.brand || undefined, model: undefined, grade: undefined }));
    if (route.params?.steering !== undefined) setF((x) => ({ ...x, steering: route.params.steering || undefined }));
  }, [route.params?.q, route.params?.body, route.params?.brand, route.params?.steering, route.params?.t]);

  const load = useCallback(
    async (p: number, mode: "loading" | "more" | "refresh") => {
      const my = ++seq.current;
      setState(mode);
      try {
        const r = await api.get<{ items: VehicleCard[]; total: number }>("/api/public/vehicles" + qs({ q: q.trim(), ...f, page: p, pageSize: PAGE }));
        if (my !== seq.current) return;
        setItems((prev) => (p === 1 ? r.items : [...prev, ...r.items.filter((x) => !prev.some((y) => y.id === x.id))]));
        setTotal(r.total);
        setPage(p);
        setError(null);
      } catch (e) {
        if (my === seq.current) setError(errText(e));
      } finally {
        if (my === seq.current) setState("ready");
      }
    },
    [q, f],
  );

  // new search/filters → first page (debounced while typing)
  useEffect(() => {
    const t = setTimeout(() => void load(1, "loading"), 300);
    return () => clearTimeout(t);
  }, [load]);

  const active = Object.entries(f).filter(([k, v]) => v && k !== "sort").length;
  const more = items.length < total;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={st.bar}>
        <View style={{ flex: 1 }}>
          <Input value={q} onChangeText={setQ} placeholder="Search model, chassis, stock no." returnKeyType="search" clearButtonMode="while-editing" />
        </View>
        <Pressable accessibilityLabel="Filters" onPress={() => setOpen(true)} style={[st.filterBtn, active ? { backgroundColor: col.brand, borderColor: col.brand } : null]}>
          <Ionicons name="options-outline" size={20} color={active ? "#fff" : C.ink} />
          {active ? <T style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{active}</T> : null}
        </Pressable>
      </View>
      <View style={st.summary}>
        <T style={{ color: C.muted, fontSize: 13 }}>{state === "loading" ? "Searching…" : `${total} car${total === 1 ? "" : "s"}`}</T>
        <T style={{ color: C.muted, fontSize: 13 }}>{SORTS.find((s) => s.v === (f.sort ?? "newest"))?.l}</T>
      </View>
      {error ? (
        <View style={{ paddingHorizontal: 16 }}>
          <ErrorBox text={error} onRetry={() => void load(1, "loading")} />
        </View>
      ) : null}
      {state === "loading" && !items.length ? (
        <View style={{ padding: 16, gap: 12 }}>
          <Skeleton h={260} />
          <Skeleton h={260} />
        </View>
      ) : (
        <FlatList
          key={`cols${cols}`}
          data={items}
          numColumns={cols}
          keyExtractor={(v) => v.id}
          contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 12 }}
          columnWrapperStyle={cols > 1 ? { gap: 12 } : undefined}
          renderItem={({ item }) => (
            <View style={cols > 1 ? { flex: 1 / cols } : undefined}>
              <VehicleTile v={item} onPress={() => nav.navigate("Vehicle", { slug: item.slug })} />
            </View>
          )}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (more && state === "ready") void load(page + 1, "more");
          }}
          refreshControl={<RefreshControl refreshing={state === "refresh"} onRefresh={() => void load(1, "refresh")} colors={[col.brand]} tintColor={col.brand} />}
          ListEmptyComponent={<Empty icon="car-outline" title="No cars match" text="Try another search or clear the filters." action={active || q ? <Button title="Clear all" variant="secondary" onPress={() => { setQ(""); setF({}); }} /> : undefined} />}
          ListFooterComponent={state === "more" ? <ActivityIndicator style={{ marginVertical: 16 }} color={col.brand} /> : null}
        />
      )}
      <FilterSheet open={open} onClose={() => setOpen(false)} value={f} facets={facets.data} onApply={(v) => { setF(v); setOpen(false); }} />
    </View>
  );
}

function FilterSheet({ open, onClose, value, facets, onApply }: { open: boolean; onClose: () => void; value: Filters; facets: Facets | null; onApply: (f: Filters) => void }) {
  const insets = useSafeAreaInsets();
  const [d, setD] = useState<Filters>(value);
  useEffect(() => {
    if (open) setD(value);
  }, [open, value]);
  const toggle = (k: keyof Filters, v: string) => setD((x) => ({ ...x, [k]: x[k] === v ? undefined : v, ...(k === "brand" ? { model: undefined, grade: undefined } : k === "model" ? { grade: undefined } : {}) }));
  const models = facets?.brands.find((b) => b.slug === d.brand)?.models ?? [];
  const grades = models.find((m) => m.slug === d.model)?.grades ?? [];
  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} />
      <View style={[st.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={st.sheetHead}>
          <T style={{ fontSize: 18, fontWeight: "800", color: C.ink }}>Filters</T>
          <Pressable accessibilityLabel="Close" onPress={onClose} style={{ padding: 8 }}>
            <Ionicons name="close" size={22} color={C.ink} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
          <View>
            <T style={st.groupTitle}>Min price (USD, FOB)</T>
            <Input keyboardType="number-pad" value={d.priceMin ?? ""} onChangeText={(t) => setD((x) => ({ ...x, priceMin: t.replace(/\D/g, "") || undefined }))} placeholder="Any" />
          </View>
          <View>
            <T style={st.groupTitle}>Max price (USD, FOB)</T>
            <Input keyboardType="number-pad" value={d.priceMax ?? ""} onChangeText={(t) => setD((x) => ({ ...x, priceMax: t.replace(/\D/g, "") || undefined }))} placeholder="e.g. 15000" />
          </View>
          <Group title="Sort by">
            {SORTS.map((s) => (
              <Chip key={s.v} label={s.l} active={(d.sort ?? "newest") === s.v} onPress={() => setD((x) => ({ ...x, sort: s.v }))} />
            ))}
          </Group>
          {facets?.brands.length ? (
            <Group title="Make">
              {facets.brands.map((b) => (
                <Chip key={b.slug} label={b.name} active={d.brand === b.slug} onPress={() => toggle("brand", b.slug)} />
              ))}
            </Group>
          ) : null}
          {models.length ? (
            <Group title="Model">
              {models.map((m) => (
                <Chip key={m.slug} label={m.name} active={d.model === m.slug} onPress={() => toggle("model", m.slug)} />
              ))}
            </Group>
          ) : null}
          {grades.length ? (
            <Group title="Grade">
              {grades.map((g) => (
                <Chip key={g} label={g} active={d.grade === g} onPress={() => toggle("grade", g)} />
              ))}
            </Group>
          ) : null}
          {facets?.bodyTypes.length ? (
            <Group title="Body type">
              {facets.bodyTypes.map((b) => (
                <Chip key={b.name} label={b.name} active={d.body === b.name} onPress={() => toggle("body", b.name)} />
              ))}
            </Group>
          ) : null}
          <Group title="Fuel">
            {FUELS.map((x) => (
              <Chip key={x} label={x} active={d.fuel === x} onPress={() => toggle("fuel", x)} />
            ))}
          </Group>
          <Group title="Gearbox">
            {GEARS.map((x) => (
              <Chip key={x} label={x} active={d.transmission === x} onPress={() => toggle("transmission", x)} />
            ))}
          </Group>
          <Group title="Steering">
            {["Right", "Left"].map((x) => (
              <Chip key={x} label={`${x}-hand`} active={d.steering === x} onPress={() => toggle("steering", x)} />
            ))}
          </Group>
          <Group title="Colour">
            {COLOURS.map((x) => (
              <Chip key={x} label={x} active={d.color === x} onPress={() => toggle("color", x)} />
            ))}
          </Group>
          <Group title="Year from">
            {YEARS.map((x) => (
              <Chip key={x} label={x} active={d.yearMin === x} onPress={() => toggle("yearMin", x)} />
            ))}
          </Group>
          <Group title="Max mileage">
            {MILES.map((x) => (
              <Chip key={x} label={`${Number(x).toLocaleString("en-US")} km`} active={d.mileageMax === x} onPress={() => toggle("mileageMax", x)} />
            ))}
          </Group>
        </ScrollView>
        <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 8 }}>
          <Button title="Reset" variant="secondary" onPress={() => setD({})} style={{ flex: 1 }} />
          <Button title="Show cars" onPress={() => onApply(d)} style={{ flex: 2 }} />
        </View>
      </View>
    </Modal>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <T style={st.groupTitle}>{title}</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{children}</View>
    </View>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 12, backgroundColor: C.bg },
  filterBtn: { minWidth: 52, height: 48, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: "#fff", flexDirection: "row", gap: 4, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  summary: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 8 },
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: "85%" },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line, paddingBottom: 6 },
  groupTitle: { fontWeight: "700", color: C.ink, marginBottom: 8 },
});
