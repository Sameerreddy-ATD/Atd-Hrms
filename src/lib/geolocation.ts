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

export function getDeviceLocation(options: { allowRecent?: boolean } = {}) {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
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
    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.sessionStorage.setItem(
          CACHE_KEY,
          JSON.stringify({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp || Date.now(),
          }),
        );
        resolve(position);
      },
      reject,
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: CACHE_MAX_AGE_MS },
    );
  });
}
