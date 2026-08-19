import { Capacitor } from "@capacitor/core";
import { isNativeApp } from "@/lib/native-app";

export type DevicePermissionState = "granted" | "denied" | "prompt" | "unsupported";

export function isMobileDeviceShell() {
  if (typeof window === "undefined") return false;
  if (isNativeApp()) return true;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  return coarse && window.innerWidth < 768;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      window.setTimeout(() => reject(new Error(`${label} timed out.`)), ms),
    ),
  ]);
}

export async function readLocationPermission(): Promise<DevicePermissionState> {
  // Prefer Permissions API / avoid Capacitor on native — checkPermissions has
  // crashed Samsung WebViews when called during route transitions.
  if ("permissions" in navigator) {
    try {
      const state = (await navigator.permissions.query({ name: "geolocation" })).state;
      if (state === "granted" || state === "denied" || state === "prompt") return state;
    } catch {
      // fall through
    }
  }
  // Do not call Capacitor Geolocation.checkPermissions on Android — it NPEs on
  // Samsung One UI (Android 16) inside Bridge.getPermissionStates.
  if (isNativeApp() && Capacitor.getPlatform() !== "android") {
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      const permission = await withTimeout(Geolocation.checkPermissions(), 3_000, "Location check");
      // Attendance requires precise (fine) location only — approximate/coarse is not enough.
      if (permission.location === "granted") return "granted";
      if (permission.location === "denied") return "denied";
      if (permission.coarseLocation === "granted") return "prompt";
      return "prompt";
    } catch {
      return "prompt";
    }
  }
  if (!("geolocation" in navigator)) return "unsupported";
  return "prompt";
}

export async function readCameraPermission(): Promise<DevicePermissionState> {
  // Prefer Permissions API only. Capacitor Camera.checkPermissions has crashed
  // Samsung One UI WebViews — never call it for status reads.
  if ("permissions" in navigator) {
    try {
      const state = (await navigator.permissions.query({ name: "camera" as PermissionName })).state;
      if (state === "granted" || state === "denied" || state === "prompt") return state;
    } catch {
      // fall through
    }
  }
  if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
  return "prompt";
}

/**
 * Face / check-in camera uses getUserMedia only.
 * Do NOT call Capacitor Camera.checkPermissions / requestPermissions — those
 * native bridges have killed Samsung One UI WebViews. Chrome WebView still
 * prompts via the app's CAMERA manifest permission.
 */
export async function requestNativeCameraPermission() {
  // Intentionally a no-op. Kept so call sites stay stable.
}

export async function requestCameraAccess() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera is not supported on this device.");
  }
  if (!window.isSecureContext) {
    throw new Error("Camera needs HTTPS. Open the app with your secure domain.");
  }

  try {
    // Probe with minimal constraints — some Android WebViews reject "ideal" shapes.
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user" },
      });
    } catch {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: true,
      });
    }
    stream.getTracks().forEach((track) => track.stop());
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      throw new Error(blockedPermissionHint("camera"));
    }
    throw error instanceof Error ? error : new Error("Camera could not start.");
  }
}

/** How to turn on Precise location (Android Approximate / iOS Precise off). */
export function preciseLocationRequiredHint() {
  if (isNativeApp() && Capacitor.getPlatform() === "android") {
    return "Precise location is required for attendance. Open Settings → Apps → Anytime Workforce → Permissions → Location and turn on Precise (not Approximate only).";
  }
  if (isNativeApp() && Capacitor.getPlatform() === "ios") {
    return "Precise Location is required for attendance. Open Settings → Anytime Workforce → Location and turn on Precise Location.";
  }
  return "Precise location is required for attendance. Allow precise/exact location for this site (not approximate), then try again.";
}

/** Timeout / GPS still warming — not the same as Precise being off. */
export function locationLockHint() {
  return "GPS is still locking. Stay on this screen near a window or outdoors, then try again. If Precise location is off, turn it on in App info → Permissions → Location.";
}

export function locationUnavailableHint() {
  return "Location could not be read. Turn on GPS, keep Precise location on, then try again.";
}

export function formatImpreciseLocationError(accuracyMeters: number, maxMeters: number) {
  const rounded = Math.round(accuracyMeters);
  return `Location accuracy is about ${rounded} m (need within ${maxMeters} m). ${preciseLocationRequiredHint()} Move outdoors or near a window if Precise is already on.`;
}

export function blockedPermissionHint(kind: "location" | "camera") {
  if (kind === "location") return preciseLocationRequiredHint();
  if (isNativeApp() && Capacitor.getPlatform() === "android") {
    return "Camera is blocked. Open Settings → Apps → Anytime Workforce → Permissions and allow Camera.";
  }
  return "Camera is blocked. Enable it in this site’s settings, then return here.";
}
