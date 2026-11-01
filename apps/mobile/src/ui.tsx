import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Animated, Keyboard, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, useColors } from "./lib/site";
import { absUrl } from "./lib/config";
import { km, usd } from "./lib/format";
import { effectivePrice, type VehicleCard } from "./lib/types";

export type IconName = keyof typeof Ionicons.glyphMap;

/** Big text stays readable but never breaks a layout. */
export const T = ({ style, children, lines, ...p }: { style?: StyleProp<TextStyle>; children?: ReactNode; lines?: number; selectable?: boolean }) => (
  <Text maxFontSizeMultiplier={1.4} numberOfLines={lines} style={[s.text, style]} {...p}>
    {children}
  </Text>
);

/** A scrolling page with pull-to-refresh and the bottom safe area handled. */
export function Screen({ children, onRefresh, refreshing, padded = true, style }: { children: ReactNode; onRefresh?: () => void; refreshing?: boolean; padded?: boolean; style?: StyleProp<ViewStyle> }) {
  const col = useColors();
  const lift = useKeyboardLift();
  // The padding is on a wrapper, not inside the ScrollView: Android scrolls a focused field into the
  // ScrollView's own bounds, so those bounds must really end above the keyboard.
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingBottom: lift }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[padded && { padding: 16, paddingBottom: 32 }, style]}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} colors={[col.brand]} tintColor={col.brand} /> : undefined}
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function Card({ children, style, onPress, label }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; label?: string }) {
  if (onPress)
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }, style]}>
        {children}
      </Pressable>
    );
  return <View style={[s.card, style]}>{children}</View>;
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent";
export function Button({ title, onPress, variant = "primary", icon, loading, disabled, small, style }: { title: string; onPress?: () => void; variant?: Variant; icon?: IconName; loading?: boolean; disabled?: boolean; small?: boolean; style?: StyleProp<ViewStyle> }) {
  const col = useColors();
  const bg = { primary: col.brand, secondary: "#fff", ghost: "transparent", danger: C.red, accent: col.accent }[variant];
  const fg = { primary: "#fff", secondary: C.ink, ghost: col.brand, danger: "#fff", accent: C.ink }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [s.btn, small && s.btnSmall, { backgroundColor: bg }, variant === "secondary" && s.btnOutline, pressed && !off && { opacity: 0.8 }, off && { opacity: 0.55 }, style]}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <Ionicons name={icon} size={small ? 16 : 18} color={fg} /> : null}
      <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[s.btnText, small && { fontSize: 13 }, { color: fg }]}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Input(p: TextInputProps & { invalid?: boolean }) {
  const col = useColors();
  const [focus, setFocus] = useState(false);
  return (
    <TextInput
      placeholderTextColor={C.faint}
      maxFontSizeMultiplier={1.3}
      {...p}
      onFocus={(e) => {
        setFocus(true);
        p.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocus(false);
        p.onBlur?.(e);
      }}
      style={[s.input, p.multiline && { minHeight: 90, textAlignVertical: "top", paddingTop: 10 }, focus && { borderColor: col.brand }, p.invalid && { borderColor: C.red }, p.style]}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <T style={s.label}>{label}</T>
      {children}
      {hint ? <T style={s.hint}>{hint}</T> : null}
    </View>
  );
}

const TONES: Record<string, [string, string]> = {
  green: [C.greenBg, C.green],
  amber: [C.amberBg, C.amber],
  red: [C.redBg, C.red],
  gray: ["#f1f5f9", "#475569"],
  blue: [C.blueBg, "#1d4ed8"],
  violet: [C.violetBg, C.violet],
};
export function Badge({ label, tone = "gray" }: { label: string; tone?: keyof typeof TONES }) {
  const [bg, fg] = TONES[tone]!;
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <Text maxFontSizeMultiplier={1.2} style={[s.badgeText, { color: fg }]}>
        {label}
      </Text>
    </View>
  );
}
const STATUS_TONE: Record<string, keyof typeof TONES> = { available: "green", reserved: "amber", sold: "gray", pending: "amber", approved: "green", confirmed: "blue", paid: "green", shipped: "violet", delivered: "green", cancelled: "red", sent: "blue", rejected: "red" };
export const StatusBadge = ({ status }: { status: string }) => <Badge label={status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ")} tone={STATUS_TONE[status] ?? "gray"} />;

export function Skeleton({ h = 16, w, style }: { h?: number; w?: number | `${number}%`; style?: StyleProp<ViewStyle> }) {
  const a = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.timing(a, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== "web" }), Animated.timing(a, { toValue: 0.5, duration: 700, useNativeDriver: Platform.OS !== "web" })]));
    loop.start();
    return () => loop.stop();
  }, [a]);
  return <Animated.View style={[{ height: h, width: w ?? "100%", borderRadius: 12, backgroundColor: "#e2e8f0", opacity: a }, style]} />;
}

