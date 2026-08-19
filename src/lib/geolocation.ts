import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import {
  locationLockHint,
  locationUnavailableHint,
  preciseLocationRequiredHint,
} from "@/lib/device-permissions";

const CACHE_KEY = "atd.last-location";
const CACHE_MAX_AGE_MS = 15_000;
const WATCH_BUDGET_MS = 18_000;
const GOOD_ACCURACY_METERS = 80;

type CachedLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
};

export function locationErrorFromGeolocationFailure(error: unknown): Error & { code: number } {
  const code =
    error && typeof error === "object" && "code" in error
      ? Number((error as { code: unknown }).code)
      : 0;
  if (code === 1) {
    return Object.assign(new Error(preciseLocationRequiredHint()), { code: 1 });
  }
  if (code === 3) {
    return Object.assign(new Error(locationLockHint()), { code: 3 });
  }
  return Object.assign(new Error(locationUnavailableHint()), { code: code || 2 });
}

function readCachedLocation() {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.sessionStorage.getItem(CACHE_KEY) ?? "null") as CachedLocation;
    return Date.now() - value.timestamp <= CACHE_MAX_AGE_MS ? value : null;
  } catch {
    return null;
  }
}

function asGeolocationPosition(
  latitude: number,
  longitude: number,
  accuracy: number,
  timestamp: number,
): GeolocationPosition {
  return {
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
  } as unknown as GeolocationPosition;
}

function cachePosition(position: GeolocationPosition) {
  try {
    window.sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp || Date.now(),
      }),
    );
  } catch {
    // sessionStorage may be blocked — still return the fix.
  }
}

function fromBrowserPosition(position: GeolocationPosition) {
  const next = asGeolocationPosition(
    position.coords.latitude,
    position.coords.longitude,
    position.coords.accuracy,
    position.timestamp || Date.now(),
  );
  cachePosition(next);
  return next;
}

function getCurrentPositionOnce(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location is not supported on this device."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(fromBrowserPosition(position)),
      reject,
      options,
    );
  });
}

function watchForFix(budgetMs: number): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location is not supported on this device."));
      return;
    }
    let best: GeolocationPosition | null = null;
    let settled = false;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const next = fromBrowserPosition(position);
        if (!best || next.coords.accuracy < best.coords.accuracy) best = next;
        if (next.coords.accuracy <= GOOD_ACCURACY_METERS) finish(next);
      },
      (error) => {
        if (best) {
          finish(best);
          return;
        }
        fail(error);
      },
      { enableHighAccuracy: true, timeout: budgetMs, maximumAge: 0 },
    );
    const timer = window.setTimeout(() => {
      if (best) finish(best);
      else fail(Object.assign(new Error(locationLockHint()), { code: 3 }));
    }, budgetMs);

    function finish(position: GeolocationPosition) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      navigator.geolocation.clearWatch(watchId);
      resolve(position);
    }
    function fail(error: unknown) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      navigator.geolocation.clearWatch(watchId);
      reject(error);
    }
  });
}

/**
 * Capacitor Geolocation.requestPermissions has crashed Samsung One UI WebViews.
 * Prefer the Chrome WebView geolocation API (still gated by the app manifest
 * ACCESS_FINE_LOCATION). Fall back to the plugin only if the browser path fails.
 */
async function getNativeDeviceLocation(): Promise<GeolocationPosition> {
  let firstFix: GeolocationPosition | null = null;
  try {
    firstFix = await getCurrentPositionOnce({
      enableHighAccuracy: true,
      timeout: 12_000,
      maximumAge: CACHE_MAX_AGE_MS,
    });
    if (firstFix.coords.accuracy <= GOOD_ACCURACY_METERS) return firstFix;
  } catch (firstError) {
    const code =
      firstError && typeof firstError === "object" && "code" in firstError
        ? Number((firstError as { code: unknown }).code)
        : 0;
    // Permission really denied — don't keep prompting as if GPS is only slow.
    if (code === 1) throw locationErrorFromGeolocationFailure(firstError);
  }

  try {
    const watched = await watchForFix(WATCH_BUDGET_MS);
    if (!firstFix || watched.coords.accuracy <= firstFix.coords.accuracy) return watched;
    return firstFix;
  } catch (watchError) {
    if (firstFix) return firstFix;
    if (Capacitor.getPlatform() === "android") {
      throw locationErrorFromGeolocationFailure(watchError);
    }
  }

  // iOS only — Capacitor Geolocation.checkPermissions NPEs on Samsung Android.
  try {
    const permission = await Promise.race([
      Geolocation.checkPermissions(),
      new Promise<never>((_, fail) =>
        window.setTimeout(() => fail(new Error("Location permission check timed out.")), 4_000),
      ),
    ]);
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
        throw Object.assign(new Error(preciseLocationRequiredHint()), { code: 1 });
      }
    }
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 8_000,
      maximumAge: CACHE_MAX_AGE_MS,
    });
    const next = asGeolocationPosition(
      position.coords.latitude,
      position.coords.longitude,
      position.coords.accuracy ?? 0,
      position.timestamp || Date.now(),
    );
    cachePosition(next);
    return next;
  } catch (error) {
    throw locationErrorFromGeolocationFailure(error);
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
      resolve(
        asGeolocationPosition(
          cached.latitude,
          cached.longitude,
          cached.accuracy,
          cached.timestamp,
        ),
      );
      return;
    }

    if (Capacitor.isNativePlatform()) {
      void getNativeDeviceLocation().then(resolve, reject);
      return;
    }

    getCurrentPositionOnce({
      enableHighAccuracy: true,
      timeout: 12_000,
      maximumAge: CACHE_MAX_AGE_MS,
    }).then(resolve, (error) => {
      const code =
        error && typeof error === "object" && "code" in error
          ? Number((error as { code: unknown }).code)
          : 0;
      if (code === 1) {
        reject(locationErrorFromGeolocationFailure(error));
        return;
      }
      void watchForFix(WATCH_BUDGET_MS).then(resolve, (watchError) =>
        reject(locationErrorFromGeolocationFailure(watchError)),
      );
    });
  });
}
