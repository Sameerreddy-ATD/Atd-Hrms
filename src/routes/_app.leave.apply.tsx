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
import { leaveApi } from "@/services/api";
import { useAuth } from "@/lib/auth";
import type { LeaveBalance, LeaveTypeOption, WeeklyOffRequest } from "@/mock/types";
import { CalendarClock, ShieldCheck } from "lucide-react";

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
  const [medicalDocumentUrl, setMedicalDocumentUrl] = useState("");
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [weeklyOffs, setWeeklyOffs] = useState<WeeklyOffRequest[]>([]);
  const [weeklyOffDate, setWeeklyOffDate] = useState("");
  const [weeklyOffReason, setWeeklyOffReason] = useState("");
  const [weeklyOffSaving, setWeeklyOffSaving] = useState(false);
  const [approverName, setApproverName] = useState<string | null>(null);
  const [approverLoading, setApproverLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [typesLoading, setTypesLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const todayString = new Date().toISOString().split("T")[0];

  useEffect(() => {
    Promise.all([leaveApi.types(), leaveApi.myBalance(), leaveApi.weeklyOffs()])
      .then(([rows, balanceRows, weeklyRows]) => {
        setTypes(rows);
        setTypeId(rows[0]?.id ?? "");
        setBalances(balanceRows);
        setWeeklyOffs(weeklyRows);
      })
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setTypesLoading(false));
  }, []);
  const selectedType = types.find((type) => type.id === typeId);

  useEffect(() => {
    if (!user?.employeeId) return;
    leaveApi
      .approver()
      .then((result) => setApproverName(result.approverName))
      .catch(() => setApproverName(null))
      .finally(() => setApproverLoading(false));
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
    if (reason.trim().length < 3) errs.reason = "Enter at least 3 characters";
    if (reason.length > 1000) errs.reason = "Reason cannot exceed 1,000 characters";
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
        reason: reason.trim(),
        medicalDocumentUrl: medicalDocumentUrl.trim() || undefined,
      });
      toast.success("Leave request submitted");
      navigate({ to: "/leave/history" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function submitWeeklyOff(e: React.FormEvent) {
    e.preventDefault();
    if (!weeklyOffDate) return toast.error("Select a weekly-off date");
    setWeeklyOffSaving(true);
    try {
      const request = await leaveApi.requestWeeklyOff(
        weeklyOffDate,
        weeklyOffReason.trim() || undefined,
      );
      setWeeklyOffs((current) => [request, ...current]);
      setWeeklyOffDate("");
      setWeeklyOffReason("");
      toast.success("Weekly-off request sent to your organization head");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setWeeklyOffSaving(false);
    }
  }

  async function cancelWeeklyOff(id: string) {
    setWeeklyOffSaving(true);
    try {
      const updated = await leaveApi.cancelWeeklyOff(id);
      setWeeklyOffs((current) => current.map((item) => (item.id === id ? updated : item)));
      toast.success("Weekly off cancelled and attendance updated");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setWeeklyOffSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Apply for Leave"
        description="Your request follows the organization chart to the responsible team head."
      />
      <section
        className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Leave policies"
      >
        {types.map((type) => {
          const balance = balances.find((item) => item.code === type.code)?.balance ?? 0;
          return (
            <Card key={type.id} className="border-border/80">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{type.name}</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">{balance}</p>
                    <p className="text-xs text-muted-foreground">available credit</p>
                  </div>
                  <ShieldCheck className="h-5 w-5 text-primary" />
                </div>
                <p className="mt-3 text-sm leading-5 text-muted-foreground">{type.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </section>
      <Card className="max-w-2xl mx-auto w-full">
        <CardContent className="p-4 sm:p-6">
          {!approverLoading && !approverName && (
            <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              No organization head is available for your unit. Contact HR to complete the
              organization chart before applying for leave.
            </p>
          )}
          {!approverLoading && approverName && (
            <p className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              This request will be sent to your organization head:{" "}
              <span className="font-medium text-foreground">{approverName}</span>
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
            {selectedType?.requiresMedicalDocument && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="medical-document">Medical report Drive link (optional now)</Label>
                <Input
                  id="medical-document"
                  type="url"
                  value={medicalDocumentUrl}
                  placeholder="https://drive.google.com/..."
                  onChange={(event) => setMedicalDocumentUrl(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Set sharing to anyone with the link. It must be submitted within 3 days after you
                  return from Sick Leave.
                </p>
              </div>
            )}
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
                maxLength={1000}
                onChange={(e) => setReason(e.target.value.slice(0, 1000))}
              />
              <div className="flex items-center justify-between gap-3">
                {errors.reason ? (
                  <p className="text-xs text-destructive">{errors.reason}</p>
                ) : (
                  <span />
                )}
                <p className="text-xs tabular-nums text-muted-foreground">
                  {1000 - reason.length} characters left
                </p>
              </div>
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
                disabled={loading || typesLoading || approverLoading || !approverName}
              >
                Submit request
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card className="mx-auto mt-5 w-full max-w-2xl">
        <CardContent className="p-4 sm:p-6">
          <div className="mb-4 flex items-start gap-3">
            <CalendarClock className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <h2 className="font-semibold">Request weekly off</h2>
              <p className="text-sm text-muted-foreground">
                Request at least one day earlier. One weekly off is allowed per Monday-Sunday week,
                unused weekly offs expire, and two consecutive dates are not allowed.
              </p>
            </div>
          </div>
          <form onSubmit={submitWeeklyOff} className="grid gap-3 sm:grid-cols-[180px_1fr_auto]">
            <Input
              type="date"
              value={weeklyOffDate}
              min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
              onChange={(event) => setWeeklyOffDate(event.target.value)}
              aria-label="Weekly-off date"
            />
            <Input
              value={weeklyOffReason}
              maxLength={500}
              placeholder="Reason (optional)"
              onChange={(event) => setWeeklyOffReason(event.target.value)}
            />
            <Button type="submit" disabled={weeklyOffSaving || !weeklyOffDate}>
              {weeklyOffSaving ? "Sending..." : "Request"}
            </Button>
          </form>
          {weeklyOffs.length > 0 && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {weeklyOffs.slice(0, 6).map((request) => (
                <div
                  key={request.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                >
                  <span className="font-medium">{request.date}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {request.status}
                    </span>
                    {(request.status === "PENDING" || request.status === "APPROVED") && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={weeklyOffSaving}
                        onClick={() => void cancelWeeklyOff(request.id)}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
