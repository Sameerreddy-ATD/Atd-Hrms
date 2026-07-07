import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { attendanceRecords, branches } from "@/mock/data";
export const Route = createFileRoute("/_app/attendance/mismatch")({
  component: MismatchPage,
});
function MismatchPage() {
  const rows = attendanceRecords.filter((a) => a.branchMismatch);
  const b = (id?: string) => branches.find((x) => x.id === id)?.name ?? "—";
  return (
    <div>
      <PageHeader
        title="Branch Mismatch Alerts"
        description="Employees who punched in at a branch other than their scheduled branch."
      />
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Scheduled</TableHead>
              <TableHead>Actual</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.employeeName}</TableCell>
                <TableCell>{r.date}</TableCell>
                <TableCell>{b(r.scheduledBranchId)}</TableCell>
                <TableCell>{b(r.actualBranchId)}</TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
