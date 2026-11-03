import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import * as Speech from "expo-speech";
import { Ionicons } from "@expo/vector-icons";
import { api } from "./api";
import { C } from "./site";
import { uploadChatFile } from "./upload";
import { T } from "../ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
const LANGS: Record<string, string> = { english: "en", urdu: "ur", hindi: "hi", arabic: "ar", swahili: "sw", french: "fr", spanish: "es", portuguese: "pt", russian: "ru", japanese: "ja", chinese: "zh", bengali: "bn", turkish: "tr" };

/** Reads a reply aloud with the phone's own voice (not a model call). It always finishes, even with no voice for that language. */
function speakAloud(text: string, language = ""): Promise<void> {
  const plain = text.replace(/https?:\/\/\S+/g, "").replace(/[*_#`>~]/g, "").replace(/\p{Extended_Pictographic}/gu, "").trim();
  if (!plain) return Promise.resolve();
  const code = /[\u0600-\u06FF]/.test(plain) ? (language.toLowerCase() === "arabic" ? "ar" : "ur") : LANGS[language.toLowerCase()];
  return new Promise((res) => {
    const t = setTimeout(res, Math.max(3000, plain.length * 110));
    const done = () => {
      clearTimeout(t);
      res();
    };
    Speech.speak(plain, { ...(code ? { language: code } : {}), onDone: done, onStopped: done, onError: done });
  });
}

/**
 * A call the AI employee answers. It takes turns: the buyer speaks, the same voice-note path hears it, she answers with her usual
 * tools, and the phone reads the answer out. Every turn stays in the chat as text.
 */
export function FteCallScreen({ conversationId, name, greeting, onHangUp, onEnded }: { conversationId: string; name: string; greeting: string; onHangUp: () => void; onEnded: (note: string) => void }) {
  const insets = useSafeAreaInsets();
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const state = useAudioRecorderState(recorder, 200);
  const level = useRef<number | undefined>(undefined);
  level.current = state.metering;
  const [phase, setPhase] = useState<"starting" | "listening" | "thinking" | "speaking">("starting");
  const [lines, setLines] = useState<{ who: "you" | "fte"; text: string }[]>([]);
  const [secs, setSecs] = useState(0);
  const finishTurn = useRef<(() => void) | null>(null);
  const hangUp = useRef(onHangUp);
  const ended = useRef(onEnded);
  hangUp.current = onHangUp;
  ended.current = onEnded;
  const said = (who: "you" | "fte", text: string) => setLines((l) => [...l.slice(-5), { who, text }]);

  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;

    /** One thing said: stops by itself after a second of quiet, or when the buyer taps Done. */
    const listen = async (): Promise<string | null> => {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      const started = Date.now();
      let heard = false;
      let quiet = 0;
      await new Promise<void>((res) => {
        const tick = setInterval(() => {
          const m = level.current;
          if (typeof m === "number") {
            if (m > -38) {
              heard = true;
              quiet = 0;
            } else if (heard) quiet += 200;
          }
          if (!alive || (heard && quiet >= 1200) || Date.now() - started > (heard ? 30_000 : 90_000)) {
            clearInterval(tick);
            res();
          }
        }, 200);
        finishTurn.current = () => {
          heard = true;
          clearInterval(tick);
          res();
        };
      });
      finishTurn.current = null;
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      return heard ? recorder.uri : null;
    };

    const waitForReply = async (messageId: string) => {
      const end = Date.now() + 120_000;
      while (alive && Date.now() < end) {
        const r = await api.get<{ conversation: { holder: string }; messages: any[] }>("/api/chat/mine?channel=app").catch(() => null);
        const all = r?.messages ?? [];
        const at = all.findIndex((m) => m.id === messageId);
        const reply = at >= 0 ? all.slice(at + 1).find((m) => m.sender?.kind === "fte" && m.body?.trim()) : undefined;
        if (reply) return { text: reply.body as string, heard: (all[at]?.meta?.transcript as string) ?? "", language: (all[at]?.meta?.language as string) ?? "", person: r?.conversation.holder === "human" };
        await new Promise((res) => setTimeout(res, 1000));
      }
      return null;
    };

    void (async () => {
      const p = await requestRecordingPermissionsAsync();
      if (!p.granted) {
        ended.current("Allow the microphone to make a call.");
        return;
      }
      setPhase("speaking");
      said("fte", greeting);
      await speakAloud(greeting);
      while (alive) {
        setPhase("listening");
        let uri: string | null = null;
        try {
          uri = await listen();
        } catch {
          ended.current("The microphone could not start. Please try again.");
          return;
        }
        if (!alive) return;
        if (!uri) {
          const bye = "I will hang up now. You can call me again any time.";
          setPhase("speaking");
          said("fte", bye);
          await speakAloud(bye);
          hangUp.current();
          return;
        }
        setPhase("thinking");
        try {
          const web = Platform.OS === "web";
          const id = await uploadChatFile(uri, web ? "audio/webm" : "audio/mp4", web ? "call.webm" : "call.m4a");
          const m = await api.post<{ id: string }>(`/api/chat/conversations/${conversationId}/messages`, { kind: "voice", body: "", fileIds: [id], onCall: true });
          const reply = await waitForReply(m.id);
          if (!alive) return;
          if (!reply) {
            const sorry = "Sorry, that took too long. Could you say it again?";
            setPhase("speaking");
            said("fte", sorry);
            await speakAloud(sorry);
            continue;
          }
          if (reply.heard) said("you", reply.heard);
          said("fte", reply.text);
          setPhase("speaking");
          await speakAloud(reply.text, reply.language);
          if (reply.person) {
            hangUp.current();
            return;
          }
        } catch {
          const sorry = "Sorry, I lost you for a moment. Please say that again.";
          setPhase("speaking");
          said("fte", sorry);
          await speakAloud(sorry);
        }
      }
    })();

    return () => {
      alive = false;
      finishTurn.current?.();
      void Speech.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, greeting]);

  const status = phase === "listening" ? "Listening: speak now" : phase === "thinking" ? `${name} is thinking…` : phase === "speaking" ? `${name} is speaking…` : "Connecting…";
  return (
    <View style={st.screen} accessibilityLabel="Call">
      <View style={[st.who, { paddingTop: insets.top + 40 }]}>
        <View style={st.avatar}>
          <T style={{ color: "#fff", fontSize: 30, fontWeight: "800" }}>{name.slice(0, 1).toUpperCase()}</T>
        </View>
        <T lines={1} style={st.name}>
          {name}
        </T>
        <View accessibilityLiveRegion="polite">
          <T style={[st.status, phase === "listening" ? { color: "#6ee7b7", fontWeight: "700" } : null]}>{status}</T>
        </View>
        <T style={st.time}>
          {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
        </T>
      </View>
      <ScrollView style={{ flex: 1, marginTop: 18 }} contentContainerStyle={{ paddingHorizontal: 22, gap: 8 }}>
        {lines.map((l, i) => (
          <T key={i} style={{ color: l.who === "you" ? "rgba(255,255,255,0.7)" : "#fff", lineHeight: 21 }}>
            <T style={{ fontWeight: "700", color: l.who === "you" ? "rgba(255,255,255,0.7)" : "#fff" }}>{l.who === "you" ? "You" : name}: </T>
            {l.text.replace(/\*+/g, "")}
          </T>
        ))}
      </ScrollView>
      <View style={[st.buttons, { paddingBottom: insets.bottom + 30 }]}>
        {phase === "listening" ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Done talking" onPress={() => finishTurn.current?.()} style={[st.round, { backgroundColor: "#059669" }]}>
            <Ionicons name="checkmark" size={28} color="#fff" />
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Hang up" onPress={onHangUp} style={[st.round, { backgroundColor: C.red }]}>
          <Ionicons name="call" size={26} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} />
        </Pressable>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0f172a" },
  who: { alignItems: "center", paddingHorizontal: 24 },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: "#6d28d9", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  name: { color: "#fff", fontSize: 24, fontWeight: "800" },
  status: { color: "rgba(255,255,255,0.85)", fontSize: 15, marginTop: 6, textAlign: "center" },
  time: { color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 4 },
  buttons: { flexDirection: "row", justifyContent: "center", gap: 22, paddingTop: 16 },
  round: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
});
