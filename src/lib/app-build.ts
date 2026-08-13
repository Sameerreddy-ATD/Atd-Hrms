/** Bump this AND public/app-version.json together on each production deploy that must force-update installed apps. */
export const APP_BUILD_ID = "2026-08-13-mark-type";

/** Play package. Keep androidVersionCode in app-version.json in sync with android/app/build.gradle after each AAB goes live. */
export const PLAY_PACKAGE_ID = "com.anytimediesel.workforce";
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE_ID}`;

export type AppVersionManifest = {
  buildId?: string;
  forceReload?: boolean;
  androidVersionCode?: number;
  androidVersionName?: string;
  minAndroidVersionCode?: number;
  playStoreUrl?: string;
};

export async function fetchAppVersionManifest(): Promise<AppVersionManifest | null> {
  if (typeof window === "undefined") return null;
  try {
    const response = await fetch(`/app-version.json?_=${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    return (await response.json()) as AppVersionManifest;
  } catch {
    return null;
  }
}
