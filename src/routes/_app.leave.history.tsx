import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
      toast.success("Leave cancellation recorded");
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
        title="Leave History"
        description="All your submitted leave requests and their current status."
        actions={
          <Button size="sm" asChild>
            <Link to="/leave/apply">
              <Plus className="mr-2 h-4 w-4" />
              Apply leave
            </Link>
          </Button>
        }
      />
      {loading && <LoadingState label="Loading leave history" />}
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
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Approved">Approved</SelectItem>
                <SelectItem value="Rejected">Rejected</SelectItem>
                <SelectItem value="Cancelled">Cancelled</SelectItem>
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
                    <MobileListField label="Days" value={leave.days} />
                    <MobileListField label="Applied" value={formatDisplayDate(leave.appliedOn)} />
                    <MobileListField label="Assigned head" value={leave.approverName ?? "-"} />
                    <MobileListField label="Decision" value={decisionLabel(leave)} />
                  </MobileListFields>
                  {(leave.cancelledDates?.length ?? 0) > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Cancelled:{" "}
                      {leave.cancelledDates?.map((d) => formatDisplayDate(d)).join(", ")}
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
                        Cancel leave
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
                    <TableHead>Type</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Assigned head</TableHead>
                    <TableHead>Decision</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((leave) => (
                    <TableRow key={leave.id}>
                      <TableCell className="font-medium">{leave.type}</TableCell>
                      <TableCell>
                        <div>{formatDisplayDateRange(leave.from, leave.to)}</div>
                        <div className="text-xs text-muted-foreground">
                          Applied {formatDisplayDate(leave.appliedOn)}
                        </div>
                        {(leave.cancelledDates?.length ?? 0) > 0 && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            Cancelled:{" "}
                            {leave.cancelledDates?.map((d) => formatDisplayDate(d)).join(", ")}
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
                            Cancel
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
                title="No leave requests"
                description={
                  statusFilter === "all"
                    ? "Apply leave to see your history here."
                    : `No ${statusFilter.toLowerCase()} requests.`
                }
              />
            )}
          </ResponsiveListShell>
        </>
      )}

      <AlertDialog open={!!cancelling} onOpenChange={(open) => !open && setCancelling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel leave request?</AlertDialogTitle>
            <AlertDialogDescription>
              This cancels remaining current and future dates in the request
              {cancelling
                ? ` (${cancelling.type}: ${formatDisplayDateRange(cancelling.from, cancelling.to)})`
                : ""}
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep leave</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmCancel()}>Cancel leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
