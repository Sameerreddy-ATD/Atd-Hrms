export type Theme = "light" | "dark";

function resolveLegacyTheme(stored: string | null): Theme {
  if (stored === "dark") return "dark";
  if (stored === "light") return "light";
  // Migrate old "system"/missing values to an explicit choice once.
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export function getTheme(): Theme {
  if (typeof localStorage === "undefined") return "light";
  return resolveLegacyTheme(localStorage.getItem("theme"));
}

export function isDarkTheme(theme: Theme = getTheme()) {
  return theme === "dark";
}

export function applyTheme() {
  if (typeof document === "undefined") return;
  const isDark = isDarkTheme();
  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.style.colorScheme = isDark ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", isDark ? "#1a1f2a" : "#F6F8FC");
  void import("@/lib/native-app")
    .then((native) => native.syncNativeChrome())
    .catch(() => undefined);
}

export function setTheme(theme: Theme) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem("theme", theme);
  applyTheme();
}

export function toggleTheme() {
  setTheme(getTheme() === "dark" ? "light" : "dark");
}

/** Keeps document classes in sync; no longer follows OS theme changes. */
export function watchSystemTheme() {
  if (typeof window === "undefined") return () => undefined;
  const current = getTheme();
  // Persist an explicit light/dark if the user still had "system" stored.
  setTheme(current);
  return () => undefined;
}
