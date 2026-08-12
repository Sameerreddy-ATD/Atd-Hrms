// Self-heal for stale-deploy chunk failures.
//
// The native WebView has no service worker, so after a redeploy it can hold a
// cached index.html that references JS chunk hashes that no longer exist on the
// server. When a lazy route then imports that missing chunk it throws
// "Failed to fetch dynamically imported module" and the page (e.g. /dashboard
// right after login) breaks — which looks like the app "closing after login".
//
// When we detect that specific failure we force ONE cache-busting reload so the
// WebView fetches a fresh document that points at the current chunks.

const CHUNK_RELOAD_KEY = "adh_chunk_reload_at";
const RELOAD_COOLDOWN_MS = 20_000;

const CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /unable to preload css/i,
  /chunkloaderror/i,
  /loading chunk [\w-]+ failed/i,
  /failed to load module script/i,
];

function messageOf(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function isChunkLoadError(error: unknown): boolean {
  const message = messageOf(error);
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * If `error` is a stale-chunk failure, trigger a single cache-busting reload and
 * return true (the caller should stop — navigation is imminent). Otherwise false.
 */
export function recoverFromChunkError(error: unknown): boolean {
  if (typeof window === "undefined") return false;
  if (!isChunkLoadError(error)) return false;

  try {
    const last = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
    if (Number.isFinite(last) && Date.now() - last < RELOAD_COOLDOWN_MS) {
      // Already reloaded very recently — don't loop.
      return false;
    }
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    // sessionStorage blocked — still attempt the reload once.
  }

  const url = new URL(window.location.href);
  // A fresh query string bypasses a stale cached document in the native WebView.
  url.searchParams.set("_cb", String(Date.now()));
  window.location.replace(url.toString());
  return true;
}
