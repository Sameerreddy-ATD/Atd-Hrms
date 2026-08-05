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
import {
  formatDisplayDate,
  formatDisplayDateRange,
  indiaMonthKey,
  indiaMonthRange,
} from "@/lib/india-date";
import { CalendarRange } from "lucide-react";

export const Route = createFileRoute("/_app/attendance/locations")({
  component: DayLogsPage,
});

type SavedDayLogSelection = {
  employeeId?: string;
  from?: string;
  to?: string;
};

function readSavedSelection(): SavedDayLogSelection | null {
  const raw = sessionStorage.getItem("attendance-day-log-selection");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SavedDayLogSelection;
  } catch {
    return null;
  }
}

function DayLogsPage() {
  const initialSelection = useMemo(() => readSavedSelection(), []);
  const defaultMonth = initialSelection?.from?.slice(0, 7) || indiaMonthKey();
  const defaultRange = indiaMonthRange(defaultMonth);

  const [employees, setEmployees] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(
    () => initialSelection?.employeeId || "all",
  );
  const [month, setMonth] = useState(defaultMonth);
  const [from, setFrom] = useState(() => initialSelection?.from || defaultRange.from);
  const [to, setTo] = useState(() => initialSelection?.to || defaultRange.to);
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

  function changeMonth(nextMonth: string) {
    if (!nextMonth) return;
    const range = indiaMonthRange(nextMonth);
    setMonth(nextMonth);
    setFrom(range.from);
    setTo(range.to);
  }

  function changeFrom(nextFrom: string) {
    setFrom(nextFrom);
    if (nextFrom) setMonth(nextFrom.slice(0, 7));
    if (to && nextFrom && to < nextFrom) setTo(nextFrom);
  }

  function changeTo(nextTo: string) {
    if (!nextTo) {
      setTo(nextTo);
      return;
    }
    const monthKey = (!from || nextTo.slice(0, 7) === from.slice(0, 7)
      ? nextTo.slice(0, 7)
      : month) || nextTo.slice(0, 7);
    const capped = indiaMonthRange(monthKey).to;
    const clamped = nextTo > capped ? capped : nextTo;
    setTo(clamped);
    if (!from || clamped.slice(0, 7) === from.slice(0, 7)) {
      setMonth(clamped.slice(0, 7));
    }
  }

  const branchName = (id?: string) => branches.find((branch) => branch.id === id)?.name ?? "-";

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Day Logs"
        description="Track your team's day-wise attendance for the selected month through today. Expand any date for every punch in order."
      />

      <Card className="border-border shadow-sm">
        <CardHeader className="space-y-1 px-4 pb-3 pt-4 sm:px-6">
          <CardTitle className="text-base font-semibold">Filters</CardTitle>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Choose employee and date range. Results update as you change filters.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 px-4 pb-4 sm:px-6 sm:pb-5">
          <div
            className={`grid gap-2.5 sm:gap-3 md:grid-cols-2 ${
              selectedEmployeeId === "all"
                ? "lg:grid-cols-[minmax(0,1.2fr)_6.75rem_9rem_9rem_minmax(8.5rem,1fr)]"
                : "lg:grid-cols-[minmax(0,1.35fr)_6.75rem_9rem_9rem]"
            }`}
          >
            <div
              className={`min-w-0 space-y-1 ${selectedEmployeeId === "all" ? "" : "md:col-span-2 lg:col-span-1"}`}
            >
              <Label className="text-xs sm:text-sm">Employee</Label>
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
            <div className="min-w-0 space-y-1">
              <Label className="text-xs sm:text-sm">Month</Label>
              <Input
                type="month"
                className="px-2.5"
                value={month}
                max={indiaMonthKey()}
                onChange={(event) => changeMonth(event.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:contents">
              <div className="min-w-0 space-y-1">
                <Label className="text-xs sm:text-sm">From</Label>
                <Input
                  type="date"
                  className="px-2.5"
                  value={from}
                  min={indiaMonthRange(month).from}
                  max={to || indiaMonthRange(month).to}
                  onChange={(event) => changeFrom(event.target.value)}
                />
              </div>
              <div className="min-w-0 space-y-1">
                <Label className="text-xs sm:text-sm">To</Label>
                <Input
                  type="date"
                  className="px-2.5"
                  value={to}
                  min={from || indiaMonthRange(month).from}
                  max={indiaMonthRange(month).to}
                  onChange={(event) => changeTo(event.target.value)}
                />
              </div>
            </div>
            {selectedEmployeeId === "all" && (
              <div className="min-w-0 space-y-1">
                <Label className="text-xs sm:text-sm">Branch</Label>
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

      <Card className="border-border shadow-sm">
        <CardHeader className="flex flex-col gap-3 px-4 pt-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold">Day-wise logs</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Per-day records for{" "}
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
            <div className="inline-flex min-h-11 w-full items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground min-[420px]:w-auto">
              <CalendarRange className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {from && to
                  ? formatDisplayDateRange(from, to)
                  : from || to
                    ? formatDisplayDate(from || to)
                    : "Select month"}
              </span>
            </div>
            <Button
              variant="outline"
              className="min-h-11 w-full min-[420px]:w-auto"
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
        <CardContent className="px-3 pb-4 pt-0 sm:px-4 sm:pb-5">
          {loadingEmployeeRows && <LoadingState label="Loading employee day logs" compact />}
          {employeeError && <p className="text-sm text-destructive">{employeeError}</p>}
          {!loadingEmployeeRows && !employeeError && (
            <AttendanceDayList
              records={employeeRows}
              showEmployee={selectedEmployeeId === "all"}
              emptyText="No day-wise attendance records found for the selected month."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
