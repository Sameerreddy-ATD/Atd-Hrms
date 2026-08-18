import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { StatCard } from "@/components/common/StatCard";
import {
  ResponsiveListShell,
  MobileList,
  MobileListItem,
  MobileListHeader,
  MobileListFields,
  MobileListField,
  DesktopTable,
} from "@/components/common/ResponsiveList";
import { MedicalOpenLink, decisionLabel } from "@/components/leave/MedicalDocumentActions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { formatDisplayDate, formatDisplayDateRange } from "@/lib/india-date";
import { CalendarClock, CheckCircle2, Clock3 } from "lucide-react";

export const Route = createFileRoute("/_app/leave/approvals")({
  component: LeaveApprovalsPage,
});

function LeaveBalancePanel({ leave }: { leave: LeaveRequest }) {
  const { t } = useTranslation();
  const balances = leave.leaveBalances ?? [];
  const requested = leave.requestedDays ?? leave.days;
  const available = leave.availableBalance ?? 0;
  const after = leave.projectedBalance ?? available - requested;
  const otherPending = leave.otherPendingCount ?? 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 rounded-md border bg-muted/30 p-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">
            {t("pages.leaveApprovals.availableFor", { type: leave.type })}
          </p>
          <p className="text-lg font-semibold tabular-nums">{available}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t("pages.leaveApprovals.applyingFor")}</p>
          <p className="text-lg font-semibold tabular-nums">{requested}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">
            {t("pages.leaveApprovals.afterApproval")}
          </p>
          <p
            className={`text-lg font-semibold tabular-nums ${after < 0 ? "text-destructive" : ""}`}
          >
            {after}
          </p>
        </div>
      </div>
      {balances.length > 0 && (
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
              {balance.type}: <span className="tabular-nums">{balance.balance}</span>{" "}
              {t("pages.leaveApprovals.left")}
            </span>
          ))}
        </div>
      )}
      {otherPending > 0 && (
        <p className="text-xs text-amber-800 dark:text-amber-300">
          {t("pages.leaveApprovals.otherPending", { count: otherPending })}
        </p>
      )}
    </div>
  );
}

