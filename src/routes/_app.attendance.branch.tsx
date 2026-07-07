import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { attendanceRecords, branches } from "@/mock/data";

export const Route = createFileRoute("/_app/attendance/branch")({
  component: BranchAttendancePage,
});

function BranchAttendancePage() {
  const branchName = (id?: string) =>
    branches.find((b) => b.id === id)?.name ?? "—";
  const rows = attendanceRecords.filter((a) => a.source === "Thumb Scanner");
  return (
    <div>
      <PageHeader
        title="Branch Attendance"
        description="Employees punching in at thumb scanners across branches. Branch mismatch flag indicates the employee attended a branch different from their scheduled one."
      />
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Home Branch</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Actual</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Punch In</TableHead>
                <TableHead>Punch Out</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.employeeName}</TableCell>
                  <TableCell>{branchName(r.homeBranchId)}</TableCell>
                  <TableCell>{branchName(r.scheduledBranchId)}</TableCell>
                  <TableCell>
                    {branchName(r.actualBranchId)}
                    {r.branchMismatch && (
                      <span className="ml-2 text-xs text-orange-600">⚠</span>
                    )}
                  </TableCell>
                  <TableCell>{r.deviceName}</TableCell>
                  <TableCell>{r.punchIn ?? "—"}</TableCell>
                  <TableCell>{r.punchOut ?? "—"}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}