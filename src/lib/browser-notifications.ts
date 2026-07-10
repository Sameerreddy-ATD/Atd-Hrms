import type { NotificationItem } from "@/mock/types";

const CLEARED_AT_KEY = "adh_notifications_cleared_at";
const DESKTOP_ALERTS_KEY = "adh_desktop_alerts_enabled";
const SEEN_NOTIFICATION_IDS_KEY = "adh_seen_notification_ids";

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
  const newestTime = items
    .map((item) => item.time)
    .sort((a, b) => +new Date(b) - +new Date(a))[0];
  if (newestTime) writeLocalStorage(CLEARED_AT_KEY, newestTime);
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

export function disableDesktopAlerts() {
  setDesktopAlertsEnabled(false);
}

export type NotificationPermissionState = "granted" | "denied" | "default" | "unsupported";

export function getNotificationPermission(): NotificationPermissionState {
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
  await navigator.serviceWorker.register("/sw.js");
}

export async function showDesktopNotification(item: NotificationItem) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification(item.title, {
    body: item.desc,
    icon: "/atd-logo.png",
    badge: "/atd-favicon.png",
    tag: item.id,
    data: { href: "/notifications" },
  });
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
  await showDesktopNotification({
    id: "alerts-enabled",
    title: "Anytime Diesel HRMS alerts enabled",
    desc: "Browser alerts are ready while the app is open.",
    time: new Date().toISOString(),
    type: "system",
  });
}
