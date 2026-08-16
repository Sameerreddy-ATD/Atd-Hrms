import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en";

export const LOCALES = ["en", "te", "hi"] as const;
export type AppLocale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<AppLocale, string> = {
  en: "English",
  te: "తెలుగు",
  hi: "हिंदी",
};

export const LOCALE_PREF_KEYS: Record<
  AppLocale,
  "preferences.english" | "preferences.telugu" | "preferences.hindi"
> = {
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

/**
 * Only English is bundled. Telugu and Hindi are fetched on demand, because
 * statically importing all three put every translation in the entry chunk —
 * around 75KB gzipped of the 214KB the login page downloads, two thirds of it
 * for languages the reader had not chosen.
 */
type TranslationTree = { readonly [key: string]: string | TranslationTree };

type LazyLocale = Exclude<AppLocale, "en">;

const LOCALE_LOADERS: Record<LazyLocale, () => Promise<{ default: TranslationTree }>> = {
  te: () => import("./locales/te"),
  hi: () => import("./locales/hi"),
};

const loadedLocales = new Set<AppLocale>(["en"]);
const inFlight = new Map<AppLocale, Promise<void>>();

/** Resolves once `locale` can be rendered without falling back to English. */
export function loadLocale(locale: AppLocale): Promise<void> {
  if (locale === "en" || loadedLocales.has(locale)) return Promise.resolve();
  const existing = inFlight.get(locale);
  if (existing) return existing;

  const pending = LOCALE_LOADERS[locale]()
    .then((module) => {
      i18n.addResourceBundle(locale, "translation", module.default, true, true);
      loadedLocales.add(locale);
    })
    .catch((error) => {
      // A failed chunk leaves English on screen rather than a blank app, and
      // the next attempt is allowed to retry.
      console.error(`Could not load the ${locale} translations`, error);
    })
    .finally(() => {
      inFlight.delete(locale);
    });

  inFlight.set(locale, pending);
  return pending;
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: getStoredLocale(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
  // Components re-read their strings when a language bundle arrives, which is
  // what turns the English first paint into the chosen language.
  react: { bindI18nStore: "added" },
});

applyDocumentLocale(getStoredLocale());

// Start the chosen language on its way before anything renders. Until it
// lands, i18next serves the bundled English through fallbackLng.
if (getStoredLocale() !== "en") void loadLocale(getStoredLocale());

export async function setAppLocale(locale: AppLocale) {
  await loadLocale(locale);
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }
  applyDocumentLocale(locale);
  await i18n.changeLanguage(locale);
}

export default i18n;
