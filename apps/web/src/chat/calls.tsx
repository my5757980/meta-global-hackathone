import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from "lucide-react";
import { api } from "../lib/api";
import { useLiveEvent } from "../lib/sse";
import { notifyDesktop } from "../lib/desktopNotify";
import { Avatar, clsx } from "../ui";

/**
 * Voice and video calls, browser to browser (WebRTC). The server rings the other side and relays the
 * offer, answer and network candidates over the live stream; the sound and picture never pass through it.
 * Mount <CallLayer/> once per signed-in layout; call startCall() from any button.
 */
type Media = "audio" | "video";
interface Call {
  id: string;
  media: Media;
  peerName: string;
  role: "caller" | "callee";
  phase: "ringing" | "incoming" | "connecting" | "active" | "ended";
  note?: string;
  startedAt?: number;
}
type SignalEvent = { type: string; callId: string; data?: unknown; media?: Media; from?: { id: string; name: string }; status?: string; seconds?: number };

let iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
let starter: ((conversationId: string, media: Media, peerName: string) => Promise<void>) | null = null;

export function startCall(conversationId: string, media: Media, peerName: string): Promise<void> {
  if (!starter) return Promise.reject(new Error("Calls are not ready yet"));
  return starter(conversationId, media, peerName);
}

/** A soft repeating tone: ringing for the callee, ring-back for the caller (no audio files needed). */
function tone(kind: "ring" | "back") {
  try {
    const ctx = new AudioContext();
    let stopped = false;
    const beep = () => {
      if (stopped) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = kind === "ring" ? 880 : 440;
      g.gain.value = kind === "ring" ? 0.08 : 0.04;
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + (kind === "ring" ? 0.35 : 1));
    };
    beep();
    const t = setInterval(beep, kind === "ring" ? 1200 : 3000);
    return {
      stop: () => {
        stopped = true;
        clearInterval(t);
        void ctx.close().catch(() => {});
      },
    };
  } catch {
    return { stop: () => {} };
  }
}

