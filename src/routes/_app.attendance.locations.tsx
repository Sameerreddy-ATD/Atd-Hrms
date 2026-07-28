import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { AttendanceDayList } from "@/components/attendance/AttendanceDayList";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AttendanceRecord, Branch, User } from "@/types/domain";
import { attendanceApi, branchesApi, employeesApi } from "@/services/api";
import { downloadAttendanceExcel } from "@/lib/csv";
import { punchSourceLabel } from "@/lib/attendance-labels";
import { indiaDateKey } from "@/lib/india-date";
import { CalendarRange } from "lucide-react";

export const Route = createFileRoute("/_app/attendance/locations")({
  component: DayLogsPage,
});

function DayLogsPage() {
  const [employees, setEmployees] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(() => {
    const savedSelectionRaw = sessionStorage.getItem("attendance-day-log-selection");
    if (savedSelectionRaw) {
      try {
        const savedSelection = JSON.parse(savedSelectionRaw) as { employeeId?: string };
        return savedSelection.employeeId || "all";
      } catch {
        return "all";
      }
    }
    return "all";
  });
  const [from, setFrom] = useState(() => {
    const savedSelectionRaw = sessionStorage.getItem("attendance-day-log-selection");
    if (savedSelectionRaw) {
      try {
        const savedSelection = JSON.parse(savedSelectionRaw) as { from?: string };
        if (savedSelection.from !== undefined) return savedSelection.from;
      } catch {
        // Use today's date when a saved selection cannot be read.
      }
    }
    return indiaDateKey();
  });
  const [to, setTo] = useState(() => {
    const savedSelectionRaw = sessionStorage.getItem("attendance-day-log-selection");
    if (savedSelectionRaw) {
      try {
        const savedSelection = JSON.parse(savedSelectionRaw) as { to?: string };
        if (savedSelection.to !== undefined) return savedSelection.to;
      } catch {
        // Use today's date when a saved selection cannot be read.
      }
    }
    return indiaDateKey();
  });
  const [branchId, setBranchId] = useState("all");
  const [employeeRows, setEmployeeRows] = useState<AttendanceRecord[]>([]);
  const [loadingEmployeeRows, setLoadingEmployeeRows] = useState(true);
  const [employeeError, setEmployeeError] = useState("");
  useEffect(() => {
    Promise.all([employeesApi.list(), branchesApi.list()])
      .then(([employeeRows, branchRows]) => {
        const sortedEmployees = [...employeeRows].sort((a, b) => a.name.localeCompare(b.name));
        setEmployees(sortedEmployees);
        setBranches(branchRows);
        sessionStorage.removeItem("attendance-day-log-selection");
      })
      .catch(() => {
        setEmployees([]);
        setBranches([]);
      });
  }, []);

  useEffect(() => {
    if (!selectedEmployeeId) return;
    setLoadingEmployeeRows(true);
    setEmployeeError("");
    attendanceApi
      .list({
        employeeId: selectedEmployeeId !== "all" ? selectedEmployeeId : undefined,
        from: from || undefined,
        to: to || undefined,
        branchId: selectedEmployeeId === "all" && branchId !== "all" ? branchId : undefined,
        limit: "none",
      })
      .then((rows) => {
        const filtered =
          employees.length === 0
            ? rows
            : rows.filter((row) => {
                const emp = employees.find((e) => (e.employeeId || e.id) === row.employeeId);
                return emp && emp.role !== "developer_admin" && emp.role !== "main_admin";
              });
        setEmployeeRows(
          [...filtered].sort(
            (a, b) => b.date.localeCompare(a.date) || a.employeeName.localeCompare(b.employeeName),
          ),
        );
        if (!from && !to && filtered.length > 0) {
          const dates = filtered.map((r) => r.date).filter(Boolean);
          if (dates.length > 0) {
            dates.sort();
            setFrom(dates[0]);
            setTo(dates[dates.length - 1]);
          }
        }
      })
      .catch((err) => setEmployeeError((err as Error).message))
      .finally(() => setLoadingEmployeeRows(false));
  }, [selectedEmployeeId, from, to, branchId, employees]);

  const employeeName = useMemo(
    () =>
      selectedEmployeeId === "all"
        ? "All Employees"
        : (employees.find((employee) => (employee.employeeId || employee.id) === selectedEmployeeId)
            ?.name ?? "Employee"),
    [employees, selectedEmployeeId],
  );
  const selectedEmployee = useMemo(
    () =>
      selectedEmployeeId === "all"
        ? undefined
        : employees.find((employee) => (employee.employeeId || employee.id) === selectedEmployeeId),
    [employees, selectedEmployeeId],
  );
  const filteredEmployeesForDropdown = useMemo(() => {
    return employees.filter((emp) => emp.role !== "developer_admin" && emp.role !== "main_admin");
  }, [employees]);

  function changeEmployee(employeeId: string) {
    setSelectedEmployeeId(employeeId);
    if (employeeId !== "all") setBranchId("all");
  }

  function setToday() {
    const today = indiaDateKey();
    setFrom(today);
    setTo(today);
  }

  function clearRange() {
    setToday();
  }

  const branchName = (id?: string) => branches.find((branch) => branch.id === id)?.name ?? "-";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Day Logs"
        description="Review day-wise attendance and expand any date to see every punch in chronological order."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={`grid gap-4 md:grid-cols-2 ${selectedEmployeeId === "all" ? "xl:grid-cols-5" : ""}`}
          >
            <div
              className={`space-y-1.5 ${selectedEmployeeId === "all" ? "xl:col-span-2" : "md:col-span-2"}`}
            >
              <Label>Employee</Label>
              <Select value={selectedEmployeeId} onValueChange={changeEmployee}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent className="max-h-[320px]">
                  <SelectItem value="all">All Employees</SelectItem>
                  {filteredEmployeesForDropdown.map((employee) => (
                    <SelectItem
                      key={employee.employeeId || employee.id}
                      value={employee.employeeId || employee.id}
                    >
                      {employee.name}
                      {employee.employeeCode ? ` (${employee.employeeCode})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>From</Label>
              <Input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(event) => {
                  const nextFrom = event.target.value;
                  setFrom(nextFrom);
                  if (to && nextFrom && to < nextFrom) setTo(nextFrom);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <Input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
            {selectedEmployeeId === "all" && (
              <div className="space-y-1.5">
                <Label>Branch</Label>
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All branches</SelectItem>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="text-sm">Employee Day-wise Logs</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Clear per-day attendance records for{" "}
              <span className="font-medium text-foreground">{employeeName}</span>.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedEmployeeId === "all" ? (
                "Scope: All active employees"
              ) : (
                <>
                  Employee ID:{" "}
                  {selectedEmployee?.employeeCode ??
                    selectedEmployee?.employeeId ??
                    selectedEmployee?.id ??
                    "-"}
                  {selectedEmployee?.department
                    ? ` · Department: ${selectedEmployee.department}`
                    : ""}
                </>
              )}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 min-[420px]:flex-row min-[420px]:flex-wrap min-[420px]:items-center sm:w-auto sm:justify-end">
            <div className="inline-flex w-full items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground min-[420px]:w-auto">
              <CalendarRange className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {from && to ? `${from} to ${to}` : from || to || "Select date range"}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full min-[420px]:w-auto"
              disabled={employeeRows.length === 0}
              onClick={() =>
                downloadAttendanceExcel(
                  `${selectedEmployeeId === "all" ? "all-employees" : (selectedEmployee?.employeeCode ?? selectedEmployeeId).toLowerCase()}-attendance-overview.xls`,
                  employeeRows.map((row) => {
                    const emp = employees.find((e) => (e.employeeId || e.id) === row.employeeId);
                    return {
                      employee: row.employeeName,
                      employeeId: emp?.employeeCode ?? row.employeeId,
                      date: row.date,
                      status: row.status,
                      homeBranch: branchName(row.homeBranchId),
                      actualBranch: branchName(row.actualBranchId),
                      punchIn: row.punchIn ?? "",
                      punchOut: row.punchOut ?? "",
                      workedSeconds: Math.round(
                        (row.totalHours ?? (row.workedMinutes ?? 0) / 60) * 3600,
                      ),
                      sourceIn: punchSourceLabel(
                        row.punchInSource,
                        row.punchInBranchId ?? row.actualBranchId,
                        branches,
                      ),
                      sourceOut: punchSourceLabel(
                        row.punchOutSource,
                        row.punchOutBranchId ?? row.actualBranchId,
                        branches,
                      ),
                    };
                  }),
                )
              }
            >
              {selectedEmployeeId === "all" ? "Export All to Excel" : "Export to Excel"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingEmployeeRows && <LoadingState label="Loading employee day logs" compact />}
          {employeeError && <p className="text-sm text-destructive">{employeeError}</p>}
          {!loadingEmployeeRows && !employeeError && (
            <>
              <AttendanceDayList
                records={employeeRows}
                showEmployee={selectedEmployeeId === "all"}
                emptyText="No day-wise attendance records found."
              />
            </>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
