import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, CheckCircle2, Clock3, LogIn, LogOut } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import { formatDisplayDate, indiaDateKey } from "@/lib/india-date";
import {
  detectMissedPunchItems,
  directionFromEventType,
  type CorrectionRequestLike,
  type MissedPunchItem,
} from "@/lib/missed-punch";
import { attendanceApi } from "@/services/api";
import type { AttendanceRecord } from "@/types/domain";

export type MissedPunchCorrectionRequest = CorrectionRequestLike & {
  id: string;
  employeeId: string;
  employeeName: string;
  punchTime: string;
  remarks: string;
  createdAt: string;
};

function currentTimeInputValue() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function requestStatusLabel(status: string) {
  if (status === "PENDING") return "Pending";
  if (status === "APPROVED") return "Approved";
  if (status === "REJECTED") return "Rejected";
  return status;
}

export function MissedPunchRequestPanel({
  records,
  requests,
  onSubmitted,
  showHistory = true,
}: {
  records: AttendanceRecord[];
  requests: MissedPunchCorrectionRequest[];
  onSubmitted?: () => void | Promise<void>;
  showHistory?: boolean;
}) {
  const { user } = useAuth();
  const items = useMemo(() => detectMissedPunchItems(records, requests), [records, requests]);
  const [selected, setSelected] = useState<MissedPunchItem | null>(null);
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const maxDate = indiaDateKey();
  const maxTime = selected?.date === maxDate ? currentTimeInputValue() : undefined;

  function openItem(item: MissedPunchItem) {
    setSelected(item);
    setTime("");
    setReason(
      item.direction === "Out"
        ? `Forgot to check out on ${formatDisplayDate(item.date)}`
        : `Forgot to check in on ${formatDisplayDate(item.date)}`,
    );
  }

  function clearSelection() {
    setSelected(null);
    setTime("");
    setReason("");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!user?.employeeId || !selected) {
      toast.error("You must have an employee profile to submit correction requests.");
      return;
    }
    if (!time) {
      toast.error("Enter the punch time.");
      return;
    }
    if (reason.trim().length < 3) {
      toast.error("Reason must be at least 3 characters long.");
      return;
    }

    const punchTime = new Date(`${selected.date}T${time}:00+05:30`);
    if (
      user.shiftType === "NIGHT" &&
      selected.direction === "Out" &&
      Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) <= (user.shiftEndMinutes ?? 360)
    ) {
      punchTime.setDate(punchTime.getDate() + 1);
    }
    if (selected.date > maxDate || punchTime.getTime() > Date.now()) {
      toast.error("Punch time must be in the past.");
      return;
    }

    setSubmitting(true);
    try {
      await attendanceApi.requestCorrection({
        employeeId: user.employeeId,
        date: new Date(selected.date),
        punchTime,
        eventType: selected.eventType,
        remarks: reason.trim(),
      });
      toast.success("Missed punch request submitted");
      clearSelection();
      await onSubmitted?.();
    } catch (err) {
      toast.error((err as Error).message || "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-amber-300/80 bg-amber-50/50 shadow-sm dark:border-amber-900 dark:bg-amber-950/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Your missing punches</CardTitle>
          <p className="text-sm text-muted-foreground">
            Select a miss, enter the time and reason, then submit. Date and In/Out type stay fixed.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 ? (
            <EmptyState
              icon={Clock3}
              title="No missing punches to request right now"
              description="When the system detects a missed In or Out, it will appear here for you to submit."
              className="border-amber-200/80 bg-background dark:border-amber-900"
            />
          ) : (
            items.map((item) => {
              const active = selected?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openItem(item)}
                  className={`flex min-h-11 w-full flex-col gap-2.5 rounded-lg border p-3 text-left transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${
                    active
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-amber-200 bg-background hover:border-primary/40 dark:border-amber-900"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{formatDisplayDate(item.date)}</p>
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
                          item.direction === "Out"
                            ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
                            : "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100"
                        }`}
                      >
                        {item.direction === "Out" ? (
                          <LogOut className="size-3.5" aria-hidden />
                        ) : (
                          <LogIn className="size-3.5" aria-hidden />
                        )}
                        {item.direction}
                      </span>
                      <StatusBadge status={item.record.status} />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:hidden">
                      <div className="rounded-md bg-muted/50 px-2 py-1.5">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          First in
                        </p>
                        <p className="mt-0.5 text-sm font-medium tabular-nums">
                          {item.record.punchIn ?? "—"}
                        </p>
                      </div>
                      <div className="rounded-md bg-muted/50 px-2 py-1.5">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Last out
                        </p>
                        <p className="mt-0.5 text-sm font-medium tabular-nums">
                          {item.record.punchOut ?? "—"}
                        </p>
                      </div>
                    </div>
                    <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
                      First in: {item.record.punchIn ?? "Not recorded"} · Last out:{" "}
                      {item.record.punchOut ?? "Not recorded"}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-primary sm:shrink-0">
                    {active ? "Selected" : "Add & submit"}
                  </span>
                </button>
              );
            })
          )}
        </CardContent>
      </Card>

      {selected && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-start">
          <Card className="border-border shadow-sm">
            <CardContent className="p-4 sm:p-6">
              <div className="mb-5 flex items-start justify-between gap-3 border-b pb-4">
                <div>
                  <h2 className="font-semibold">
                    Submit missed {selected.direction.toLowerCase()}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Date and type are locked from the selected miss. Enter time and reason only.
                  </p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
                  Clear
                </Button>
              </div>

              <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="missed-date-locked">Date</Label>
                    <DateField id="missed-date-locked" value={selected.date} disabled readOnly />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="missed-type-locked">Type</Label>
                    <Input id="missed-type-locked" value={selected.direction} disabled readOnly />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="missed-time">Time</Label>
                    <Input
                      id="missed-time"
                      type="time"
                      value={time}
                      max={maxTime}
                      onChange={(event) => setTime(event.target.value)}
                      required
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="missed-reason">Reason</Label>
                    <Textarea
                      id="missed-reason"
                      rows={3}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="Explain why the punch was missed..."
                      maxLength={1000}
                      required
                    />
                    <p className="text-right text-xs tabular-nums text-muted-foreground">
                      {reason.length}/1,000
                    </p>
                  </div>
                </div>

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    onClick={clearSelection}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button className="min-h-11 w-full sm:w-auto" type="submit" disabled={submitting}>
                    {submitting ? "Submitting..." : "Submit request"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <aside className="rounded-lg border bg-muted/20 p-4 lg:sticky lg:top-4">
            <h2 className="text-sm font-semibold">Request summary</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex gap-3">
                <CalendarClock className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="font-medium">{formatDisplayDate(selected.date)}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Clock3 className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Time</p>
                  <p className="font-medium">{time || "Not entered"}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Punch type</p>
                  <p className="font-medium">{selected.direction}</p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {showHistory && (
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Missed punch requests</CardTitle>
            <p className="text-xs text-muted-foreground">
              Correction requests submitted for your organization head to review.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="space-y-2 p-3 md:hidden">
              {requests.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No missed punch requests submitted yet.
                </p>
              ) : (
                requests.map((request) => (
                  <div key={request.id} className="rounded-lg border bg-background p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">
                          {formatDisplayDate(request.date)} ·{" "}
                          {directionFromEventType(request.eventType) ?? request.eventType}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(request.punchTime).toLocaleTimeString("en-IN", {
                            timeZone: "Asia/Kolkata",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <StatusBadge status={requestStatusLabel(request.status)} />
                    </div>
                    <p className="mt-3 break-words text-xs text-muted-foreground">
                      {request.remarks}
                    </p>
                  </div>
                ))
              )}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="py-12 text-center text-xs italic text-muted-foreground"
                      >
                        No missed punch requests submitted yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    requests.map((request) => (
                      <TableRow key={request.id} className="text-xs hover:bg-muted/5">
                        <TableCell className="whitespace-nowrap font-semibold">
                          {formatDisplayDate(request.date)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {new Date(request.punchTime).toLocaleTimeString("en-IN", {
                            timeZone: "Asia/Kolkata",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell>
                          {directionFromEventType(request.eventType) ?? request.eventType}
                        </TableCell>
                        <TableCell
                          className="max-w-xs truncate text-muted-foreground"
                          title={request.remarks}
                        >
                          {request.remarks}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDisplayDate(request.createdAt)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={requestStatusLabel(request.status)} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
