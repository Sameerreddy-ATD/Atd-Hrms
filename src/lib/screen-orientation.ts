import { detectPwaPlatform } from "@/lib/pwa-install";

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
};

/** True for phone-sized devices where the workforce app should stay portrait. */
export function shouldLockPortraitOrientation() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;

  const platform = detectPwaPlatform();
  const ua = navigator.userAgent;

  if (platform === "ios") {
    // iPhone / iPod only — iPad may be used in landscape for admin work.
    return /iPhone|iPod/i.test(ua);
  }

  if (platform === "android") {
    // Shortest physical side under ~600 CSS px ≈ phone, not tablet.
    const shortest = Math.min(window.screen.width || 0, window.screen.height || 0);
    return shortest > 0 && shortest < 600;
  }

  return false;
}

function getOrientationApi(): LockableOrientation | null {
  if (typeof window === "undefined") return null;
  return (window.screen?.orientation as LockableOrientation | undefined) ?? null;
}

/**
 * Ask the browser to keep the phone in upright portrait.
 * Safe to call repeatedly — failures are ignored (common outside installed PWAs).
 */
export function lockPortraitOrientation() {
  if (!shouldLockPortraitOrientation()) return;
  const orientation = getOrientationApi();
  if (!orientation?.lock) return;
  void orientation.lock("portrait-primary").catch(() => {
    // Some engines only accept the broader "portrait" token.
    void orientation.lock?.("portrait").catch(() => undefined);
  });
}

/**
 * Keep trying to hold portrait on phones: mount, resume, and after OS orientation flips.
 * Does not unlock — FaceCapture and route remounts must not release the lock.
 */
export function startPortraitOrientationLock() {
  if (!shouldLockPortraitOrientation()) {
    return () => undefined;
  }

  const apply = () => lockPortraitOrientation();
  apply();

  const onVisible = () => {
    if (document.visibilityState === "visible") apply();
  };

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("pageshow", apply);
  window.addEventListener("focus", apply);
  window.addEventListener("orientationchange", apply);
  getOrientationApi()?.addEventListener?.("change", apply);

  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("pageshow", apply);
    window.removeEventListener("focus", apply);
    window.removeEventListener("orientationchange", apply);
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
