import { AppState } from "react-native";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { onLive } from "./live";

/**
 * The little tone when something arrives: never for the conversation being looked at, only when the app is behind
 * other things or somebody writes elsewhere. A phone that cannot play it simply stays quiet.
 */
let player: AudioPlayer | null = null;
let lastAt = 0;
let openConversation: string | null = null;

export const setOpenConversation = (id: string | null) => {
  openConversation = id;
};

export function chime() {
  const now = Date.now();
  if (now - lastAt < 1500) return; // five messages at once are one tone
  lastAt = now;
  try {
    if (!player) {
      player = createAudioPlayer(require("../../assets/chime.wav"));
      player.play();
      return;
    }
    const p = player;
    void p.seekTo(0).then(
      () => p.play(),
      () => p.play(),
    );
  } catch {
    /* a missing tone is never worth an error on screen */
  }
}

/** Listens for the whole time someone is signed in. Returns the way to stop. */
export function watchForChime(meId: string) {
  return onLive<{ senderUserId: string | null; conversationId: string; kind: string }>("message", (m) => {
    if (!m.senderUserId || m.senderUserId === meId || m.kind === "system") return;
    if (m.conversationId === openConversation && AppState.currentState === "active") return;
    chime();
  });
}
