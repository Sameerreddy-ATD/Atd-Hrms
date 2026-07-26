import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { InfoButton } from "@/components/common/InfoButton";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingState } from "@/components/common/LoadingState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { leaveApi } from "@/services/api";
import { useAuth } from "@/lib/auth";
import { indiaDateKey, indiaDateKeyShift } from "@/lib/india-date";
import type { LeaveBalance, LeaveTypeOption, WeeklyOffRequest } from "@/types/domain";
import { StatusBadge } from "@/components/common/StatusBadge";
import { CalendarClock, CalendarDays, CheckCircle2, ShieldCheck, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [requestKind, setRequestKind] = useState<"leave" | "weekly-off">("leave");
  const todayString = indiaDateKey();

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
  const requiresApprover = selectedType?.approvalRequired !== false;
  const selectedBalance = balances.find((item) => item.code === selectedType?.code)?.balance ?? 0;
  const requestedDays =
    from && to && from <= to
      ? Math.max(1, Math.round((+new Date(to) - +new Date(from)) / 86400000) + 1)
      : 0;

  useEffect(() => {
    if (!user?.employeeId) {
      setApproverName(null);
      setApproverLoading(false);
      return;
    }
    setApproverLoading(true);
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
      toast.success(
        selectedType?.code === "COMP_OFF"
          ? "Comp Off booked successfully"
          : "Leave request submitted",
      );
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
        description="Choose the leave type and dates. Approval follows the policy for that leave type."
        actions={
          <InfoButton title="Leave request process">
            Leave requests go to your organization head. Higher heads in the same chain can also
            approve or reject. Comp Off uses an earned holiday-work credit and does not require
            approval. You can track the result in Leave History and cancel an approved leave when
            required.
          </InfoButton>
        }
      />
      <div className="mb-5 grid w-full grid-cols-2 rounded-lg border bg-muted/30 p-1 sm:w-[26rem]">
        <Button
          type="button"
          variant={requestKind === "leave" ? "default" : "ghost"}
          className="whitespace-normal"
          onClick={() => setRequestKind("leave")}
        >
          <CalendarDays className="h-4 w-4" /> Leave request
        </Button>
        <Button
          type="button"
          variant={requestKind === "weekly-off" ? "default" : "ghost"}
          className="whitespace-normal"
          onClick={() => setRequestKind("weekly-off")}
        >
          <CalendarClock className="h-4 w-4" /> Weekly off
        </Button>
      </div>
      {typesLoading && <LoadingState label="Loading leave options" />}
      {!typesLoading && requestKind === "leave" && (
        <>
          <section
            className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            aria-label="Leave policies"
          >
            {types.map((type) => {
              const balance = balances.find((item) => item.code === type.code)?.balance ?? 0;
              const selected = type.id === typeId;
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setTypeId(type.id)}
                  className={cn(
                    "rounded-lg border bg-card p-4 text-left transition-colors",
                    selected
                      ? "border-primary/50 bg-primary/[0.03] ring-1 ring-primary/30"
                      : "border-border/80 hover:border-primary/30 hover:bg-muted/30",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{type.name}</p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums">{balance}</p>
                      <p className="text-xs text-muted-foreground">available credit</p>
                    </div>
                    <InfoButton title={type.name} className="-mr-1 -mt-1">
                      {type.description || "This leave type follows the company leave policy."}
                    </InfoButton>
                  </div>
                  <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    {selected ? (
                      <>
                        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                        Selected
                      </>
                    ) : (
                      "Tap to select"
                    )}
                  </p>
                </button>
              );
            })}
          </section>
          <div className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <Card>
              <CardContent className="p-4 sm:p-6">
                {!approverLoading && requiresApprover && !approverName && (
                  <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    No organization head is available for your unit. Contact HR to complete the
                    organization chart before applying for leave.
                  </p>
                )}
                {!approverLoading && requiresApprover && approverName && (
                  <p className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    This request will be sent to your organization head:{" "}
                    <span className="font-medium text-foreground">{approverName}</span>. Higher heads
                    in the same chain can also approve or reject it.
                  </p>
                )}
                {selectedType && !requiresApprover && (
                  <p className="mb-4 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-300">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    Comp Off uses an earned holiday-work credit and is confirmed immediately. No
                    organization-head approval is required.
                  </p>
                )}
                <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
                  {!typeId && (
                    <p className="sm:col-span-2 text-sm text-muted-foreground">
                      Select a leave type above to continue.
                    </p>
                  )}
                  {errors.type && (
                    <p className="sm:col-span-2 text-xs text-destructive">{errors.type}</p>
                  )}
                  {selectedType?.requiresMedicalDocument && (
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="medical-document">
                        Medical report Drive link (optional now)
                      </Label>
                      <Input
                        id="medical-document"
                        type="url"
                        value={medicalDocumentUrl}
                        placeholder="https://drive.google.com/..."
                        onChange={(event) => setMedicalDocumentUrl(event.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Set sharing to anyone with the link. Upload within 2 days after Sick Leave
                        ends, or HR will be notified that the report is overdue.
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
                      disabled={
                        loading ||
                        typesLoading ||
                        (requiresApprover && (approverLoading || !approverName))
                      }
                    >
                      Submit request
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
            <aside className="rounded-lg border bg-muted/20 p-4 lg:sticky lg:top-4 lg:self-start">
              <h2 className="text-sm font-semibold">Request summary</h2>
              <div className="mt-4 space-y-4">
                <LeaveSummary
                  icon={ShieldCheck}
                  label="Leave type"
                  value={selectedType?.name ?? "Not selected"}
                />
                <LeaveSummary
                  icon={CalendarDays}
                  label="Requested"
                  value={
                    requestedDays
                      ? `${requestedDays} day${requestedDays === 1 ? "" : "s"}`
                      : "Select dates"
                  }
                />
                <LeaveSummary
                  icon={CheckCircle2}
                  label="Available credit"
                  value={String(selectedBalance)}
                />
                <LeaveSummary
                  icon={UserRound}
                  label="Approver"
                  value={
                    requiresApprover
                      ? approverLoading
                        ? "Checking..."
                        : (approverName ?? "Not assigned")
                      : "No approval required"
                  }
                />
              </div>
              {requestedDays > selectedBalance && selectedType?.paid && (
                <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                  This request exceeds the current credit by {requestedDays - selectedBalance}{" "}
                  day(s).
                </p>
              )}
            </aside>
          </div>
        </>
      )}
      {!typesLoading && requestKind === "weekly-off" && (
        <div className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="mb-5 flex items-start gap-3">
                <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <h2 className="font-semibold">Request weekly off</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Request at least one day earlier. One weekly off is allowed per Monday-Sunday
                    week, unused weekly offs expire, and consecutive weekly-off dates are not
                    allowed.
                  </p>
                </div>
              </div>
              {!approverLoading && approverName && (
                <p className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  This request will be sent to your organization head:{" "}
                  <span className="font-medium text-foreground">{approverName}</span>. Higher heads in
                  the same chain can also approve or reject it.
                </p>
              )}
              <form onSubmit={submitWeeklyOff} className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="weekly-off-date">Requested date</Label>
                  <Input
                    id="weekly-off-date"
                    type="date"
                    value={weeklyOffDate}
                    min={indiaDateKeyShift(1)}
                    onChange={(event) => setWeeklyOffDate(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="weekly-off-reason">Reason (optional)</Label>
                  <Input
                    id="weekly-off-reason"
                    value={weeklyOffReason}
                    maxLength={500}
                    placeholder="Add a short note"
                    onChange={(event) => setWeeklyOffReason(event.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-2 sm:col-span-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate({ to: "/leave/history" })}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={weeklyOffSaving || !weeklyOffDate}>
                    {weeklyOffSaving ? "Sending..." : "Submit request"}
                  </Button>
                </div>
              </form>
              {weeklyOffs.length > 0 && (
                <div className="mt-5 space-y-2">
                  <h3 className="text-sm font-semibold">Recent weekly-off requests</h3>
                  {weeklyOffs.slice(0, 6).map((request) => (
                    <div
                      key={request.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-3 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{request.date}</p>
                        {request.reviewedByName && (
                          <p className="text-xs text-muted-foreground">
                            {request.status === "REJECTED"
                              ? `Rejected by ${request.reviewedByName}`
                              : request.status === "APPROVED"
                                ? `Approved by ${request.reviewedByName}`
                                : request.reviewedByName}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={request.status} />
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
          <aside className="rounded-lg border bg-muted/20 p-4 lg:sticky lg:top-4 lg:self-start">
            <h2 className="text-sm font-semibold">Request summary</h2>
            <div className="mt-4 space-y-4">
              <LeaveSummary icon={CalendarClock} label="Request type" value="Weekly off" />
              <LeaveSummary
                icon={CalendarDays}
                label="Requested date"
                value={weeklyOffDate || "Select a date"}
              />
              <LeaveSummary
                icon={UserRound}
                label="Approver"
                value={approverLoading ? "Checking..." : (approverName ?? "Not assigned")}
              />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function LeaveSummary({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3 text-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="break-words font-medium">{value}</p>
      </div>
    </div>
  );
}
