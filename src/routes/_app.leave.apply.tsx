import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BackButton } from "@/components/common/BackButton";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { leaveApi, employeesApi } from "@/services/api";
import { useAuth } from "@/lib/auth";
import type { LeaveTypeOption } from "@/mock/types";

export const Route = createFileRoute("/_app/leave/apply")({
  component: ApplyLeavePage,
});

function ApplyLeavePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [types, setTypes] = useState<LeaveTypeOption[]>([]);
  const [typeId, setTypeId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [managerName, setManagerName] = useState<string | null>(null);
  const [managerLoading, setManagerLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [typesLoading, setTypesLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const todayString = new Date().toISOString().split("T")[0];

  useEffect(() => {
    leaveApi
      .types()
      .then((rows) => {
        setTypes(rows);
        setTypeId(rows[0]?.id ?? "");
      })
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setTypesLoading(false));
  }, []);

  useEffect(() => {
    if (!user?.employeeId) {
      setManagerLoading(false);
      return;
    }
    employeesApi
      .get(user.employeeId)
      .then((employee) => {
        if (employee?.managerId && employee.managerName) {
          setManagerName(employee.managerName);
        } else {
          setManagerName(null);
        }
      })
      .catch(() => setManagerName(null))
      .finally(() => setManagerLoading(false));
  }, [user?.employeeId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!typeId) errs.type = "Leave type required";
    if (!from) {
      errs.from = "Start date required";
    } else if (from < todayString) {
      errs.from = "Start date cannot be in the past";
    }
    if (!to) {
      errs.to = "End date required";
    } else if (to < todayString) {
      errs.to = "End date cannot be in the past";
    }
    if (from && to && from > to) errs.to = "End date must be after start";
    if (!reason.trim()) errs.reason = "Reason required";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const days = Math.max(1, Math.round((+new Date(to) - +new Date(from)) / 86400000) + 1);
    setLoading(true);
    try {
      await leaveApi.apply({
        leaveTypeId: typeId,
        fromDate: from,
        toDate: to,
        days,
        reason,
      });
      toast.success("Leave request submitted");
      navigate({ to: "/leave/history" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Apply for Leave"
        description="Submit a leave request to your reporting manager for approval."
      />
      <Card className="max-w-2xl mx-auto w-full">
        <CardContent className="p-6">
          {!managerLoading && !managerName && (
            <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              No reporting manager is assigned to your profile. Contact HR before applying for
              leave.
            </p>
          )}
          {!managerLoading && managerName && (
            <p className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              This request will be sent to your reporting manager:{" "}
              <span className="font-medium text-foreground">{managerName}</span>
            </p>
          )}
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Leave type</Label>
              <Select value={typeId} onValueChange={setTypeId} disabled={typesLoading}>
                <SelectTrigger>
                  <SelectValue placeholder="Select leave type" />
                </SelectTrigger>
                <SelectContent>
                  {types.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.type && <p className="text-xs text-destructive">{errors.type}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="from">From</Label>
              <Input
                id="from"
                type="date"
                value={from}
                min={todayString}
                max={to || undefined}
                onChange={(e) => {
                  const nextFrom = e.target.value;
                  setFrom(nextFrom);
                  if (to && nextFrom && to < nextFrom) setTo(nextFrom);
                }}
              />
              {errors.from && <p className="text-xs text-destructive">{errors.from}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to">To</Label>
              <Input
                id="to"
                type="date"
                value={to}
                min={from || todayString}
                onChange={(e) => setTo(e.target.value)}
              />
              {errors.to && <p className="text-xs text-destructive">{errors.to}</p>}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="reason">Reason</Label>
              <Textarea
                id="reason"
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              {errors.reason && <p className="text-xs text-destructive">{errors.reason}</p>}
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate({ to: "/leave/history" })}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading || typesLoading || managerLoading || !managerName}
              >
                Submit request
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
