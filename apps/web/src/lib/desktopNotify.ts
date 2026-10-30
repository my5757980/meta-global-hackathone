/** Desktop pop-ups (the operating system's own notifications) while this tab is in the background. */
export const desktopNotifySupported = () => typeof window !== "undefined" && "Notification" in window;

export const desktopNotifyState = (): NotificationPermission | "unsupported" => (desktopNotifySupported() ? Notification.permission : "unsupported");

export async function askDesktopNotify(): Promise<NotificationPermission | "unsupported"> {
  if (!desktopNotifySupported()) return "unsupported";
  if (Notification.permission === "default") return Notification.requestPermission();
  return Notification.permission;
}

/** Shown only when the tab is hidden — in front of the user the page itself shows the news. */
export function notifyDesktop(title: string, body: string, onClick?: () => void, opts: { always?: boolean; tag?: string } = {}) {
  if (!desktopNotifySupported() || Notification.permission !== "granted") return;
  if (!opts.always && !document.hidden) return;
  try {
    const n = new Notification(title, { body: body.slice(0, 180), icon: "/favicon.svg", tag: opts.tag });
    n.onclick = () => {
      window.focus();
      onClick?.();
      n.close();
    };
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}
