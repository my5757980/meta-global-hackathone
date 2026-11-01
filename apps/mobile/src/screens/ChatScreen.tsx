import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Linking, Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { createAudioPlayer, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState, type AudioPlayer } from "expo-audio";
import { Ionicons } from "@expo/vector-icons";
import { api, errText } from "../lib/api";
import { useAuth } from "../lib/auth";
import { absUrl, getServer, protectedSource } from "../lib/config";
import { secs, time, usd } from "../lib/format";
import { C, useColors, useSite } from "../lib/site";
import type { ChatCard, ChatMsg } from "../lib/types";
import { uploadChatFile } from "../lib/upload";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Screen, T, useKeyboardLift } from "../ui";

export default function ChatScreen() {
  const route = useRoute<any>();
  const { ready, me, isBuyer } = useAuth();
  if (!ready) return <Screen><ActivityIndicator /></Screen>;
  if (!me) return <ChatGate />;
  if (!isBuyer) return <Screen><Empty icon="briefcase-outline" title="Staff answer buyers on the desk" text="Open the Chat desk on the website to reply." /></Screen>;
  return <Conversation draft={route.params?.draft} draftKey={route.params?.t} />;
}

/* ---------------- the door for someone who has not signed in ---------------- */
function ChatGate() {
  const nav = useNavigation<any>();
  const { demoMode, demo, visitor } = useAuth();
  const { site } = useSite();
  const [f, setF] = useState({ name: "", email: "", phone: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async (k: string, fn: () => Promise<void>) => {
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
    <Screen>
      <Card style={{ alignItems: "center", paddingVertical: 22 }}>
        <View style={[st.avatar, { width: 56, height: 56, borderRadius: 28, backgroundColor: C.violet }]}>
          <T style={{ color: "#fff", fontWeight: "800" }}>AI</T>
        </View>
        <T style={{ fontSize: 20, fontWeight: "800", color: C.ink, marginTop: 10 }}>Chat with {site.ftEName}</T>
        <T style={{ textAlign: "center", color: C.muted, marginTop: 4 }}>Our AI sales executive answers 24/7 — prices to your port, auction cars, your invoices. A person joins whenever you ask.</T>
        <Button title="Sign in" icon="log-in-outline" onPress={() => nav.navigate("Auth", {})} style={{ marginTop: 16, alignSelf: "stretch" }} />
        {demoMode ? <Button title="Try the demo customer" variant="secondary" icon="sparkles-outline" loading={busy === "demo"} onPress={() => run("demo", demo)} style={{ marginTop: 8, alignSelf: "stretch" }} /> : null}
      </Card>
      <Card style={{ marginTop: 12 }}>
        <T style={{ fontWeight: "800", color: C.ink, marginBottom: 10 }}>Or chat as a guest</T>
        {err ? <ErrorBox text={err} /> : null}
        <Field label="Your name">
          <Input value={f.name} onChangeText={(name) => setF({ ...f, name })} autoComplete="name" />
        </Field>
        <Field label="E-mail" hint="The same e-mail continues the same conversation later.">
          <Input value={f.email} onChangeText={(email) => setF({ ...f, email })} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
        </Field>
        <Field label="Phone / WhatsApp">
          <Input value={f.phone} onChangeText={(phone) => setF({ ...f, phone })} keyboardType="phone-pad" autoComplete="tel" />
        </Field>
        <Button title="Start chatting" icon="chatbubbles-outline" loading={busy === "guest"} disabled={f.name.trim().length < 2 || !f.email.includes("@") || f.phone.trim().length < 6} onPress={() => run("guest", () => visitor({ name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim() }))} />
      </Card>
    </Screen>
  );
}

/* ---------------- the conversation: the same thread as the website ---------------- */
function Conversation({ draft, draftKey }: { draft?: string; draftKey?: number }) {
  const { me } = useAuth();
  const { site } = useSite();
  const col = useColors();
  const lift = useKeyboardLift();
  const tabH = useBottomTabBarHeight();
  const [conv, setConv] = useState<{ id: string; holder: string } | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<null | "send" | "image" | "voice">(null);
  const [waitAfter, setWaitAfter] = useState<string | null>(null); // id of my last message; cleared by a reply
  const [viewer, setViewer] = useState<string | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const rec = useAudioRecorderState(recorder, 250);

  useEffect(() => {
    if (draft) setText(draft);
  }, [draft, draftKey]);

  const poll = useCallback(async () => {
    try {
      const r = await api.get<{ conversation: { id: string; holder: string }; messages: ChatMsg[] }>("/api/chat/mine?channel=app");
      setConv(r.conversation);
      setMessages(r.messages);
      setError(null);
    } catch (e) {
      setError(errText(e));
    }
  }, []);

  // live while this screen is open: the same messages the website and the desk see
  useFocusEffect(
    useCallback(() => {
      void poll();
      const t = setInterval(() => void poll(), 3000);
      return () => clearInterval(t);
    }, [poll]),
  );

  // "typing…" until someone answers after my message (by position, not clocks: phone and server clocks differ)
  useEffect(() => {
    if (!waitAfter) return;
    const i = messages.findIndex((m) => m.id === waitAfter);
    if (i >= 0 && messages.slice(i + 1).some((m) => m.senderUserId !== me?.id)) setWaitAfter(null);
  }, [messages, waitAfter, me?.id]);
  useEffect(() => {
    if (!waitAfter) return;
    const t = setTimeout(() => setWaitAfter(null), 120_000);
    return () => clearTimeout(t);
  }, [waitAfter]);

  const post = async (body: { body?: string; kind?: "text" | "image" | "voice"; fileIds?: string[] }) => {
    if (!conv) return;
    const m = await api.post<ChatMsg>(`/api/chat/conversations/${conv.id}/messages`, { body: "", kind: "text", fileIds: [], ...body });
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    setWaitAfter(m.id);
  };
  const sendText = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy("send");
    setError(null);
    try {
      await post({ body: t });
      setText("");
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  };
  const sendPicture = async () => {
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
      const a = r.canceled ? null : r.assets?.[0];
      if (!a) return;
      setBusy("image");
      setError(null);
      const mime = a.mimeType && /^image\/(png|jpeg|webp)$/.test(a.mimeType) ? a.mimeType : "image/jpeg";
      const id = await uploadChatFile(a.uri, mime, a.fileName ?? (mime === "image/png" ? "photo.png" : "photo.jpg"));
      await post({ kind: "image", fileIds: [id], body: text.trim() });
      setText("");
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  };
  const startVoice = async () => {
    try {
      const p = await requestRecordingPermissionsAsync();
      if (!p.granted) {
        setError("Allow the microphone to send voice notes.");
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (e) {
      setError(errText(e));
    }
  };
  const stopVoice = async (send: boolean) => {
    const length = Math.round((rec.durationMillis ?? 0) / 1000);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const uri = recorder.uri;
      if (!send || !uri) return;
      if (length < 1) {
        setError("That voice note was too short.");
        return;
      }
      setBusy("voice");
      setError(null);
      const web = Platform.OS === "web";
      const id = await uploadChatFile(uri, web ? "audio/webm" : "audio/mp4", web ? "voice.webm" : "voice.m4a");
      await post({ kind: "voice", fileIds: [id] });
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  };

  const data = useMemo(() => [...messages].reverse(), [messages]);
  const typingLabel = conv?.holder === "human" ? "Our team will reply here" : `${site.ftEName} is typing…`;
  const bottomPad = Platform.OS === "ios" ? Math.max(0, lift - tabH) : lift;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingBottom: bottomPad }}>
      {error ? (
        <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
          <ErrorBox text={error} onRetry={() => void poll()} />
        </View>
      ) : null}
      {!conv && !error ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={col.brand} />
        </View>
      ) : (
        <FlatList
          inverted
          data={data}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12, gap: 8 }}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            waitAfter ? (
              <View style={[st.row, { justifyContent: "flex-start" }]}>
                <View style={[st.bubble, st.theirs]}>
                  <T style={{ color: C.muted, fontStyle: "italic", fontSize: 13 }}>{typingLabel}</T>
                </View>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={{ transform: [{ scaleY: -1 }], paddingTop: 40 }}>
              <Empty icon="chatbubbles-outline" title={`Say hello to ${site.ftEName}`} text="Ask for a price to your port, a car in stock, or your invoice." />
            </View>
          }
          renderItem={({ item }) => <Bubble m={item} mine={item.senderUserId === me?.id} onImage={setViewer} />}
        />
      )}

      <View style={st.composer}>
        {rec.isRecording ? (
          <>
            <Pressable accessibilityLabel="Discard voice note" onPress={() => void stopVoice(false)} style={st.iconBtn}>
              <Ionicons name="trash-outline" size={22} color={C.red} />
            </Pressable>
            <View style={st.recording}>
              <View style={st.dot} />
              <T style={{ color: C.ink, fontWeight: "700" }}>Recording {secs((rec.durationMillis ?? 0) / 1000)}</T>
            </View>
            <Pressable accessibilityLabel="Send voice note" onPress={() => void stopVoice(true)} style={[st.sendBtn, { backgroundColor: col.brand }]}>
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          </>
        ) : (
          <>
            <Pressable accessibilityLabel="Send a picture" disabled={!!busy} onPress={() => void sendPicture()} style={st.iconBtn}>
              {busy === "image" ? <ActivityIndicator color={col.brand} /> : <Ionicons name="image-outline" size={22} color={col.brand} />}
            </Pressable>
            <Input value={text} onChangeText={setText} placeholder={`Message ${site.ftEName}…`} multiline style={st.input} />
            {text.trim() ? (
              <Pressable accessibilityLabel="Send" disabled={!!busy} onPress={() => void sendText()} style={[st.sendBtn, { backgroundColor: col.brand }]}>
                {busy === "send" ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
              </Pressable>
            ) : (
              <Pressable accessibilityLabel="Record a voice note" disabled={!!busy} onPress={() => void startVoice()} style={[st.sendBtn, { backgroundColor: col.brand }]}>
                {busy === "voice" ? <ActivityIndicator color="#fff" /> : <Ionicons name="mic" size={20} color="#fff" />}
              </Pressable>
            )}
          </>
        )}
      </View>

      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={st.viewer} onPress={() => setViewer(null)}>
          {viewer ? <Image source={protectedSource(viewer)} style={{ width: "100%", height: "80%" }} contentFit="contain" /> : null}
          <T style={{ color: "#fff", marginTop: 12 }}>Tap to close</T>
        </Pressable>
      </Modal>
    </View>
  );
}

