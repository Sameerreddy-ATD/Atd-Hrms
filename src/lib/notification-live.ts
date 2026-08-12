import { API_BASE } from "@/services/api";
import { isNativeApp } from "@/lib/native-app";

/**
 * Live notification updates via SSE.
 * Deferred on native — see attendance-live.ts for why (Samsung WebView process death).
 */
export function subscribeToNotificationChanges(onChange: () => void) {
  if (typeof window === "undefined") return () => undefined;

  let closed = false;
  let stream: EventSource | null = null;
  let startTimer: number | undefined;

  const startStream = () => {
    if (closed || !("EventSource" in window)) return;
    stream = new EventSource(`${API_BASE}/notifications/stream`, { withCredentials: true });
    stream.addEventListener("notification", onChange);
  };

  if (isNativeApp()) {
    startTimer = window.setTimeout(startStream, 20_000);
  } else if ("EventSource" in window) {
    startStream();
  }

  return () => {
    closed = true;
    if (startTimer) window.clearTimeout(startTimer);
    if (stream) {
      stream.removeEventListener("notification", onChange);
      stream.close();
    }
  };
}
