import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
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
import type { LeaveRequest } from "@/mock/types";
import { downloadCsv } from "@/lib/csv";
import { Download } from "lucide-react";

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
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
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
      {loading && <p className="text-sm text-muted-foreground">Loading leave requests...</p>}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
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
