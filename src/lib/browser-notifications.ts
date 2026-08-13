import type { NotificationItem } from "@/types/domain";
import { pushApi } from "@/services/api";
import { getNativePlatform, isNativeApp } from "@/lib/native-app";

const CLEARED_AT_KEY = "adh_notifications_cleared_at";
const DESKTOP_ALERTS_KEY = "adh_desktop_alerts_enabled";
const SEEN_NOTIFICATION_IDS_KEY = "adh_seen_notification_ids";
const NATIVE_PUSH_TOKEN_KEY = "adh_native_push_token";
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

function removeLocalStorage(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures.
  }
}

function nativePushChannel(): "fcm" | "apns" {
  return getNativePlatform() === "ios" ? "apns" : "fcm";
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
  if (isNativeApp()) {
    const token = readLocalStorage(NATIVE_PUSH_TOKEN_KEY);
    if (token) {
      await pushApi.unsubscribeNative(nativePushChannel(), token).catch(() => undefined);
      removeLocalStorage(NATIVE_PUSH_TOKEN_KEY);
    }
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      await PushNotifications.removeAllListeners();
    } catch {
      // Plugin may be unavailable.
    }
    setDesktopAlertsEnabled(false);
    return;
  }
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
  if (isNativeApp()) {
    // Native permission is resolved asynchronously; local flag tracks user choice.
    return areDesktopAlertsEnabled() ? "granted" : "default";
  }
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

export async function unregisterAppServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
}

export async function registerAppServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  // Play / App Store shell must never run the PWA worker or browser push.
  if (isNativeApp()) {
    await unregisterAppServiceWorker().catch(() => undefined);
    return;
  }
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

  const registration = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });

  // After a deploy, activate the new worker and reload so installed PWAs get fresh UI.
  let refreshing = false;
  const reloadOnce = () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener("controllerchange", reloadOnce);
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "FORCE_RELOAD") reloadOnce();
  });

  const promptUpdate = () => {
    if (registration.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
  };
  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      if (installing.state === "installed" && navigator.serviceWorker.controller) {
        promptUpdate();
      }
    });
  });
  promptUpdate();

  const checkUpdate = () => {
    void registration.update().catch(() => undefined);
  };
  checkUpdate();

  // Poll often enough that already-open installed apps pick up deploys.
  window.setInterval(checkUpdate, 60_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkUpdate();
  });
  window.addEventListener("focus", checkUpdate);
  window.addEventListener("online", checkUpdate);
}

export async function showDesktopNotification(item: NotificationItem) {
  // Native store app uses FCM / in-app alerts — never Chrome WebView toasts.
  if (isNativeApp()) return;
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
  if (isNativeApp()) {
    // Samsung S25 Ultra (Android 16): PushNotifications.checkPermissions NPEs in
    // Bridge.getPermissionStates and kills the app. Skip Cap permission APIs on Android.
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const { Capacitor } = await import("@capacitor/core");
      const android = Capacitor.getPlatform() === "android";

      let permission: { receive?: string } = { receive: "prompt" };
      if (!android) {
        try {
          permission = await Promise.race([
            PushNotifications.checkPermissions(),
            new Promise<never>((_, reject) =>
              window.setTimeout(() => reject(new Error("Notification check timed out.")), 4_000),
            ),
          ]);
        } catch {
          permission = { receive: "prompt" };
        }

        if (permission.receive === "prompt" || permission.receive === "prompt-with-rationale") {
          try {
            permission = await Promise.race([
              PushNotifications.requestPermissions(),
              new Promise<never>((_, reject) =>
                window.setTimeout(
                  () => reject(new Error("Notification permission timed out.")),
                  20_000,
                ),
              ),
            ]);
          } catch {
            // User dismissed or OEM hung — fall through.
          }
        }

        if (permission.receive && permission.receive !== "granted") {
          throw new Error(
            "Notification permission was not granted. Open Settings → Apps → Anytime Workforce → Notifications and allow them.",
          );
        }
      }

      try {
        await PushNotifications.removeAllListeners();
      } catch {
        // ignore
      }

      try {
        await PushNotifications.addListener("registration", (token) => {
          writeLocalStorage(NATIVE_PUSH_TOKEN_KEY, token.value);
          void pushApi.subscribeNative(nativePushChannel(), token.value).catch(() => undefined);
        });
        await PushNotifications.addListener("registrationError", (error) => {
          console.error("Native push registration failed", error);
        });
        await PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
          const href =
            (event.notification.data as { href?: string } | undefined)?.href ?? "/notifications";
          if (typeof href === "string" && href.startsWith("/")) {
            window.location.assign(href);
          }
        });
      } catch {
        // Listeners optional.
      }

      // Android: do not call register() either — some OEM WebViews still route
      // it through getPermissionStates (S25 Ultra NPE). In-app alerts still work.
      if (!android) {
        window.setTimeout(() => {
          void PushNotifications.register().catch((error) => {
            console.error("Native push register failed", error);
          });
        }, 400);
      }

      setDesktopAlertsEnabled(true);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/not granted|blocked|denied/i.test(message)) {
        throw error instanceof Error ? error : new Error(message);
      }
      setDesktopAlertsEnabled(true);
      throw new Error(
        "Alerts were turned on in the app, but system push setup failed on this device. You will still see notifications inside Anytime Workforce.",
      );
    }
  }

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
    title: "Anytime Workforce alerts enabled",
    desc: "You will get alerts from this browser or home-screen app.",
    time: new Date().toISOString(),
    type: "system",
  });
}

