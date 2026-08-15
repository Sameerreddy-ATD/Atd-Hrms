import { APP_BUILD_ID } from "@/lib/app-build";
import { getNativePlatform, isNativeApp } from "@/lib/native-app";
import { recoverFromChunkError } from "@/lib/chunk-reload";
import { API_BASE } from "@/services/api";

// POST target. In production VITE_API_BASE_URL="/api" (nginx strips the prefix);
// in dev it points at the local API. credentials:"include" + keepalive send the
// Origin/Referer headers the backend CSRF guard requires.
const ENDPOINT = `${API_BASE}/client-logs`;

const DEDUPE_WINDOW_MS = 10_000;
const MAX_PER_WINDOW = 8;

const recentSignatures = new Map<string, number>();
let sentInWindow = 0;
let windowStartedAt = Date.now();
let reporting = false;

type ReportSource = "window.onerror" | "unhandledrejection" | "route-boundary" | "manual";
type BackendKind = "error" | "unhandledrejection" | "route-boundary" | "manual";

const KIND_BY_SOURCE: Record<ReportSource, BackendKind> = {
  "window.onerror": "error",
  unhandledrejection: "unhandledrejection",
  "route-boundary": "route-boundary",
  manual: "manual",
};

function shouldSend(signature: string): boolean {
  const now = Date.now();
  if (now - windowStartedAt > DEDUPE_WINDOW_MS) {
    windowStartedAt = now;
    sentInWindow = 0;
    recentSignatures.clear();
  }
  if (recentSignatures.has(signature)) return false;
  if (sentInWindow >= MAX_PER_WINDOW) return false;
  recentSignatures.set(signature, now);
  sentInWindow += 1;
  return true;
}

function normalizeError(value: unknown): { message: string; stack?: string } {
  if (value instanceof Error) return { message: value.message || value.name, stack: value.stack };
  if (typeof value === "string") return { message: value };
  try {
    return { message: JSON.stringify(value) };
  } catch {
    return { message: String(value) };
  }
}

function viewport(): string {
  try {
    return `${window.innerWidth}x${window.innerHeight}`;
  } catch {
    return "";
  }
}

/** Fire-and-forget report. Never throws, never blocks the UI. */
export function reportClientError(
  error: unknown,
  source: ReportSource = "manual",
  path?: string,
): void {
  if (typeof window === "undefined" || reporting) return;
  const { message, stack } = normalizeError(error);
  const signature = `${source}:${message}:${(stack ?? "").slice(0, 120)}`;
  if (!shouldSend(signature)) return;

  reporting = true;
  try {
    void fetch(ENDPOINT, {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: KIND_BY_SOURCE[source],
        message: message.slice(0, 2000),
        stack: stack?.slice(0, 8000),
        path: path ?? window.location.pathname,
        appBuildId: APP_BUILD_ID,
        platform: getNativePlatform(),
        isNative: isNativeApp(),
        userAgent: navigator.userAgent,
        viewport: viewport(),
        occurredAt: new Date().toISOString(),
      }),
    }).catch(() => undefined);
  } catch {
    // Reporting must never surface its own errors.
  } finally {
    reporting = false;
  }
}

let installed = false;

/** Install global JS error + promise-rejection listeners. Idempotent; call once from the root. */
export function installClientErrorReporter(): () => void {
  if (typeof window === "undefined" || installed) return () => undefined;
  installed = true;

  const onError = (event: ErrorEvent) => {
    const error = event.error ?? event.message;
    reportClientError(error, "window.onerror");
    // Stale-deploy chunk failure — heal by reloading fresh (esp. native WebView).
    recoverFromChunkError(error);
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    reportClientError(event.reason, "unhandledrejection");
    recoverFromChunkError(event.reason);
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    installed = false;
  };
}
