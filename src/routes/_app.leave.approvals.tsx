import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { BadgeCheck, CalendarClock, CheckCircle2, Clock3 } from "lucide-react";

export const Route = createFileRoute("/_app/leave/approvals")({
  component: LeaveApprovalsPage,
});

function LeaveApprovalsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<LeaveRequest[]>([]);
  const [history, setHistory] = useState<LeaveRequest[]>([]);
  const [weeklyOffs, setWeeklyOffs] = useState<WeeklyOffRequest[]>([]);
  const [confirm, setConfirm] = useState<{
    request: LeaveRequest;
    action: "Approved" | "Rejected";
  } | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [reviewing, setReviewing] = useState(false);
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
      canApprove ? leaveApi.assignedApprovals() : leaveApi.approvalQueue(),
      leaveApi.weeklyOffs(canApprove, canOversee),
    ])
      .then(([all, weeklyRows]) => {
        setRows(all.filter((request) => request.status === "Pending"));
        setHistory(all.filter((request) => request.status !== "Pending"));
        setWeeklyOffs(weeklyRows);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [canApprove, canOversee]);

  async function apply() {
    if (!confirm) return;
    const { request, action } = confirm;
    if (action === "Rejected" && decisionNote.trim().length < 3) {
      toast.error("Enter a rejection reason with at least 3 characters");
      return;
    }
    setReviewing(true);
    try {
      const updated =
        action === "Approved"
          ? await leaveApi.approve(request.id, decisionNote)
          : await leaveApi.reject(request.id, decisionNote);
      setRows((prev) => prev.filter((row) => row.id !== request.id));
      setHistory((prev) => [updated, ...prev.filter((historyRow) => historyRow.id !== request.id)]);
      toast.success(`Leave request ${action.toLowerCase()}`);
      setConfirm(null);
      setDecisionNote("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setReviewing(false);
    }
  }

  function openDecision(request: LeaveRequest, action: "Approved" | "Rejected") {
    setDecisionNote("");
    setConfirm({ request, action });
  }

  function canReview(request: LeaveRequest) {
    return Boolean(canApprove && request.status === "Pending");
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

  if (!accessChecked || (!canApprove && !canOversee)) {
    return (
      <div className="text-sm text-muted-foreground">Checking organization approval access...</div>
    );
  }

  const pendingWeeklyOffs = weeklyOffs.filter((request) => request.status === "PENDING");
  const assignedLeaveCount = rows.filter(
    (request) => request.approverId === user?.employeeId,
  ).length;
  const approvedCount = history.filter((request) => request.status === "Approved").length;

  return (
    <div>
      <PageHeader
        title="Leave Approval Queue"
        description={
          canApprove
            ? "Approve leave and weekly-off for your unit and people under heads below you. Each card shows available balance, days requested, projected balance, and who is assigned."
            : "Monitor weekly-off and leave across the organization. Approval sits with each employee's organization head and higher heads in that chain."
        }
      />
      {loading && <LoadingState label="Loading leave approvals" />}
      {error && (
        <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {!loading && (
        <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ApprovalMetric icon={Clock3} label="Pending leave" value={rows.length} />
          <ApprovalMetric icon={BadgeCheck} label="Assigned to me" value={assignedLeaveCount} />
          <ApprovalMetric
            icon={CalendarClock}
            label="Pending weekly off"
            value={pendingWeeklyOffs.length}
          />
          <ApprovalMetric icon={CheckCircle2} label="Approved leave" value={approvedCount} />
        </section>
      )}
      <div className="mb-3">
        <h2 className="text-base font-semibold">Pending leave requests</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {canApprove
            ? "Your unit and subordinate units. Primary assigned head is shown on each card; you can still decide as a higher head."
            : "Organization-wide visibility. Action buttons appear for organization heads only."}
        </p>
      </div>
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
              {leave.leaveCode === "LOP" ? (
                <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  Unpaid leave — no paid-leave credit is deducted.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Available</p>
                      <p className="font-semibold">{leave.availableBalance ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Applying for</p>
                      <p className="font-semibold">{leave.requestedDays ?? leave.days}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">After approval</p>
                      <p className="font-semibold">{leave.projectedBalance ?? "—"}</p>
                    </div>
                  </div>
                  {(leave.leaveBalances?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {leave.leaveBalances!.map((balance) => (
                        <span
                          key={`${balance.type}-${balance.code ?? ""}`}
                          className={`rounded-md border px-2 py-1 text-xs ${
                            balance.type === leave.type
                              ? "border-primary/40 bg-primary/5 font-medium"
                              : "bg-background"
                          }`}
                        >
                          {balance.type}: {balance.balance} left
                        </span>
                      ))}
                    </div>
                  )}
                  {(leave.otherPendingCount ?? 0) > 0 && (
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                      Also has {leave.otherPendingCount} other pending leave request
                      {leave.otherPendingCount === 1 ? "" : "s"} ({leave.otherPendingDays ?? 0}{" "}
                      day{(leave.otherPendingDays ?? 0) === 1 ? "" : "s"}).
                    </p>
                  )}
                </div>
              )}
              <div className="mt-3 text-sm">
                <p className="text-xs text-muted-foreground">Assigned / primary head</p>
                <p className="font-medium">{leave.approverName ?? "Not assigned"}</p>
              </div>
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
                      href={leaveApi.medicalFileUrl(leave.medicalDocumentUrl)}
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
                  {leave.medicalDocumentUrl &&
                    !leave.medicalDocumentVerifiedAt &&
                    (canApprove || canOversee) && (
                      <Button
                        size="sm"
                        className="mt-2"
                        variant="outline"
                        onClick={() =>
                          void leaveApi
                            .verifyMedicalDocument(leave.id)
                            .then(() => {
                              toast.success("Medical report verified");
                              setRows((current) =>
                                current.map((row) =>
                                  row.id === leave.id
                                    ? {
                                        ...row,
                                        medicalDocumentVerifiedAt: new Date().toISOString(),
                                      }
                                    : row,
                                ),
                              );
                            })
                            .catch((error) => toast.error((error as Error).message))
                        }
                      >
                        Verify medical
                      </Button>
                    )}
                  {leave.medicalDocumentVerifiedAt && (
                    <p className="mt-1 text-xs text-muted-foreground">Verified</p>
                  )}
                </div>
              )}
              {canReview(leave) ? (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => openDecision(leave, "Rejected")}>
                    Reject
                  </Button>
                  <Button onClick={() => openDecision(leave, "Approved")}>Approve</Button>
                </div>
              ) : (
                <p className="mt-4 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                  Awaiting {leave.approverName ?? "the assigned organization head"} (or a higher
                  head in their chain).
                </p>
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
      <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Approver</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.employeeName}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {l.approverName ?? "Not assigned"}
                  </TableCell>
                  <TableCell>{l.type}</TableCell>
                  <TableCell>{l.from}</TableCell>
                  <TableCell>{l.to}</TableCell>
                  <TableCell>{l.days}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {l.leaveCode === "LOP" ? (
                      <span className="text-xs text-muted-foreground">Not applicable</span>
                    ) : (
                      <>
                        {l.availableBalance ?? "—"} available
                        <br />
                        <span className="text-xs text-muted-foreground">
                          {l.projectedBalance ?? "—"} after
                        </span>
                      </>
                    )}
                  </TableCell>
                  <TableCell className="min-w-[260px] max-w-[420px] whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                    {l.reason}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={l.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end gap-2">
                      {l.type === "Sick Leave" && l.medicalDocumentUrl && (
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button size="sm" variant="outline" asChild>
                            <a
                              href={leaveApi.medicalFileUrl(l.medicalDocumentUrl)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Medical
                            </a>
                          </Button>
                          {!l.medicalDocumentVerifiedAt && (canApprove || canOversee) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                void leaveApi
                                  .verifyMedicalDocument(l.id)
                                  .then(() => {
                                    toast.success("Medical report verified");
                                    setRows((current) =>
                                      current.map((row) =>
                                        row.id === l.id
                                          ? {
                                              ...row,
                                              medicalDocumentVerifiedAt: new Date().toISOString(),
                                            }
                                          : row,
                                      ),
                                    );
                                  })
                                  .catch((error) => toast.error((error as Error).message))
                              }
                            >
                              Verify
                            </Button>
                          )}
                        </div>
                      )}
                      {canReview(l) ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openDecision(l, "Rejected")}
                          >
                            Reject
                          </Button>
                          <Button size="sm" onClick={() => openDecision(l, "Approved")}>
                            Approve
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Read only</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!loading && rows.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">No pending leave requests.</div>
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
              {leave.reason && (
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                  {leave.reason}
                </p>
              )}
              <div className="mt-3 border-t pt-3 text-sm">
                <p className="text-xs text-muted-foreground">Decision</p>
                <p className="font-medium">{leave.reviewerName ?? "System"}</p>
                {leave.decisionNote && (
                  <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                    {leave.decisionNote}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {leave.reviewedAt
                    ? new Date(leave.reviewedAt).toLocaleString()
                    : leave.updatedOn
                      ? new Date(leave.updatedOn).toLocaleDateString()
                      : "-"}
                </p>
              </div>
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
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Decision</TableHead>
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
                  <TableCell className="min-w-[260px] max-w-[420px] whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                    {leave.reason}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={leave.status} />
                  </TableCell>
                  <TableCell className="min-w-[220px] text-sm">
                    <p className="font-medium">{leave.reviewerName ?? "System"}</p>
                    {leave.decisionNote && (
                      <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                        {leave.decisionNote}
                      </p>
                    )}
                    <p className="mt-1 whitespace-nowrap text-xs text-muted-foreground">
                      {leave.reviewedAt
                        ? new Date(leave.reviewedAt).toLocaleString()
                        : leave.updatedOn
                          ? new Date(leave.updatedOn).toLocaleDateString()
                          : "-"}
                    </p>
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

      <section className="mt-8 border-t border-border pt-7">
        <div className="mb-3">
          <h2 className="text-base font-semibold">Weekly-off requests</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Weekly offs follow the same chain: primary head or any higher head can decide.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {pendingWeeklyOffs.map((request) => (
            <Card key={request.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{request.employeeName}</p>
                    <p className="text-sm text-muted-foreground">
                      {request.employeeCode} · {request.date}
                    </p>
                    {request.assignedApproverName && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Primary head: {request.assignedApproverName}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={request.status} />
                </div>
                {request.reason && (
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm">{request.reason}</p>
                )}
                {canApprove ? (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => reviewWeeklyOff(request.id, false)}>
                      Reject
                    </Button>
                    <Button onClick={() => reviewWeeklyOff(request.id, true)}>Approve</Button>
                  </div>
                ) : (
                  <p className="mt-4 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                    Read-only visibility. Organization heads in the employee chain review this
                    request.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
        {!loading && pendingWeeklyOffs.length === 0 && (
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

      <AlertDialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open && !reviewing) {
            setConfirm(null);
            setDecisionNote("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action === "Approved" ? "Approve leave request?" : "Reject leave request?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === "Approved"
                ? "Approval updates the employee's leave balance and attendance day logs. Attendance still takes priority if the employee punches in."
                : "A rejection closes this request without deducting leave credit. The employee will see your reason in Leave History."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="leave-decision-note">
              {confirm?.action === "Rejected" ? "Rejection reason" : "Approval note (optional)"}
            </Label>
            <Textarea
              id="leave-decision-note"
              rows={4}
              maxLength={1000}
              value={decisionNote}
              placeholder={
                confirm?.action === "Rejected"
                  ? "Explain why this request is being rejected"
                  : "Add any instruction or context for the employee"
              }
              onChange={(event) => setDecisionNote(event.target.value)}
            />
            <p className="text-right text-xs text-muted-foreground">{decisionNote.length}/1000</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reviewing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void apply();
              }}
              disabled={
                reviewing || (confirm?.action === "Rejected" && decisionNote.trim().length < 3)
              }
            >
              {reviewing ? "Saving..." : confirm?.action === "Approved" ? "Approve" : "Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ApprovalMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
