import { useCallback, useEffect, useState } from "react";
import { attendanceApi } from "@/services/api";
import { subscribeToAttendanceChanges } from "@/lib/attendance-live";

export type AttendanceCurrentState = Awaited<ReturnType<typeof attendanceApi.current>>;

const REFRESH_INTERVAL_MS = 45_000;

export function useAttendanceCurrent(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const [state, setState] = useState<AttendanceCurrentState | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const next = await attendanceApi.current();
      setState(next);
      setError(null);
    } catch (err) {
      // Keep last good state on refresh failures (including network); only set error.
      const message = err instanceof Error ? err.message : "Unable to load attendance";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const run = () => {
      if (!cancelled) void refresh();
    };

    run();

    const unsub = subscribeToAttendanceChanges(() => run());
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    const onFocus = () => run();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(run, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      unsub();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
    };
  }, [enabled, refresh]);

  return { state, loading, error, refresh };
}
