import { keepSessionAlive } from "@/services/api";
import { isMaintenanceActive, subscribeMaintenance } from "@/lib/maintenance";

/**
 * EventSource does not run through fetch(), so a 15-minute access-cookie expiry
 * becomes a red console 401 and a dead live stream until reload.
 * Refresh the session, then reconnect with backoff.
 * While maintenance is active, pause reconnect storms until Try Again clears it.
 */
export function openCredentialedEventSource(
  url: string,
  eventName: string,
  onEvent: EventListener,
): () => void {
  if (typeof window === "undefined" || !("EventSource" in window)) return () => undefined;

  let closed = false;
  let stream: EventSource | null = null;
  let retryMs = 1_500;
  let timer: number | undefined;
  let pausedForMaintenance = isMaintenanceActive();

  const connect = () => {
    if (closed || pausedForMaintenance) return;
    stream = new EventSource(url, { withCredentials: true });
    stream.addEventListener(eventName, onEvent);
    stream.onopen = () => {
      retryMs = 1_500;
    };
    stream.onerror = () => {
      stream?.removeEventListener(eventName, onEvent);
      stream?.close();
      stream = null;
      if (closed || pausedForMaintenance) return;
      if (window.location.pathname.includes("/login")) return;
      if (isMaintenanceActive()) {
        pausedForMaintenance = true;
        return;
      }
      void keepSessionAlive().then((ok) => {
        if (closed || pausedForMaintenance || !ok) return;
        timer = window.setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, 60_000);
      });
    };
  };

  const unsubscribe = subscribeMaintenance((info) => {
    if (info.active) {
      pausedForMaintenance = true;
      if (timer) window.clearTimeout(timer);
      stream?.removeEventListener(eventName, onEvent);
      stream?.close();
      stream = null;
      return;
    }
    if (pausedForMaintenance) {
      pausedForMaintenance = false;
      retryMs = 1_500;
      connect();
    }
  });

  connect();

  return () => {
    closed = true;
    unsubscribe();
    if (timer) window.clearTimeout(timer);
    if (stream) {
      stream.removeEventListener(eventName, onEvent);
      stream.close();
      stream = null;
    }
  };
}
