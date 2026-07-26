export type Theme = "light" | "dark" | "system";

export function getTheme(): Theme {
  if (typeof localStorage === "undefined") return "system";
  return (localStorage.getItem("theme") as Theme) || "system";
}

export function applyTheme() {
  if (typeof document === "undefined") return;
  const theme = getTheme();
  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.style.colorScheme = isDark ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", isDark ? "#1a1f2a" : "#dc2f20");
}

export function setTheme(theme: Theme) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem("theme", theme);
  applyTheme();
}

export function toggleTheme() {
  const current = getTheme();
  if (current === "light") {
    setTheme("dark");
  } else if (current === "dark") {
    setTheme("system");
  } else {
    setTheme("light");
  }
}

export function watchSystemTheme() {
  if (typeof window === "undefined") return () => undefined;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => {
    const theme = getTheme();
    if (theme === "system") {
      applyTheme();
    }
  };
  applyTheme();
  media.addEventListener("change", handler);
  return () => media.removeEventListener("change", handler);
}
