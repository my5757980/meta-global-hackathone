import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "./api";
import { useAuth } from "./auth";
import { holdLive, onLive, startLive } from "./live";
import { FteCallScreen } from "./fteCall";
import { C } from "./site";
import { askCallPermissions, callSound, mediaDevices, RTCPeerConnection, RTCView, streamProp } from "./webrtc";
import { T } from "../ui";

/**
 * Voice and video calls with a colleague, the same calls the website makes. The server rings and passes messages along;
 * the sound and picture go phone to person directly. Who places the call sends the offer once the other side has answered.
 */
type Media = "audio" | "video";
type Phase = "ringing" | "incoming" | "connecting" | "active" | "ended";
interface Call {
  id: string;
  conversationId?: string;
  media: Media;
  peerName: string;
  role: "caller" | "callee";
  phase: Phase;
  note?: string;
  startedAt?: number;
  fte?: { conversationId: string; greeting: string }; // the AI employee answered: no peer connection, she takes turns
}
interface Ring {
  callId: string;
  conversationId?: string;
  media: Media;
  from?: { id: string; name: string };
}
type Signal = Ring & { type: string; data?: unknown; status?: string };
/* eslint-disable @typescript-eslint/no-explicit-any */

const Ctx = createContext<{ startCall: (conversationId: string, media: Media, peerName: string, opts?: { fte?: boolean }) => Promise<void> }>({ startCall: async () => {} });
/** What the screen says when a call is over. */
const endNote = (status: string | undefined, role: "caller" | "callee") =>
  ({ ended: "Call ended", declined: role === "caller" ? "They are busy right now" : "Call declined", cancelled: role === "callee" ? "Missed call" : "Call cancelled", missed: role === "callee" ? "Missed call" : "No answer", failed: "The call could not connect." })[status ?? "ended"] ?? "Call ended";

let answeredListener: ((conversationId: string) => void) | null = null;
export const onCallAnswered = (fn: (conversationId: string) => void) => {
  answeredListener = fn;
  return () => {
    if (answeredListener === fn) answeredListener = null;
  };
};

export const useCalls = () => useContext(Ctx);

