import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/_app/attendance/missed-punch")({
  component: MissedPunchPage,
});
function MissedPunchPage() {
  const navigate = useNavigate();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  return (
    <div>
      <PageHeader title="Missed Punch Request" description="Report a missed punch to your manager for approval." />
      <Card className="max-w-xl"><CardContent className="p-6">
        <form onSubmit={(e) => { e.preventDefault(); toast.success("Request submitted"); navigate({ to: "/app/attendance/mine" }); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Time</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Reason</Label><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <div className="flex justify-end gap-2"><Button type="submit">Submit request</Button></div>
        </form>
      </CardContent></Card>
    </div>
  );
}