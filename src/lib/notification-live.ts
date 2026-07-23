import { API_BASE } from "@/services/api";

export function subscribeToNotificationChanges(onChange: () => void) {
  if (typeof window === "undefined" || !("EventSource" in window)) return () => undefined;
  const stream = new EventSource(`${API_BASE}/notifications/stream`, { withCredentials: true });
  stream.addEventListener("notification", onChange);
  return () => {
    stream.removeEventListener("notification", onChange);
    stream.close();
  };
}
