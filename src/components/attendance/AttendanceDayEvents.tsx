import { useCallback, useEffect, useState } from "react";
import { Building2, Clock3, Fingerprint, MapPin, Smartphone } from "lucide-react";
import { LoadingState } from "@/components/common/LoadingState";
import { Badge } from "@/components/ui/badge";
import { attendanceApi } from "@/services/api";
import type { AttendanceTimelineEvent } from "@/mock/types";
import {
  captureSourceLabel,
  movementDirectionLabel,
  movementEventLabel,
} from "@/lib/attendance-labels";
import { subscribeToAttendanceChanges } from "@/lib/attendance-live";

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

  return (
    <div className="relative ml-3 border-l border-border pl-5 sm:ml-4 sm:pl-6">
      {events.map((event, index) => {
        const direction = movementDirectionLabel(event.type);
        const source = captureSourceLabel(event);
        const SourceIcon = source.startsWith("Biometric")
          ? Fingerprint
          : source.startsWith("Mobile")
            ? Smartphone
            : Clock3;
        return (
          <div key={`${event.time}-${event.type}-${index}`} className="relative pb-4 last:pb-0">
            <span
              className={`absolute -left-[31px] top-3 grid h-5 w-5 place-items-center rounded-full border-2 border-background sm:-left-[35px] ${
                direction === "In"
                  ? "bg-emerald-500"
                  : direction === "Out"
                    ? "bg-amber-500"
                    : "bg-primary"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
            </span>
            <div className="rounded-lg border bg-background p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{movementEventLabel(event)}</p>
                    {direction && (
                      <Badge variant="outline" className="text-xs">
                        {direction}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <SourceIcon className="h-3.5 w-3.5 shrink-0" />
                    {source}
                  </p>
                </div>
                <time className="rounded-md bg-muted px-2 py-1 text-sm font-semibold tabular-nums">
                  {new Date(event.time).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </time>
              </div>

              {(event.branchName || event.deviceName || event.clientName) && (
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  {event.branchName && (
                    <span className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5" /> {event.branchName}
                    </span>
                  )}
                  {event.deviceName && (
                    <span className="flex items-center gap-1.5">
                      <Fingerprint className="h-3.5 w-3.5" /> {event.deviceName}
                    </span>
                  )}
                  {event.clientName && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" /> {event.clientName}
                    </span>
                  )}
                </div>
              )}

              {(event.address || (event.latitude && event.longitude)) && (
                <a
                  href={
                    event.latitude && event.longitude
                      ? `https://www.google.com/maps/search/?api=1&query=${event.latitude},${event.longitude}`
                      : undefined
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 flex items-start gap-1.5 break-words rounded-md bg-muted/50 p-2 text-xs text-muted-foreground hover:text-primary"
                >
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {event.address ?? `${event.latitude}, ${event.longitude}`}
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
