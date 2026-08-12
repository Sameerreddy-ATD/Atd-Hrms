import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

const CACHE_KEY = "atd.last-location";
const CACHE_MAX_AGE_MS = 15_000;

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
  window.sessionStorage.setItem(
    CACHE_KEY,
    JSON.stringify({ latitude, longitude, accuracy, timestamp }),
  );
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

async function getNativeDeviceLocation(
  resolve: (position: GeolocationPosition) => void,
  reject: (reason?: unknown) => void,
) {
  try {
    const permission = await Geolocation.checkPermissions();
    if (permission.location !== "granted" && permission.coarseLocation !== "granted") {
      const requested = await Geolocation.requestPermissions();
      if (requested.location !== "granted" && requested.coarseLocation !== "granted") {
        reject(Object.assign(new Error("Location permission was denied."), { code: 1 }));
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
    reject(error);
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
  });
}
