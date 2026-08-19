import { API_BASE } from "@/services/api";
import { isNativeApp } from "@/lib/native-app";
import { openCredentialedEventSource } from "@/lib/sse-reconnect";

/**
 * Live attendance updates via SSE.
 * On native Android (esp. Samsung One UI), opening EventSource immediately after
 * login correlates with WebView process death ~2–4s later. Defer the stream and
 * fall back to a quiet poll until then.
 */
export function subscribeToAttendanceChanges(onChange: (date: string) => void) {
  if (typeof window === "undefined") return () => undefined;

  let closed = false;
  let stopStream: (() => void) | undefined;
  let pollTimer: number | undefined;
  let startTimer: number | undefined;

  const handleChange = (event: Event) => {
    const message = event as MessageEvent<string>;
    try {
      const payload = JSON.parse(message.data) as { date?: string };
      onChange(payload.date ?? "");
    } catch {
      onChange("");
    }
  };

  const startStream = () => {
    if (closed) return;
    stopStream = openCredentialedEventSource(
      `${API_BASE}/attendance/stream`,
      "attendance",
      handleChange,
    );
  };

  if (isNativeApp()) {
    pollTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") onChange("");
    }, 60_000);
    startTimer = window.setTimeout(startStream, 20_000);
  } else {
    startStream();
  }

  return () => {
    closed = true;
    if (pollTimer) window.clearInterval(pollTimer);
    if (startTimer) window.clearTimeout(startTimer);
    stopStream?.();
  };
}
