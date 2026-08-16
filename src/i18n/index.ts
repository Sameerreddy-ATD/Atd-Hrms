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

const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function isAppLocale(value: unknown): value is AppLocale {
  return value === "en" || value === "te" || value === "hi";
}

/** Pulls the locale out of a `document.cookie` or request `Cookie` string. */
export function readLocaleCookie(cookieHeader: string | null | undefined): AppLocale | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.split("=");
    if (name.trim() !== LOCALE_STORAGE_KEY) continue;
    const value = decodeURIComponent(rest.join("=").trim());
    return isAppLocale(value) ? value : null;
  }
  return null;
}

/**
 * The cookie is what lets the server render the reader's language. localStorage
 * is kept in step for the inline script in the document head, which sets the
 * lang attribute before any JavaScript bundle has loaded.
 */
function persistLocale(locale: AppLocale) {
  if (typeof document !== "undefined") {
    document.cookie = `${LOCALE_STORAGE_KEY}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
  }
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }
}

export function getStoredLocale(): AppLocale {
  const fromCookie = typeof document === "undefined" ? null : readLocaleCookie(document.cookie);
  if (fromCookie) return fromCookie;
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

/**
 * Prepares the browser to hydrate in `locale`, and writes the cookie so the
 * next request is server-rendered in it too. Called from the client entry
 * before hydration, which is what keeps the first client render identical to
 * the server markup.
 */
export async function prepareClientLocale(locale: AppLocale) {
  persistLocale(locale);
  applyDocumentLocale(locale);
  await loadLocale(locale);
  if (i18n.language !== locale) await i18n.changeLanguage(locale);
}

/**
 * Server-side rendering is concurrent, so the language cannot live on the
 * shared instance — a second request in another language would change it
 * mid-render. Each request renders through its own clone, which still reads
 * from the one resource store.
 */
export function i18nForLocale(locale: AppLocale) {
  if (typeof document !== "undefined") return i18n;
  return i18n.cloneInstance({ lng: locale });
}

export async function setAppLocale(locale: AppLocale) {
  await loadLocale(locale);
  persistLocale(locale);
  applyDocumentLocale(locale);
  await i18n.changeLanguage(locale);
}

export default i18n;