/* ---------------- one message ---------------- */
function Bubble({ m, mine, onImage }: { m: ChatMsg; mine: boolean; onImage: (path: string) => void }) {
  const col = useColors();
  const { site } = useSite();
  if (m.kind === "system" || m.kind === "call")
    return (
      <View style={{ alignItems: "center", marginVertical: 4 }}>
        <View style={st.system}>
          <T style={{ color: C.text, fontSize: 12, textAlign: "center" }}>{m.kind === "call" ? `📞 ${m.body || "Call"}` : m.body}</T>
        </View>
      </View>
    );
  const who = mine ? null : m.sender?.kind === "fte" ? `${site.ftEName} · AI sales executive` : m.sender ? `${m.sender.name}${m.sender.title ? ` · ${m.sender.title}` : ""}` : null;
  return (
    <View style={[st.row, { justifyContent: mine ? "flex-end" : "flex-start" }]}>
      <View style={{ maxWidth: "86%" }}>
        {who ? <T style={{ color: m.sender?.kind === "fte" ? C.violet : C.muted, fontSize: 11, fontWeight: "700", marginBottom: 3, marginLeft: 4 }}>{who}</T> : null}
        <View style={[st.bubble, mine ? { backgroundColor: col.brand, borderBottomRightRadius: 4 } : st.theirs]}>
          {m.kind === "image"
            ? m.fileIds.map((f) => (
                <Pressable key={f} onPress={() => onImage(`/api/chat/media/${f}?m=${m.id}`)}>
                  <Image source={protectedSource(`/api/chat/media/${f}?m=${m.id}`)} style={st.photo} contentFit="cover" transition={150} />
                </Pressable>
              ))
            : null}
          {m.kind === "voice" && m.fileIds[0] ? <VoiceNote m={m} mine={mine} /> : null}
          {m.body ? (
            <T selectable style={{ color: mine ? "#fff" : C.ink, lineHeight: 21, marginTop: m.kind === "image" ? 6 : 0 }}>
              {m.body.replace(/\*\*/g, "")}
            </T>
          ) : null}
          {m.meta?.cards?.length ? <Cards cards={m.meta.cards} /> : null}
          <T style={{ color: mine ? "rgba(255,255,255,0.75)" : C.faint, fontSize: 10, marginTop: 4, alignSelf: "flex-end" }}>{time(m.createdAt)}</T>
        </View>
      </View>
    </View>
  );
}