export function CallProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const [call, setCall] = useState<Call | null>(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [front, setFront] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [remote, setRemote] = useState<any>(null);
  const [mine, setMine] = useState<any>(null);
  const current = useRef<Call | null>(null);
  current.current = call;
  const pc = useRef<any>(null);
  const local = useRef<any>(null);
  const pendingIce = useRef<unknown[]>([]);
  const ice = useRef<unknown[]>([{ urls: "stun:stun.l.google.com:19302" }]);

  const signal = (id: string, type: string, data?: unknown) => api.post(`/api/chat/calls/${id}/signal`, { type, data }).catch(() => {});

  const cleanup = useCallback(() => {
    callSound.stop();
    pc.current?.close();
    pc.current = null;
    local.current?.getTracks().forEach((t: any) => t.stop());
    local.current = null;
    pendingIce.current = [];
    setRemote(null);
    setMine(null);
    setMuted(false);
    setCamOff(false);
    setSpeaker(false);
    setFront(true);
    holdLive(false);
  }, []);

  const endShown = useCallback(
    (note: string) => {
      cleanup();
      setCall((c) => (c ? { ...c, phase: "ended", note } : c));
      setTimeout(() => setCall((c) => (c?.phase === "ended" ? null : c)), 2500);
    },
    [cleanup],
  );

  const getMedia = async (media: Media) => {
    if (!(await askCallPermissions(media))) throw new Error(media === "video" ? "Allow the camera and microphone to make a video call." : "Allow the microphone to make a call.");
    const stream = await mediaDevices.getUserMedia({ audio: true, video: media === "video" ? { facingMode: "user", width: 640, height: 480 } : false });
    local.current = stream;
    setMine(stream);
  };

  const makePc = (id: string, media: Media) => {
    const p = new RTCPeerConnection({ iceServers: ice.current });
    p.addEventListener("icecandidate", (e: any) => {
      if (e.candidate) void signal(id, "ice", e.candidate.toJSON?.() ?? e.candidate);
    });
    p.addEventListener("track", (e: any) => {
      const stream = e.streams?.[0];
      if (!stream) return;
      setRemote(stream);
      callSound.remote(stream);
    });
    p.addEventListener("connectionstatechange", () => {
      if (p.connectionState === "connected") {
        callSound.connected(media);
        setSpeaker(media === "video");
        setCall((c) => (c ? { ...c, phase: "active", startedAt: c.startedAt ?? Date.now() } : c));
      }
      if (p.connectionState === "failed") {
        void signal(id, "end", { failed: true });
        endShown("The call could not connect. Their network may block calls — try a message.");
      }
    });
    local.current?.getTracks().forEach((t: any) => p.addTrack(t, local.current));
    pc.current = p;
    return p;
  };

  const flushIce = async () => {
    const p = pc.current;
    if (!p?.remoteDescription) return;
    for (const c of pendingIce.current.splice(0)) await p.addIceCandidate(c).catch(() => {});
  };

  const showRing = useCallback((r: Ring) => {
    if (current.current) return; // already in a call: the caller hears no answer
    setCall({ id: r.callId, conversationId: r.conversationId, media: r.media ?? "audio", peerName: r.from?.name || "Caller", role: "callee", phase: "incoming" });
    holdLive(true);
    callSound.ringing();
  }, []);

  const onCall = useCallback(
    async (e: Signal) => {
      if (e.type === "ring") return showRing(e);
      const c = current.current;
      if (!c || c.id !== e.callId) return;
      if (e.type === "taken") {
        if (c.phase === "incoming") {
          cleanup();
          setCall(null); // answered on another device
        }
        return;
      }
      if (e.type === "ended") {
        endShown(endNote(e.status, c.role));
        return;
      }
      try {
        if (e.type === "accept" && c.role === "caller") {
          setCall({ ...c, phase: "connecting" });
          const p = makePc(c.id, c.media);
          const offer = await p.createOffer({});
          await p.setLocalDescription(offer);
          void signal(c.id, "offer", p.localDescription?.toJSON?.() ?? offer);
        } else if (e.type === "offer" && c.role === "callee") {
          const p = pc.current ?? makePc(c.id, c.media);
          await p.setRemoteDescription(e.data);
          await flushIce();
          const answer = await p.createAnswer();
          await p.setLocalDescription(answer);
          void signal(c.id, "answer", p.localDescription?.toJSON?.() ?? answer);
        } else if (e.type === "answer" && c.role === "caller") {
          await pc.current?.setRemoteDescription(e.data);
          await flushIce();
        } else if (e.type === "ice") {
          pendingIce.current.push(e.data);
          await flushIce();
        }
      } catch {
        void signal(c.id, "end", { failed: true });
        endShown("The call could not connect.");
      }
    },
    [cleanup, endShown, showRing],
  );

  // connected while signed in; a push may have opened the app for a call that is already ringing
  useEffect(() => {
    if (!me) return;
    const stopStream = startLive();
    const offCall = onLive<Signal>("call", (e) => void onCall(e));
    const offHello = onLive("hello", () => {
      void api.get<{ iceServers: unknown[] }>("/api/chat/ice").then((r) => (ice.current = r.iceServers)).catch(() => {});
      void api.get<{ call: Ring | null }>("/api/chat/calls/pending").then((r) => r.call && showRing(r.call)).catch(() => {});
    });
    return () => {
      offCall();
      offHello();
      stopStream();
    };
  }, [me?.id, onCall, showRing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (call?.phase !== "active") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [call?.phase]);

  const startCall = useCallback(
    async (conversationId: string, media: Media, peerName: string, opts?: { fte?: boolean }) => {
      if (current.current) throw new Error("You are already in a call.");
      if (!opts?.fte) await getMedia(media); // she listens through the recorder, with no peer connection
      try {
        const r = await api.post<{ callId: string; peer: { name: string }; fte?: boolean; greeting?: string }>(`/api/chat/conversations/${conversationId}/calls`, { media });
        holdLive(true);
        if (r.fte) {
          setCall({ id: r.callId, media: "audio", peerName: r.peer.name || peerName, role: "caller", phase: "active", startedAt: Date.now(), fte: { conversationId, greeting: r.greeting ?? "" } });
          return;
        }
        setCall({ id: r.callId, media, peerName: r.peer.name || peerName, role: "caller", phase: "ringing" });
        callSound.calling(media);
      } catch (e) {
        cleanup();
        throw e;
      }
    },
    [cleanup],
  );
  const value = useMemo(() => ({ startCall }), [startCall]);

  const accept = async () => {
    if (!call) return;
    callSound.stopRinging();
    try {
      await getMedia(call.media);
    } catch (e) {
      void signal(call.id, "decline");
      endShown((e as Error).message || "Microphone not available.");
      return;
    }
    setCall({ ...call, phase: "connecting" });
    makePc(call.id, call.media);
    void signal(call.id, "accept");
    if (call.conversationId) answeredListener?.(call.conversationId);
  };
  const decline = () => {
    if (!call) return;
    void signal(call.id, "decline");
    cleanup();
    setCall(null);
  };
  const hangUp = () => {
    if (!call) return;
    void signal(call.id, "end");
    endShown(call.phase === "active" ? "Call ended" : "Call cancelled");
  };
  const toggleMute = () => {
    local.current?.getAudioTracks().forEach((t: any) => (t.enabled = muted));
    setMuted(!muted);
  };
  const toggleCam = () => {
    local.current?.getVideoTracks().forEach((t: any) => (t.enabled = camOff));
    setCamOff(!camOff);
  };
  const toggleSpeaker = () => {
    callSound.speaker(!speaker);
    setSpeaker(!speaker);
  };
  const flipCamera = () => {
    const track: any = local.current?.getVideoTracks()[0];
    if (!track) return;
    // a phone with one camera refuses: the picture simply stays as it is
    Promise.resolve(track.applyConstraints({ facingMode: front ? "environment" : "user" }))
      .then(() => setFront(!front))
      .catch(() => undefined);
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {call?.fte && call.phase === "active" ? (
        <Modal visible animationType="fade" statusBarTranslucent onRequestClose={hangUp}>
          <FteCallScreen conversationId={call.fte.conversationId} name={call.peerName} greeting={call.fte.greeting} onHangUp={hangUp} onEnded={(note) => { void signal(call.id, "end"); endShown(note); }} />
        </Modal>
      ) : call ? (
        <CallScreen call={call} now={now} remote={remote} mine={mine} muted={muted} camOff={camOff} speaker={speaker} front={front} onFlip={flipCamera} onAccept={() => void accept()} onDecline={decline} onHangUp={hangUp} onMute={toggleMute} onCam={toggleCam} onSpeaker={toggleSpeaker} />
      ) : null}
    </Ctx.Provider>
  );
}

function CallScreen(p: { call: Call; now: number; remote: any; mine: any; muted: boolean; camOff: boolean; speaker: boolean; front: boolean; onFlip: () => void; onAccept: () => void; onDecline: () => void; onHangUp: () => void; onMute: () => void; onCam: () => void; onSpeaker: () => void }) {
  const { call } = p;
  const insets = useSafeAreaInsets();
  const secs = call.startedAt ? Math.max(0, Math.round((p.now - call.startedAt) / 1000)) : 0;
  const what = call.media === "video" ? "video" : "voice";
  const status = call.phase === "incoming" ? `Incoming ${what} call` : call.phase === "ringing" ? "Ringing…" : call.phase === "connecting" ? "Connecting…" : call.phase === "active" ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` : (call.note ?? "Call ended");
  const showVideo = call.media === "video" && (call.phase === "active" || call.phase === "connecting");
  const five = call.media === "video" && call.phase !== "incoming"; // five round buttons on one line, down to a 320 wide phone
  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => (call.phase === "incoming" ? p.onDecline() : undefined)}>
      <View style={st.screen} accessibilityLabel="Call">
        {showVideo && p.remote ? <RTCView {...(streamProp(p.remote) as object)} style={StyleSheet.absoluteFill} objectFit="cover" /> : null}
        {showVideo && p.mine ? <RTCView {...(streamProp(p.mine) as object)} style={[st.pip, { top: insets.top + 16 }]} objectFit="cover" mirror={p.front} zOrder={1} /> : null}
        <View style={showVideo ? [st.who, st.whoOverVideo, { bottom: insets.bottom + 120 }] : [st.who, { paddingTop: insets.top + 96 }]}>
          {!showVideo ? (
            <View style={st.avatar}>
              <T style={{ color: "#fff", fontSize: 34, fontWeight: "800" }}>{call.peerName.slice(0, 1).toUpperCase()}</T>
            </View>
          ) : null}
          <T lines={1} style={st.name}>
            {call.peerName}
          </T>
          <View accessibilityLiveRegion="polite">
            <T style={st.status}>{status}</T>
          </View>
        </View>
        {call.phase !== "ended" ? (
          <View style={[st.buttons, { paddingBottom: insets.bottom + 40 }, five ? { gap: 8, paddingHorizontal: 8 } : null]}>
            {call.phase === "incoming" ? (
              <>
                <Round label="Decline" icon="call" color={C.red} tilt onPress={p.onDecline} />
                <Round label="Answer" icon={call.media === "video" ? "videocam" : "call"} color="#059669" onPress={p.onAccept} />
              </>
            ) : (
              <>
                <Round small={five} label={p.muted ? "Unmute" : "Mute"} icon={p.muted ? "mic-off" : "mic"} color={p.muted ? "#d97706" : "rgba(255,255,255,0.18)"} onPress={p.onMute} />
                <Round small={five} label={p.speaker ? "Speaker off" : "Speaker on"} icon={p.speaker ? "volume-high" : "volume-medium"} color={p.speaker ? "#2563eb" : "rgba(255,255,255,0.18)"} onPress={p.onSpeaker} />
                {call.media === "video" ? <Round small={five} label={p.camOff ? "Camera on" : "Camera off"} icon={p.camOff ? "videocam-off" : "videocam"} color={p.camOff ? "#d97706" : "rgba(255,255,255,0.18)"} onPress={p.onCam} /> : null}
                {call.media === "video" ? <Round small label="Flip camera" icon="camera-reverse" color="rgba(255,255,255,0.18)" onPress={p.onFlip} /> : null}
                <Round small={five} label="Hang up" icon="call" color={C.red} tilt onPress={p.onHangUp} />
              </>
            )}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function Round({ label, icon, color, tilt, small, onPress }: { label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; color: string; tilt?: boolean; small?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[st.round, small ? st.roundSmall : null, { backgroundColor: color }]}>
      <Ionicons name={icon} size={26} color="#fff" style={tilt ? { transform: [{ rotate: "135deg" }] } : undefined} />
    </Pressable>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0f172a" },
  who: { alignItems: "center", paddingHorizontal: 24 },
  whoOverVideo: { position: "absolute", left: 0, right: 0 },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: "#334155", alignItems: "center", justifyContent: "center", marginBottom: 18 },
  name: { color: "#fff", fontSize: 24, fontWeight: "800", textShadowColor: "rgba(0,0,0,0.5)", textShadowRadius: 4 },
  status: { color: "rgba(255,255,255,0.85)", fontSize: 15, marginTop: 6, textAlign: "center", textShadowColor: "rgba(0,0,0,0.5)", textShadowRadius: 4 },
  pip: { position: "absolute", right: 16, width: 104, height: 148, borderRadius: 14, overflow: "hidden", backgroundColor: "#1e293b", zIndex: 2 },
  buttons: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", justifyContent: "center", gap: 18, paddingHorizontal: 16, flexWrap: "wrap" },
  round: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  roundSmall: { width: 54, height: 54, borderRadius: 27 },
});
