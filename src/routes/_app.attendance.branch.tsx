import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
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
import type { AttendanceRecord, Branch } from "@/types/domain";
import { attendanceApi, branchesApi } from "@/services/api";
import { lastOutLabel, punchSourceLabel } from "@/lib/attendance-labels";
import { formatStoredWorkedTime } from "@/lib/worked-time";
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
import { ArrowRight, Building2 } from "lucide-react";

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
      {loading && <LoadingState label="Loading branch attendance" />}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <ResponsiveListShell>
        <MobileList>
          {rows.map((r) => {
            const out = lastOutLabel(r);
            return (
              <MobileListItem key={r.id} intrinsicSize="200px">
                <MobileListHeader
                  title={r.employeeName}
                  meta={r.employeeId}
                  trailing={<StatusBadge status={r.status} />}
                />
                <MobileListFields>
                  <MobileListField label="Date" value={r.date} />
                  <MobileListField label="Home Branch" value={branchName(r.homeBranchId)} />
                  <MobileListField
                    label="Punch In"
                    value={
                      <>
                        <span>{r.punchIn ?? "-"}</span>
                        <span className="mt-0.5 block text-[11px] font-semibold text-muted-foreground">
                          {punchSourceLabel(
                            r.punchInSource,
                            r.punchInBranchId ?? r.actualBranchId,
                            branches,
                          )}
                        </span>
                      </>
                    }
                  />
                  <MobileListField
                    label="Punch Out"
                    value={
                      <>
                        <span>{out.text}</span>
                        {!out.provisional && out.text !== "Punch-out required" && (
                          <span className="mt-0.5 block text-[11px] font-semibold text-muted-foreground">
                            {punchSourceLabel(
                              r.punchOutSource,
                              r.punchOutBranchId ?? r.actualBranchId,
                              branches,
                            )}
                          </span>
                        )}
                      </>
                    }
                  />
                  <MobileListField
                    label="Worked Time"
                    value={formatStoredWorkedTime(r.totalHours, r.workedMinutes)}
                  />
                </MobileListFields>
                <MobileListActions>
                  <Button
                    className="w-full"
                    size="sm"
                    variant="outline"
                    onClick={() => openDayLogs(r)}
                  >
                    Open Day Logs <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                </MobileListActions>
              </MobileListItem>
            );
          })}
        </MobileList>
        <DesktopTable>
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Home Branch</TableHead>
                <TableHead>Punch In</TableHead>
                <TableHead>Punch Out</TableHead>
                <TableHead>Worked Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
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
                      {punchSourceLabel(
                        r.punchInSource,
                        r.punchInBranchId ?? r.actualBranchId,
                        branches,
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const out = lastOutLabel(r);
                      return (
                        <>
                          <div>{out.text}</div>
                          {!out.provisional && out.text !== "Punch-out required" && (
                            <div className="mt-0.5 text-xs font-semibold text-muted-foreground">
                              {punchSourceLabel(
                                r.punchOutSource,
                                r.punchOutBranchId ?? r.actualBranchId,
                                branches,
                              )}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="font-medium tabular-nums">
                    {formatStoredWorkedTime(r.totalHours, r.workedMinutes)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => openDayLogs(r)}>
                      Open Day Logs <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DesktopTable>
        {!loading && rows.length === 0 && (
          <EmptyState
            icon={Building2}
            title="No branch attendance records"
            description="Branch punches for the selected filters will appear here."
            className="m-2"
          />
        )}
      </ResponsiveListShell>
    </div>
  );
}
