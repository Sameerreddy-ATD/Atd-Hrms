import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TableToolbar } from "@/components/common/TableToolbar";
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
import {
  MedicalDocumentUploadCard,
  decisionLabel,
} from "@/components/leave/MedicalDocumentActions";
import { formatDisplayDate, formatDisplayDateRange } from "@/lib/india-date";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LeaveRequest } from "@/types/domain";
import { leaveApi } from "@/services/api";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_app/leave/history")({
  component: LeaveHistoryPage,
});

function LeaveHistoryPage() {
  const { t } = useTranslation();
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [cancelling, setCancelling] = useState<LeaveRequest | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    leaveApi
      .mine()
      .then(setLeaveRequests)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const medicalDue = useMemo(
    () =>
      leaveRequests.filter(
        (leave) =>
          leave.type === "Sick Leave" && leave.medicalDocumentDueAt && !leave.medicalDocumentUrl,
      ),
    [leaveRequests],
  );

  const visible = useMemo(() => {
    if (statusFilter === "all") return leaveRequests;
    return leaveRequests.filter((leave) => leave.status === statusFilter);
  }, [leaveRequests, statusFilter]);

  async function confirmCancel() {
    if (!cancelling) return;
    setCancellingId(cancelling.id);
    try {
      const updated = await leaveApi.cancel(cancelling.id);
      setLeaveRequests((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
      toast.success(t("pages.leaveHistory.toastCancelled"));
      setCancelling(null);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title={t("pages.leaveHistory.title")}
        description={t("pages.leaveHistory.subtitle")}
        actions={
          <Button size="sm" asChild>
            <Link to="/leave/apply">
              <Plus className="mr-2 h-4 w-4" />
              {t("pages.attendanceMine.applyLeave")}
            </Link>
          </Button>
        }
      />
      {loading && <LoadingState label={t("pages.loading.leaveHistory")} />}
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {!loading && medicalDue.length > 0 && (
        <div className="mb-4 grid gap-3 lg:grid-cols-2">
          {medicalDue.map((leave) => (
            <MedicalDocumentUploadCard
              key={`medical-${leave.id}`}
              leave={leave}
              onUpdated={(updated) =>
                setLeaveRequests((rows) =>
                  rows.map((row) => (row.id === updated.id ? updated : row)),
                )
              }
            />
          ))}
        </div>
      )}

      {!loading && (
        <>
          <TableToolbar>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="sm:w-44">
                <SelectValue placeholder={t("pages.leaveHistory.statusPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("pages.leaveHistory.allStatuses")}</SelectItem>
                <SelectItem value="Pending">{t("common.pending")}</SelectItem>
                <SelectItem value="Approved">{t("common.approved")}</SelectItem>
                <SelectItem value="Rejected">{t("common.rejected")}</SelectItem>
                <SelectItem value="Cancelled">{t("pages.leaveHistory.cancelled")}</SelectItem>
              </SelectContent>
            </Select>
          </TableToolbar>

          <ResponsiveListShell>
            <MobileList>
              {visible.map((leave) => (
                <MobileListItem key={leave.id} intrinsicSize="200px">
                  <MobileListHeader
                    title={leave.type}
                    meta={formatDisplayDateRange(leave.from, leave.to)}
                    trailing={<StatusBadge status={leave.status} />}
                  />
                  <MobileListFields>
                    <MobileListField label={t("pages.leaveHistory.days")} value={leave.days} />
                    <MobileListField
                      label={t("pages.leaveHistory.applied")}
                      value={formatDisplayDate(leave.appliedOn)}
                    />
                    <MobileListField
                      label={t("pages.leaveHistory.assignedHead")}
                      value={leave.approverName ?? "-"}
                    />
                    <MobileListField
                      label={t("pages.leaveHistory.decision")}
                      value={decisionLabel(leave)}
                    />
                  </MobileListFields>
                  {(leave.cancelledDates?.length ?? 0) > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t("pages.leaveHistory.cancelledDates", {
                        dates: leave.cancelledDates?.map((d) => formatDisplayDate(d)).join(", "),
                      })}
                    </p>
                  )}
                  {["Pending", "Approved"].includes(leave.status) && (
                    <MobileListActions>
                      <Button
                        className="w-full"
                        variant="outline"
                        size="sm"
                        disabled={cancellingId === leave.id}
                        onClick={() => setCancelling(leave)}
                      >
                        {t("pages.leaveHistory.cancelLeave")}
                      </Button>
                    </MobileListActions>
                  )}
                </MobileListItem>
              ))}
            </MobileList>

            <DesktopTable>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("pages.corrections.type")}</TableHead>
                    <TableHead>{t("pages.leaveHistory.dates")}</TableHead>
                    <TableHead>{t("pages.leaveHistory.days")}</TableHead>
                    <TableHead>{t("pages.leaveHistory.assignedHead")}</TableHead>
                    <TableHead>{t("pages.leaveHistory.decision")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                    <TableHead className="text-right">{t("pages.leaveHistory.action")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((leave) => (
                    <TableRow key={leave.id}>
                      <TableCell className="font-medium">{leave.type}</TableCell>
                      <TableCell>
                        <div>{formatDisplayDateRange(leave.from, leave.to)}</div>
                        <div className="text-xs text-muted-foreground">
                          {t("pages.leaveHistory.applied")} {formatDisplayDate(leave.appliedOn)}
                        </div>
                        {(leave.cancelledDates?.length ?? 0) > 0 && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {t("pages.leaveHistory.cancelledDates", {
                              dates: leave.cancelledDates
                                ?.map((d) => formatDisplayDate(d))
                                .join(", "),
                            })}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{leave.days}</TableCell>
                      <TableCell>{leave.approverName ?? "-"}</TableCell>
                      <TableCell className="text-sm">{decisionLabel(leave)}</TableCell>
                      <TableCell>
                        <StatusBadge status={leave.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {["Pending", "Approved"].includes(leave.status) && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={cancellingId === leave.id}
                            onClick={() => setCancelling(leave)}
                          >
                            {t("common.cancel")}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DesktopTable>

            {visible.length === 0 && (
              <EmptyState
                title={t("pages.leaveHistory.empty")}
                description={
                  statusFilter === "all"
                    ? t("pages.leaveHistory.emptyHelp")
                    : t("pages.leaveHistory.noStatusRequests", {
                        status: statusFilter.toLowerCase(),
                      })
                }
              />
            )}
          </ResponsiveListShell>
        </>
      )}

      <AlertDialog open={!!cancelling} onOpenChange={(open) => !open && setCancelling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("pages.leaveHistory.cancelDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("pages.leaveHistory.cancelDialogDesc")}
              {cancelling
                ? ` (${cancelling.type}: ${formatDisplayDateRange(cancelling.from, cancelling.to)})`
                : ""}
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("pages.dashboard.keepLeave")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmCancel()}>
              {t("pages.leaveHistory.cancelLeave")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
