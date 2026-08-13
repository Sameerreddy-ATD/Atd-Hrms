import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { ScreenOrientation } from "@capacitor/screen-orientation";
import { Keyboard } from "@capacitor/keyboard";

/** True when running inside the Capacitor Android/iOS shell (Play / App Store). */
export function isNativeApp() {
  try {
    if (typeof document !== "undefined" && document.documentElement.classList.contains("atd-native")) {
      return true;
    }
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function getNativePlatform(): "ios" | "android" | "web" {
  try {
    const platform = Capacitor.getPlatform();
    if (platform === "ios" || platform === "android") return platform;
    return "web";
  } catch {
    return "web";
  }
}

function shouldLockNativePortrait() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const platform = getNativePlatform();
  if (platform === "ios") return /iPhone|iPod/i.test(navigator.userAgent);
  if (platform === "android") {
    const shortest = Math.min(window.screen.width || 0, window.screen.height || 0);
    return shortest > 0 && shortest < 600;
  }
  return false;
}

function isDocumentDark() {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

// Timestamp of the last navigation / resume, used to reject the spurious Back
// events that Samsung and other OEMs emit right after a route change.
let lastNavActivityAt = Date.now();
// Timestamp of the last Back press while already at a root screen (double-press
// to background pattern).
let lastRootBackAt = 0;
// After login the keyboard dismisses and Samsung often fires Back + resize.
// Block minimize for a grace window so the app never "closes" mid-login.
let loginGraceUntil = 0;

function markNavActivity() {
  lastNavActivityAt = Date.now();
}

/** Call right after a successful native login / password change. */
export function markNativeLoginGrace(ms = 5_000) {
  loginGraceUntil = Date.now() + ms;
  markNavActivity();
}

/** Patch history + popstate so any route change refreshes the nav timestamp. */
function installNavTracking(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const originalPush = window.history.pushState;
  const originalReplace = window.history.replaceState;

  window.history.pushState = function patchedPush(...args) {
    markNavActivity();
    return originalPush.apply(this, args as Parameters<typeof originalPush>);
  };
  window.history.replaceState = function patchedReplace(...args) {
    markNavActivity();
    return originalReplace.apply(this, args as Parameters<typeof originalReplace>);
  };
  window.addEventListener("popstate", markNavActivity);

  return () => {
    window.history.pushState = originalPush;
    window.history.replaceState = originalReplace;
    window.removeEventListener("popstate", markNavActivity);
  };
}

function isAppRootPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/dashboard" ||
    pathname === "/first-login" ||
    pathname === "/forgot-password"
  );
}

async function configureStatusBar() {
  if (!isNativeApp()) return;
  try {
    const dark = isDocumentDark();
    document.documentElement.classList.add("atd-native");
    // Overlay so the header background fills the status-bar region. The header
    // itself stays compact via clamped --atd-sat (never a full-screen top bar).
    if (getNativePlatform() === "android") {
      await StatusBar.setOverlaysWebView({ overlay: true });
    }
    await StatusBar.setBackgroundColor({ color: dark ? "#1a1f2a" : "#F6F8FC" });
    await StatusBar.setStyle({ style: dark ? Style.Light : Style.Dark });
  } catch {
    document.documentElement.classList.add("atd-native");
  }
}

/** Re-apply status-bar contrast after theme changes. */
export async function syncNativeChrome() {
  await configureStatusBar();
}

async function lockNativePortrait() {
  if (!isNativeApp() || !shouldLockNativePortrait()) return;
  try {
    await ScreenOrientation.lock({ orientation: "portrait" });
  } catch {
    // Some tablets / OEMs reject portrait lock; web guard remains.
  }
}

export async function hideNativeSplash(fadeOutDuration = 180) {
  if (!isNativeApp()) return;
  try {
    await SplashScreen.hide({ fadeOutDuration });
  } catch {
    // Ignore if splash already dismissed.
  }
}

