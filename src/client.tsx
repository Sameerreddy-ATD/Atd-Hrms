import "@/lib/array-at-polyfill";
import { installResizeObserverLoopFix } from "@/lib/resize-observer-fix";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";

import {
  hydrateToServerLocale,
  readHydrationLocale,
  readStoredLocalePreference,
  setAppLocale,
} from "./i18n";

installResizeObserverLoopFix();

/**
 * Replaces the framework default entry purely to settle the language first.
 *
 * Hydrate in the cookie language the server used. A localStorage-only
 * preference is applied after hydrate so React #418 does not fire.
 */
void hydrateToServerLocale(readHydrationLocale()).then(() => {
  const hydrated = readHydrationLocale();
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <StartClient />
      </StrictMode>,
    );
  });
  const preferred = readStoredLocalePreference();
  if (preferred && preferred !== hydrated) {
    window.setTimeout(() => {
      void setAppLocale(preferred);
    }, 0);
  }
});
