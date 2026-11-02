import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { api } from "./api";

/**
 * Push on the phone: the server sends one when this person is away, and a tap opens the chat, where a call that is still ringing
 * comes up by itself. A build with no Firebase file (google-services.json) simply gets no token and works while it is open.
 */
let token: string | null = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function registerPush(): Promise<void> {
  try {
    await Notifications.setNotificationChannelAsync("messages", { name: "Messages", importance: Notifications.AndroidImportance.HIGH });
    await Notifications.setNotificationChannelAsync("calls", { name: "Calls", importance: Notifications.AndroidImportance.MAX, vibrationPattern: [0, 700, 500, 700, 500, 700], lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC });
    const now = await Notifications.getPermissionsAsync();
    const granted = now.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;
    token = String((await Notifications.getDevicePushTokenAsync()).data);
    await api.post("/api/chat/push-token", { token, platform: Platform.OS });
  } catch {
    /* no Firebase in this build, or offline: the next start tries again */
  }
}

export async function forgetPush(): Promise<void> {
  if (!token) return;
  await api.post("/api/chat/push-token/forget", { token }).catch(() => {});
  token = null;
}

/** Tells the app a notification was tapped, including the tap that started it. */
export function onPushOpened(fn: () => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(() => fn());
  void Notifications.getLastNotificationResponseAsync()
    .then((r) => {
      if (r) fn();
    })
    .catch(() => {});
  return () => sub.remove();
}