function LeaveApprovalsPage() {
  const { t } = useTranslation();
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

  useEffect(() => {
    if (!user) return;
    const peopleOps =
      user.role === "hr" ||
      user.role === "developer_admin" ||
      user.role === "main_admin" ||
      user.role === "ceo" ||
      user.role === "chief_of_staff";
    employeesApi
      .isReportingManager()
      .then((result) => {
        const allowed = result.isReportingManager || peopleOps;
        setCanApprove(allowed);
        setAccessChecked(true);
        if (!allowed) {
          void navigate({ to: "/leave/history", replace: true });
        }
      })
      .catch(() => {
        setAccessChecked(true);
        if (peopleOps) {
          setCanApprove(true);
          return;
        }
        setCanApprove(false);
        void navigate({ to: "/dashboard", replace: true });
      });
  }, [navigate, user]);

  useEffect(() => {
    if (!canApprove) return;
    Promise.all([
      leaveApi.assignedApprovals("PENDING"),
      leaveApi.assignedApprovals(),
      leaveApi.weeklyOffs(true, false),
    ])
      .then(([pending, all, weeklyRows]) => {
        setRows(pending);
        setHistory(all.filter((request) => request.status !== "Pending"));
        setWeeklyOffs(weeklyRows);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [canApprove]);

  const pendingWeekly = useMemo(
    () => weeklyOffs.filter((request) => request.status === "PENDING"),
    [weeklyOffs],
  );
  const weeklyHistory = useMemo(
    () => weeklyOffs.filter((request) => request.status !== "PENDING"),
    [weeklyOffs],
  );

  async function apply() {
    if (!confirm) return;
    const { id, action } = confirm;
    try {
      const updated =
        action === "Approved" ? await leaveApi.approve(id) : await leaveApi.reject(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
      setHistory((prev) => [updated, ...prev.filter((request) => request.id !== id)]);
      toast.success(
        action === "Approved"
          ? t("pages.leaveApprovals.toastRequestApproved")
          : t("pages.leaveApprovals.toastRequestRejected"),
      );
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
      setWeeklyOffs((current) => current.map((row) => (row.id === id ? updated : row)));
      toast.success(
        approve
          ? t("pages.leaveApprovals.toastWeeklyOffApproved")
          : t("pages.leaveApprovals.toastWeeklyOffRejected"),
      );
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const confirmLeave = confirm ? rows.find((leave) => leave.id === confirm.id) : undefined;

  if (!accessChecked || !canApprove) {
    return (
      <div className="space-y-4">
        <PageHeader
          title={t("pages.leaveApprovals.title")}
          description={t("pages.leaveApprovals.subtitleChain")}
        />
        <LoadingState
          label={
            accessChecked
              ? t("pages.leaveApprovals.redirectingToTracking")
              : t("pages.leaveApprovals.checkingAccess")
          }
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={t("pages.leaveApprovals.title")} description={t("pages.leaveApprovals.subtitle")} />
      {loading && <LoadingState label={t("pages.loading.leaveApprovals")} />}
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {!loading && (
        <>
          <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard
              label={t("pages.leaveApprovals.pendingLeave")}
              value={rows.length}
              icon={Clock3}
              tone="warning"
            />
            <StatCard
              label={t("pages.leaveApprovals.pendingWeekly")}
              value={pendingWeekly.length}
              icon={CalendarClock}
              tone="info"
            />
            <StatCard
              label={t("pages.leaveApprovals.approvedLeave")}
              value={history.filter((request) => request.status === "Approved").length}
              icon={CheckCircle2}
              tone="success"
            />
          </section>

          <Tabs defaultValue="pending-leave" className="space-y-4">
            <TabsList className="h-auto w-full flex-wrap justify-start">
              <TabsTrigger value="pending-leave">
                {t("pages.leaveApprovals.pendingLeaveTab", { count: rows.length })}
              </TabsTrigger>
              <TabsTrigger value="weekly-off">
                {t("pages.leaveApprovals.weeklyOffTab", { count: pendingWeekly.length })}
              </TabsTrigger>
              <TabsTrigger value="history">
                {t("pages.leaveApprovals.historyTab", { count: history.length })}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending-leave" className="space-y-3">
              {rows.length === 0 ? (
                <EmptyState
                  title={t("pages.leaveApprovals.emptyLeave")}
                  description={t("pages.leaveApprovals.emptyLeaveHelp")}
                />
              ) : (
                rows.map((leave) => (
                  <Card key={leave.id}>
                    <CardContent className="space-y-4 p-4 sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-semibold">{leave.employeeName}</p>
                          <p className="text-sm text-muted-foreground">
                            {leave.type} · {formatDisplayDateRange(leave.from, leave.to)} ·{" "}
                            {t("pages.leaveApply.dayCount", { count: leave.days })}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t("pages.leaveHistory.applied")} {formatDisplayDate(leave.appliedOn)}
                            {leave.approverName
                              ? ` · ${t("pages.leaveApprovals.primaryHead", { name: leave.approverName })}`
                              : ""}
                          </p>
                        </div>
                        <StatusBadge status={leave.status} />
                      </div>
                      <LeaveBalancePanel leave={leave} />
                      <div>
                        <p className="text-xs text-muted-foreground">Reason</p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">
                          {leave.reason || "-"}
                        </p>
                      </div>
                      {leave.type === "Sick Leave" && (
                        <div className="space-y-2 rounded-md border p-3 text-sm">
                          <MedicalOpenLink url={leave.medicalDocumentUrl} />
                          {leave.medicalDocumentVerifiedAt ? (
                            <p className="text-xs text-muted-foreground">Verified by HR</p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Medical verification is completed by HR in Leave Tracking.
                            </p>
                          )}
                        </div>
                      )}
                      {canApprove && leave.status === "Pending" && (
                        <div className="flex flex-wrap gap-2">
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
                ))
              )}
            </TabsContent>

            <TabsContent value="weekly-off" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                One weekly off per Monday–Sunday week. Consecutive weekly-off dates are blocked.
              </p>
              {pendingWeekly.length === 0 ? (
                <EmptyState
                  title={t("pages.leaveApprovals.emptyWeekly")}
                  description={t("pages.leaveApprovals.emptyWeeklyHelp")}
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {pendingWeekly.map((request) => (
                    <Card key={request.id}>
                      <CardContent className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{request.employeeName}</p>
                            <p className="text-sm text-muted-foreground">
                              {formatDisplayDate(request.date)}
                            </p>
                          </div>
                          <StatusBadge status={request.status} />
                        </div>
                        {request.reason && <p className="text-sm">{request.reason}</p>}
                        {canApprove && (
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              variant="outline"
                              onClick={() => void reviewWeeklyOff(request.id, false)}
                            >
                              Reject
                            </Button>
                            <Button onClick={() => void reviewWeeklyOff(request.id, true)}>
                              Approve
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
              {weeklyHistory.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Weekly-off history</h3>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {weeklyHistory.map((request) => (
                      <div
                        key={request.id}
                        className="flex items-start justify-between gap-3 rounded-md border bg-background p-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{request.employeeName}</p>
                          <p className="text-xs text-muted-foreground">
                            {request.employeeCode} · {formatDisplayDate(request.date)}
                          </p>
                        </div>
                        <StatusBadge status={request.status} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="history">
              <ResponsiveListShell>
                <MobileList>
                  {history.map((leave) => (
                    <MobileListItem key={leave.id} intrinsicSize="180px">
                      <MobileListHeader
                        title={leave.employeeName}
                        meta={leave.type}
                        trailing={<StatusBadge status={leave.status} />}
                      />
                      <MobileListFields>
                        <MobileListField
                          label="Dates"
                          value={formatDisplayDateRange(leave.from, leave.to)}
                          className="col-span-2"
                        />
                        <MobileListField label="Days" value={leave.days} />
                        <MobileListField label="Decision" value={decisionLabel(leave)} />
                      </MobileListFields>
                    </MobileListItem>
                  ))}
                </MobileList>
                <DesktopTable>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Dates</TableHead>
                        <TableHead>Decision</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((leave) => (
                        <TableRow key={leave.id}>
                          <TableCell className="font-medium">{leave.employeeName}</TableCell>
                          <TableCell>
                            <div>{leave.type}</div>
                            <div className="text-xs text-muted-foreground">{leave.days} day(s)</div>
                          </TableCell>
                          <TableCell>{formatDisplayDateRange(leave.from, leave.to)}</TableCell>
                          <TableCell className="text-sm">{decisionLabel(leave)}</TableCell>
                          <TableCell>
                            <StatusBadge status={leave.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </DesktopTable>
                {history.length === 0 && (
                  <EmptyState
                    title={t("pages.leaveApprovals.emptyDone")}
                    description={t("pages.leaveApprovals.emptyDoneHelp")}
                  />
                )}
              </ResponsiveListShell>
            </TabsContent>
          </Tabs>
        </>
      )}

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
                    <p className="font-medium">
                      {confirmLeave.employeeName} · {confirmLeave.type}
                    </p>
                    <p className="mt-1">
                      Applying for{" "}
                      <strong>{confirmLeave.requestedDays ?? confirmLeave.days}</strong> day
                      {(confirmLeave.requestedDays ?? confirmLeave.days) === 1 ? "" : "s"} (
                      {formatDisplayDateRange(confirmLeave.from, confirmLeave.to)}). Available{" "}
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
            <AlertDialogAction onClick={() => void apply()}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
