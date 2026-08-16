import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import { getStoredLocale, readLocaleCookie, type AppLocale } from "@/i18n";

/**
 * The language to render in, resolved the same way on both sides of hydration.
 *
 * The server reads the request cookie, the browser reads the same cookie back
 * out of `document.cookie`, so the markup React streams and the markup React
 * hydrates agree. When the preference lived only in localStorage the server had
 * no way to see it, always rendered English, and every visit in Telugu or Hindi
 * cost a full client re-render of the page (React hydration error #418).
 *
 * The `.server` body and its import are stripped from the browser bundle.
 */
export const resolveRequestLocale: () => AppLocale = createIsomorphicFn()
  .client(() => getStoredLocale())
  .server(() => readLocaleCookie(getRequestHeader("cookie")) ?? "en");
