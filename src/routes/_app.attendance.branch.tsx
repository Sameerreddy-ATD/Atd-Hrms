import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TableToolbar } from "@/components/common/TableToolbar";
import { Input } from "@/components/ui/input";
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
import type { AttendanceRecord, Branch } from "@/mock/types";
import { attendanceApi, branchesApi } from "@/services/api";
import { punchSourceLabel } from "@/lib/attendance-labels";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_app/attendance/branch")({
  component: BranchAttendancePage,
});

function BranchAttendancePage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<AttendanceRecord[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branch, setBranch] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([attendanceApi.listBranch({ branchId: branch, from, to }), branchesApi.list()])
      .then(([attendanceRows, branchRows]) => {
        setRows(attendanceRows);
        setBranches(branchRows);

        if (!from && !to && attendanceRows.length > 0) {
          const dates = attendanceRows.map((r) => r.date).filter(Boolean);
          if (dates.length > 0) {
            dates.sort();
            setFrom(dates[0]);
            setTo(dates[dates.length - 1]);
          }
        }
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [branch, from, to]);

  const branchName = (id?: string) => branches.find((b) => b.id === id)?.name ?? "-";

  function openDayLogs(row: AttendanceRecord) {
    sessionStorage.setItem(
      "attendance-day-log-selection",
      JSON.stringify({
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        from: row.date,
        to: row.date,
      }),
    );
    void navigate({ to: "/attendance/locations" });
  }

  return (
    <div>
      <PageHeader
        title="Branch Attendance"
        description="Employees who marked attendance at a branch using biometric scanners or mobile GPS while inside the office location."
      />
      <TableToolbar>
        <Input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => {
            const nextFrom = e.target.value;
            setFrom(nextFrom);
            if (to && nextFrom && to < nextFrom) setTo(nextFrom);
          }}
          className="sm:w-auto"
          aria-label="From date"
        />
        <Input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => setTo(e.target.value)}
          className="sm:w-auto"
          aria-label="To date"
        />
        <Select value={branch} onValueChange={setBranch}>
          <SelectTrigger className="sm:w-52">
            <SelectValue placeholder="Branch" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All branches</SelectItem>
            {branches.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableToolbar>
      {loading && <p className="text-sm text-muted-foreground">Loading branch attendance...</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Home Branch</TableHead>
                <TableHead>Punch In</TableHead>
                <TableHead>Punch Out</TableHead>
                <TableHead>Worked Minutes</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <div>{r.employeeName}</div>
                    <div className="text-xs text-muted-foreground font-mono">{r.employeeId}</div>
                  </TableCell>
                  <TableCell>{r.date}</TableCell>
                  <TableCell>{branchName(r.homeBranchId)}</TableCell>
                  <TableCell>
                    <div>{r.punchIn ?? "-"}</div>
                    <div className="mt-0.5 text-xs font-semibold text-muted-foreground">
                      {punchSourceLabel(r.punchInSource, r.punchInBranchId, branches)}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium tabular-nums">
                    {r.workedMinutes ?? Math.round((r.totalHours ?? 0) * 60)} min
                  </TableCell>
                  <TableCell>
                    <div>{r.punchOut ?? "-"}</div>
                    <div className="mt-0.5 text-xs font-semibold text-muted-foreground">
                      {punchSourceLabel(r.punchOutSource, r.punchOutBranchId, branches)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!loading && rows.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">
            No branch attendance records found.
          </div>
        )}
      </div>
    </div>
  );
}
