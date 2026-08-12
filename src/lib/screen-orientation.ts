import { detectPwaPlatform } from "@/lib/pwa-install";
import { isNativeApp, getNativePlatform } from "@/lib/native-app";
import { ScreenOrientation as CapScreenOrientation } from "@capacitor/screen-orientation";

type LockableOrientation = globalThis.ScreenOrientation & {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
};

/**
 * Phone-sized viewport where portrait lock applies.
 * Prefer layout viewport (innerWidth) so foldables / split-screen reclassify correctly.
 */
function shortestLayoutSide() {
  if (typeof window === "undefined") return 0;
  const w = window.innerWidth || window.screen?.width || 0;
  const h = window.innerHeight || window.screen?.height || 0;
  return Math.min(w, h);
}

/** True for phone-sized devices where the workforce app should stay portrait. */
export function shouldLockPortraitOrientation() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;

  // Tablets / unfolded foldables / wide split-screen: allow landscape admin work.
  if (window.matchMedia("(min-width: 600px)").matches) return false;

  if (isNativeApp()) {
    const platform = getNativePlatform();
    if (platform === "ios") {
      return /iPhone|iPod/i.test(navigator.userAgent);
    }
    if (platform === "android") {
      const shortest = shortestLayoutSide();
      return shortest > 0 && shortest < 600;
    }
  }

  const platform = detectPwaPlatform();
  const ua = navigator.userAgent;

  if (platform === "ios") {
    return /iPhone|iPod/i.test(ua);
  }

  if (platform === "android") {
    const shortest = shortestLayoutSide();
    return shortest > 0 && shortest < 600;
  }

  return false;
}

function getOrientationApi(): LockableOrientation | null {
  if (typeof window === "undefined") return null;
  return (window.screen?.orientation as LockableOrientation | undefined) ?? null;
}

/**
 * Ask the browser / native shell to keep the phone in upright portrait.
 * Safe to call repeatedly — failures are ignored (common outside installed PWAs).
 */
export function lockPortraitOrientation() {
  if (!shouldLockPortraitOrientation()) {
    if (isNativeApp()) {
      void CapScreenOrientation.unlock().catch(() => undefined);
    }
    return;
  }
  if (isNativeApp()) {
    void CapScreenOrientation.lock({ orientation: "portrait" }).catch(() => undefined);
    return;
  }
  const orientation = getOrientationApi();
  if (!orientation?.lock) return;
  void orientation.lock("portrait-primary").catch(() => {
    void orientation.lock?.("portrait").catch(() => undefined);
  });
}

/**
 * Keep trying to hold portrait on phones: mount, resume, fold/unfold, and orientation flips.
 */
export function startPortraitOrientationLock() {
  const apply = () => lockPortraitOrientation();
  // Defer the very first native lock: locking during cold start crashes some
  // Android 12–15 OEM WebView builds (mirrors bootstrapNativeApp's delay). Later
  // resume/rotation events still re-lock immediately, which is safe post-boot.
  if (isNativeApp()) {
    window.setTimeout(apply, 900);
  } else {
    apply();
  }

  const onVisible = () => {
    if (document.visibilityState === "visible") apply();
  };

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("pageshow", apply);
  window.addEventListener("focus", apply);
  window.addEventListener("orientationchange", apply);
  window.addEventListener("resize", apply);
  getOrientationApi()?.addEventListener?.("change", apply);

  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("pageshow", apply);
    window.removeEventListener("focus", apply);
    window.removeEventListener("orientationchange", apply);
    window.removeEventListener("resize", apply);
    getOrientationApi()?.removeEventListener?.("change", apply);
  };
}

/** Phone is currently showing a landscape viewport (lock API unavailable or ignored). */
export function isPhoneLandscapeViewport() {
  if (!shouldLockPortraitOrientation()) return false;
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(orientation: landscape)").matches) return true;
  return window.innerWidth > window.innerHeight;
}
