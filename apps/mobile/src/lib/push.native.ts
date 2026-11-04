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
    await Notifications.setNotificationChannelAsync("messages", { name: "Messages", description: "New messages in your conversations, and missed calls", importance: Notifications.AndroidImportance.HIGH });
    await Notifications.setNotificationChannelAsync("groups", { name: "Groups", description: "New messages in the groups you are in", importance: Notifications.AndroidImportance.DEFAULT });
    await Notifications.setNotificationChannelAsync("calls", { name: "Calls", importance: Notifications.AndroidImportance.MAX, vibrationPattern: [0, 700, 500, 700, 500, 700], lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC });
    await Notifications.setNotificationCategoryAsync("message", [
      { identifier: "reply", buttonTitle: "Reply", textInput: { submitButtonTitle: "Send", placeholder: "Write a reply…" }, options: { opensAppToForeground: true } },
      { identifier: "read", buttonTitle: "Read", options: { opensAppToForeground: true } },
    ]);
    await Notifications.setNotificationCategoryAsync("call", [
      { identifier: "answer", buttonTitle: "Answer", options: { opensAppToForeground: true } },
      { identifier: "decline", buttonTitle: "Decline", options: { isDestructive: true, opensAppToForeground: true } },
    ]);
    const now = await Notifications.getPermissionsAsync();
    const granted = now.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;
    token = String((await Notifications.getDevicePushTokenAsync()).data);
    await api.post("/api/chat/push-token", { token, platform: Platform.OS });
    console.log("[push] registered");
  } catch (e) {
    /* no Firebase in this build, or offline: the next start tries again */
    console.warn("[push] not registered:", (e as Error).message);
  }
}

export async function forgetPush(): Promise<void> {
  if (!token) return;
  await api.post("/api/chat/push-token/forget", { token }).catch(() => {});
  token = null;
}

/** What a button on a notification asks for, done here. Anything else (a plain tap, Answer) opens the chat. */
async function handle(r: Notifications.NotificationResponse, open: () => void) {
  const content = r.notification.request.content;
  const trigger = r.notification.request.trigger as { remoteMessage?: { data?: Record<string, string> } } | null;
  const data = { ...(trigger?.remoteMessage?.data ?? {}), ...((content.data ?? {}) as Record<string, string>) };
  const conv = data.conversationId;
  const action = r.actionIdentifier;
  try {
    if (action === "reply" && r.userText?.trim() && conv) {
      await api.post(`/api/chat/conversations/${conv}/messages`, { body: r.userText.trim(), kind: "text", fileIds: [] });
      await Notifications.dismissNotificationAsync(r.notification.request.identifier);
      return;
    }
    if (action === "read" && conv) {
      await api.post(`/api/chat/conversations/${conv}/read`, {});
      await Notifications.dismissNotificationAsync(r.notification.request.identifier);
      return;
    }
    if (action === "decline" && data.callId) {
      await api.post(`/api/chat/calls/${data.callId}/signal`, { type: "decline" });
      await Notifications.dismissNotificationAsync(r.notification.request.identifier);
      return;
    }
  } catch {
    /* it could not be done from here: the chat opens, and it can be done there */
  }
  open();
}

/** Tells the app a notification was tapped, including the tap that started it. */
export function onPushOpened(fn: () => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((r) => void handle(r, fn));
  void Notifications.getLastNotificationResponseAsync()
    .then((r) => {
      if (r) void handle(r, fn);
    })
    .catch(() => {});
  return () => sub.remove();
}
