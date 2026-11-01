import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Where the platform's API lives. The web build is served next to the API, so "" = same origin.
 * A phone needs a real address: the build-time default (EXPO_PUBLIC_API_URL), or whatever the buyer
 * typed in Menu → Server address (kept on the device, so a new laptop IP never needs a new APK).
 */
const SERVER_KEY = "autofte.server";
const TOKEN_KEY = "autofte.session";
export const DEFAULT_SERVER = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
export const isWeb = Platform.OS === "web";

let server = DEFAULT_SERVER;
let token: string | null = null;

export async function loadConfig(): Promise<void> {
  try {
    const s = await AsyncStorage.getItem(SERVER_KEY);
    if (s !== null && s !== "") server = s;
  } catch {
    /* storage unavailable: keep the default */
  }
  try {
    token = isWeb ? await AsyncStorage.getItem(TOKEN_KEY) : await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    token = null;
  }
}

export const getServer = () => server;
export const getToken = () => token;
/** A phone with no server address cannot do anything yet. */
export const needsServer = () => !isWeb && !server;

export async function setServer(url: string): Promise<void> {
  server = url.trim().replace(/\/+$/, "");
  await AsyncStorage.setItem(SERVER_KEY, server);
}

export async function setToken(t: string | null): Promise<void> {
  token = t;
  try {
    if (isWeb) {
      if (t) await AsyncStorage.setItem(TOKEN_KEY, t);
      else await AsyncStorage.removeItem(TOKEN_KEY);
    } else if (t) await SecureStore.setItemAsync(TOKEN_KEY, t);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    /* the session still works for this run */
  }
}

/** Absolute URL for an API path or a server-relative media path. */
export const absUrl = (path: string) => (/^https?:\/\//.test(path) ? path : server + path);

/** Headers that sign this device in (the server never gives a browser this token). */
export function authHeaders(): Record<string, string> {
  return token ? { Authorization: `Session ${token}` } : {};
}

/** expo-image / expo-audio source for a protected file: the header travels with the request on a phone. */
export const protectedSource = (path: string) => ({ uri: absUrl(path), headers: authHeaders() });
