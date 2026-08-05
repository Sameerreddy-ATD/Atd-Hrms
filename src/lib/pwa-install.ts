const INSTALL_DISMISSED_KEY = "adh_pwa_install_dismissed_at";
const DISMISS_DAYS = 14;

export type PwaPlatform = "ios" | "android" | "windows" | "mac" | "other";

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
    // Private mode or restricted storage.
  }
}

export function isAppInstalled() {
  if (typeof window === "undefined") return false;
  const standaloneDisplay = window.matchMedia("(display-mode: standalone)").matches;
  const standaloneIos = "standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const windowControls =
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches;
  return standaloneDisplay || standaloneIos || windowControls;
}

export function detectPwaPlatform(): PwaPlatform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
    return "ios";
  }
  if (/Android/i.test(ua)) return "android";
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "mac";
  return "other";
}

export function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIos =
    /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Android/i.test(ua);
  return isIos && isSafari;
}

export function wasInstallDismissedRecently() {
  const raw = readLocalStorage(INSTALL_DISMISSED_KEY);
  if (!raw) return false;
  const dismissedAt = Number(raw);
  if (!Number.isFinite(dismissedAt)) return false;
  return Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

export function dismissInstallPrompt() {
  writeLocalStorage(INSTALL_DISMISSED_KEY, String(Date.now()));
}

export function installInstructionCopy(platform: PwaPlatform) {
  switch (platform) {
    case "ios":
      return {
        title: "Add Anytime Diesel to your Home Screen",
        steps: [
          "Tap the Share button in Safari",
          "Scroll and choose Add to Home Screen",
          "Tap Add, then open the app from your icon",
          "Enable Alerts inside Notifications for push updates",
        ],
      };
    case "mac":
      return {
        title: "Install on your Mac",
        steps: [
          "In Chrome or Edge, open the install icon in the address bar",
          "Or use Safari File → Add to Dock when available",
          "Open the installed app, then enable Alerts in Notifications",
        ],
      };
    case "windows":
      return {
        title: "Install on Windows",
        steps: [
          "In Chrome or Edge, click Install app in the address bar or menu",
          "Pin the app to the taskbar for quick attendance and leave checks",
          "Enable Alerts in Notifications for desktop pop-ups",
        ],
      };
    case "android":
      return {
        title: "Install or create a shortcut",
        steps: [
          "Tap Create shortcut / Install app below if shown",
          "Or open the browser menu (⋮) → Install app / Add to Home screen / Create shortcut",
          "Open Anytime Workforce from your home screen or app drawer",
          "Enable Alerts so company updates arrive even when the browser is closed",
        ],
      };
    default:
      return {
        title: "Install Anytime Workforce",
        steps: [
          "Use your browser’s Install or Add to Home Screen option",
          "Open the installed app for the full-screen workplace experience",
          "Enable Alerts in Notifications",
        ],
      };
  }
}

export async function clearAppBadgeSafe() {
  try {
    if ("clearAppBadge" in navigator) {
      await (navigator as Navigator & { clearAppBadge: () => Promise<void> }).clearAppBadge();
    }
  } catch {
    // Badge APIs can fail on unsupported platforms.
  }
}

/**
 * Force a full app refresh for home-screen / installed PWAs (no browser refresh button).
 * Clears app caches, drops the service worker so the next load fetches a fresh one, then reloads.
 */
export async function hardRefreshApp(): Promise<void> {
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("atd-static-") || key.startsWith("atd-"))
          .map((key) => caches.delete(key)),
      );
    }

    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map(async (registration) => {
          try {
            await registration.update();
          } catch {
            // Offline or blocked — still unregister below.
          }
          if (registration.waiting) {
            registration.waiting.postMessage({ type: "SKIP_WAITING" });
          }
          await registration.unregister().catch(() => false);
        }),
      );
    }
  } catch {
    // Always continue to reload.
  }

  const url = new URL(window.location.href);
  url.searchParams.set("_r", String(Date.now()));
  window.location.replace(url.toString());
}

/** Softer path: ask the service worker for an update without clearing everything. */
export async function checkForAppUpdate(): Promise<"updated" | "current" | "unavailable"> {
  if (!("serviceWorker" in navigator)) return "unavailable";
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return "unavailable";
    await registration.update();
    if (registration.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
      return "updated";
    }
    return "current";
  } catch {
    return "unavailable";
  }
}

import { APP_BUILD_ID } from "@/lib/app-build";

const FORCED_BUILD_SESSION_KEY = "adh_forced_build";
const STORED_BUILD_KEY = "adh_app_build_id";

/**
 * Compare the running client build to /app-version.json on the server.
 * If they differ (new deploy), hard-refresh so already-installed home-screen apps catch up.
 */
export async function ensureLatestAppBuild(): Promise<void> {
  if (typeof window === "undefined") return;
  if (import.meta.env.DEV) return;

  try {
    const response = await fetch(`/app-version.json?_=${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return;

    const remote = (await response.json()) as { buildId?: string; forceReload?: boolean };
    if (!remote.buildId) return;

    try {
      window.localStorage.setItem(STORED_BUILD_KEY, APP_BUILD_ID);
    } catch {
      // ignore
    }

    // Already forced onto this remote build in this tab — avoid reload loops.
    try {
      if (window.sessionStorage.getItem(FORCED_BUILD_SESSION_KEY) === remote.buildId) {
        return;
      }
    } catch {
      // ignore
    }

    if (remote.buildId !== APP_BUILD_ID) {
      try {
        window.sessionStorage.setItem(FORCED_BUILD_SESSION_KEY, remote.buildId);
      } catch {
        // ignore
      }
      await hardRefreshApp();
      return;
    }

    try {
      window.sessionStorage.setItem(FORCED_BUILD_SESSION_KEY, remote.buildId);
    } catch {
      // ignore
    }
  } catch {
    // Offline or blocked — keep the current shell.
  }
}
