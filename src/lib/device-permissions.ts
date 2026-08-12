import { Capacitor } from "@capacitor/core";
import { isNativeApp } from "@/lib/native-app";

export type DevicePermissionState = "granted" | "denied" | "prompt" | "unsupported";

export function isMobileDeviceShell() {
  if (typeof window === "undefined") return false;
  if (isNativeApp()) return true;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  return coarse && window.innerWidth < 768;
}

export async function readLocationPermission(): Promise<DevicePermissionState> {
  if (isNativeApp()) {
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      const permission = await Geolocation.checkPermissions();
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
  if (!("permissions" in navigator)) return "prompt";
  try {
    return (await navigator.permissions.query({ name: "geolocation" })).state;
  } catch {
    return "prompt";
  }
}

export async function readCameraPermission(): Promise<DevicePermissionState> {
  if (isNativeApp()) {
    try {
      const { Camera } = await import("@capacitor/camera");
      const permission = await Camera.checkPermissions();
      if (permission.camera === "granted") return "granted";
      if (permission.camera === "denied") return "denied";
      return "prompt";
    } catch {
      return "prompt";
    }
  }
  if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
  if (!("permissions" in navigator)) return "prompt";
  try {
    return (await navigator.permissions.query({ name: "camera" as PermissionName })).state;
  } catch {
    return "prompt";
  }
}

export async function requestNativeCameraPermission() {
  if (!isNativeApp()) return;
  const { Camera } = await import("@capacitor/camera");
  let permission = await Camera.checkPermissions();
  if (permission.camera === "granted") return;
  permission = await Camera.requestPermissions({ permissions: ["camera"] });
  if (permission.camera !== "granted") {
    throw new Error(
      Capacitor.getPlatform() === "android"
        ? "Camera is blocked. Open Settings → Apps → Anytime Workforce → Permissions and allow Camera."
        : "Camera permission was not granted.",
    );
  }
}

export async function requestCameraAccess() {
  await requestNativeCameraPermission();
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera is not supported on this device.");
  }
  if (!window.isSecureContext) {
    throw new Error("Camera needs HTTPS. Open the app with your secure domain.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: "user" },
  });
  stream.getTracks().forEach((track) => track.stop());
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
