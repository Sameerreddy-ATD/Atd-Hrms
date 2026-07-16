import { useCallback, useEffect, useState } from "react";
import { Building2, Clock3, Fingerprint, MapPin, Smartphone } from "lucide-react";
import { LoadingState } from "@/components/common/LoadingState";
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
    <div className="relative ml-2 border-l-2 border-dashed border-border pl-4 sm:ml-5 sm:pl-6">
      {events.map((event, index) => {
        const direction = movementDirectionLabel(event.type);
        const source = captureSourceLabel(event);
        const SourceIcon = source.startsWith("Biometric")
          ? Fingerprint
          : source.startsWith("Mobile")
            ? Smartphone
            : Clock3;
        return (
          <div key={`${event.time}-${event.type}-${index}`} className="relative pb-2.5 last:pb-0">
            <span className="absolute -left-4 top-7 h-px w-4 bg-border sm:-left-6 sm:w-6" />
            <span
              className={`absolute -left-[21px] top-[23px] grid h-3 w-3 place-items-center rounded-full border-2 border-background sm:-left-[29px] ${
                direction === "In"
                  ? "bg-emerald-500"
                  : direction === "Out"
                    ? "bg-amber-500"
                    : "bg-primary"
              }`}
            ></span>
            <div className="rounded-md border bg-background px-3 py-3 sm:px-4">
              <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4 lg:grid-cols-5">
                <div className="col-span-2 min-w-0 sm:col-span-1">
                  <p className="text-xs text-muted-foreground">Punch</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold">
                    {direction === "In" ? (
                      <span className="text-emerald-600">→</span>
                    ) : direction === "Out" ? (
                      <span className="text-amber-600">→</span>
                    ) : (
                      <Clock3 className="h-3.5 w-3.5" />
                    )}
                    {movementEventLabel(event)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Time</p>
                  <time className="mt-0.5 block text-sm font-semibold tabular-nums">
                    {new Date(event.time).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </time>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Source</p>
                  <p className="mt-0.5 flex items-center gap-1.5 break-words text-sm font-medium">
                    <SourceIcon className="h-3.5 w-3.5 shrink-0" /> {source}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Branch / device</p>
                  <p className="mt-0.5 flex items-center gap-1.5 break-words text-sm font-medium">
                    {event.deviceName ? (
                      <Fingerprint className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <Building2 className="h-3.5 w-3.5 shrink-0" />
                    )}
                    {event.branchName ?? event.deviceName ?? event.clientName ?? "-"}
                  </p>
                </div>
                <div className="col-span-2 min-w-0 sm:col-span-4 lg:col-span-1">
                  <p className="text-xs text-muted-foreground">Location</p>
                  {event.address || (event.latitude && event.longitude) ? (
                    <a
                      href={
                        event.latitude && event.longitude
                          ? `https://www.google.com/maps/search/?api=1&query=${event.latitude},${event.longitude}`
                          : undefined
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 flex items-start gap-1.5 break-words text-sm font-medium hover:text-primary"
                    >
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {event.address ?? `${event.latitude}, ${event.longitude}`}
                    </a>
                  ) : (
                    <p className="mt-0.5 text-sm font-medium">-</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
