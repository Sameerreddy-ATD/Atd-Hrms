import { App as CapApp } from "@capacitor/app";
import { fetchAppVersionManifest, PLAY_STORE_URL, type AppVersionManifest } from "@/lib/app-build";
import { getNativePlatform, isNativeApp } from "@/lib/native-app";

export type StoreUpdateStatus = {
  needed: boolean;
  required: boolean;
  installedVersion: string;
  installedBuild: number;
  latestVersion: string;
  latestBuild: number;
  playStoreUrl: string;
};

function parseBuild(value: string | undefined) {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) ? n : 0;
}

export async function checkNativeStoreUpdate(): Promise<StoreUpdateStatus | null> {
  if (typeof window === "undefined") return null;
  if (!isNativeApp() || getNativePlatform() !== "android") return null;

  let installedVersion = "";
  let installedBuild = 0;
  try {
    const info = await CapApp.getInfo();
    installedVersion = info.version || "";
    installedBuild = parseBuild(info.build);
  } catch {
    return null;
  }
  if (!installedBuild) return null;

  const remote: AppVersionManifest | null = await fetchAppVersionManifest();
  const latestBuild = remote?.androidVersionCode;
  if (!latestBuild || installedBuild >= latestBuild) return null;

  const minBuild = remote.minAndroidVersionCode ?? latestBuild;
  return {
    needed: true,
    required: installedBuild < minBuild,
    installedVersion,
    installedBuild,
    latestVersion: remote.androidVersionName || String(latestBuild),
    latestBuild,
    playStoreUrl: remote.playStoreUrl || PLAY_STORE_URL,
  };
}

export function openPlayStoreListing(httpsUrl = PLAY_STORE_URL) {
  if (typeof window === "undefined") return;
  const link = document.createElement("a");
  link.href = httpsUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
