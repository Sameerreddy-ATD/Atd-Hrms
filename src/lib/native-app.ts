import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { ScreenOrientation } from "@capacitor/screen-orientation";

const BRAND_RED = "#dc2f20";

/** True when running inside the Capacitor Android/iOS shell. */
export function isNativeApp() {
  try {
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

async function configureStatusBar() {
  if (!isNativeApp()) return;
  try {
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: BRAND_RED });
    if (getNativePlatform() === "android") {
      await StatusBar.setOverlaysWebView({ overlay: false });
    }
  } catch {
    // Plugin may be unavailable on unsupported platforms.
  }
}

async function lockNativePortrait() {
  if (!isNativeApp()) return;
  try {
    await ScreenOrientation.lock({ orientation: "portrait" });
  } catch {
    // Some tablets ignore portrait lock; the web guard remains as fallback.
  }
}

async function hideSplashWhenReady() {
  if (!isNativeApp()) return;
  try {
    await SplashScreen.hide();
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

  await configureStatusBar();
  await lockNativePortrait();

  // Let the first paint settle, then drop the splash over the live web UI.
  window.setTimeout(() => {
    void hideSplashWhenReady();
  }, 400);

  const resumeHandle = await CapApp.addListener("appStateChange", ({ isActive }) => {
    if (!isActive) return;
    void configureStatusBar();
    void lockNativePortrait();
  });

  const backHandle = await CapApp.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
      return;
    }
    void CapApp.exitApp();
  });

  return () => {
    void resumeHandle.remove();
    void backHandle.remove();
  };
}
