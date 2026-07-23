import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { CalendarDays, CheckCircle2, Download } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/leave/reports")({
  component: LeaveReportsPage,
});

function LeaveReportsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<LeaveRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const canVerifyMedicalReport = ["developer_admin", "main_admin", "hr"].includes(user?.role ?? "");

  const verifyMedicalReport = async (id: string) => {
    setVerifyingId(id);
    try {
      const updated = await leaveApi.verifyMedicalDocument(id);
      setRows((current) => current.map((row) => (row.id === id ? updated : row)));
      toast.success("Medical report marked as verified");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setVerifyingId(null);
    }
  };

  useEffect(() => {
    setLoading(true);
    setError("");
    leaveApi
      .list(statusFilter === "all" ? {} : { status: statusFilter })
      .then(setRows)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  const filteredRows = useMemo(() => rows, [rows]);

  const csvRows = filteredRows.map((row) => ({
    employee: row.employeeName,
    employeeId: row.employeeId,
    organizationApprover: row.approverName ?? row.managerName ?? "",
    leaveType: row.type,
    from: row.from,
    to: row.to,
    days: row.days,
    status: row.status,
    workflow: row.workflowStatus ?? row.status,
    appliedOn: row.appliedOn,
    updatedOn: row.updatedOn ?? "",
    reason: row.reason,
    medicalDocument: row.medicalDocumentUrl ?? "",
    medicalDocumentDue: row.medicalDocumentDueAt ?? "",
    medicalDocumentVerified: row.medicalDocumentVerifiedAt ?? "",
  }));

  return (
    <div>
      <PageHeader
        title="Leave Tracking"
        description="Read-only view of every leave request and its approval progress. HR can monitor the flow but cannot approve it here."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All requests</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={filteredRows.length === 0}
              onClick={() => downloadCsv("leave-tracking.csv", csvRows)}
            >
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>
        }
      />
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <LoadingState label="Loading leave requests" />}
      <div className="space-y-3 md:hidden">
        {filteredRows.map((row) => (
          <Card key={row.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{row.employeeName}</p>
                  <p className="text-xs text-muted-foreground">{row.employeeId}</p>
                </div>
                <StatusBadge status={row.status} />
              </div>
              <p className="mt-3 text-sm font-medium">{row.type}</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarDays className="h-4 w-4" /> {row.from} to {row.to} · {row.days} day(s)
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Approver</p>
                  <p className="break-words font-medium">
                    {row.approverName ?? row.managerName ?? "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Flow</p>
                  <p className="break-words font-medium">{row.workflowStatus ?? row.status}</p>
                </div>
              </div>
              {row.reason && (
                <div className="mt-3 rounded-md bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Reason</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">
                    {row.reason}
                  </p>
                </div>
              )}
              {row.type === "Sick Leave" && (
                <div className="mt-3 rounded-md border p-3 text-sm">
                  <p className="text-xs text-muted-foreground">Medical report</p>
                  {row.medicalDocumentUrl ? (
                    <a
                      href={row.medicalDocumentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-primary underline"
                    >
                      Open report
                    </a>
                  ) : (
                    <p className="font-medium text-amber-700 dark:text-amber-400">Not submitted</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.medicalDocumentVerifiedAt
                      ? "Verified by HR"
                      : `Due ${row.medicalDocumentDueAt ? new Date(row.medicalDocumentDueAt).toLocaleString() : "-"}`}
                  </p>
                  {canVerifyMedicalReport &&
                    row.medicalDocumentUrl &&
                    !row.medicalDocumentVerifiedAt && (
                      <Button
                        className="mt-3 w-full"
                        size="sm"
                        variant="outline"
                        disabled={verifyingId === row.id}
                        onClick={() => void verifyMedicalReport(row.id)}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        {verifyingId === row.id ? "Verifying..." : "Mark verified"}
                      </Button>
                    )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      {!loading && filteredRows.length === 0 && (
        <div className="rounded-lg border bg-card p-6 md:hidden">
          <EmptyState
            title="No leave requests"
            description="No leave requests match the selected filter."
          />
        </div>
      )}
      <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
        <div className="overflow-x-auto">
          <Table className="min-w-[1100px]">
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Organization approver</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Applied</TableHead>
                <TableHead>Flow status</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Medical report</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">{row.employeeName}</div>
                    <div className="text-xs text-muted-foreground">{row.employeeId}</div>
                  </TableCell>
                  <TableCell>{row.approverName ?? row.managerName ?? "-"}</TableCell>
                  <TableCell>{row.type}</TableCell>
                  <TableCell>{row.from}</TableCell>
                  <TableCell>{row.to}</TableCell>
                  <TableCell>{row.days}</TableCell>
                  <TableCell>{row.appliedOn}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.workflowStatus ?? row.status}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="min-w-[260px] max-w-[420px] whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                    {row.reason}
                  </TableCell>
                  <TableCell className="min-w-[180px] text-sm">
                    {row.type === "Sick Leave" ? (
                      row.medicalDocumentUrl ? (
                        <div className="space-y-2">
                          <a
                            href={row.medicalDocumentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="block font-medium text-primary underline"
                          >
                            Open report
                          </a>
                          {row.medicalDocumentVerifiedAt ? (
                            <span className="text-xs text-emerald-700 dark:text-emerald-400">
                              Verified by HR
                            </span>
                          ) : canVerifyMedicalReport ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={verifyingId === row.id}
                              onClick={() => void verifyMedicalReport(row.id)}
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              {verifyingId === row.id ? "Verifying..." : "Mark verified"}
                            </Button>
                          ) : (
                            <span className="text-xs text-amber-700 dark:text-amber-400">
                              Awaiting verification
                            </span>
                          )}
                        </div>
                      ) : (
                        "Not submitted"
                      )
                    ) : (
                      "-"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!loading && filteredRows.length === 0 && (
          <div className="p-6">
            <EmptyState
              title="No leave requests"
              description="No leave requests match the selected filter."
            />
          </div>
        )}
      </div>
    </div>
  );
}
