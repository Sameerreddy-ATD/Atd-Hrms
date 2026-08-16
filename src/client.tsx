import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";

import { getStoredLocale, prepareClientLocale } from "./i18n";

/**
 * Replaces the framework default entry purely to settle the language first.
 *
 * Telugu and Hindi are fetched on demand, so without this await React would
 * hydrate in English against markup the server rendered in the reader's
 * language, throw the whole tree away and build it again. Waiting costs one
 * small chunk that is already downloading alongside the main bundle, and only
 * for readers who are not on English.
 */
void prepareClientLocale(getStoredLocale()).then(() => {
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <StartClient />
      </StrictMode>,
    );
  });
});
