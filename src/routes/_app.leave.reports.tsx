import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TableToolbar } from "@/components/common/TableToolbar";
import { StatCard } from "@/components/common/StatCard";
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
import { MedicalOpenLink, MedicalVerifyButton } from "@/components/leave/MedicalDocumentActions";
import { formatDisplayDate, formatDisplayDateRange, formatDisplayDateTime } from "@/lib/india-date";
import { Button } from "@/components/ui/button";
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
import { leaveApi } from "@/services/api";
import type { LeaveRequest } from "@/types/domain";
import { downloadCsv } from "@/lib/csv";
import { useAuth } from "@/lib/auth";
import { CheckCircle2, Clock3, Download, XCircle } from "lucide-react";

export const Route = createFileRoute("/_app/leave/reports")({
  component: LeaveReportsPage,
});

function LeaveReportsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<LeaveRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const canVerifyMedicalReport = ["developer_admin", "main_admin", "hr"].includes(user?.role ?? "");

  useEffect(() => {
    setLoading(true);
    setError("");
    leaveApi
      .list(statusFilter === "all" ? {} : { status: statusFilter })
      .then(setRows)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  const pendingCount = rows.filter((row) => row.status === "Pending").length;
  const approvedCount = rows.filter((row) => row.status === "Approved").length;
  const rejectedCount = rows.filter((row) => row.status === "Rejected").length;
  const showStatusBreakdown = statusFilter === "all";

  const csvRows = rows.map((row) => ({
    employee: row.employeeName,
    employeeId: row.employeeId,
    organizationApprover: row.approverName ?? row.managerName ?? "",
    leaveType: row.type,
    from: formatDisplayDate(row.from),
    to: formatDisplayDate(row.to),
    days: row.days,
    status: row.status,
    workflow: row.workflowStatus ?? row.status,
    appliedOn: formatDisplayDate(row.appliedOn),
    updatedOn: row.updatedOn ? formatDisplayDate(row.updatedOn) : "",
    reason: row.reason,
    medicalDocument: row.medicalDocumentUrl ?? "",
    medicalDocumentDue: row.medicalDocumentDueAt
      ? formatDisplayDateTime(row.medicalDocumentDueAt)
      : "",
    medicalDocumentVerified: row.medicalDocumentVerifiedAt
      ? formatDisplayDateTime(row.medicalDocumentVerifiedAt)
      : "",
  }));

  return (
    <div>
      <PageHeader
        title="Leave Tracking"
        description="Organization-wide leave requests. Organization heads approve leave; HR verifies sick-leave medical reports here."
        actions={
          <Button
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={rows.length === 0}
            onClick={() => downloadCsv("leave-tracking.csv", csvRows)}
          >
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        }
      />
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <LoadingState label="Loading leave requests" />}
      {!loading && (
        <>
          {showStatusBreakdown ? (
            <section className="mb-4 grid gap-3 sm:grid-cols-3">
              <StatCard label="Pending" value={pendingCount} icon={Clock3} tone="warning" />
              <StatCard label="Approved" value={approvedCount} icon={CheckCircle2} tone="success" />
              <StatCard label="Rejected" value={rejectedCount} icon={XCircle} />
            </section>
          ) : (
            <section className="mb-4">
              <StatCard
                label="Matching requests"
                value={rows.length}
                icon={Clock3}
                hint={`Filtered to ${statusFilter.toLowerCase()} leave`}
              />
            </section>
          )}

          <TableToolbar>
            <p className="text-sm text-muted-foreground sm:mr-auto">
              {rows.length} leave request{rows.length === 1 ? "" : "s"}
            </p>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="sm:w-44">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All requests</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </TableToolbar>

          <ResponsiveListShell>
            <MobileList>
              {rows.map((row) => (
                <MobileListItem key={row.id} intrinsicSize="220px">
                  <MobileListHeader
                    title={row.employeeName}
                    meta={row.employeeId}
                    trailing={<StatusBadge status={row.status} />}
                  />
                  <MobileListFields>
                    <MobileListField label="Type" value={row.type} />
                    <MobileListField label="Days" value={row.days} />
                    <MobileListField
                      label="Dates"
                      value={formatDisplayDateRange(row.from, row.to)}
                      className="col-span-2"
                    />
                    <MobileListField
                      label="Approver"
                      value={row.approverName ?? row.managerName ?? "-"}
                    />
                    <MobileListField label="Flow" value={row.workflowStatus ?? row.status} />
                  </MobileListFields>
                  {row.reason && (
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{row.reason}</p>
                  )}
                  {row.type === "Sick Leave" && (
                    <div className="mt-3 space-y-2 rounded-md border p-3 text-sm">
                      <MedicalOpenLink url={row.medicalDocumentUrl} />
                      <p className="text-xs text-muted-foreground">
                        {row.medicalDocumentVerifiedAt
                          ? "Verified by HR"
                          : `Due ${row.medicalDocumentDueAt ? formatDisplayDateTime(row.medicalDocumentDueAt) : "-"}`}
                      </p>
                      {canVerifyMedicalReport &&
                        row.medicalDocumentUrl &&
                        !row.medicalDocumentVerifiedAt && (
                          <MobileListActions>
                            <MedicalVerifyButton
                              leaveId={row.id}
                              onVerified={(updated) =>
                                setRows((current) =>
                                  current.map((item) => (item.id === row.id ? updated : item)),
                                )
                              }
                            />
                          </MobileListActions>
                        )}
                    </div>
                  )}
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
                    <TableHead>Approver</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Medical</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.employeeName}</div>
                        <div className="text-xs text-muted-foreground">{row.employeeId}</div>
                        {row.reason && (
                          <div className="mt-1 max-w-xs truncate text-xs text-muted-foreground">
                            {row.reason}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div>{row.type}</div>
                        <div className="text-xs text-muted-foreground">{row.days} day(s)</div>
                      </TableCell>
                      <TableCell>
                        <div>{formatDisplayDateRange(row.from, row.to)}</div>
                        <div className="text-xs text-muted-foreground">
                          Applied {formatDisplayDate(row.appliedOn)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>{row.approverName ?? row.managerName ?? "-"}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.workflowStatus ?? row.status}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.type === "Sick Leave" ? (
                          <div className="space-y-2">
                            <MedicalOpenLink url={row.medicalDocumentUrl} />
                            {row.medicalDocumentVerifiedAt ? (
                              <span className="text-xs text-emerald-700 dark:text-emerald-400">
                                Verified
                              </span>
                            ) : canVerifyMedicalReport && row.medicalDocumentUrl ? (
                              <MedicalVerifyButton
                                leaveId={row.id}
                                onVerified={(updated) =>
                                  setRows((current) =>
                                    current.map((item) => (item.id === row.id ? updated : item)),
                                  )
                                }
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">Awaiting</span>
                            )}
                          </div>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DesktopTable>

            {rows.length === 0 && (
              <EmptyState
                title="No leave requests"
                description="No leave requests match the selected filter."
              />
            )}
          </ResponsiveListShell>
        </>
      )}
    </div>
  );
}
