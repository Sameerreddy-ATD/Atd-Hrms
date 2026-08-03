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
