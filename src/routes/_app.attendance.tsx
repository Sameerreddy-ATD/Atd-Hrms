import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TableToolbar } from "@/components/common/TableToolbar";
import { EmptyState } from "@/components/common/EmptyState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { attendanceRecords, branches } from "@/mock/data";
import { Download, Search } from "lucide-react";

export const Route = createFileRoute("/_app/attendance")({
  component: AttendanceLogsPage,
});

function AttendanceLogsPage() {
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState<string>("all");
  const [source, setSource] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");

  const branchName = (id?: string) =>
    branches.find((b) => b.id === id)?.name ?? "—";

  const rows = useMemo(
    () =>
      attendanceRecords.filter((r) => {
        if (q && !r.employeeName.toLowerCase().includes(q.toLowerCase())) return false;
        if (branch !== "all" && r.actualBranchId !== branch && r.homeBranchId !== branch)
          return false;
        if (source !== "all" && r.source !== source) return false;
        if (status !== "all" && r.status !== status) return false;
        return true;
      }),
    [q, branch, source, status],
  );

  return (
    <div>
      <PageHeader
        title="Attendance Logs"
        description="All punch-in and punch-out records from thumb scanners and mobile GPS."
        actions={
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <TableToolbar>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search employee…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>
        <Input type="date" className="sm:w-auto" />
        <Select value={branch} onValueChange={setBranch}>
          <SelectTrigger className="sm:w-44"><SelectValue placeholder="Branch" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All branches</SelectItem>
            {branches.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="sm:w-40"><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="Thumb Scanner">Thumb Scanner</SelectItem>
            <SelectItem value="Mobile GPS">Mobile GPS</SelectItem>
            <SelectItem value="Manual Entry">Manual Entry</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="sm:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {["Present","Late","Absent","On Leave","Present - Branch Mismatch","Present - Field","Missed Punch","Missed Checkout","Location Flagged"].map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableToolbar>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Home Branch</TableHead>
                <TableHead>Actual Branch</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Punch In</TableHead>
                <TableHead>Punch Out</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.employeeName}
                    <div className="text-xs text-muted-foreground">{r.employeeId}</div>
                  </TableCell>
                  <TableCell>{r.date}</TableCell>
                  <TableCell className="text-sm">{branchName(r.homeBranchId)}</TableCell>
                  <TableCell className="text-sm">
                    {branchName(r.actualBranchId)}
                    {r.branchMismatch && (
                      <span className="ml-2 text-xs text-orange-600">⚠ mismatch</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{r.deviceName ?? "—"}</TableCell>
                  <TableCell>{r.punchIn ?? "—"}</TableCell>
                  <TableCell>{r.punchOut ?? "—"}</TableCell>
                  <TableCell className="text-sm">{r.source}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {rows.length === 0 && (
          <div className="p-6">
            <EmptyState title="No attendance records" description="Try clearing filters or changing the date range." />
          </div>
        )}
      </div>
    </div>
  );
}