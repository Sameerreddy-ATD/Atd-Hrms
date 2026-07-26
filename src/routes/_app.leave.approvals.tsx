import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { LeaveRequest, WeeklyOffRequest } from "@/types/domain";
import { employeesApi, leaveApi } from "@/services/api";
import { useAuth } from "@/lib/auth";
import { StatCard } from "@/components/common/StatCard";
import { CalendarClock, CheckCircle2, Clock3 } from "lucide-react";

export const Route = createFileRoute("/_app/leave/approvals")({
  component: LeaveApprovalsPage,
});

function LeaveBalancePanel({ leave }: { leave: LeaveRequest }) {
  const balances = leave.leaveBalances ?? [];
  const requested = leave.requestedDays ?? leave.days;
  const available = leave.availableBalance ?? 0;
  const after = leave.projectedBalance ?? available - requested;
  const otherPending = leave.otherPendingCount ?? 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 rounded-md border bg-muted/30 p-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Available ({leave.type})</p>
          <p className="text-lg font-semibold tabular-nums">{available}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Applying for</p>
          <p className="text-lg font-semibold tabular-nums">{requested}</p>
          <p className="text-[11px] text-muted-foreground">day{requested === 1 ? "" : "s"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">After approval</p>
          <p
            className={`text-lg font-semibold tabular-nums ${after < 0 ? "text-destructive" : ""}`}
          >
            {after}
          </p>
        </div>
      </div>
      {balances.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">All leave balances</p>
          <div className="flex flex-wrap gap-1.5">
            {balances.map((balance) => (
              <span
                key={`${balance.type}-${balance.code ?? ""}`}
                className={`rounded-md border px-2 py-1 text-xs ${
                  balance.type === leave.type
                    ? "border-primary/40 bg-primary/5 font-medium"
                    : "bg-background"
                }`}
              >
                {balance.type}: <span className="tabular-nums">{balance.balance}</span> left
                <span className="text-muted-foreground">
                  {" "}
                  ({balance.used}/{balance.entitled} used)
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
      {otherPending > 0 && (
        <p className="text-xs text-amber-800 dark:text-amber-300">
          Also has {otherPending} other pending leave request
          {otherPending === 1 ? "" : "s"} ({leave.otherPendingDays ?? 0} day
          {(leave.otherPendingDays ?? 0) === 1 ? "" : "s"}
          {(leave.sameTypeOtherPendingDays ?? 0) > 0
            ? `, including ${leave.sameTypeOtherPendingDays} more ${leave.type}`
            : ""}
          ).
        </p>
      )}
    </div>
  );
}

function LeaveApprovalsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<LeaveRequest[]>([]);
  const [history, setHistory] = useState<LeaveRequest[]>([]);
  const [weeklyOffs, setWeeklyOffs] = useState<WeeklyOffRequest[]>([]);
  const [confirm, setConfirm] = useState<{ id: string; action: "Approved" | "Rejected" } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accessChecked, setAccessChecked] = useState(false);
  const [canApprove, setCanApprove] = useState(false);
  const canOversee = ["hr", "developer_admin", "main_admin"].includes(user?.role ?? "");

  useEffect(() => {
    if (!user) return;
    employeesApi
      .isReportingManager()
      .then((result) => {
        setCanApprove(result.isReportingManager);
        setAccessChecked(true);
        if (!result.isReportingManager && !canOversee) {
          void navigate({ to: "/dashboard", replace: true });
        }
      })
      .catch(() => {
        setAccessChecked(true);
        setCanApprove(false);
        if (!canOversee) void navigate({ to: "/dashboard", replace: true });
      });
  }, [canOversee, navigate, user]);

  useEffect(() => {
    if (!canApprove && !canOversee) return;
    Promise.all([
      canApprove ? leaveApi.assignedApprovals("PENDING") : Promise.resolve([]),
      canApprove ? leaveApi.assignedApprovals() : Promise.resolve([]),
      leaveApi.weeklyOffs(canApprove, canOversee),
    ])
      .then(([pending, all, weeklyRows]) => {
        setRows(pending);
        setHistory(all.filter((request) => request.status !== "Pending"));
        setWeeklyOffs(weeklyRows);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [canApprove, canOversee]);

  async function apply() {
    if (!confirm) return;
    const { id, action } = confirm;
    try {
      const updated =
        action === "Approved" ? await leaveApi.approve(id) : await leaveApi.reject(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
      setHistory((prev) => [updated, ...prev.filter((request) => request.id !== id)]);
      toast.success(`Request ${action.toLowerCase()}`);
      setConfirm(null);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function reviewWeeklyOff(id: string, approve: boolean) {
    try {
      const updated = approve
        ? await leaveApi.approveWeeklyOff(id)
        : await leaveApi.rejectWeeklyOff(id);
      setWeeklyOffs((rows) => rows.map((row) => (row.id === id ? updated : row)));
      toast.success(`Weekly off ${approve ? "approved" : "rejected"}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const confirmLeave = confirm ? rows.find((leave) => leave.id === confirm.id) : undefined;

  if (!accessChecked || (!canApprove && !canOversee)) {
    return (
      <div className="text-sm text-muted-foreground">Checking organization approval access...</div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Leave Approvals"
        description={
          canApprove
            ? "Approve leave and weekly-off for your unit and for people under heads below you. Each card shows available balance, days requested, and projected balance."
            : "Monitor weekly-off requests across the organization. Approval sits with each employee's organization head and higher heads in that chain."
        }
      />
      {loading && <LoadingState label="Loading leave approvals" />}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!loading && (
        <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard label="Pending leave" value={rows.length} icon={Clock3} tone="warning" />
          <StatCard
            label="Pending weekly off"
            value={weeklyOffs.filter((request) => request.status === "PENDING").length}
            icon={CalendarClock}
            tone="info"
          />
          <StatCard
            label="Approved leave"
            value={history.filter((request) => request.status === "Approved").length}
            icon={CheckCircle2}
            tone="success"
          />
        </section>
      )}
      <section className="mb-7">
        <h2 className="mb-3 text-base font-semibold">Weekly-off approvals</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {weeklyOffs
            .filter((request) => request.status === "PENDING")
            .map((request) => (
              <Card key={request.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{request.employeeName}</p>
                      <p className="text-sm text-muted-foreground">{request.date}</p>
                    </div>
                    <StatusBadge status={request.status} />
                  </div>
                  {request.reason && <p className="mt-3 text-sm">{request.reason}</p>}
                  <p className="mt-3 text-xs text-muted-foreground">
                    One weekly off per Monday-Sunday week. Consecutive weekly-off dates are blocked.
                    {request.approverId !== user?.employeeId
                      ? " You can act as a higher head in this employee's chain."
                      : " Assigned to you as the primary head."}
                  </p>
                  {canApprove && (
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Button variant="outline" onClick={() => reviewWeeklyOff(request.id, false)}>
                        Reject
                      </Button>
                      <Button onClick={() => reviewWeeklyOff(request.id, true)}>Approve</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
        </div>
        {weeklyOffs.filter((request) => request.status === "PENDING").length === 0 && (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No weekly-off requests are waiting for approval.
          </p>
        )}
        {weeklyOffs.some((request) => request.status !== "PENDING") && (
          <div className="mt-5">
            <h3 className="mb-2 text-sm font-semibold">Weekly-off history</h3>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {weeklyOffs
                .filter((request) => request.status !== "PENDING")
                .map((request) => (
                  <div
                    key={request.id}
                    className="flex items-start justify-between gap-3 rounded-md border bg-background p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{request.employeeName}</p>
                      <p className="text-xs text-muted-foreground">
                        {request.employeeCode} · {request.date}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {request.reviewedByName
                          ? request.status === "REJECTED"
                            ? `Rejected by ${request.reviewedByName}`
                            : request.status === "APPROVED"
                              ? `Approved by ${request.reviewedByName}`
                              : `Reviewed by ${request.reviewedByName}`
                          : request.assignedApproverName
                            ? `Assigned to ${request.assignedApproverName}`
                            : null}
                      </p>
                    </div>
                    <StatusBadge status={request.status} />
                  </div>
                ))}
            </div>
          </div>
        )}
      </section>
      <h2 className="mb-3 text-base font-semibold">Pending approvals</h2>
      <div className="space-y-3 md:hidden">
        {rows.map((leave) => (
          <Card key={leave.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{leave.employeeName}</p>
                  <p className="text-sm text-muted-foreground">{leave.type}</p>
                </div>
                <StatusBadge status={leave.status} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 rounded-md bg-muted/40 p-3 text-sm">
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Dates</p>
                  <p className="font-medium">
                    {leave.from} to {leave.to}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Days</p>
                  <p className="font-medium">{leave.days}</p>
                </div>
              </div>
              <div className="mt-3">
                <LeaveBalancePanel leave={leave} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Applied {leave.appliedOn}
                {leave.approverName ? ` · Primary head: ${leave.approverName}` : ""}
              </p>
              <div className="mt-3">
                <p className="text-xs text-muted-foreground">Reason</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">
                  {leave.reason || "-"}
                </p>
              </div>
              {leave.type === "Sick Leave" && (
                <div className="mt-3 rounded-md border p-3 text-sm">
                  <p className="text-xs text-muted-foreground">Medical report</p>
                  {leave.medicalDocumentUrl ? (
                    <a
                      className="font-medium text-primary underline"
                      href={leave.medicalDocumentUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open shared report
                    </a>
                  ) : (
                    <p className="font-medium text-amber-700 dark:text-amber-400">
                      Awaiting employee link
                    </p>
                  )}
                </div>
              )}
              {canApprove && leave.status === "Pending" && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setConfirm({ id: leave.id, action: "Rejected" })}
                  >
                    Reject
                  </Button>
                  <Button onClick={() => setConfirm({ id: leave.id, action: "Approved" })}>
                    Approve
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      {!loading && rows.length === 0 && (
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground md:hidden">
          No pending leave requests.
        </div>
      )}
      <div className="hidden space-y-4 md:block">
        {rows.map((leave) => (
          <Card key={leave.id}>
            <CardContent className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold">{leave.employeeName}</p>
                  <p className="text-sm text-muted-foreground">
                    {leave.type} · {leave.from} to {leave.to} · {leave.days} day
                    {leave.days === 1 ? "" : "s"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Applied {leave.appliedOn}
                    {leave.approverName ? ` · Primary head: ${leave.approverName}` : ""}
                  </p>
                </div>
                <StatusBadge status={leave.status} />
              </div>
              <div className="mt-4">
                <LeaveBalancePanel leave={leave} />
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
                <div>
                  <p className="text-xs text-muted-foreground">Reason</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">
                    {leave.reason || "-"}
                  </p>
                  {leave.type === "Sick Leave" && (
                    <div className="mt-3 rounded-md border p-3 text-sm">
                      <p className="text-xs text-muted-foreground">Medical report</p>
                      {leave.medicalDocumentUrl ? (
                        <a
                          className="font-medium text-primary underline"
                          href={leave.medicalDocumentUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open shared report
                        </a>
                      ) : (
                        <p className="font-medium text-amber-700 dark:text-amber-400">
                          Awaiting employee link
                        </p>
                      )}
                    </div>
                  )}
                </div>
                {canApprove && leave.status === "Pending" && (
                  <div className="flex shrink-0 gap-2 self-end">
                    <Button
                      variant="outline"
                      onClick={() => setConfirm({ id: leave.id, action: "Rejected" })}
                    >
                      Reject
                    </Button>
                    <Button onClick={() => setConfirm({ id: leave.id, action: "Approved" })}>
                      Approve
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {!loading && rows.length === 0 && (
          <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            No pending leave requests.
          </div>
        )}
      </div>

      <h2 className="mb-3 mt-8 text-base font-semibold">Leave approval history</h2>
      <div className="space-y-3 md:hidden">
        {history.map((leave) => (
          <Card key={leave.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{leave.employeeName}</p>
                  <p className="text-sm text-muted-foreground">{leave.type}</p>
                </div>
                <StatusBadge status={leave.status} />
              </div>
              <p className="mt-3 text-sm">
                {leave.from} to {leave.to} · {leave.days} day(s)
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {leave.reviewedByName
                  ? leave.status === "Rejected"
                    ? `Rejected by ${leave.reviewedByName}`
                    : `Approved by ${leave.reviewedByName}`
                  : leave.approverName
                    ? `Assigned head: ${leave.approverName}`
                    : null}
              </p>
              {leave.reason && (
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                  {leave.reason}
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Updated {leave.updatedOn ? new Date(leave.updatedOn).toLocaleDateString() : "-"}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      {!loading && history.length === 0 && (
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground md:hidden">
          No completed leave approvals yet.
        </div>
      )}
      <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Decision by</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((leave) => (
                <TableRow key={leave.id}>
                  <TableCell className="font-medium">{leave.employeeName}</TableCell>
                  <TableCell>{leave.type}</TableCell>
                  <TableCell>{leave.from}</TableCell>
                  <TableCell>{leave.to}</TableCell>
                  <TableCell>{leave.days}</TableCell>
                  <TableCell className="text-sm">
                    {leave.reviewedByName
                      ? leave.status === "Rejected"
                        ? `Rejected by ${leave.reviewedByName}`
                        : `Approved by ${leave.reviewedByName}`
                      : leave.approverName
                        ? `Assigned: ${leave.approverName}`
                        : "-"}
                  </TableCell>
                  <TableCell className="min-w-[260px] max-w-[420px] whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                    {leave.reason}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={leave.status} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {leave.updatedOn ? new Date(leave.updatedOn).toLocaleDateString() : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!loading && history.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">No completed leave approvals yet.</div>
        )}
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action === "Approved" ? "Approve leave request?" : "Reject leave request?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                {confirmLeave && (
                  <div className="rounded-md border bg-muted/30 p-3 text-foreground">
                    <p className="font-medium text-foreground">
                      {confirmLeave.employeeName} · {confirmLeave.type}
                    </p>
                    <p className="mt-1">
                      Applying for <strong>{confirmLeave.requestedDays ?? confirmLeave.days}</strong>{" "}
                      day
                      {(confirmLeave.requestedDays ?? confirmLeave.days) === 1 ? "" : "s"} (
                      {confirmLeave.from} to {confirmLeave.to}). Available{" "}
                      <strong>{confirmLeave.availableBalance ?? 0}</strong>, after approval{" "}
                      <strong>{confirmLeave.projectedBalance ?? 0}</strong>.
                    </p>
                  </div>
                )}
                <p>
                  Approved leave is added to day logs only on days without attendance. If the
                  employee punches in on a leave day, attendance will override the leave mark.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={apply}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
