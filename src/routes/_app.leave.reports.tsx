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
import type { LeaveRequest } from "@/mock/types";
import { downloadCsv } from "@/lib/csv";
import { CalendarDays, Download } from "lucide-react";

export const Route = createFileRoute("/_app/leave/reports")({
  component: LeaveReportsPage,
});

function LeaveReportsPage() {
  const [rows, setRows] = useState<LeaveRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
                  <p className="mt-1 whitespace-pre-wrap text-sm">{row.reason}</p>
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
                  <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">
                    {row.reason}
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
