import { PermissionsAndroid } from "react-native";
import { mediaDevices, RTCPeerConnection, RTCView } from "react-native-webrtc";
import InCallManager from "react-native-incall-manager";

/** The phone's side of a call: the WebRTC engine, permissions, and the phone's own ringtone, earpiece and speaker. */
export { mediaDevices, RTCPeerConnection, RTCView };

export async function askCallPermissions(media: "audio" | "video"): Promise<boolean> {
  const wanted = media === "video" ? [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, PermissionsAndroid.PERMISSIONS.CAMERA] : [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
  const got = await PermissionsAndroid.requestMultiple(wanted);
  return wanted.every((p) => got[p] === PermissionsAndroid.RESULTS.GRANTED);
}

// a phone's sound system can refuse: the call itself must go on, so nothing here may throw
const safe = (fn: () => void) => {
  try {
    fn();
  } catch {
    /* no ringtone is better than no call */
  }
};

export const callSound = {
  ringing: () => safe(() => InCallManager.startRingtone("_DEFAULT_", [0, 800, 800], "default", 45)),
  stopRinging: () => safe(() => InCallManager.stopRingtone()),
  calling: (media: "audio" | "video") => safe(() => InCallManager.start({ media, auto: false, ringback: "_DTMF_" })),
  connected: (media: "audio" | "video") =>
    safe(() => {
      InCallManager.stopRingback();
      InCallManager.start({ media, auto: false });
      InCallManager.setForceSpeakerphoneOn(media === "video");
      InCallManager.setKeepScreenOn(true);
    }),
  speaker: (on: boolean) => safe(() => InCallManager.setForceSpeakerphoneOn(on)),
  remote: (_stream: unknown) => {},
  stop: () =>
    safe(() => {
      InCallManager.stopRingtone();
      InCallManager.setKeepScreenOn(false);
      InCallManager.stop();
    }),
};

/** RTCView takes the stream's address. */
export const streamProp = (stream: { toURL(): string }) => ({ streamURL: stream.toURL() });
