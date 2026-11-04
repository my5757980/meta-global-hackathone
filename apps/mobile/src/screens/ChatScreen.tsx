import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Linking, Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { createAudioPlayer, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState, type AudioPlayer } from "expo-audio";
import { Ionicons } from "@expo/vector-icons";
import { api, errText } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useCalls } from "../lib/calls";
import { setOpenConversation } from "../lib/chime";
import { onLive } from "../lib/live";
import { absUrl, getServer, protectedSource } from "../lib/config";
import { secs, time, usd } from "../lib/format";
import { C, useColors, useSite } from "../lib/site";
import type { ChatCard, ChatMsg } from "../lib/types";
import { uploadChatFile } from "../lib/upload";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Screen, T, useKeyboardLift } from "../ui";
import { DeskHome } from "./DeskScreen";

const MAX_BATCH = 20; // pictures in one go
const MAX_VOICE_SECS = 300; // a long voice note is a phone call

/** "Today", "Yesterday", or the date: the line between one day and the next. */
function dayOf(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** The line a call leaves in the conversation, the same words the website writes. */
function callLine(m: ChatMsg, mine: boolean) {
  const meta = m.meta as { media?: string; status?: string; seconds?: number } | null;
  const what = meta?.media === "video" ? "Video call" : "Voice call";
  const small = what.toLowerCase();
  switch (meta?.status) {
    case "ended":
      return { line: `${what} · ${secs(meta.seconds ?? 0)}`, missed: false };
    case "missed":
    case "cancelled":
      return mine ? { line: `${what} — ${meta.status === "missed" ? "no answer" : "cancelled"}`, missed: false } : { line: `Missed ${small}`, missed: true };
    case "declined":
      return { line: mine ? `${what} — declined` : `${what} — you declined`, missed: false };
    case "failed":
      return { line: `${what} — could not connect`, missed: false };
    default:
      return { line: m.body || "Call", missed: false };
  }
}

/** A picture, opened: every picture in the conversation a swipe away, and "2 / 5" says how many there are. */
function PictureViewer({ shots, at, onClose }: { shots: string[]; at: number; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const [i, setI] = useState(at);
  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <FlatList
          key={`${width}x${height}`}
          data={shots}
          horizontal
          pagingEnabled
          initialScrollIndex={at}
          getItemLayout={(_, n) => ({ length: width, offset: width * n, index: n })}
          keyExtractor={(u) => u}
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={32}
          onScroll={(e) => {
            const n = Math.round(e.nativeEvent.contentOffset.x / width);
            if (n !== i && n >= 0 && n < shots.length) setI(n);
          }}
          renderItem={({ item }) => (
            <View style={{ width, height, alignItems: "center", justifyContent: "center" }}>
              <Image source={protectedSource(item)} style={{ width, height }} contentFit="contain" />
            </View>
          )}
        />
        <View pointerEvents="box-none" style={st.viewerBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close picture" onPress={onClose} style={st.viewerBtn}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
          {shots.length > 1 ? (
            <View style={st.viewerCount}>
              <T style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>{i + 1} / {shots.length}</T>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

export default function ChatScreen() {
  const route = useRoute<any>();
  const { ready, me, isBuyer } = useAuth();
  if (!ready) return <Screen><ActivityIndicator /></Screen>;
  if (!me) return <ChatGate />;
  if (!isBuyer) return <DeskHome />;
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
export function Conversation({ draft, draftKey, desk }: { draft?: string; draftKey?: number; desk?: { id: string; name: string; kind: string } }) {
  const { me } = useAuth();
  const { site } = useSite();
  const col = useColors();
  const lift = useKeyboardLift();
  const { startCall } = useCalls();
  const [conv, setConv] = useState<{ id: string; holder: string; assignedUserId?: string | null } | null>(null);
  const [batch, setBatch] = useState<{ n: number; of: number } | null>(null);
  const [agent, setAgent] = useState<{ id: string; name: string; title?: string | null; online: boolean } | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<null | "send" | "image" | "voice">(null);
  const [waitAfter, setWaitAfter] = useState<string | null>(null); // id of my last message; cleared by a reply
  const [viewer, setViewer] = useState<number | null>(null);
  const [receipts, setReceipts] = useState<{ deliveredAt: string | null; readAt: string | null } | null>(null);
  const [people, setPeople] = useState<{ id: string; name: string; title: string | null; online: boolean }[] | null>(null);
  const [asking, setAsking] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const rec = useAudioRecorderState(recorder, 250);

  useEffect(() => {
    if (draft) setText(draft);
  }, [draft, draftKey]);

  const misses = useRef(0);
  const lastSeen = useRef("");
  const poll = useCallback(async () => {
    try {
      const r = await api.get<{ conversation: { id: string; holder: string; assignedUserId?: string | null }; messages: ChatMsg[]; agent: { id: string; name: string; title?: string | null; online: boolean } | null }>(desk ? `/api/chat/conversations/${desk.id}` : "/api/chat/mine?channel=app");
      setAgent((a) => (a?.id === r.agent?.id && a?.online === r.agent?.online ? a : r.agent));
      misses.current = 0;
      setError(null);
      setConv((c) => (c && c.id === r.conversation.id && c.holder === r.conversation.holder && c.assignedUserId === r.conversation.assignedUserId ? c : r.conversation));
      const rc = await api.get<{ deliveredAt: string | null; readAt: string | null }>(`/api/chat/conversations/${r.conversation.id}/receipts`).catch(() => null);
      if (rc) setReceipts((old) => (old?.readAt === rc.readAt && old?.deliveredAt === rc.deliveredAt ? old : rc));
      // redraw only when something changed (a new message, or a transcript arriving on a voice note)
      const seen = r.messages.map((m) => `${m.id}:${m.meta?.transcript ? 1 : 0}`).join();
      if (seen !== lastSeen.current) {
        lastSeen.current = seen;
        setMessages(r.messages);
      }
    } catch (e) {
      // a phone loses a request now and then: only three in a row is worth a red bar
      misses.current += 1;
      if (misses.current >= 3) setError(errText(e));
    }
  }, [desk?.id]);

  // live while this screen is open: the same messages the website and the desk see
  useFocusEffect(
    useCallback(() => {
      void poll();
      const t = setInterval(() => void poll(), 3000);
      return () => clearInterval(t);
    }, [poll]),
  );
  // no tone for the conversation being looked at
  useFocusEffect(
    useCallback(() => {
      setOpenConversation(conv?.id ?? null);
      return () => setOpenConversation(null);
    }, [conv?.id]),
  );

  // what the live stream says arrives at once; the three-second check above is what covers a lost connection
  useEffect(() => onLive("message", () => void poll()), [poll]);
  useEffect(() => onLive("holder", () => void poll()), [poll]);
  useEffect(() => onLive("read", () => void poll()), [poll]);
  useEffect(() => onLive("delivered", () => void poll()), [poll]);

  const openPeople = async () => {
    setError(null);
    try {
      setPeople(await api.get<{ id: string; name: string; title: string | null; online: boolean }[]>("/api/chat/people"));
    } catch (e) {
      setError(errText(e));
    }
  };
  const askFor = async (userId?: string) => {
    setAsking(true);
    setError(null);
    try {
      await api.post("/api/chat/mine/person", userId ? { userId } : {});
      setPeople(null);
      await poll();
    } catch (e) {
      setError(errText(e));
    } finally {
      setAsking(false);
    }
  };
  const backToFte = async () => {
    setError(null);
    try {
      await api.post("/api/chat/mine/back-to-fte", {});
      await poll();
    } catch (e) {
      setError(errText(e));
    }
  };

  const take = async (over: boolean) => {
    if (!desk) return;
    setError(null);
    try {
      await api.post(`/api/chat/conversations/${desk.id}/${over ? "takeover" : "handback"}`, {});
      await poll();
    } catch (e) {
      setError(errText(e));
    }
  };
  const call = async (media: "audio" | "video") => {
    if (!conv) return;
    if (desk) {
      setError(null);
      try {
        await startCall(conv.id, media, desk.name);
      } catch (e) {
        setError(e instanceof Error && !(e as { status?: number }).status ? e.message : errText(e));
      }
      return;
    }
    const fte = conv.holder === "fte";
    if (!fte && !agent) return;
    setError(null);
    try {
      await startCall(conv.id, media, fte ? site.ftEName : agent!.name, { fte });
    } catch (e) {
      setError(e instanceof Error && !(e as { status?: number }).status ? e.message : errText(e));
    }
  };

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
    if (!desk) setWaitAfter(m.id);
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
  /** Several pictures, one at a time and in the order chosen: "Sending 2 of 5" says the rest are coming. If one fails the rest are held back, and the person is told. */
  const sendPicture = async () => {
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7, allowsMultipleSelection: true, selectionLimit: MAX_BATCH, orderedSelection: true });
      const list = r.canceled ? [] : (r.assets ?? []).slice(0, MAX_BATCH);
      if (!list.length) return;
      setBusy("image");
      setError(null);
      const ids: string[] = [];
      let failed: string | null = null;
      for (let k = 0; k < list.length; k++) {
        const a = list[k]!;
        if (list.length > 1) setBatch({ n: k + 1, of: list.length });
        const mime = a.mimeType && /^image\/(png|jpeg|webp)$/.test(a.mimeType) ? a.mimeType : "image/jpeg";
        try {
          ids.push(await uploadChatFile(a.uri, mime, a.fileName ?? (mime === "image/png" ? `photo-${k + 1}.png` : `photo-${k + 1}.jpg`)));
        } catch (e) {
          failed = errText(e);
          break;
        }
      }
      setBatch(null);
      if (ids.length) await post({ kind: "image", fileIds: ids, body: failed ? "" : text.trim() });
      if (failed) {
        const left = list.length - ids.length;
        setError(`${failed} ${left} picture${left === 1 ? " was" : "s were"} not sent.`);
      } else setText("");
    } catch (e) {
      setError(errText(e));
    } finally {
      setBatch(null);
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
      if (!send) return;
      if (!uri) {
        setError("The recording did not save. Please try again.");
        return;
      }
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

  // five minutes and the recording sends itself
  useEffect(() => {
    if (rec.isRecording && (rec.durationMillis ?? 0) >= MAX_VOICE_SECS * 1000) void stopVoice(true);
  }, [rec.isRecording, rec.durationMillis]); // eslint-disable-line react-hooks/exhaustive-deps

  const data = useMemo(() => [...messages].reverse(), [messages]);
  // every picture in the conversation, in order: what the full-screen view swipes through
  const shots = useMemo(() => messages.flatMap((m) => (m.kind === "image" ? m.fileIds.map((f) => `/api/chat/media/${f}?m=${m.id}`) : [])), [messages]);
  const openShot = useCallback((path: string) => setViewer(Math.max(0, shots.indexOf(path))), [shots]);
  // the phone is for the two people in the conversation: reading another agent's thread gives none
  const canRing = !desk || desk.kind !== "customer" || conv?.holder === "fte" || !conv?.assignedUserId || conv.assignedUserId === me?.id;
  const typingLabel = conv?.holder === "human" ? "Our team will reply here" : `${site.ftEName} is typing…`;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingBottom: lift }}>
      {desk && desk.kind !== "group" ? (
        <View style={{ flexDirection: "row" }}>
          {canRing ? (
            <>
              <Pressable accessibilityLabel={`Voice call ${desk.name}`} onPress={() => void call("audio")} style={[st.personBar, { flex: 1 }]}>
                <Ionicons name="call-outline" size={16} color={col.brand} />
                <T style={{ color: col.brand, fontWeight: "700", fontSize: 13 }}>Voice</T>
              </Pressable>
              <Pressable accessibilityLabel={`Video call ${desk.name}`} onPress={() => void call("video")} style={[st.personBar, { flex: 1 }]}>
                <Ionicons name="videocam-outline" size={16} color={col.brand} />
                <T style={{ color: col.brand, fontWeight: "700", fontSize: 13 }}>Video</T>
              </Pressable>
            </>
          ) : null}
          {desk.kind === "customer" ? (
            <Pressable accessibilityLabel={conv?.holder === "fte" ? `Take over from ${site.ftEName}` : `Hand back to ${site.ftEName}`} onPress={() => void take(conv?.holder === "fte")} style={[st.personBar, { flex: 1.4 }]}>
              <Ionicons name={conv?.holder === "fte" ? "hand-left-outline" : "sparkles-outline"} size={16} color={C.violet} />
              <T lines={1} style={{ color: C.violet, fontWeight: "700", fontSize: 13 }}>{conv?.holder === "fte" ? "Take over" : "Hand back"}</T>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {!desk && conv?.holder === "fte" ? (
        <View style={{ flexDirection: "row" }}>
          <Pressable accessibilityLabel={`Call ${site.ftEName}`} onPress={() => void call("audio")} style={[st.personBar, { flex: 1 }]}>
            <Ionicons name="call-outline" size={16} color={C.violet} />
            <T style={{ color: C.violet, fontWeight: "700", fontSize: 13 }}>Call {site.ftEName}</T>
          </Pressable>
          <Pressable accessibilityLabel="Talk to a person" onPress={() => void openPeople()} style={[st.personBar, { flex: 1 }]}>
            <Ionicons name="person-outline" size={16} color={col.brand} />
            <T style={{ color: col.brand, fontWeight: "700", fontSize: 13 }}>Talk to a person</T>
          </Pressable>
        </View>
      ) : null}
      {!desk && conv?.holder === "human" ? (
        <Pressable accessibilityLabel={`Back to ${site.ftEName}`} onPress={() => void backToFte()} style={st.personBar}>
          <Ionicons name="sparkles-outline" size={16} color={C.violet} />
          <T style={{ color: C.violet, fontWeight: "700", fontSize: 13 }}>Back to {site.ftEName}</T>
        </Pressable>
      ) : null}
      <Modal visible={!!people} transparent animationType="slide" onRequestClose={() => setPeople(null)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.45)" }} onPress={() => setPeople(null)} />
        <View style={st.peopleSheet}>
          <T style={{ fontSize: 18, fontWeight: "800", color: C.ink }}>Talk to a person</T>
          <T style={{ color: C.muted, marginTop: 2, marginBottom: 10 }}>{people?.some((p) => p.online) ? `${people.filter((p) => p.online).length} of the team online now` : "The team is away. They answer here when they are back."}</T>
          <Button title="Whoever is free" loading={asking} onPress={() => void askFor()} />
          {people?.map((p) => (
            <Pressable key={p.id} disabled={asking} accessibilityLabel={`Ask for ${p.name}`} onPress={() => void askFor(p.id)} style={st.personRow}>
              <View style={[st.onlineDot, { backgroundColor: p.online ? C.green : C.line }]} />
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: "700", color: C.ink }}>{p.name}</T>
                <T style={{ fontSize: 12, color: C.muted }}>
                  {p.title ?? "Sales team"} · {p.online ? "online" : "away"}
                </T>
              </View>
            </Pressable>
          ))}
        </View>
      </Modal>
      {conv?.holder === "human" && agent ? (
        <View style={st.agentBar}>
          <View style={{ flex: 1 }}>
            <T lines={1} style={{ fontWeight: "700", color: C.ink }}>
              {agent.name}
            </T>
            <T style={{ fontSize: 12, color: agent.online ? C.green : C.muted }}>{agent.online ? "Online" : "Away: a call will ring their phone"}</T>
          </View>
          <Pressable accessibilityLabel={`Voice call ${agent.name}`} onPress={() => void call("audio")} style={st.iconBtn}>
            <Ionicons name="call-outline" size={22} color={col.brand} />
          </Pressable>
          <Pressable accessibilityLabel={`Video call ${agent.name}`} onPress={() => void call("video")} style={st.iconBtn}>
            <Ionicons name="videocam-outline" size={22} color={col.brand} />
          </Pressable>
        </View>
      ) : null}
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
            <View style={{ paddingTop: 40 }}>
              <Empty icon="chatbubbles-outline" title={`Say hello to ${site.ftEName}`} text="Ask for a price to your port, a car in stock, or your invoice." />
            </View>
          }
          renderItem={({ item, index }) => {
            const day = dayOf(item.createdAt);
            const older = data[index + 1];
            return (
              <View>
                {!older || dayOf(older.createdAt) !== day ? (
                  <View style={{ alignItems: "center", marginVertical: 8 }}>
                    <View style={st.dayLine}>
                      <T style={{ fontSize: 11, fontWeight: "700", color: C.muted }}>{day}</T>
                    </View>
                  </View>
                ) : null}
                <Bubble m={item} mine={item.senderUserId === me?.id} onImage={openShot} receipts={receipts} />
              </View>
            );
          }}
        />
      )}

      {batch ? (
        <View style={st.sending} accessibilityLiveRegion="polite">
          <ActivityIndicator color={col.brand} size="small" />
          <T style={{ color: C.text, fontSize: 13 }}>Sending {batch.n} of {batch.of} photos…</T>
        </View>
      ) : null}
      <View style={st.composer}>
        {rec.isRecording ? (
          <>
            <Pressable accessibilityLabel="Discard voice note" onPress={() => void stopVoice(false)} style={st.iconBtn}>
              <Ionicons name="trash-outline" size={22} color={C.red} />
            </Pressable>
            <View style={st.recording}>
              <View style={st.dot} />
              <T style={{ color: C.ink, fontWeight: "700" }}>Recording… {secs((rec.durationMillis ?? 0) / 1000)}</T>
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
            <Input value={text} onChangeText={setText} placeholder={conv?.holder === "human" ? (agent ? `Message ${agent.name.split(" ")[0]}…` : "Message the team…") : `Message ${site.ftEName}…`} multiline style={st.input} />
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

      {viewer !== null && shots.length ? <PictureViewer shots={shots} at={Math.min(viewer, shots.length - 1)} onClose={() => setViewer(null)} /> : null}
    </View>
  );
}

/* ---------------- one message ---------------- */
/** A web address in a message opens in the browser. */
function Linked({ text, color }: { text: string; color: string }) {
  const parts = text.split(/((?:https?:\/\/|www\.)[^\s<)]+)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2 === 0) return p;
        const tail = p.match(/[.,!?:;]+$/)?.[0] ?? "";
        const bare = tail ? p.slice(0, -tail.length) : p;
        return (
          <Text key={i}>
            <Text style={{ color, textDecorationLine: "underline" }} onPress={() => void Linking.openURL(bare.startsWith("www.") ? `https://${bare}` : bare)}>
              {bare}
            </Text>
            {tail}
          </Text>
        );
      })}
    </>
  );
}