export function Empty({ icon = "file-tray-outline", title, text, action }: { icon?: IconName; title: string; text?: string; action?: ReactNode }) {
  return (
    <View style={s.empty}>
      <Ionicons name={icon} size={36} color={C.faint} />
      <T style={s.emptyTitle}>{title}</T>
      {text ? <T style={s.emptyText}>{text}</T> : null}
      {action ? <View style={{ marginTop: 14 }}>{action}</View> : null}
    </View>
  );
}

export function ErrorBox({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <View style={s.error}>
      <Ionicons name="alert-circle-outline" size={18} color={C.red} />
      <T style={{ flex: 1, color: C.red, fontWeight: "600" }}>{text}</T>
      {onRetry ? <Button small variant="ghost" title="Retry" onPress={onRetry} /> : null}
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  const col = useColors();
  return (
    <Pressable onPress={onPress} style={[s.chip, active && { backgroundColor: col.brand, borderColor: col.brand }]}>
      <Text maxFontSizeMultiplier={1.2} style={[s.chipText, active && { color: "#fff" }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={s.sectionRow}>
      <T style={s.sectionTitle}>{title}</T>
      {action}
    </View>
  );
}

export function Price({ v, big }: { v: { priceUsd: number; discountPriceUsd: number | null }; big?: boolean }) {
  const col = useColors();
  const discounted = v.discountPriceUsd != null && Number(v.discountPriceUsd) < Number(v.priceUsd);
  return (
    <View>
      {discounted ? <T style={{ color: C.faint, textDecorationLine: "line-through", fontSize: big ? 14 : 12 }}>{usd(v.priceUsd)}</T> : null}
      <T style={{ color: col.brand, fontWeight: "800", fontSize: big ? 28 : 17 }}>{usd(effectivePrice(v))}</T>
    </View>
  );
}

/** Vehicle card: full width in lists, fixed width in horizontal rails (never flexGrow beside a width). */
export function VehicleTile({ v, onPress, width }: { v: VehicleCard; onPress: () => void; width?: number }) {
  return (
    <Card onPress={onPress} label={`${v.title}, ${v.stockNo}`} style={[{ padding: 0, overflow: "hidden" }, width ? { width } : null]}>
      <View style={{ aspectRatio: 16 / 10, backgroundColor: "#e2e8f0" }}>
        {v.image ? <Image source={{ uri: absUrl(v.image) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : null}
        <View style={s.stockTag}>
          <Text style={s.stockTagText}>{v.stockNo}</Text>
        </View>
        {v.status !== "available" ? (
          <View style={{ position: "absolute", top: 8, left: 8 }}>
            <StatusBadge status={v.status} />
          </View>
        ) : v.discountPriceUsd != null && Number(v.discountPriceUsd) < Number(v.priceUsd) ? (
          <View style={{ position: "absolute", top: 8, left: 8 }}>
            <Badge label="Price drop" tone="red" />
          </View>
        ) : null}
      </View>
      <View style={{ padding: 12 }}>
        <T lines={2} style={{ fontWeight: "700", color: C.ink, minHeight: 38 }}>
          {v.title}
        </T>
        <T lines={1} style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
          {km(v.mileageKm)} · {v.fuel} · {v.transmission}
        </T>
        <View style={{ marginTop: 8, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
          <Price v={v} />
          <T style={{ color: C.faint, fontSize: 11 }}>FOB Japan</T>
        </View>
      </View>
    </Card>
  );
}

export function ListRow({ icon, title, subtitle, onPress, right, danger }: { icon?: IconName; title: string; subtitle?: string; onPress?: () => void; right?: ReactNode; danger?: boolean }) {
  const col = useColors();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, pressed && onPress && { backgroundColor: "#f8fafc" }]}>
      {icon ? (
        <View style={[s.rowIcon, { backgroundColor: danger ? C.redBg : "#eef4fb" }]}>
          <Ionicons name={icon} size={18} color={danger ? C.red : col.brand} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T lines={1} style={{ fontWeight: "600", color: danger ? C.red : C.ink }}>
          {title}
        </T>
        {subtitle ? (
          <T lines={1} style={{ color: C.muted, fontSize: 12 }}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={C.faint} /> : null)}
    </Pressable>
  );
}

/**
 * Bottom padding that keeps content above the keyboard. Edge-to-edge Android does not resize the window,
 * and RN's keyboard height leaves out the navigation bar, so the bottom inset is added back. The tab bar
 * hides while the keyboard is up (tabBarHideOnKeyboard), so every screen reaches the bottom of the window.
 */
export function useKeyboardLift(): number {
  const insets = useSafeAreaInsets();
  const [h, setH] = useState(0);
  useEffect(() => {
    if (Platform.OS === "web") return;
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", (e) => setH(e.endCoordinates.height + (Platform.OS === "android" ? insets.bottom : 0)));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setH(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [insets.bottom]);
  return h;
}

/** Tiny markdown: headings, bullets, numbered lists, **bold**, [links](url) as text. Enough for pages and blog posts. */
export function Markdown({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <View style={{ gap: 10 }}>
      {blocks.map((b, i) => {
        const t = b.trim();
        if (!t) return null;
        const h = /^(#{1,3})\s+(.*)$/.exec(t);
        if (h) return <T key={i} style={{ fontSize: h[1]!.length === 1 ? 22 : h[1]!.length === 2 ? 18 : 16, fontWeight: "800", color: C.ink, marginTop: 6 }}>{inline(h[2]!)}</T>;
        const lines = t.split("\n");
        if (lines.every((l) => /^\s*([-*]|\d+\.)\s+/.test(l)))
          return (
            <View key={i} style={{ gap: 6 }}>
              {lines.map((l, j) => {
                const num = /^\s*(\d+)\./.exec(l)?.[1];
                return (
                  <View key={j} style={{ flexDirection: "row", gap: 8 }}>
                    <T style={{ color: C.muted, width: 18 }}>{num ? `${num}.` : "•"}</T>
                    <T style={{ flex: 1, color: C.text, lineHeight: 21 }}>{inline(l.replace(/^\s*([-*]|\d+\.)\s+/, ""))}</T>
                  </View>
                );
              })}
            </View>
          );
        return (
          <T key={i} style={{ color: C.text, lineHeight: 22 }}>
            {inline(t.replace(/\n/g, " "))}
          </T>
        );
      })}
    </View>
  );
}
function inline(t: string): ReactNode[] {
  const parts = t.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <Text key={i} style={{ fontWeight: "700", color: C.ink }}>
        {p.slice(2, -2)}
      </Text>
    ) : (
      p
    ),
  );
}

export const s = StyleSheet.create({
  text: { color: C.text, fontSize: 15 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line, shadowColor: "#0f172a", shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  btn: { minHeight: 48, borderRadius: 14, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  btnSmall: { minHeight: 44, paddingHorizontal: 12, borderRadius: 12 },
  btnOutline: { borderWidth: 1, borderColor: C.line },
  btnText: { fontWeight: "700", fontSize: 15 },
  input: { minHeight: 48, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, backgroundColor: "#fff", color: C.ink, fontSize: 15 },
  label: { fontWeight: "600", color: C.text, marginBottom: 6, fontSize: 14 },
  hint: { color: C.muted, fontSize: 12, marginTop: 4 },
  badge: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  empty: { alignItems: "center", paddingVertical: 40, paddingHorizontal: 20, borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: "#cbd5e1", backgroundColor: "#fff" },
  emptyTitle: { marginTop: 10, fontWeight: "700", color: C.ink, fontSize: 16, textAlign: "center" },
  emptyText: { marginTop: 4, color: C.muted, textAlign: "center", fontSize: 14 },
  error: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.redBg, borderRadius: 12, padding: 12, marginBottom: 12 },
  chip: { borderWidth: 1, borderColor: C.line, backgroundColor: "#fff", borderRadius: 999, paddingHorizontal: 14, minHeight: 36, justifyContent: "center" },
  chipText: { color: C.text, fontWeight: "600", fontSize: 13 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 22, marginBottom: 10 },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: C.ink },
  stockTag: { position: "absolute", right: 8, bottom: 8, backgroundColor: "rgba(15,23,42,0.72)", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  stockTagText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, minHeight: 56 },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