/**
 * Boot native chrome once per app session: status bar, portrait lock, splash hide,
 * and resume handlers. Safe to call from the web root even when not native.
 */
export async function bootstrapNativeApp() {
  if (!isNativeApp()) return () => undefined;

  // Status bar first (cheap). Skip orientation lock on Android — OEM WebViews
  // (Samsung One UI) have crashed when lock races keyboard dismiss after login.
  try {
    await configureStatusBar();
  } catch {
    // continue boot
  }

  if (getNativePlatform() !== "android") {
    window.setTimeout(() => {
      void lockNativePortrait();
    }, 800);
  }

  // Safety-net only. AppOpenSplash hides the native splash, then plays the
  // lockup. If JS never reaches that component, reveal the WebView anyway.
  window.setTimeout(() => {
    void hideNativeSplash(200);
  }, 6_000);

  const resumeHandle = await CapApp.addListener("appStateChange", ({ isActive }) => {
    if (!isActive) return;
    markNavActivity();
    void configureStatusBar();
    if (getNativePlatform() !== "android") {
      window.setTimeout(() => {
        void lockNativePortrait();
      }, 1_200);
    }
  });

  // Track route changes so a Back event that lands immediately after login /
  // navigation can be recognised as spurious and ignored.
  const stopNavTracking = installNavTracking();

  // Track keyboard visibility. On Samsung One UI and other OEMs, dismissing the
  // soft keyboard (e.g. after tapping "Sign in") synthesizes a Back event. That
  // must only close the keyboard — never navigate or background the app.
  let keyboardVisible = false;
  let keyboardHiddenAt = 0;
  const kbShow = await Keyboard.addListener("keyboardWillShow", () => {
    keyboardVisible = true;
  }).catch(() => null);
  const kbHide = await Keyboard.addListener("keyboardWillHide", () => {
    keyboardVisible = false;
    keyboardHiddenAt = Date.now();
    markNavActivity();
  }).catch(() => null);
  // Android often only fires keyboardDid* (not Will*). Listen to both.
  const kbShowDid = await Keyboard.addListener("keyboardDidShow", () => {
    keyboardVisible = true;
  }).catch(() => null);
  const kbHideDid = await Keyboard.addListener("keyboardDidHide", () => {
    keyboardVisible = false;
    keyboardHiddenAt = Date.now();
    markNavActivity();
  }).catch(() => null);

  // Hardware / gesture Back. Never exitApp; only a deliberate Back at an app root
  // minimizes (like Home). Spurious Back from keyboard-dismiss or a fresh
  // navigation is swallowed so the app never "closes" right after login.
  const backHandle = await CapApp.addListener("backButton", ({ canGoBack }) => {
    const now = Date.now();

    // 0) Absolute grace after login — ignore all Back (including double-press).
    if (now < loginGraceUntil) return;

    // 1) Back that is really just the keyboard closing → ignore.
    if (keyboardVisible || now - keyboardHiddenAt < 1_500) return;

    // 2) Back that arrives right after a route change (login redirect, etc.) is an
    //    OEM artifact, not a user intent → ignore.
    if (now - lastNavActivityAt < 2_000) return;

    const pathname = window.location.pathname || "/";
    if (!isAppRootPath(pathname) && canGoBack) {
      window.history.back();
      return;
    }

    // At a root screen: require a deliberate double Back before backgrounding so a
    // single stray event can never drop the app to the background.
    if (now - lastRootBackAt < 2_000) {
      void CapApp.minimizeApp().catch(() => undefined);
      lastRootBackAt = 0;
      return;
    }
    lastRootBackAt = now;
  });

  return () => {
    void resumeHandle.remove();
    void backHandle.remove();
    stopNavTracking();
    void kbShow?.remove();
    void kbHide?.remove();
    void kbShowDid?.remove();
    void kbHideDid?.remove();
  };
}
