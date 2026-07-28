import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { attendanceApi } from "@/services/api";
import type { AttendanceTimelineEvent } from "@/types/domain";
import {
  movementDirectionLabel,
  movementEventLabel,
  movementSourceLabel,
  captureSourceLabel,
} from "@/lib/attendance-labels";
import { formatWorkedTime } from "@/lib/worked-time";
import {
  Fingerprint,
  MapPin,
  Clock,
  Camera,
  Calendar,
  ExternalLink,
  Loader2,
  Building,
} from "lucide-react";

export interface AttendanceTimelineSheetProps {
  employeeId: string;
  employeeName: string;
  date: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AttendanceTimelineSheet({
  employeeId,
  employeeName,
  date,
  open,
  onOpenChange,
}: AttendanceTimelineSheetProps) {
  const [events, setEvents] = useState<AttendanceTimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !employeeId) return;

    setLoading(true);
    setError("");
    attendanceApi
      .teamTimeline(employeeId, date)
      .then((data) => {
        setEvents([...data].sort((a, b) => +new Date(b.time) - +new Date(a.time)));
      })
      .catch((err) => {
        setError((err as Error).message || "Failed to load timeline events.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open, employeeId, date]);

  // Utility to format time
  function formatTime(timeStr: string) {
    try {
      const d = new Date(timeStr);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return timeStr;
    }
  }

  // Calculate duration between events
  function getDurationLabel(t1: string, t2: string) {
    try {
      const d1 = new Date(t1);
      const d2 = new Date(t2);
      const diffMs = d2.getTime() - d1.getTime();
      if (diffMs <= 0) return "";
      return formatWorkedTime(diffMs);
    } catch {
      return "";
    }
  }

  // Determine icon & color based on event type & source
  function getEventStyles(event: AttendanceTimelineEvent) {
    const type = event.type?.toUpperCase() ?? "";
    const source = event.source?.toUpperCase() ?? "";

    if (source === "THUMB_SCANNER") {
      return {
        icon: Fingerprint,
        bgClass:
          "bg-purple-100 border-purple-200 text-purple-700 dark:bg-purple-950/40 dark:border-purple-900/50 dark:text-purple-400",
        label: "Biometric Thumb Scanner",
      };
    }

    if (type.includes("CLIENT") || type.includes("FIELD")) {
      return {
        icon: MapPin,
        bgClass:
          "bg-emerald-100 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-900/50 dark:text-emerald-400",
        label: event.branchName ? `${event.branchName} · Mobile` : "Mobile",
      };
    }

    if (source === "MOBILE_GPS") {
      return {
        icon: MapPin,
        bgClass:
          "bg-emerald-100 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-900/50 dark:text-emerald-400",
        label: event.branchName ? `${event.branchName} · Mobile` : "Mobile GPS check",
      };
    }

    return {
      icon: Clock,
      bgClass: "bg-muted border-border text-muted-foreground",
      label: "System trigger",
    };
  }

  function sourceLabel(event: AttendanceTimelineEvent) {
    return captureSourceLabel(event);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md md:max-w-lg p-0 flex flex-col h-full">
        <div className="p-6 border-b border-border bg-muted/20">
          <SheetHeader className="text-left">
            <div className="flex items-center gap-2 mb-1">
              <Badge
                variant="outline"
                className="border-primary/20 bg-primary/5 text-primary text-xs"
              >
                Timeline Tracking
              </Badge>
              <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                <Calendar className="h-3 w-3" /> {date}
              </span>
            </div>
            <SheetTitle className="text-xl font-bold tracking-tight text-foreground">
              {employeeName}
            </SheetTitle>
            <SheetDescription className="text-xs mt-1">
              Preceding & current location logs tracked chronologically for today.
            </SheetDescription>
          </SheetHeader>
        </div>

        <div className="flex-1 min-h-0 flex flex-col justify-start">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground flex-1">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium">Fetching path history...</p>
            </div>
          ) : error ? (
            <div className="p-6 text-sm text-destructive bg-destructive/5 border border-destructive/10 m-4 rounded-md">
              {error}
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground flex-1 text-center px-6">
              <Clock className="h-10 w-10 mb-2 opacity-50" />
              <p className="text-sm font-medium">No movement path logs recorded.</p>
              <p className="text-xs mt-1 max-w-[280px]">
                Ensure the employee has punched in using biometric devices or checked in via mobile
                GPS.
              </p>
            </div>
          ) : (
            <ScrollArea className="flex-1 p-6">
              <div className="relative border-l border-border pl-6 ml-4 space-y-6">
                {events.map((event, index) => {
                  const styles = getEventStyles(event);
                  const Icon = styles.icon;
                  const nextEvent = events[index + 1];
                  const duration = nextEvent ? getDurationLabel(event.time, nextEvent.time) : "";

                  return (
                    <div key={`${event.time}-${event.type}-${index}`} className="relative">
                      {/* Timeline Icon Badge */}
                      <span
                        className={`absolute -left-[41px] top-0 flex h-8 w-8 items-center justify-center rounded-full border shadow-sm ${styles.bgClass}`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>

                      {/* Event Card */}
                      <div className="rounded-lg border border-border bg-card p-4 shadow-sm text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                            {movementDirectionLabel(event.type) && (
                              <Badge
                                variant="outline"
                                className={
                                  movementDirectionLabel(event.type) === "In"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400"
                                    : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-400"
                                }
                              >
                                {movementDirectionLabel(event.type)}
                              </Badge>
                            )}
                            {movementSourceLabel(event)}
                          </span>
                          <span className="text-xs font-mono font-medium text-primary bg-primary/5 px-2 py-0.5 rounded-full">
                            {formatTime(event.time)}
                          </span>
                        </div>

                        <div className="mt-1 text-xs text-muted-foreground">
                          Source: {sourceLabel(event)}
                        </div>

                        {/* Location / details */}
                        <div className="mt-3 space-y-2 text-xs border-t border-border/60 pt-2.5">
                          {event.branchName && (
                            <div className="flex items-center gap-1.5 text-foreground">
                              <Building className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span>
                                Branch: <span className="font-medium">{event.branchName}</span>
                              </span>
                            </div>
                          )}
                          {event.deviceName && (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Fingerprint className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                              <span>Device: {event.deviceName}</span>
                            </div>
                          )}
                          {event.clientName && (
                            <div className="flex items-center gap-1.5 text-foreground">
                              <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span>
                                Location: <span className="font-medium">{event.clientName}</span>
                              </span>
                            </div>
                          )}
                          {event.remarks && (
                            <div className="bg-muted/50 p-2 rounded text-xs text-muted-foreground border border-border/30">
                              <span className="font-medium text-[10px] uppercase text-muted-foreground/80 block mb-0.5">
                                Remarks
                              </span>
                              "{event.remarks}"
                            </div>
                          )}
                          {(event.latitude || event.longitude || event.address) && (
                            <div className="space-y-1.5 bg-muted/30 p-2.5 rounded border border-border/40">
                              <div className="flex items-start gap-1.5 text-muted-foreground leading-snug">
                                <MapPin className="h-3.5 w-3.5 text-muted-foreground/80 mt-0.5 shrink-0" />
                                <span>
                                  {event.address ??
                                    `${event.latitude?.toFixed(4)}, ${event.longitude?.toFixed(4)}`}
                                </span>
                              </div>
                              {event.latitude && event.longitude && (
                                <a
                                  href={`https://www.google.com/maps/search/?api=1&query=${event.latitude},${event.longitude}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                                >
                                  <ExternalLink className="h-3 w-3" /> View on Maps
                                </a>
                              )}
                            </div>
                          )}
                          {event.photoUrl && (
                            <div className="mt-2.5 border border-border/50 rounded overflow-hidden max-w-[140px] bg-muted shadow-sm">
                              <div className="bg-muted px-2 py-0.5 border-b border-border/50 text-[10px] text-muted-foreground flex items-center gap-1 font-semibold">
                                <Camera className="h-2.5 w-2.5" /> Proof Photo
                              </div>
                              <img
                                src={event.photoUrl}
                                alt="Check-in proof"
                                className="w-full h-auto object-cover max-h-24 hover:scale-105 transition-transform cursor-zoom-in"
                                onClick={() => window.open(event.photoUrl, "_blank")}
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Travel Duration indicator */}
                      {duration && (
                        <div className="absolute -left-6 top-[calc(100%+6px)] h-4 flex items-center gap-1 text-[10px] text-muted-foreground font-mono bg-background px-2.5 py-0.5 border border-border rounded-full shadow-sm select-none z-10">
                          <Clock className="h-2.5 w-2.5" /> Time diff: {duration}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
