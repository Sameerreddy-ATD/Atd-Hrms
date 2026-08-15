import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en";
import te from "./locales/te";
import hi from "./locales/hi";

export const LOCALES = ["en", "te", "hi"] as const;
export type AppLocale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<AppLocale, string> = {
  en: "English",
  te: "తెలుగు",
  hi: "हिंदी",
};

export const LOCALE_PREF_KEYS: Record<AppLocale, "preferences.english" | "preferences.telugu" | "preferences.hindi"> = {
  en: "preferences.english",
  te: "preferences.telugu",
  hi: "preferences.hindi",
};

export const LOCALE_STORAGE_KEY = "atd-locale";

export function isAppLocale(value: unknown): value is AppLocale {
  return value === "en" || value === "te" || value === "hi";
}

export function getStoredLocale(): AppLocale {
  if (typeof localStorage === "undefined") return "en";
  const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
  return isAppLocale(raw) ? raw : "en";
}

export function applyDocumentLocale(locale: AppLocale) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale === "te" ? "te" : locale === "hi" ? "hi" : "en";
  document.documentElement.dataset.locale = locale;
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    te: { translation: te },
    hi: { translation: hi },
  },
  lng: getStoredLocale(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

applyDocumentLocale(getStoredLocale());

export async function setAppLocale(locale: AppLocale) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }
  applyDocumentLocale(locale);
  await i18n.changeLanguage(locale);
}

export default i18n;
