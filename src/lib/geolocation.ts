import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { preciseLocationRequiredHint } from "@/lib/device-permissions";

const CACHE_KEY = "atd.last-location";
const CACHE_MAX_AGE_MS = 15_000;
const NATIVE_GEO_TIMEOUT_MS = 10_000;

type CachedLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
};

function readCachedLocation() {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.sessionStorage.getItem(CACHE_KEY) ?? "null") as CachedLocation;
    return Date.now() - value.timestamp <= CACHE_MAX_AGE_MS ? value : null;
  } catch {
    return null;
  }
}

function cacheAndResolve(
  latitude: number,
  longitude: number,
  accuracy: number,
  timestamp: number,
  resolve: (position: GeolocationPosition) => void,
) {
  try {
    window.sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ latitude, longitude, accuracy, timestamp }),
    );
  } catch {
    // sessionStorage may be blocked — still return the fix.
  }
  resolve({
    coords: {
      latitude,
      longitude,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp,
  } as unknown as GeolocationPosition);
}

function getBrowserLocation(
  resolve: (position: GeolocationPosition) => void,
  reject: (reason?: unknown) => void,
) {
  if (!navigator.geolocation) {
    reject(new Error("Location is not supported on this device."));
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (position) => {
      cacheAndResolve(
        position.coords.latitude,
        position.coords.longitude,
        position.coords.accuracy,
        position.timestamp || Date.now(),
        resolve,
      );
    },
    reject,
    { enableHighAccuracy: true, timeout: 8_000, maximumAge: CACHE_MAX_AGE_MS },
  );
}

/**
 * Capacitor Geolocation.requestPermissions has crashed Samsung One UI WebViews.
 * Prefer the Chrome WebView geolocation API (still gated by the app manifest
 * ACCESS_FINE_LOCATION). Fall back to the plugin only if the browser path fails.
 */
async function getNativeDeviceLocation(
  resolve: (position: GeolocationPosition) => void,
  reject: (reason?: unknown) => void,
) {
  // 1) WebView path — safest on Samsung / Android 15+.
  const browserAttempt = await new Promise<"ok" | "fail">((done) => {
    if (!navigator.geolocation) {
      done("fail");
      return;
    }
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      done("fail");
    }, NATIVE_GEO_TIMEOUT_MS);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        cacheAndResolve(
          position.coords.latitude,
          position.coords.longitude,
          position.coords.accuracy,
          position.timestamp || Date.now(),
          resolve,
        );
        done("ok");
      },
      () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        done("fail");
      },
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: CACHE_MAX_AGE_MS },
    );
  });
  if (browserAttempt === "ok") return;

  // Samsung Galaxy S25 Ultra (Android 16): Capacitor Geolocation.checkPermissions
  // NPEs inside Bridge.getPermissionStates and kills the process. Never call it.
  if (Capacitor.getPlatform() === "android") {
    reject(Object.assign(new Error(preciseLocationRequiredHint()), { code: 1 }));
    return;
  }

  // 2) Capacitor plugin fallback (iOS only) — isolated so a plugin failure
  //    cannot become an unhandled rejection that tears down the WebView.
  try {
    const permission = await Promise.race([
      Geolocation.checkPermissions(),
      new Promise<never>((_, fail) =>
        window.setTimeout(() => fail(new Error("Location permission check timed out.")), 4_000),
      ),
    ]);
    // Fine/precise only — approximate (coarse) location cannot verify branch geofence.
    if (permission.location !== "granted") {
      const requested = await Promise.race([
        Geolocation.requestPermissions(),
        new Promise<never>((_, fail) =>
          window.setTimeout(
            () => fail(new Error("Location permission request timed out.")),
            15_000,
          ),
        ),
      ]);
      if (requested.location !== "granted") {
        reject(Object.assign(new Error(preciseLocationRequiredHint()), { code: 1 }));
        return;
      }
    }
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 8_000,
      maximumAge: CACHE_MAX_AGE_MS,
    });
    cacheAndResolve(
      position.coords.latitude,
      position.coords.longitude,
      position.coords.accuracy ?? 0,
      position.timestamp || Date.now(),
      resolve,
    );
  } catch (error) {
    reject(
      error instanceof Error
        ? error
        : Object.assign(new Error(preciseLocationRequiredHint()), { code: 1 }),
    );
  }
}

export function getDeviceLocation(options: { allowRecent?: boolean } = {}) {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (typeof navigator === "undefined") {
      reject(new Error("Location is not supported on this device."));
      return;
    }
    const cached = options.allowRecent === false ? null : readCachedLocation();
    if (cached) {
      resolve({
        coords: { ...cached, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
        timestamp: cached.timestamp,
      } as unknown as GeolocationPosition);
      return;
    }

    if (Capacitor.isNativePlatform()) {
      void getNativeDeviceLocation(resolve, reject);
      return;
    }

    getBrowserLocation(resolve, reject);
  });
}
