import { API_BASE } from "@/services/api";

export function subscribeToAttendanceChanges(onChange: (date: string) => void) {
  if (typeof window === "undefined" || !("EventSource" in window)) return () => undefined;

  const stream = new EventSource(`${API_BASE}/attendance/stream`, { withCredentials: true });
  const handleChange = (event: MessageEvent<string>) => {
    try {
      const payload = JSON.parse(event.data) as { date?: string };
      onChange(payload.date ?? "");
    } catch {
      onChange("");
    }
  };
  stream.addEventListener("attendance", handleChange as EventListener);
  return () => {
    stream.removeEventListener("attendance", handleChange as EventListener);
    stream.close();
  };
}