function Bubble({ m, mine, onImage, receipts }: { m: ChatMsg; mine: boolean; onImage: (path: string) => void; receipts?: { deliveredAt: string | null; readAt: string | null } | null }) {
  const col = useColors();
  const at = new Date(m.createdAt).getTime();
  const read = !!receipts?.readAt && new Date(receipts.readAt).getTime() >= at;
  const delivered = read || (!!receipts?.deliveredAt && new Date(receipts.deliveredAt).getTime() >= at);
  const { site } = useSite();
  if (m.kind === "call") {
    const c = callLine(m, mine);
    const video = (m.meta as { media?: string } | null)?.media === "video";
    return (
      <View style={{ alignItems: "center", marginVertical: 4 }}>
        <View style={[st.system, { flexDirection: "row", alignItems: "center", gap: 6 }, c.missed ? { backgroundColor: C.redBg } : null]}>
          <Ionicons name={video ? "videocam-outline" : "call-outline"} size={14} color={c.missed ? C.red : C.text} />
          <T style={{ color: c.missed ? C.red : C.text, fontSize: 12, fontWeight: c.missed ? "700" : "400" }}>{c.line}</T>
          <T style={{ color: C.muted, fontSize: 11 }}>{time(m.createdAt)}</T>
        </View>
      </View>
    );
  }
  if (m.kind === "system")
    return (
      <View style={{ alignItems: "center", marginVertical: 4 }}>
        <View style={st.system}>
          <T style={{ color: C.text, fontSize: 12, textAlign: "center" }}>{m.body}</T>
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
              <Linked text={m.body.replace(/\*\*/g, "")} color={mine ? "#fff" : col.brand} />
            </T>
          ) : null}
          {m.meta?.cards?.length ? <Cards cards={m.meta.cards} /> : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4, alignSelf: "flex-end" }}>
            <T style={{ color: mine ? "rgba(255,255,255,0.75)" : C.faint, fontSize: 10 }}>{time(m.createdAt)}</T>
            {mine ? <Ionicons accessibilityLabel={read ? "Read" : delivered ? "Delivered" : "Sent"} name={delivered ? "checkmark-done" : "checkmark"} size={13} color={read ? "#7dd3fc" : "rgba(255,255,255,0.75)"} /> : null}
          </View>
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
  personBar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, minHeight: 40, backgroundColor: "#fff", borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  peopleSheet: { backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 28, maxHeight: "80%" },
  personRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, minHeight: 48 },
  onlineDot: { width: 10, height: 10, borderRadius: 5 },
  agentBar: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: "#fff", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  row: { flexDirection: "row" },
  bubble: { borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  theirs: { backgroundColor: "#fff", borderBottomLeftRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  system: { backgroundColor: "#e2e8f0", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, maxWidth: "90%" },
  photo: { width: 220, height: 160, borderRadius: 12, backgroundColor: "#e2e8f0", marginBottom: 4 },
  dayLine: { backgroundColor: "#e2e8f0", borderRadius: 9, paddingHorizontal: 11, paddingVertical: 4 },
  sending: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 6, paddingHorizontal: 14, backgroundColor: "#eef2ff", borderTopWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  viewerBar: { position: "absolute", top: 0, left: 0, right: 0, paddingTop: 44, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  viewerBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  viewerCount: { backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 8, backgroundColor: "#fff", borderTopWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  input: { flex: 1, minHeight: 44, maxHeight: 120, paddingTop: 11 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  recording: { flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, borderRadius: 22, backgroundColor: C.redBg },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.red },
  avatar: { alignItems: "center", justifyContent: "center" },
  carCard: { width: 170, borderRadius: 12, overflow: "hidden", backgroundColor: "#fff", borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  cardBox: { backgroundColor: "#fff", borderRadius: 12, padding: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
});