/** One voice note. Players are made on first tap (a long thread must not open one per bubble) and only one plays. */
let playingNow: AudioPlayer | null = null;
function VoiceNote({ m, mine }: { m: ChatMsg; mine: boolean }) {
  const player = useRef<AudioPlayer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  useEffect(
    () => () => {
      if (playingNow === player.current) playingNow = null;
      player.current?.remove();
    },
    [],
  );
  const toggle = () => {
    let p = player.current;
    if (!p) {
      p = createAudioPlayer(protectedSource(`/api/chat/media/${m.fileIds[0]}?m=${m.id}`), { updateInterval: 250 });
      p.addListener("playbackStatusUpdate", (s) => {
        setPlaying(s.playing);
        setPos(s.currentTime);
        if (s.duration) setDur(s.duration);
        if (s.didJustFinish) {
          void p!.seekTo(0);
          setPlaying(false);
        }
      });
      player.current = p;
    }
    if (p.playing) p.pause();
    else {
      if (playingNow && playingNow !== p) playingNow.pause();
      playingNow = p;
      p.play();
    }
  };
  const fg = mine ? "#fff" : C.ink;
  return (
    <View>
      <Pressable onPress={toggle} style={{ flexDirection: "row", alignItems: "center", gap: 10, minWidth: 180, minHeight: 44 }}>
        <Ionicons name={playing ? "pause-circle" : "play-circle"} size={36} color={fg} />
        <View style={{ flex: 1 }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: mine ? "rgba(255,255,255,0.35)" : "#e2e8f0" }}>
            <View style={{ height: 4, borderRadius: 2, width: `${dur ? Math.min(100, (pos / dur) * 100) : 0}%`, backgroundColor: fg }} />
          </View>
          <T style={{ color: mine ? "rgba(255,255,255,0.8)" : C.muted, fontSize: 11, marginTop: 4 }}>{dur ? `${secs(pos)} / ${secs(dur)}` : "Voice note"}</T>
        </View>
      </Pressable>
      {m.meta?.transcript ? (
        <T style={{ color: mine ? "rgba(255,255,255,0.85)" : C.muted, fontSize: 12, fontStyle: "italic", marginTop: 4 }}>
          “{m.meta.transcript}”{m.meta.language ? ` · ${m.meta.language}` : ""}
        </T>
      ) : null}
    </View>
  );
}

