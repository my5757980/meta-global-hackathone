import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Phone, PhoneOff } from "lucide-react";
import { api } from "../lib/api";
import { useFte } from "../lib/site";
import { Avatar, clsx } from "../ui";
import { startCall } from "./calls";
import { speakAloud, stopSpeaking, VoiceListener } from "./media";

interface MineMsg {
  id: string;
  body: string | null;
  sender?: { kind?: string } | null;
  meta?: { transcript?: string; language?: string } | null;
}

/**
 * A call the AI employee answers. It takes turns: the buyer speaks, the same voice-note path hears it, Sora answers with her usual
 * tools, and the browser reads the answer out. Every turn stays in the chat as text.
 */
export function FteCallPanel({ conversationId, name, greeting, onHangUp, onEnded }: { conversationId: string; name: string; greeting: string; onHangUp: () => void; onEnded: (note: string) => void }) {
  const [phase, setPhase] = useState<"starting" | "listening" | "thinking" | "speaking">("starting");
  const [lines, setLines] = useState<{ who: "you" | "fte"; text: string }[]>([]);
  const [muted, setMuted] = useState(false);
  const [secs, setSecs] = useState(0);
  const listener = useRef<VoiceListener | null>(null);
  const said = (who: "you" | "fte", text: string) => setLines((l) => [...l.slice(-5), { who, text }]);
  const hangUp = useRef(onHangUp);
  const ended = useRef(onEnded);
  hangUp.current = onHangUp;
  ended.current = onEnded;

  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    const voice = new VoiceListener();
    listener.current = voice;

    const waitForReply = async (messageId: string) => {
      const end = Date.now() + 120_000;
      while (alive && Date.now() < end) {
        const r = await api.get<{ conversation: { holder: string }; messages: MineMsg[] }>("/api/chat/mine").catch(() => null);
        const all = r?.messages ?? [];
        const at = all.findIndex((m) => m.id === messageId);
        const reply = at >= 0 ? all.slice(at + 1).find((m) => m.sender?.kind === "fte" && m.body?.trim()) : undefined;
        if (reply) return { text: reply.body!, heard: all[at]?.meta?.transcript ?? "", language: all[at]?.meta?.language ?? "", person: r?.conversation.holder === "human" };
        await new Promise((res) => setTimeout(res, 1000));
      }
      return null;
    };

    void (async () => {
      try {
        await voice.start();
      } catch {
        ended.current("Microphone not available. Allow it to call.");
        return;
      }
      setPhase("speaking");
      said("fte", greeting);
      await speakAloud(greeting);
      while (alive) {
        setPhase("listening");
        const blob = await voice.next(90_000);
        if (!alive) return;
        if (!blob) {
          const bye = "I will hang up now. You can call me again any time.";
          setPhase("speaking");
          said("fte", bye);
          await speakAloud(bye);
          hangUp.current();
          return;
        }
        setPhase("thinking");
        try {
          const form = new FormData();
          form.append("files", blob, "call.wav");
          const up = await api.post<{ files: { id: string }[] }>("/api/chat/upload", form);
          const m = await api.post<{ id: string }>(`/api/chat/conversations/${conversationId}/messages`, { kind: "voice", body: "", fileIds: [up.files[0]!.id], onCall: true });
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
      voice.stop();
      stopSpeaking();
    };
  }, [conversationId, greeting]);

  const status = phase === "listening" ? "Listening: speak now" : phase === "thinking" ? `${name} is thinking…` : phase === "speaking" ? `${name} is speaking…` : "Connecting…";
  return (
    <div className="fixed right-4 bottom-4 left-4 z-[70] sm:left-auto sm:w-96" role="dialog" aria-label="Call">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
        <div className="flex items-center gap-3">
          <Avatar kind="fte" size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-slate-900">{name}</p>
            <p aria-live="polite" className={clsx("text-sm", phase === "listening" ? "font-medium text-emerald-700" : "text-slate-500")}>{status}</p>
          </div>
          <span className="text-sm text-slate-500">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}</span>
        </div>
        <div className="mt-3 max-h-44 space-y-1.5 overflow-y-auto text-sm [overflow-wrap:anywhere]">
          {lines.map((l, i) => (
            <p key={i} className={l.who === "you" ? "text-slate-500" : "text-slate-800"}>
              <span className="font-semibold">{l.who === "you" ? "You" : name}:</span> {l.text.replace(/\*+/g, "")}
            </p>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            onClick={() => {
              if (listener.current) listener.current.muted = !muted;
              setMuted(!muted);
            }}
            className={clsx("flex size-11 items-center justify-center rounded-full", muted ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-700")}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
          </button>
          <button onClick={onHangUp} className="flex size-12 items-center justify-center rounded-full bg-rose-600 text-white hover:bg-rose-700" aria-label="Hang up">
            <PhoneOff className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** The button that calls the AI employee, while she holds the chat. */
export function CallFte({ conversationId }: { conversationId: string }) {
  const fte = useFte();
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <button
        onClick={async () => {
          setErr(null);
          try {
            await startCall(conversationId, "audio", fte);
          } catch (e) {
            setErr((e as Error).message);
            setTimeout(() => setErr(null), 6000);
          }
        }}
        className="inline-flex min-h-7 items-center gap-1 font-semibold text-violet-700 hover:underline"
        aria-label={`Call ${fte}`}
      >
        <Phone className="size-3.5" /> Call {fte}
      </button>
      {err && <span role="alert" className="text-rose-700">{err}</span>}
    </>
  );
}
