import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TableToolbar } from "@/components/common/TableToolbar";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ResponsiveListShell,
  MobileList,
  MobileListItem,
  MobileListHeader,
  MobileListFields,
  MobileListField,
  MobileListActions,
  DesktopTable,
} from "@/components/common/ResponsiveList";
import { attendanceApi } from "@/services/api";
import type { AttendanceRecord } from "@/types/domain";
import { formatDisplayDate, indiaDateKeyShift } from "@/lib/india-date";
import { useAuth } from "@/lib/auth";
import { punchTypeLabel } from "@/lib/attendance-labels";
import { ArrowRight, Check, X, FileClock, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_app/attendance/corrections")({
  component: AttendanceCorrectionsPage,
});

interface CorrectionRequestItem {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  date: string;
  punchTime: string;
  eventType: string;
  remarks: string;
  status: string;
  createdAt: string;
  canReview: boolean;
  approverName?: string | null;
}

function AttendanceCorrectionsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [rows, setRows] = useState<AttendanceRecord[]>([]);
  const [requests, setRequests] = useState<CorrectionRequestItem[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingReqs, setLoadingReqs] = useState(true);
  const [actionId, setActionId] = useState("");
  const [error, setError] = useState("");
  const [punchOutTarget, setPunchOutTarget] = useState<AttendanceRecord | null>(null);
  const [punchOutTime, setPunchOutTime] = useState("18:00");
  const [punchOutRemarks, setPunchOutRemarks] = useState("Missed punch-out corrected by HR");

  const canRecalculate = user && ["developer_admin", "main_admin", "hr"].includes(user.role);
  const canHrCorrect = user && ["developer_admin", "main_admin", "hr"].includes(user.role);

  const loadAlerts = useCallback(() => {
    setLoading(true);
    setError("");
    const yesterdayStr = indiaDateKeyShift(-1);
    const queryFrom = from || yesterdayStr;
    const queryTo = to || yesterdayStr;
    attendanceApi
      .list({ status: "Missed", from: queryFrom, to: queryTo })
      .then((records) =>
        setRows(
          records.filter(
            (record) => record.status.includes("Missed") || record.status.includes("Manual"),
          ),
        ),
      )
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => {
    const yesterdayStr = indiaDateKeyShift(-1);
    setFrom(yesterdayStr);
    setTo(yesterdayStr);
  }, []);

  const loadRequests = useCallback(() => {
    setLoadingReqs(true);
    attendanceApi
      .listCorrectionRequests()
      .then(setRequests)
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setLoadingReqs(false));
  }, []);

  useEffect(() => {
    loadAlerts();
    loadRequests();
  }, [loadAlerts, loadRequests]);

  async function submitPunchOut() {
    if (!punchOutTarget || !punchOutRemarks.trim()) return;
    setActionId(punchOutTarget.id);
    try {
      const punchTime = new Date(`${punchOutTarget.date}T${punchOutTime}:00+05:30`);
      const eventType = punchOutTarget.status.includes("Field") ? "FIELD_CHECK_OUT" : "OFFICE_OUT";
      await attendanceApi.hrPunchCorrection({
        employeeId: punchOutTarget.employeeId,
        date: new Date(punchOutTarget.date),
        punchTime,
        eventType,
        remarks: punchOutRemarks.trim(),
      });
      toast.success(t("pages.corrections.toastPunchOutAdded"));
      setPunchOutTarget(null);
      loadAlerts();
    } catch (err) {
      toast.error((err as Error).message || t("pages.corrections.toastPunchOutFailed"));
    } finally {
      setActionId("");
    }
  }

  async function recalculate(row: AttendanceRecord) {
    setActionId(row.id);
    try {
      const updated = await attendanceApi.recalculate(row.employeeId, row.date);
      setRows((current) => current.map((item) => (item.id === row.id ? updated : item)));
      toast.success(t("pages.corrections.toastRecalculated"));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setActionId("");
    }
  }

  async function handleApprove(id: string) {
    setActionId(id);
    try {
      await attendanceApi.approveCorrectionRequest(id);
      toast.success(t("pages.corrections.toastApproved"));
      loadRequests();
      loadAlerts();
    } catch (err) {
      toast.error((err as Error).message || t("pages.corrections.toastApproveFailed"));
    } finally {
      setActionId("");
    }
  }

  async function handleReject(id: string) {
    setActionId(id);
    try {
      await attendanceApi.rejectCorrectionRequest(id);
      toast.success(t("pages.corrections.toastRejected"));
      loadRequests();
    } catch (err) {
      toast.error((err as Error).message || t("pages.corrections.toastRejectFailed"));
    } finally {
      setActionId("");
    }
  }

  const pendingRequests = requests.filter((r) => r.status === "PENDING");
  const reviewableRequests = pendingRequests.filter((request) => request.canReview);

  function openDayLogs(employeeId: string, employeeName: string, date: string) {
    sessionStorage.setItem(
      "attendance-day-log-selection",
      JSON.stringify({ employeeId, employeeName, from: date, to: date }),
    );
    void navigate({ to: "/attendance/locations" });
  }

  return (
    <div>
      <PageHeader
        title={t("pages.corrections.title")}
        description={t("pages.corrections.subtitle")}
      />

      <Tabs defaultValue="requests" className="mt-6 w-full">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:max-w-md">
          <TabsTrigger
            value="requests"
            className="min-h-11 flex-col gap-0.5 rounded-md py-2 text-xs font-semibold sm:flex-row sm:gap-2 sm:text-sm"
          >
            <FileClock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="sm:hidden">
              {t("pages.corrections.tabRequestsMobile", { count: pendingRequests.length })}
            </span>
            <span className="hidden sm:inline">
              {t("pages.corrections.tabRequestsDesktop", { count: pendingRequests.length })}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="alerts"
            className="min-h-11 flex-col gap-0.5 rounded-md py-2 text-xs font-semibold sm:flex-row sm:gap-2 sm:text-sm"
          >
            <AlertTriangle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="sm:hidden">
              {t("pages.corrections.tabAlertsMobile", { count: rows.length })}
            </span>
            <span className="hidden sm:inline">
              {t("pages.corrections.tabAlertsDesktop", { count: rows.length })}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="mt-4">
          {loadingReqs && <LoadingState label={t("pages.loading.corrections")} compact />}
          {!loadingReqs && pendingRequests.length > 0 && (
            <div className="mb-4 rounded-md border border-border bg-muted/30 px-4 py-3 text-sm">
              {reviewableRequests.length > 0 ? (
                <p>
                  <span className="font-semibold">{reviewableRequests.length}</span>{" "}
                  {t("pages.corrections.waitingDecision", { count: reviewableRequests.length })}
                </p>
              ) : (
                <p className="text-muted-foreground">{t("pages.corrections.trackingOnly")}</p>
              )}
            </div>
          )}

          {/* Mobile: card list with inline approve/reject */}
          <div className="space-y-3 md:hidden">
            {pendingRequests.map((req) => (
              <div key={req.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{req.employeeName}</p>
                    <p className="text-xs text-muted-foreground">
                      {req.employeeCode || req.employeeId}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {punchTypeLabel(req.eventType)}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("pages.corrections.requestedDate")}
                    </p>
                    <p className="font-medium">{formatDisplayDate(req.date)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("pages.corrections.punchTime")}
                    </p>
                    <p className="font-medium">
                      {new Date(req.punchTime).toLocaleTimeString("en-IN", {
                        timeZone: "Asia/Kolkata",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
                {req.remarks && (
                  <p className="mt-2 break-words text-sm text-muted-foreground">{req.remarks}</p>
                )}
                <div className="mt-3 space-y-2">
                  {req.canReview && (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        className="min-h-11 bg-emerald-600 text-white hover:bg-emerald-700"
                        disabled={actionId === req.id}
                        onClick={() => handleApprove(req.id)}
                      >
                        <Check className="mr-1 h-4 w-4" /> {t("common.approve")}
                      </Button>
                      <Button
                        variant="destructive"
                        className="min-h-11"
                        disabled={actionId === req.id}
                        onClick={() => handleReject(req.id)}
                      >
                        <X className="mr-1 h-4 w-4" /> {t("common.reject")}
                      </Button>
                    </div>
                  )}
                  {!req.canReview && (
                    <p className="rounded-md bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
                      {t("pages.corrections.awaiting", {
                        name: req.approverName || t("pages.corrections.assignedHeadFallback"),
                      })}
                    </p>
                  )}
                  <Button
                    variant="outline"
                    className="min-h-11 w-full"
                    onClick={() => openDayLogs(req.employeeId, req.employeeName, req.date)}
                  >
                    {t("pages.corrections.openDayLogs")} <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {!loadingReqs && pendingRequests.length === 0 && (
              <EmptyState
                title={t("pages.corrections.emptyPending")}
                description={t("pages.corrections.emptyPendingHelp")}
              />
            )}
          </div>

          <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
            <div className="overflow-x-auto">
              <Table className="min-w-[800px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.employee")}</TableHead>
                    <TableHead>{t("pages.corrections.requestedDate")}</TableHead>
                    <TableHead>{t("pages.corrections.punchTime")}</TableHead>
                    <TableHead>{t("pages.corrections.type")}</TableHead>
                    <TableHead>{t("pages.corrections.reason")}</TableHead>
                    <TableHead>{t("pages.corrections.submittedOn")}</TableHead>
                    <TableHead>{t("pages.leaveApply.approver")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingRequests.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell>
                        <div className="font-medium">{req.employeeName}</div>
                        <div className="text-xs text-muted-foreground">
                          {req.employeeCode || req.employeeId}
                        </div>
                      </TableCell>
                      <TableCell>{formatDisplayDate(req.date)}</TableCell>
                      <TableCell>
                        {new Date(req.punchTime).toLocaleTimeString("en-IN", {
                          timeZone: "Asia/Kolkata",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="text-xs">{punchTypeLabel(req.eventType)}</TableCell>
                      <TableCell
                        className="max-w-xs truncate text-muted-foreground"
                        title={req.remarks}
                      >
                        {req.remarks}
                      </TableCell>
                      <TableCell>{formatDisplayDate(req.createdAt)}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {req.canReview
                          ? t("pages.corrections.yourDecision")
                          : (req.approverName ?? t("pages.leaveApply.notAssigned"))}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openDayLogs(req.employeeId, req.employeeName, req.date)}
                          >
                            {t("pages.corrections.openDayLogs")}{" "}
                            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                          </Button>
                          {req.canReview && (
                            <>
                              <Button
                                size="sm"
                                className="bg-emerald-600 text-white hover:bg-emerald-700"
                                disabled={actionId === req.id}
                                onClick={() => handleApprove(req.id)}
                              >
                                <Check className="mr-1 h-3.5 w-3.5" /> {t("common.approve")}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={actionId === req.id}
                                onClick={() => handleReject(req.id)}
                              >
                                <X className="mr-1 h-3.5 w-3.5" /> {t("common.reject")}
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {!loadingReqs && pendingRequests.length === 0 && (
              <div className="p-6">
                <EmptyState
                  title={t("pages.corrections.emptyPending")}
                  description={t("pages.corrections.emptyPendingHelp")}
                />
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="alerts" className="mt-4">
          <TableToolbar>
            <DateField
              value={from}
              max={to || undefined}
              onChange={(nextFrom) => {
                setFrom(nextFrom);
                if (to && nextFrom && to < nextFrom) setTo(nextFrom);
              }}
              className="sm:w-auto"
              aria-label={t("pages.dayLogs.ariaFromDate")}
            />
            <DateField
              value={to}
              min={from || undefined}
              onChange={setTo}
              className="sm:w-auto"
              aria-label={t("pages.dayLogs.ariaToDate")}
            />
          </TableToolbar>

          {loading && <LoadingState label={t("pages.loading.systemAlerts")} compact />}
          {error && <p className="text-sm text-destructive">{error}</p>}

          <ResponsiveListShell>
            <MobileList>
              {rows.map((row) => (
                <MobileListItem key={row.id} intrinsicSize="200px">
                  <MobileListHeader
                    title={row.employeeName}
                    meta={row.employeeCode || row.employeeId}
                    trailing={<StatusBadge status={row.status} />}
                  />
                  <MobileListFields>
                    <MobileListField label={t("common.date")} value={formatDisplayDate(row.date)} />
                    <MobileListField label={t("pages.dashboard.colSource")} value={row.source} />
                    <MobileListField
                      label={t("pages.corrections.punchIn")}
                      value={row.punchIn ?? "-"}
                    />
                    <MobileListField
                      label={t("pages.corrections.punchOut")}
                      value={row.punchOut ?? "-"}
                    />
                  </MobileListFields>
                  <MobileListActions>
                    <Button
                      className="w-full"
                      size="sm"
                      variant="outline"
                      onClick={() => openDayLogs(row.employeeId, row.employeeName, row.date)}
                    >
                      {t("pages.corrections.openDayLogs")} <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                    {canHrCorrect &&
                      (row.status.includes("Missed Punch") ||
                        row.status.includes("Missed Checkout")) && (
                        <Button
                          className="w-full"
                          size="sm"
                          disabled={actionId === row.id}
                          onClick={() => setPunchOutTarget(row)}
                        >
                          {t("pages.corrections.addPunchOut")}
                        </Button>
                      )}
                    {canRecalculate && (
                      <Button
                        className="w-full"
                        size="sm"
                        variant="outline"
                        disabled={actionId === row.id}
                        onClick={() => recalculate(row)}
                      >
                        {t("pages.corrections.recalculate")}
                      </Button>
                    )}
                  </MobileListActions>
                </MobileListItem>
              ))}
            </MobileList>
            <DesktopTable>
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.employee")}</TableHead>
                    <TableHead>{t("common.date")}</TableHead>
                    <TableHead>{t("pages.corrections.punchIn")}</TableHead>
                    <TableHead>{t("pages.corrections.punchOut")}</TableHead>
                    <TableHead>{t("pages.dashboard.colSource")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.employeeName}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.employeeCode || row.employeeId}
                        </div>
                      </TableCell>
                      <TableCell>{formatDisplayDate(row.date)}</TableCell>
                      <TableCell>{row.punchIn ?? "-"}</TableCell>
                      <TableCell>{row.punchOut ?? "-"}</TableCell>
                      <TableCell>{row.source}</TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openDayLogs(row.employeeId, row.employeeName, row.date)}
                          >
                            {t("pages.corrections.openDayLogs")}{" "}
                            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                          </Button>
                          {canHrCorrect &&
                            (row.status.includes("Missed Punch") ||
                              row.status.includes("Missed Checkout")) && (
                              <Button
                                size="sm"
                                disabled={actionId === row.id}
                                onClick={() => setPunchOutTarget(row)}
                              >
                                {t("pages.corrections.addPunchOut")}
                              </Button>
                            )}
                          {canRecalculate && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={actionId === row.id}
                              onClick={() => recalculate(row)}
                            >
                              {t("pages.corrections.recalculate")}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DesktopTable>
            {!loading && rows.length === 0 && (
              <div className="p-6">
                <EmptyState
                  title={t("pages.corrections.emptyAlerts")}
                  description={t("pages.corrections.emptyAlertsHelp")}
                />
              </div>
            )}
          </ResponsiveListShell>
        </TabsContent>
      </Tabs>

      <Dialog open={!!punchOutTarget} onOpenChange={(open) => !open && setPunchOutTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("pages.corrections.addPunchOut")}</DialogTitle>
          </DialogHeader>
          {punchOutTarget && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {punchOutTarget.employeeName} · {formatDisplayDate(punchOutTarget.date)}
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="punch-out-time">{t("pages.corrections.punchOutTime")}</Label>
                <Input
                  id="punch-out-time"
                  type="time"
                  value={punchOutTime}
                  onChange={(e) => setPunchOutTime(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="punch-out-remarks">{t("pages.corrections.remarks")}</Label>
                <Textarea
                  id="punch-out-remarks"
                  rows={3}
                  value={punchOutRemarks}
                  onChange={(e) => setPunchOutRemarks(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPunchOutTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={submitPunchOut} disabled={!punchOutRemarks.trim() || !!actionId}>
              {t("pages.corrections.submitCorrection")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
