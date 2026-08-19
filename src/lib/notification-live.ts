import { API_BASE } from "@/services/api";
import { isNativeApp } from "@/lib/native-app";
import { openCredentialedEventSource } from "@/lib/sse-reconnect";

/**
 * Live notification updates via SSE.
 * Deferred on native — see attendance-live.ts for why (Samsung WebView process death).
 */
export function subscribeToNotificationChanges(onChange: () => void) {
  if (typeof window === "undefined") return () => undefined;

  let closed = false;
  let stopStream: (() => void) | undefined;
  let startTimer: number | undefined;

  const startStream = () => {
    if (closed) return;
    stopStream = openCredentialedEventSource(
      `${API_BASE}/notifications/stream`,
      "notification",
      onChange,
    );
  };

  if (isNativeApp()) {
    startTimer = window.setTimeout(startStream, 20_000);
  } else {
    startStream();
  }

  return () => {
    closed = true;
    if (startTimer) window.clearTimeout(startTimer);
    stopStream?.();
  };
}
