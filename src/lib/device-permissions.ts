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
  if (isNativeApp()) {
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      const permission = await withTimeout(Geolocation.checkPermissions(), 3_000, "Location check");
      if (permission.location === "granted" || permission.coarseLocation === "granted") {
        return "granted";
      }
      if (permission.location === "denied" || permission.coarseLocation === "denied") {
        return "denied";
      }
      return "prompt";
    } catch {
      return "prompt";
    }
  }
  if (!("geolocation" in navigator)) return "unsupported";
  return "prompt";
}

export async function readCameraPermission(): Promise<DevicePermissionState> {
  if ("permissions" in navigator) {
    try {
      const state = (await navigator.permissions.query({ name: "camera" as PermissionName })).state;
      if (state === "granted" || state === "denied" || state === "prompt") return state;
    } catch {
      // fall through
    }
  }
  if (isNativeApp()) {
    try {
      const { Camera } = await import("@capacitor/camera");
      const permission = await withTimeout(Camera.checkPermissions(), 3_000, "Camera check");
      if (permission.camera === "granted") return "granted";
      if (permission.camera === "denied") return "denied";
      return "prompt";
    } catch {
      return "prompt";
    }
  }
  if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
  return "prompt";
}

/**
 * Ensure camera access without relying on Capacitor Camera.requestPermissions,
 * which has crashed Samsung One UI WebViews. Prefer getUserMedia (WebView prompt).
 * Capacitor is only a best-effort pre-grant and never required for success.
 */
export async function requestNativeCameraPermission() {
  if (!isNativeApp()) return;

  // Soft Capacitor pre-grant — never throw from plugin failures.
  try {
    const { Camera } = await import("@capacitor/camera");
    const permission = await withTimeout(Camera.checkPermissions(), 3_000, "Camera check");
    if (permission.camera !== "granted") {
      await withTimeout(
        Camera.requestPermissions({ permissions: ["camera"] }),
        15_000,
        "Camera permission",
      );
    }
  } catch {
    // Continue — getUserMedia below is the real gate.
  }
}

export async function requestCameraAccess() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera is not supported on this device.");
  }
  if (!window.isSecureContext) {
    throw new Error("Camera needs HTTPS. Open the app with your secure domain.");
  }

  // Best-effort native pre-grant (isolated).
  await requestNativeCameraPermission().catch(() => undefined);

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user" },
    });
    stream.getTracks().forEach((track) => track.stop());
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      throw new Error(blockedPermissionHint("camera"));
    }
    throw error instanceof Error ? error : new Error("Camera could not start.");
  }
}

export function blockedPermissionHint(kind: "location" | "camera") {
  if (isNativeApp() && Capacitor.getPlatform() === "android") {
    return kind === "location"
      ? "Location is blocked. Open Settings → Apps → Anytime Workforce → Permissions and allow Location."
      : "Camera is blocked. Open Settings → Apps → Anytime Workforce → Permissions and allow Camera.";
  }
  return kind === "location"
    ? "Location is blocked. Enable it in this site’s settings, then return here."
    : "Camera is blocked. Enable it in this site’s settings, then return here.";
}
