import type { NotificationItem } from "@/types/domain";
import { pushApi } from "@/services/api";

const CLEARED_AT_KEY = "adh_notifications_cleared_at";
const DESKTOP_ALERTS_KEY = "adh_desktop_alerts_enabled";
const SEEN_NOTIFICATION_IDS_KEY = "adh_seen_notification_ids";
export const NOTIFICATION_COUNT_CHANGED_EVENT = "adh:notification-count-changed";

function readLocalStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures in private or restricted contexts.
  }
}

export function getNotificationsClearedAt() {
  return readLocalStorage(CLEARED_AT_KEY);
}

export function clearNotifications(items: NotificationItem[]) {
  const newestTime = items.map((item) => item.time).sort((a, b) => +new Date(b) - +new Date(a))[0];
  if (newestTime) writeLocalStorage(CLEARED_AT_KEY, newestTime);
  window.dispatchEvent(new Event(NOTIFICATION_COUNT_CHANGED_EVENT));
}

export function filterVisibleNotifications(items: NotificationItem[]) {
  const clearedAt = getNotificationsClearedAt();
  if (!clearedAt) return items;
  return items.filter((item) => +new Date(item.time) > +new Date(clearedAt));
}

export function areDesktopAlertsEnabled() {
  return readLocalStorage(DESKTOP_ALERTS_KEY) === "true";
}

export function setDesktopAlertsEnabled(enabled: boolean) {
  writeLocalStorage(DESKTOP_ALERTS_KEY, enabled ? "true" : "false");
}

export async function disableDesktopAlerts() {
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager?.getSubscription();
    if (subscription) {
      await pushApi.unsubscribe(subscription.endpoint).catch(() => undefined);
      await subscription.unsubscribe();
    }
  }
  setDesktopAlertsEnabled(false);
}

export type NotificationPermissionState = "granted" | "denied" | "default" | "unsupported";

export function getNotificationPermission(): NotificationPermissionState {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export function syncDesktopAlertsWithPermission() {
  const permission = getNotificationPermission();
  if (permission !== "granted" && areDesktopAlertsEnabled()) {
    setDesktopAlertsEnabled(false);
  }
}

export function getDesktopAlertStatus() {
  syncDesktopAlertsWithPermission();
  const permission = getNotificationPermission();
  const appEnabled = areDesktopAlertsEnabled();
  return {
    permission,
    appEnabled,
    effectivelyEnabled: appEnabled && permission === "granted",
  };
}

export function getSeenNotificationIds() {
  const raw = readLocalStorage(SEEN_NOTIFICATION_IDS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

export function setSeenNotificationIds(ids: string[]) {
  writeLocalStorage(SEEN_NOTIFICATION_IDS_KEY, JSON.stringify(ids.slice(-100)));
}

export async function registerAppServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations
        .filter((registration) => registration.active?.scriptURL.endsWith("/sw.js"))
        .map((registration) => registration.unregister()),
    );
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith("atd-static-")).map((key) => caches.delete(key)),
      );
    }
    return;
  }
  await navigator.serviceWorker.register("/sw.js");
}

export async function showDesktopNotification(item: NotificationItem) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification(item.title, {
    body: item.desc,
    icon: "/pwa-192.png",
    badge: "/atd-favicon.png",
    tag: item.id,
    data: { href: "/notifications" },
    ...({
      renotify: true,
      vibrate: [80, 40, 80],
    } as NotificationOptions),
  });
  try {
    if ("setAppBadge" in navigator) {
      await (navigator as Navigator & { setAppBadge: (count?: number) => Promise<void> }).setAppBadge();
    }
  } catch {
    // Optional badge support.
  }
}

export async function enableDesktopAlerts() {
  if (!("Notification" in window)) {
    throw new Error("This browser does not support desktop notifications.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }
  setDesktopAlertsEnabled(true);
  await registerAppServiceWorker();
  const registration = await navigator.serviceWorker.ready;
  if (registration.pushManager) {
    const { publicKey } = await pushApi.publicKey();
    if (publicKey) {
      const padding = "=".repeat((4 - (publicKey.length % 4)) % 4);
      const base64 = (publicKey + padding).replace(/-/g, "+").replace(/_/g, "/");
      const applicationServerKey = Uint8Array.from(atob(base64), (character) =>
        character.charCodeAt(0),
      );
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        }));
      await pushApi.subscribe(subscription.toJSON());
    }
  }
  await showDesktopNotification({
    id: "alerts-enabled",
    title: "Anytime Diesel employee alerts enabled",
    desc: "Browser alerts are ready while the app is open.",
    time: new Date().toISOString(),
    type: "system",
  });
}