export function CallLayer() {
  const [call, setCall] = useState<Call | null>(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [now, setNow] = useState(Date.now());
  const pc = useRef<RTCPeerConnection | null>(null);
  const local = useRef<MediaStream | null>(null);
  const remote = useRef<MediaStream | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const ringer = useRef<{ stop: () => void } | null>(null);
  const current = useRef<Call | null>(null);
  current.current = call;
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const localVideo = useRef<HTMLVideoElement>(null);

  const signal = (id: string, type: string, data?: unknown) => api.post(`/api/chat/calls/${id}/signal`, { type, data }).catch(() => {});

  const cleanup = useCallback(() => {
    ringer.current?.stop();
    ringer.current = null;
    pc.current?.close();
    pc.current = null;
    local.current?.getTracks().forEach((t) => t.stop());
    local.current = null;
    remote.current = null;
    pendingIce.current = [];
    setMuted(false);
    setCamOff(false);
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
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: media === "video" ? { width: 640, height: 480 } : false });
    local.current = stream;
    return stream;
  };

  const makePc = (id: string) => {
    const p = new RTCPeerConnection({ iceServers });
    p.onicecandidate = (e) => {
      if (e.candidate) void signal(id, "ice", e.candidate.toJSON());
    };
    p.ontrack = (e) => {
      remote.current = e.streams[0] ?? new MediaStream([e.track]);
      if (remoteVideo.current) remoteVideo.current.srcObject = remote.current;
    };
    p.onconnectionstatechange = () => {
      if (p.connectionState === "connected") setCall((c) => (c ? { ...c, phase: "active", startedAt: c.startedAt ?? Date.now() } : c));
      if (p.connectionState === "failed") {
        void signal(id, "end");
        endShown("The connection failed — the network may block direct calls");
      }
    };
    local.current?.getTracks().forEach((t) => p.addTrack(t, local.current!));
    pc.current = p;
    return p;
  };

  const flushIce = async () => {
    const p = pc.current;
    if (!p?.remoteDescription) return;
    for (const c of pendingIce.current.splice(0)) await p.addIceCandidate(c).catch(() => {});
  };

  // a relay configured on the server (TURN) reaches every call
  useEffect(() => {
    void api.get<{ iceServers: RTCIceServer[] }>("/api/chat/ice").then((r) => (iceServers = r.iceServers)).catch(() => {});
  }, []);

  // start a call from a button anywhere in the app
  useEffect(() => {
    starter = async (conversationId, media, peerName) => {
      if (current.current) throw new Error("You are already in a call");
      try {
        await getMedia(media);
      } catch {
        throw new Error(media === "video" ? "Camera or microphone not available — allow access to call" : "Microphone not available — allow access to call");
      }
      try {
        const r = await api.post<{ callId: string; peer: { name: string } }>(`/api/chat/conversations/${conversationId}/calls`, { media });
        setCall({ id: r.callId, media, peerName: r.peer.name || peerName, role: "caller", phase: "ringing" });
        ringer.current = tone("back");
      } catch (e) {
        cleanup();
        throw e;
      }
    };
    return () => {
      starter = null;
    };
  }, [cleanup]);

  const onCall = useCallback(
    async (e: SignalEvent) => {
      const c = current.current;
      if (e.type === "ring") {
        if (c) return; // already busy here; the caller will hear no answer
        setCall({ id: e.callId, media: e.media ?? "audio", peerName: e.from?.name ?? "Caller", role: "callee", phase: "incoming" });
        ringer.current = tone("ring");
        notifyDesktop(`Incoming ${e.media === "video" ? "video" : "voice"} call`, `${e.from?.name ?? "Someone"} is calling you`, undefined, { tag: e.callId });
        return;
      }
      if (!c || c.id !== e.callId) return;
      if (e.type === "taken") {
        if (c.phase === "incoming") {
          cleanup();
          setCall(null); // answered in another tab
        }
        return;
      }
      if (e.type === "ended") {
        const note = e.status === "ended" ? "Call ended" : e.status === "declined" ? (c.role === "caller" ? `${c.peerName} declined the call` : "Call declined") : c.role === "caller" ? "No answer" : "Missed call";
        endShown(note);
        return;
      }
      try {
        if (e.type === "accept" && c.role === "caller") {
          ringer.current?.stop();
          setCall({ ...c, phase: "connecting" });
          const p = makePc(c.id);
          const offer = await p.createOffer();
          await p.setLocalDescription(offer);
          void signal(c.id, "offer", offer);
        } else if (e.type === "offer" && c.role === "callee") {
          const p = pc.current ?? makePc(c.id);
          await p.setRemoteDescription(e.data as RTCSessionDescriptionInit);
          await flushIce();
          const answer = await p.createAnswer();
          await p.setLocalDescription(answer);
          void signal(c.id, "answer", answer);
        } else if (e.type === "answer" && c.role === "caller") {
          await pc.current?.setRemoteDescription(e.data as RTCSessionDescriptionInit);
          await flushIce();
        } else if (e.type === "ice") {
          pendingIce.current.push(e.data as RTCIceCandidateInit);
          await flushIce();
        }
      } catch {
        void signal(c.id, "end");
        endShown("The call could not connect");
      }
    },
    [cleanup, endShown],
  );
  useLiveEvent("call", onCall);

  // timer while active, and attach streams once the video elements exist
  useEffect(() => {
    if (call?.phase !== "active") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [call?.phase]);
  useEffect(() => {
    if (remoteVideo.current && remote.current && remoteVideo.current.srcObject !== remote.current) remoteVideo.current.srcObject = remote.current;
    if (localVideo.current && local.current && localVideo.current.srcObject !== local.current) localVideo.current.srcObject = local.current;
  });
  // leaving the page ends the call cleanly
  useEffect(() => {
    const bye = () => {
      const c = current.current;
      if (c && c.phase !== "ended") navigator.sendBeacon?.(`/api/chat/calls/${c.id}/signal`, new Blob([JSON.stringify({ type: c.phase === "incoming" ? "decline" : "end" })], { type: "application/json" }));
    };
    window.addEventListener("pagehide", bye);
    return () => window.removeEventListener("pagehide", bye);
  }, []);

  if (!call) return null;

  const accept = async () => {
    ringer.current?.stop();
    try {
      await getMedia(call.media);
    } catch {
      void signal(call.id, "decline");
      endShown(call.media === "video" ? "Camera or microphone not available" : "Microphone not available");
      return;
    }
    setCall({ ...call, phase: "connecting" });
    makePc(call.id);
    void signal(call.id, "accept");
  };
  const decline = () => {
    void signal(call.id, "decline");
    cleanup();
    setCall(null);
  };
  const hangUp = () => {
    void signal(call.id, "end");
    endShown(call.phase === "active" ? "Call ended" : "Call cancelled");
  };
  const toggleMute = () => {
    local.current?.getAudioTracks().forEach((t) => (t.enabled = muted));
    setMuted(!muted);
  };
  const toggleCam = () => {
    local.current?.getVideoTracks().forEach((t) => (t.enabled = camOff));
    setCamOff(!camOff);
  };
  const secs = call.startedAt ? Math.max(0, Math.round((now - call.startedAt) / 1000)) : 0;
  const status =
    call.phase === "incoming"
      ? `Incoming ${call.media === "video" ? "video" : "voice"} call`
      : call.phase === "ringing"
        ? "Ringing…"
        : call.phase === "connecting"
          ? "Connecting…"
          : call.phase === "active"
            ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`
            : (call.note ?? "Call ended");
  const video = call.media === "video" && (call.phase === "active" || call.phase === "connecting");

  return (
    <div className={clsx("fixed z-[70]", video ? "inset-0 bg-slate-950" : "right-4 bottom-4 left-4 sm:left-auto sm:w-80")} role="dialog" aria-label="Call">
      {/* remote sound (and picture for video calls) */}
      <video ref={remoteVideo} autoPlay playsInline className={video ? "absolute inset-0 h-full w-full object-contain" : "hidden"} />
      {video && <video ref={localVideo} autoPlay playsInline muted className="absolute top-4 right-4 h-32 w-24 rounded-xl border border-white/20 bg-slate-800 object-cover sm:h-40 sm:w-56" />}
      <div className={clsx(video ? "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-6 text-white" : "rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl")}>
        <div className={clsx("flex items-center gap-3", video && "justify-center")}>
          {!video && <Avatar name={call.peerName} size={44} />}
          <div className={clsx("min-w-0", video && "text-center")}>
            <p className={clsx("truncate font-semibold", video ? "text-lg" : "text-slate-900")}>{call.peerName}</p>
            <p className={clsx("text-sm", video ? "text-white/80" : call.phase === "ended" ? "text-rose-600" : "text-slate-500")} aria-live="polite">
              {status}
            </p>
          </div>
        </div>
        {call.phase !== "ended" && (
          <div className="mt-4 flex items-center justify-center gap-3">
            {call.phase === "incoming" ? (
              <>
                <button onClick={decline} className="flex size-12 items-center justify-center rounded-full bg-rose-600 text-white hover:bg-rose-700" aria-label="Decline">
                  <PhoneOff className="size-5" />
                </button>
                <button onClick={() => void accept()} className="flex size-12 animate-pulse items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-700" aria-label="Answer">
                  {call.media === "video" ? <Video className="size-5" /> : <Phone className="size-5" />}
                </button>
              </>
            ) : (
              <>
                <button onClick={toggleMute} className={clsx("flex size-11 items-center justify-center rounded-full", muted ? "bg-amber-500 text-white" : video ? "bg-white/15 text-white" : "bg-slate-100 text-slate-700")} aria-label={muted ? "Unmute" : "Mute"}>
                  {muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
                </button>
                {call.media === "video" && (
                  <button onClick={toggleCam} className={clsx("flex size-11 items-center justify-center rounded-full", camOff ? "bg-amber-500 text-white" : "bg-white/15 text-white")} aria-label={camOff ? "Camera on" : "Camera off"}>
                    {camOff ? <VideoOff className="size-5" /> : <Video className="size-5" />}
                  </button>
                )}
                <button onClick={hangUp} className="flex size-12 items-center justify-center rounded-full bg-rose-600 text-white hover:bg-rose-700" aria-label="Hang up">
                  <PhoneOff className="size-5" />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Call buttons for a conversation header. */
export function CallButtons({ conversationId, peerName, disabled, className }: { conversationId: string; peerName: string; disabled?: string | null; className?: string }) {
  const [err, setErr] = useState<string | null>(null);
  const go = async (media: Media) => {
    setErr(null);
    try {
      await startCall(conversationId, media, peerName);
    } catch (e) {
      setErr((e as Error).message);
      setTimeout(() => setErr(null), 6000);
    }
  };
  return (
    <div className={clsx("relative flex items-center gap-1", className)}>
      <button onClick={() => void go("audio")} disabled={!!disabled} title={disabled ?? `Voice call ${peerName}`} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40" aria-label="Voice call">
        <Phone className="size-4" />
      </button>
      <button onClick={() => void go("video")} disabled={!!disabled} title={disabled ?? `Video call ${peerName}`} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40" aria-label="Video call">
        <Video className="size-4" />
      </button>
      {err && <p className="absolute top-full right-0 z-20 mt-1 w-64 rounded-xl bg-rose-50 p-2 text-xs text-rose-700 shadow ring-1 ring-rose-100">{err}</p>}
    </div>
  );
}
