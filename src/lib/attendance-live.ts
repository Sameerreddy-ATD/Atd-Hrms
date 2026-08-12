import { API_BASE } from "@/services/api";
import { isNativeApp } from "@/lib/native-app";

/**
 * Live attendance updates via SSE.
 * On native Android (esp. Samsung One UI), opening EventSource immediately after
 * login correlates with WebView process death ~2–4s later. Defer the stream and
 * fall back to a quiet poll until then.
 */
export function subscribeToAttendanceChanges(onChange: (date: string) => void) {
  if (typeof window === "undefined") return () => undefined;

  let closed = false;
  let stream: EventSource | null = null;
  let pollTimer: number | undefined;
  let startTimer: number | undefined;

  const handleChange = (event: MessageEvent<string>) => {
    try {
      const payload = JSON.parse(event.data) as { date?: string };
      onChange(payload.date ?? "");
    } catch {
      onChange("");
    }
  };

  const startStream = () => {
    if (closed || !("EventSource" in window)) return;
    stream = new EventSource(`${API_BASE}/attendance/stream`, { withCredentials: true });
    stream.addEventListener("attendance", handleChange as EventListener);
  };

  if (isNativeApp()) {
    // Keep UI fresh without SSE during the fragile post-login window.
    pollTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") onChange("");
    }, 60_000);
    startTimer = window.setTimeout(startStream, 20_000);
  } else if ("EventSource" in window) {
    startStream();
  }

  return () => {
    closed = true;
    if (pollTimer) window.clearInterval(pollTimer);
    if (startTimer) window.clearTimeout(startTimer);
    if (stream) {
      stream.removeEventListener("attendance", handleChange as EventListener);
      stream.close();
    }
  };
}
