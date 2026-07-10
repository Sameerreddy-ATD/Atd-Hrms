import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { BackButton } from "@/components/common/BackButton";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { attendanceApi } from "@/services/api";
import { MISSED_PUNCH_TYPE_OPTIONS, punchTypeLabel } from "@/lib/attendance-labels";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/attendance/missed-punch")({
  component: MissedPunchPage,
});

function todayDateInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
        description="Report a missed punch for a time that has already passed. Future times cannot be requested."
      />
      <Card className="max-w-xl mx-auto w-full">
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
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

            <div className="space-y-1.5">
              <Label>Punch type</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select punch type" />
                </SelectTrigger>
                <SelectContent>
                  {MISSED_PUNCH_TYPE_OPTIONS.map((type) => (
                    <SelectItem key={type} value={type}>
                      {punchTypeLabel(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="missed-reason">Reason</Label>
              <Textarea
                id="missed-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why the punch was missed..."
                required
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate({ to: "/attendance/mine" })}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Submitting..." : "Submit request"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
