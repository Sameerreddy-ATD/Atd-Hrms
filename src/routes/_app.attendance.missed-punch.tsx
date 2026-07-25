import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { InfoButton } from "@/components/common/InfoButton";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { indiaDateKey } from "@/lib/india-date";
import { attendanceApi } from "@/services/api";
import { MISSED_PUNCH_TYPE_OPTIONS, punchTypeLabel } from "@/lib/attendance-labels";
import { CalendarClock, CheckCircle2, Clock3, FilePenLine } from "lucide-react";

export const Route = createFileRoute("/_app/attendance/missed-punch")({
  component: MissedPunchPage,
});

function todayDateInputValue() {
  return indiaDateKey();
}

function currentTimeInputValue() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function MissedPunchPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [eventType, setEventType] = useState<string>(MISSED_PUNCH_TYPE_OPTIONS[0]);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const maxDate = todayDateInputValue();
  const maxTime = date === maxDate ? currentTimeInputValue() : undefined;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.employeeId) {
      toast.error("You must have an employee profile to submit correction requests.");
      return;
    }
    if (!date || !time) {
      toast.error("Please fill in both Date and Time.");
      return;
    }
    if (date > maxDate) {
      toast.error("You can only request corrections for past dates.");
      return;
    }
    if (reason.length < 3) {
      toast.error("Reason must be at least 3 characters long.");
      return;
    }

    const punchTime = new Date(`${date}T${time}:00+05:30`);
    if (
      user.shiftType === "NIGHT" &&
      eventType.includes("OUT") &&
      Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) <= (user.shiftEndMinutes ?? 360)
    ) {
      punchTime.setDate(punchTime.getDate() + 1);
    }
    if (punchTime.getTime() > Date.now()) {
      toast.error("Punch time must be in the past. You can only request already completed times.");
      return;
    }

    setSubmitting(true);
    try {
      await attendanceApi.requestCorrection({
        employeeId: user.employeeId,
        date: new Date(date),
        punchTime,
        eventType,
        remarks: reason,
      });

      toast.success("Correction request submitted successfully");
      void navigate({ to: "/attendance/mine" });
    } catch (err) {
      toast.error((err as Error).message || "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Missed Punch Request"
        description="Add a missing check-in or check-out for review."
        actions={
          <InfoButton title="How missed punch requests work">
            Select the actual date, time, and punch type. Your organization head reviews the
            request. Approved requests update attendance automatically; future punch times cannot be
            submitted.
          </InfoButton>
        }
      />
      <div className="mx-auto grid w-full max-w-4xl gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="mb-5 flex items-center gap-3 border-b pb-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                <FilePenLine className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold">Punch details</h2>
                <p className="text-sm text-muted-foreground">
                  Enter the time that should appear in attendance.
                </p>
              </div>
            </div>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="missed-date">Date</Label>
                  <Input
                    id="missed-date"
                    type="date"
                    value={date}
                    max={maxDate}
                    onChange={(e) => {
                      const nextDate = e.target.value;
                      setDate(nextDate);
                      if (nextDate === maxDate && time && time > currentTimeInputValue()) {
                        setTime(currentTimeInputValue());
                      }
                    }}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="missed-time">Time</Label>
                  <Input
                    id="missed-time"
                    type="time"
                    value={time}
                    max={maxTime}
                    onChange={(e) => setTime(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Punch type</Label>
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Punch type">
                  {MISSED_PUNCH_TYPE_OPTIONS.map((type) => (
                    <Button
                      key={type}
                      type="button"
                      variant={eventType === type ? "default" : "outline"}
                      className="h-auto min-h-11 justify-start whitespace-normal px-3 py-2 text-left"
                      onClick={() => setEventType(type)}
                    >
                      {eventType === type && <CheckCircle2 className="h-4 w-4" />}
                      {punchTypeLabel(type)}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="missed-reason">Reason</Label>
                <Textarea
                  id="missed-reason"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain why the punch was missed..."
                  maxLength={1000}
                  required
                />
                <p className="text-right text-xs tabular-nums text-muted-foreground">
                  {reason.length}/1,000
                </p>
              </div>

              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate({ to: "/attendance/mine" })}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button className="w-full sm:w-auto" type="submit" disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit request"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        <aside className="rounded-lg border bg-muted/20 p-4 lg:sticky lg:top-4 lg:self-start">
          <h2 className="text-sm font-semibold">Request summary</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Review these details before submitting to your organization head.
          </p>
          <div className="mt-4 space-y-4 text-sm">
            <SummaryItem icon={CalendarClock} label="Date" value={date || "Not selected"} />
            <SummaryItem icon={Clock3} label="Time" value={time || "Not selected"} />
            <SummaryItem icon={CheckCircle2} label="Punch type" value={punchTypeLabel(eventType)} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function SummaryItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="break-words font-medium">{value}</p>
      </div>
    </div>
  );
}
