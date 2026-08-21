import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { attendanceApi } from "@/services/api";
import {
  useAttendanceCurrent,
  type AttendanceCurrentState,
} from "@/hooks/useAttendanceCurrent";
import { cn } from "@/lib/utils";

function formatHm(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

function formatMinutes(m: number | null | undefined) {
  if (m == null) return "—";
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h}h ${String(min).padStart(2, "0")}m`;
}

function locationLabel(mode: string | null | undefined) {
  if (mode === "REGISTERED_LOCATION") return "Registered location";
  if (mode === "MOBILE_FIELD") return "Mobile / Field";
  return mode ?? "—";
}

type CurrentBundle = {
  state: AttendanceCurrentState | null;
  loading: boolean;
  error: string | null;
};

/** Compact Workday current-state card for Attendance mine / dashboard. */
export function AttendanceWorkdayCard({
  className,
  compact = false,
  hidePunchCta = false,
  current,
}: {
  className?: string;
  /** Shorter layout for dashboard punch chrome (state → action). */
  compact?: boolean;
  /** Hide dashboard punch link when CTAs live beside this card. */
  hidePunchCta?: boolean;
  /** Shared canonical state from a parent `useAttendanceCurrent` call. */
  current?: CurrentBundle;
}) {
  const local = useAttendanceCurrent({ enabled: current == null });
  const { state, loading, error } = current ?? local;

  if (loading && !state) {
    return (
      <div
        className={cn(
          "rounded-xl border border-border/60 bg-card p-4 text-sm text-muted-foreground",
          className,
        )}
        data-testid="workday-card-loading"
      >
        Loading workday…
      </div>
    );
  }

  if (error && !state) {
    return (
      <div className={cn("rounded-xl border border-destructive/40 p-4 text-sm", className)}>
        {error}
      </div>
    );
  }

  if (!state) return null;

  const scheduleLabel = state.scheduledShift?.explicitNoShift
    ? "No Shift"
    : state.scheduledShift?.shiftName
      ? state.scheduledShift.shiftName
      : state.scheduledShift
        ? "No shift assigned"
        : "—";

  const segmentLabel =
    state.scheduledShift?.segments
      ?.map((s) => `${formatHm(s.startAt)} – ${formatHm(s.endAt)}`)
      .join(" · ") || "—";

  const open = state.currentSession;
  const statusLabel = state.checkedIn ? "Checked In" : "Checked Out";

  return (
    <section
      className={cn(
        "min-w-0 max-w-full space-y-3 overflow-hidden rounded-xl border border-border/70 bg-card p-4 shadow-sm sm:space-y-4 sm:p-5",
        compact && "space-y-3 p-3 sm:p-4",
        className,
      )}
      data-testid="attendance-workday-card"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Today&apos;s Workday
          </p>
          <h2
            className={cn(
              "truncate font-semibold tracking-tight text-foreground",
              compact ? "text-base sm:text-lg" : "text-lg sm:text-xl",
            )}
          >
            {state.workDate ?? "—"}
          </h2>
          {!compact && (
            <>
              <p className="truncate text-sm text-muted-foreground">
                Shift: <span className="text-foreground">{scheduleLabel}</span>
              </p>
              <p className="truncate text-sm text-muted-foreground">
                Schedule: <span className="text-foreground">{segmentLabel}</span>
              </p>
            </>
          )}
          {compact && (
            <p className="truncate text-sm text-muted-foreground">
              {scheduleLabel}
              {state.nextExpectedAction
                ? ` · Next: ${state.nextExpectedAction === "CHECK_OUT" ? "Check Out" : "Check In"}`
                : ""}
            </p>
          )}
        </div>
        <div
          className={cn(
            "shrink-0 rounded-full px-3 py-1 text-xs font-semibold",
            state.checkedIn
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : "bg-muted text-muted-foreground",
          )}
        >
          {statusLabel}
        </div>
      </div>

      <div
        className={cn(
          "grid min-w-0 gap-3 text-sm",
          compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3",
        )}
      >
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Since</p>
          <p className="truncate font-medium">
            {formatHm(open?.checkInAt ?? state.firstCheckIn)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Worked</p>
          <p className="truncate font-medium">{formatMinutes(state.liveWorkedMinutes)}</p>
        </div>
        {!compact && (
          <div className="col-span-2 min-w-0 sm:col-span-1">
            <p className="text-xs text-muted-foreground">Location</p>
            <p className="truncate font-medium">
              {locationLabel(open?.checkInLocationMode ?? state.sessions.at(-1)?.checkInLocationMode)}
            </p>
          </div>
        )}
      </div>

      {!compact && (
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 text-sm text-muted-foreground">
            Next:{" "}
            <span className="font-medium text-foreground">
              {state.nextExpectedAction === "CHECK_OUT" ? "Check Out" : "Check In"}
            </span>
          </p>
          {!hidePunchCta && (
            <Link
              to="/dashboard"
              className="inline-flex h-11 min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground sm:w-auto"
              data-testid="workday-punch-cta"
            >
              {state.nextExpectedAction === "CHECK_OUT" ? "Check Out" : "Check In"}
            </Link>
          )}
        </div>
      )}

      {!compact && state.sessions.length > 0 && (
        <div className="space-y-2 border-t border-border/60 pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Sessions
          </p>
          <ul className="space-y-2">
            {state.sessions.map((session) => (
              <li
                key={session.sessionId}
                className="rounded-lg bg-muted/40 px-3 py-2 text-sm"
                data-testid={`workday-session-${session.sequence}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {session.sequence}. {formatHm(session.checkInAt)} →{" "}
                    {session.status === "OPEN" ? "Working now" : formatHm(session.checkOutAt)}
                  </span>
                  <span className="text-muted-foreground">
                    {session.status === "CLOSED"
                      ? formatMinutes(session.workedMinutes)
                      : "Open"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  In: {locationLabel(session.checkInLocationMode)}
                  {session.checkOutLocationMode
                    ? ` · Out: ${locationLabel(session.checkOutLocationMode)}`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!compact && state.scheduledShift?.explicitNoShift && state.sessions.length > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-300">Unscheduled attendance</p>
      )}

      {error && state && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Could not refresh — showing last known state.
        </p>
      )}
    </section>
  );
}

export function AttendanceWorkdayHistoryList() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof attendanceApi.workdaysMine>>>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void attendanceApi
      .workdaysMine()
      .then(setRows)
      .catch((err) => setError((err as Error).message));
  }, []);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!rows.length) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="workday-history-empty">
        No workday history yet. Legacy day logs remain available below.
      </p>
    );
  }

  return (
    <ul className="space-y-2" data-testid="workday-history-list">
      {rows.map((row) => (
        <li
          key={row.workdayId}
          className="flex flex-col gap-1 rounded-lg border border-border/60 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="font-medium">{row.workDate}</p>
            <p className="truncate text-sm text-muted-foreground">
              {row.explicitNoShift
                ? "No Shift"
                : row.shiftName || "No shift assigned"}{" "}
              · {row.sessionCount} session{row.sessionCount === 1 ? "" : "s"}
            </p>
          </div>
          <p className="text-sm font-medium">{formatMinutes(row.actualWorkedMinutes)}</p>
        </li>
      ))}
    </ul>
  );
}
