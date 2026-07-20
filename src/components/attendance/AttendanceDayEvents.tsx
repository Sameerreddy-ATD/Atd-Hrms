import { useCallback, useEffect, useState } from "react";
import { Clock3, Fingerprint, LogIn, LogOut, MapPin, Smartphone } from "lucide-react";
import { LoadingState } from "@/components/common/LoadingState";
import { attendanceApi } from "@/services/api";
import type { AttendanceTimelineEvent } from "@/mock/types";
import { captureSourceLabel, movementDirectionLabel } from "@/lib/attendance-labels";
import { subscribeToAttendanceChanges } from "@/lib/attendance-live";

type PunchSession = {
  punchIn?: AttendanceTimelineEvent;
  punchOut?: AttendanceTimelineEvent;
};

function pairPunches(events: AttendanceTimelineEvent[]) {
  const sessions: PunchSession[] = [];

  for (const event of events) {
    const direction = movementDirectionLabel(event.type);
    if (direction === "Out") {
      const openSession = [...sessions]
        .reverse()
        .find((session) => session.punchIn && !session.punchOut);
      if (openSession) openSession.punchOut = event;
      else sessions.push({ punchOut: event });
    } else {
      sessions.push({ punchIn: event });
    }
  }

  return sessions;
}

function formatTime(event?: AttendanceTimelineEvent) {
  if (!event) return "--:--:--";
  return new Date(event.time).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function SourceDetail({ event }: { event?: AttendanceTimelineEvent }) {
  if (!event) return <span className="text-muted-foreground">Not recorded</span>;
  const source = captureSourceLabel(event);
  const SourceIcon = source.startsWith("Biometric")
    ? Fingerprint
    : source.startsWith("Mobile")
      ? Smartphone
      : Clock3;

  return (
    <span className="flex min-w-0 items-start gap-1.5 break-words font-medium">
      <SourceIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {source}
    </span>
  );
}

function LocationDetail({ event }: { event?: AttendanceTimelineEvent }) {
  if (!event?.address && !(event?.latitude && event?.longitude)) {
    return <span className="text-muted-foreground">Not recorded</span>;
  }

  const coordinates = `${event.latitude}, ${event.longitude}`;
  const content = event.address ?? coordinates;
  const href =
    event.latitude && event.longitude
      ? `https://www.google.com/maps/search/?api=1&query=${event.latitude},${event.longitude}`
      : undefined;

  if (!href) return <span className="break-words font-medium">{content}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex min-w-0 items-start gap-1.5 break-words font-medium hover:text-primary"
    >
      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {content}
    </a>
  );
}

export function AttendanceDayEvents({
  employeeId,
  date,
  mine = false,
}: {
  employeeId: string;
  date: string;
  mine?: boolean;
}) {
  const [events, setEvents] = useState<AttendanceTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    const request = mine
      ? attendanceApi.myTimeline(date)
      : attendanceApi.teamTimeline(employeeId, date);
    request
      .then((rows) => setEvents([...rows].sort((a, b) => +new Date(a.time) - +new Date(b.time))))
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [date, employeeId, mine]);

  useEffect(() => void load(), [load]);

  useEffect(() => {
    if (!mine) return;
    return subscribeToAttendanceChanges((changedDate) => {
      if (changedDate === date) void load();
    });
  }, [date, load, mine]);

  if (loading) return <LoadingState label="Loading full-day punches" compact />;
  if (error)
    return <p className="rounded-md bg-destructive/5 p-3 text-sm text-destructive">{error}</p>;
  if (!events.length) {
    return (
      <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        No individual punch events were recorded for this date.
      </p>
    );
  }

  const sessions = pairPunches(events);

  return (
    <div className="relative ml-1 border-l-2 border-dashed border-border pl-3 sm:ml-4 sm:pl-5">
      {sessions.map((session, index) => (
        <section
          key={`${session.punchIn?.time ?? "out"}-${session.punchOut?.time ?? index}`}
          className="relative pb-3 last:pb-0"
          aria-label={`Attendance session ${index + 1}`}
        >
          <span className="absolute -left-3 top-7 h-px w-3 bg-border sm:-left-5 sm:w-5" />
          <span className="absolute -left-[18px] top-[23px] h-3 w-3 rounded-full border-2 border-background bg-primary sm:-left-[26px]" />
          <div className="overflow-hidden rounded-md border bg-background">
            <div className="grid grid-cols-2 divide-x border-b bg-muted/25">
              <div className="min-w-0 px-3 py-3 sm:px-4">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <LogIn className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> Punch in
                </p>
                <time className="mt-1 block text-sm font-semibold tabular-nums sm:text-base">
                  {formatTime(session.punchIn)}
                </time>
              </div>
              <div className="min-w-0 px-3 py-3 sm:px-4">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <LogOut className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" /> Punch out
                </p>
                <time className="mt-1 block text-sm font-semibold tabular-nums sm:text-base">
                  {formatTime(session.punchOut)}
                </time>
              </div>
            </div>
            <div className="grid grid-cols-2 text-xs sm:text-sm lg:grid-cols-4 lg:divide-x">
              <div className="min-w-0 border-b px-3 py-3 sm:px-4 lg:border-b-0">
                <p className="mb-1 text-xs text-muted-foreground">In source</p>
                <SourceDetail event={session.punchIn} />
              </div>
              <div className="min-w-0 border-b border-l px-3 py-3 sm:px-4 lg:border-b-0 lg:border-l-0">
                <p className="mb-1 text-xs text-muted-foreground">In location</p>
                <LocationDetail event={session.punchIn} />
              </div>
              <div className="min-w-0 px-3 py-3 sm:px-4">
                <p className="mb-1 text-xs text-muted-foreground">Out source</p>
                <SourceDetail event={session.punchOut} />
              </div>
              <div className="min-w-0 border-l px-3 py-3 sm:px-4 lg:border-l-0">
                <p className="mb-1 text-xs text-muted-foreground">Out location</p>
                <LocationDetail event={session.punchOut} />
              </div>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