/** What Sora attaches: cars, a C&F quote, an invoice, an auction-sheet verdict. */
function Cards({ cards }: { cards: ChatCard[] }) {
  const nav = useNavigation<any>();
  const col = useColors();
  return (
    <View style={{ gap: 8, marginTop: 8 }}>
      {cards.map((c, i) => {
        if (c.type === "vehicles")
          return (
            <FlatList
              key={i}
              horizontal
              data={c.items}
              keyExtractor={(x) => x.kind + x.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    const slug = item.link.startsWith("/vehicles/") ? item.link.slice("/vehicles/".length) : null;
                    if (slug) nav.navigate("Vehicle", { slug });
                    else void Linking.openURL(absUrl(item.link) || getServer());
                  }}
                  style={st.carCard}
                >
                  <Image source={{ uri: absUrl(item.image) }} style={{ width: "100%", aspectRatio: 16 / 10, backgroundColor: "#e2e8f0" }} contentFit="cover" />
                  <View style={{ padding: 8 }}>
                    <T lines={2} style={{ fontSize: 12, fontWeight: "700", color: C.ink }}>
                      {item.title}
                    </T>
                    <T style={{ fontSize: 13, fontWeight: "800", color: col.brand, marginTop: 2 }}>{item.priceLabel}</T>
                    <T lines={1} style={{ fontSize: 11, color: C.muted }}>
                      {item.facts.slice(0, 3).join(" · ")}
                    </T>
                  </View>
                </Pressable>
              )}
            />
          );
        if (c.type === "quote")
          return (
            <View key={i} style={st.cardBox}>
              <T style={{ fontWeight: "800", color: C.ink }}>{c.title}</T>
              <T style={{ color: C.muted, fontSize: 12 }}>C&F to {c.port}</T>
              {c.lines.map((l) => (
                <View key={l.label} style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                  <T style={{ color: C.text, fontSize: 13 }}>{l.label}</T>
                  <T style={{ color: C.text, fontSize: 13 }}>{usd(l.usd)}</T>
                </View>
              ))}
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderColor: C.line, paddingTop: 6 }}>
                <T style={{ fontWeight: "800", color: C.ink }}>Total</T>
                <T style={{ fontWeight: "800", color: col.brand }}>{usd(c.totalUsd)}</T>
              </View>
            </View>
          );
        if (c.type === "invoice")
          return (
            <Pressable key={i} onPress={() => nav.navigate("Invoices")} style={st.cardBox}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <T style={{ fontWeight: "800", color: C.ink }}>Invoice {c.number}</T>
                <Badge label={c.status} tone={c.status === "approved" || c.status === "sent" ? "green" : "amber"} />
              </View>
              <T style={{ color: C.text, fontSize: 13, marginTop: 4 }}>
                Total {usd(c.totalUsd)} · advance {usd(c.advanceUsd)}
              </T>
              <T style={{ color: col.brand, fontWeight: "700", fontSize: 13, marginTop: 4 }}>Open my invoices ›</T>
            </Pressable>
          );
        return (
          <View key={i} style={st.cardBox}>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Badge label={c.verdict.toUpperCase()} tone={c.verdict === "good" ? "green" : c.verdict === "caution" ? "amber" : "red"} />
              <T style={{ fontWeight: "700", color: C.ink }}>Auction sheet · grade {c.grade}</T>
            </View>
            <T style={{ color: C.text, fontSize: 13, marginTop: 4 }}>{c.summary}</T>
          </View>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: "row" },
  bubble: { borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  theirs: { backgroundColor: "#fff", borderBottomLeftRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  system: { backgroundColor: "#e2e8f0", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, maxWidth: "90%" },
  photo: { width: 220, height: 160, borderRadius: 12, backgroundColor: "#e2e8f0" },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 8, backgroundColor: "#fff", borderTopWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  input: { flex: 1, minHeight: 44, maxHeight: 120, paddingTop: 11 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  recording: { flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, borderRadius: 22, backgroundColor: C.redBg },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.red },
  viewer: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center", padding: 12 },
  avatar: { alignItems: "center", justifyContent: "center" },
  carCard: { width: 170, borderRadius: 12, overflow: "hidden", backgroundColor: "#fff", borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  cardBox: { backgroundColor: "#fff", borderRadius: 12, padding: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
});
