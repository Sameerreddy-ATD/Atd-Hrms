import { keepSessionAlive } from "@/services/api";

/**
 * EventSource does not run through fetch(), so a 15-minute access-cookie expiry
 * becomes a red console 401 and a dead live stream until reload.
 * Refresh the session, then reconnect with backoff.
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

  const connect = () => {
    if (closed) return;
    stream = new EventSource(url, { withCredentials: true });
    stream.addEventListener(eventName, onEvent);
    stream.onopen = () => {
      retryMs = 1_500;
    };
    stream.onerror = () => {
      stream?.removeEventListener(eventName, onEvent);
      stream?.close();
      stream = null;
      if (closed) return;
      if (window.location.pathname.includes("/login")) return;
      void keepSessionAlive().finally(() => {
        if (closed) return;
        timer = window.setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, 30_000);
      });
    };
  };

  connect();

  return () => {
    closed = true;
    if (timer) window.clearTimeout(timer);
    if (stream) {
      stream.removeEventListener(eventName, onEvent);
      stream.close();
      stream = null;
    }
  };
}
