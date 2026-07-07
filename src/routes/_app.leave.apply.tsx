import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { leaveApi } from "@/services/api";
import { useAuth } from "@/lib/auth";
import type { LeaveType } from "@/mock/types";

const types: LeaveType[] = [
  "Paid Leave","Sick Leave","Casual Leave","Half-Day Leave","Unpaid Leave","Emergency Leave","Comp Off",
];

export const Route = createFileRoute("/_app/leave/apply")({
  component: ApplyLeavePage,
});

function ApplyLeavePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [type, setType] = useState<LeaveType>("Casual Leave");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!from) errs.from = "Start date required";
    if (!to) errs.to = "End date required";
    if (from && to && from > to) errs.to = "End date must be after start";
    if (!reason.trim()) errs.reason = "Reason required";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const days =
      Math.max(1, Math.round((+new Date(to) - +new Date(from)) / 86400000) + 1);
    setLoading(true);
    await leaveApi.apply({
      employeeId: user?.employeeId ?? "",
      employeeName: user?.name ?? "",
      type, from, to, days, reason,
    });
    setLoading(false);
    toast.success("Leave request submitted");
    navigate({ to: "/app/leave/history" });
  }

  return (
    <div>
      <PageHeader
        title="Apply for Leave"
        description="Submit a leave request to your reporting manager for approval."
      />
      <Card className="max-w-2xl">
        <CardContent className="p-6">
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Leave type</Label>
              <Select value={type} onValueChange={(v) => setType(v as LeaveType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {types.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="from">From</Label>
              <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              {errors.from && <p className="text-xs text-destructive">{errors.from}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to">To</Label>
              <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              {errors.to && <p className="text-xs text-destructive">{errors.to}</p>}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="reason">Reason</Label>
              <Textarea id="reason" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />
              {errors.reason && <p className="text-xs text-destructive">{errors.reason}</p>}
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => navigate({ to: "/app/leave/history" })}>Cancel</Button>
              <Button type="submit" disabled={loading}>Submit request</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}