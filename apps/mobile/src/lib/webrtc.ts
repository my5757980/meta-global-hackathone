import { createElement, useEffect, useRef } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";

/**
 * The browser's side of a call, for the app's web preview: same names as webrtc.native.ts, which is what a phone loads.
 * Loosely typed on purpose: the two engines differ in details the call code does not touch.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export const RTCPeerConnection: any = (globalThis as any).RTCPeerConnection;
export const mediaDevices: any = (globalThis as any).navigator?.mediaDevices;

export const askCallPermissions = async (_media: "audio" | "video") => true;

let remoteSound: HTMLAudioElement | null = null;
export const callSound = {
  ringing: () => {},
  stopRinging: () => {},
  calling: (_media: "audio" | "video") => {},
  connected: (_media: "audio" | "video") => {},
  speaker: (_on: boolean) => {},
  remote: (stream: unknown) => {
    remoteSound ??= new Audio();
    remoteSound.srcObject = stream as MediaStream;
    void remoteSound.play().catch(() => {});
  },
  stop: () => {
    if (remoteSound) remoteSound.srcObject = null;
  },
};

export const streamProp = (stream: unknown) => ({ stream });

export function RTCView({ stream, style, mirror }: { stream?: unknown; style?: StyleProp<ViewStyle>; mirror?: boolean; objectFit?: string; zOrder?: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = (stream as MediaStream) ?? null;
  }, [stream]);
  const flat = StyleSheet.flatten(style) as object;
  return createElement("video", { ref, autoPlay: true, playsInline: true, muted: true, style: { ...flat, objectFit: "cover", transform: mirror ? "scaleX(-1)" : undefined } });
}
