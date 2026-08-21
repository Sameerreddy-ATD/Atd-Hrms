import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { AttendanceDayList } from "@/components/attendance/AttendanceDayList";
import { AttendanceAdminWorkdays } from "@/components/attendance/AttendanceAdminWorkdays";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateField } from "@/components/ui/date-field";
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
  formatBranchLocationLabel,
  formatBranchLocationLabelById,
} from "@/lib/branch-label";
import {
  formatDisplayDate,
  formatDisplayDateRange,
  indiaDateKey,
} from "@/lib/india-date";
import {
  matchesWorkforceTypeFilter,
  occupiedWorkforceTypes,
  WORKFORCE_TYPE_LABELS,
  type WorkforceTypeFilter,
} from "@/lib/workforce-type";
import { WorkforceTypeBadge } from "@/components/common/WorkforceTypeBadge";
import {
  attendanceCycleFileSlug,
  attendanceCycleForDate,
  attendanceCycleLabel,
  attendanceCycleRange,
  currentAttendanceCycle,
} from "@/lib/attendance-cycle";
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
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem("attendance-day-log-selection");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SavedDayLogSelection;
  } catch {
    return null;
  }
}

function DayLogsPage() {
  const { t } = useTranslation();
  const todayKey = indiaDateKey();
  const defaultCycle = useMemo(() => currentAttendanceCycle(todayKey), [todayKey]);

  const [employees, setEmployees] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("all");
  const [periodKey, setPeriodKey] = useState(defaultCycle.periodKey);
  const [from, setFrom] = useState(defaultCycle.from);
  const [to, setTo] = useState(defaultCycle.to);
  const [branchId, setBranchId] = useState("all");
  const [workforceTypeFilter, setWorkforceTypeFilter] = useState<WorkforceTypeFilter>("all");
  const [employeeRows, setEmployeeRows] = useState<AttendanceRecord[]>([]);
  const [loadingEmployeeRows, setLoadingEmployeeRows] = useState(true);
  const [employeeError, setEmployeeError] = useState("");

  const cycleBounds = useMemo(
    () => attendanceCycleRange(periodKey, { clampToToday: true, todayKey }),
    [periodKey, todayKey],
  );
  const periodLabel = useMemo(() => attendanceCycleLabel(periodKey), [periodKey]);
  const currentPeriodKey = useMemo(
    () => currentAttendanceCycle(todayKey).periodKey,
    [todayKey],
  );

  useEffect(() => {
    const saved = readSavedSelection();
    if (!saved) return;
    if (saved.employeeId) setSelectedEmployeeId(saved.employeeId);
    if (saved.from) {
      const cycle = attendanceCycleForDate(saved.from, {
        clampToToday: true,
        todayKey,
      });
      setPeriodKey(cycle.periodKey);
      setFrom(saved.from);
      setTo(saved.to || cycle.to);
    }
  }, [todayKey]);

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
        workforceType: workforceTypeFilter !== "all" ? workforceTypeFilter : undefined,
        limit: "none",
      })
      .then((rows) => {
        const filtered =
          employees.length === 0
            ? rows
            : rows.filter((row) => {
                const emp = employees.find((e) => (e.employeeId || e.id) === row.employeeId);
                return (
                  emp &&
                  emp.role !== "developer_admin" &&
                  emp.role !== "main_admin" &&
                  matchesWorkforceTypeFilter(emp, workforceTypeFilter)
                );
              });
        setEmployeeRows(
          [...filtered].sort(
            (a, b) => b.date.localeCompare(a.date) || a.employeeName.localeCompare(b.employeeName),
          ),
        );
      })
      .catch((err) => setEmployeeError((err as Error).message))
      .finally(() => setLoadingEmployeeRows(false));
  }, [selectedEmployeeId, from, to, branchId, employees, workforceTypeFilter]);

  const employeeName = useMemo(
    () =>
      selectedEmployeeId === "all"
        ? t("pages.dayLogs.allEmployees")
        : (employees.find((employee) => (employee.employeeId || employee.id) === selectedEmployeeId)
            ?.name ?? t("pages.dayLogs.employee")),
    [employees, selectedEmployeeId, t],
  );
  const selectedEmployee = useMemo(
    () =>
      selectedEmployeeId === "all"
        ? undefined
        : employees.find((employee) => (employee.employeeId || employee.id) === selectedEmployeeId),
    [employees, selectedEmployeeId],
  );
  const filteredEmployeesForDropdown = useMemo(() => {
    return employees.filter(
      (emp) =>
        emp.role !== "developer_admin" &&
        emp.role !== "main_admin" &&
        matchesWorkforceTypeFilter(emp, workforceTypeFilter),
    );
  }, [employees, workforceTypeFilter]);

  const workforceTypeOptions = useMemo(
    () =>
      occupiedWorkforceTypes(
        employees.filter((emp) => emp.role !== "developer_admin" && emp.role !== "main_admin"),
      ),
    [employees],
  );

  useEffect(() => {
    if (
      workforceTypeFilter !== "all" &&
      !workforceTypeOptions.includes(workforceTypeFilter)
    ) {
      setWorkforceTypeFilter("all");
    }
  }, [workforceTypeFilter, workforceTypeOptions]);

  useEffect(() => {
    if (selectedEmployeeId === "all") return;
    const stillVisible = filteredEmployeesForDropdown.some(
      (employee) => (employee.employeeId || employee.id) === selectedEmployeeId,
    );
    if (!stillVisible) setSelectedEmployeeId("all");
  }, [filteredEmployeesForDropdown, selectedEmployeeId]);

  function changeEmployee(employeeId: string) {
    setSelectedEmployeeId(employeeId);
    if (employeeId !== "all") setBranchId("all");
  }

  function changePeriod(nextPeriod: string) {
    if (!nextPeriod) return;
    const range = attendanceCycleRange(nextPeriod, { clampToToday: true, todayKey });
    setPeriodKey(range.periodKey);
    setFrom(range.from);
    setTo(range.to);
  }

  function changeFrom(nextFrom: string) {
    if (!nextFrom) {
      setFrom(nextFrom);
      return;
    }
    const cycle = attendanceCycleForDate(nextFrom, { clampToToday: true, todayKey });
    const min = cycle.from;
    const max = cycle.to;
    const clamped = nextFrom < min ? min : nextFrom > max ? max : nextFrom;
    setPeriodKey(cycle.periodKey);
    setFrom(clamped);
    if (to && to < clamped) setTo(clamped);
    else if (to && (to < cycle.from || to > cycle.to)) setTo(cycle.to);
  }

  function changeTo(nextTo: string) {
    if (!nextTo) {
      setTo(nextTo);
      return;
    }
    const cycle = attendanceCycleRange(periodKey, { clampToToday: true, todayKey });
    const clamped = nextTo > cycle.to ? cycle.to : nextTo < cycle.from ? cycle.from : nextTo;
    setTo(clamped);
    if (from && clamped < from) setFrom(clamped);
  }

  const branchName = (id?: string) => formatBranchLocationLabelById(branches, id);

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title={t("pages.dayLogs.title")}
        description={t("pages.dayLogs.subtitle")}
      />

      <Card className="border-border shadow-sm">
        <CardHeader className="space-y-1 px-4 pb-3 pt-4 sm:px-6">
          <CardTitle className="text-base font-semibold">Workdays</CardTitle>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Logical work dates with sessions (night shifts stay on the start date).
          </p>
        </CardHeader>
        <CardContent className="px-4 pb-4 sm:px-6 sm:pb-5">
          <AttendanceAdminWorkdays />
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm">
        <CardHeader className="space-y-1 px-4 pb-3 pt-4 sm:px-6">
          <CardTitle className="text-base font-semibold">{t("pages.dayLogs.filters")}</CardTitle>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {t("pages.dayLogs.filtersHelp")}
          </p>
        </CardHeader>
        <CardContent className="space-y-4 px-4 pb-4 sm:px-6 sm:pb-5">
          <div
            className={`grid gap-2.5 sm:gap-3 md:grid-cols-2 ${
              selectedEmployeeId === "all" ? "lg:grid-cols-6" : "lg:grid-cols-5"
            }`}
          >
            <div
              className={`min-w-0 space-y-1 ${selectedEmployeeId === "all" ? "" : "md:col-span-2 lg:col-span-1"}`}
            >
              <Label className="text-xs sm:text-sm">{t("pages.dayLogs.workforceType")}</Label>
              <Select
                value={workforceTypeFilter}
                onValueChange={(value) => setWorkforceTypeFilter(value as WorkforceTypeFilter)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("pages.dayLogs.allWorkforceTypes")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("pages.dayLogs.allWorkforceTypes")}</SelectItem>
                  {workforceTypeOptions.map((value) => (
                    <SelectItem key={value} value={value}>
                      {WORKFORCE_TYPE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div
              className={`min-w-0 space-y-1 ${selectedEmployeeId === "all" ? "" : "md:col-span-2 lg:col-span-1"}`}
            >
              <Label className="text-xs sm:text-sm">{t("pages.dayLogs.employee")}</Label>
              <Select value={selectedEmployeeId} onValueChange={changeEmployee}>
                <SelectTrigger>
                  <SelectValue placeholder={t("pages.dayLogs.selectEmployee")} />
                </SelectTrigger>
                <SelectContent className="max-h-[320px]">
                  <SelectItem value="all">{t("pages.dayLogs.allEmployees")}</SelectItem>
                  {filteredEmployeesForDropdown.map((employee) => (
                    <SelectItem
                      key={employee.employeeId || employee.id}
                      value={employee.employeeId || employee.id}
                    >
                      <span className="flex items-center gap-2">
                        <span>
                          {employee.name}
                          {employee.employeeCode ? ` (${employee.employeeCode})` : ""}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1">
              <Label className="text-xs sm:text-sm">{t("pages.dayLogs.period")}</Label>
              <Input
                type="month"
                className="px-2.5"
                value={periodKey}
                max={currentPeriodKey}
                onChange={(event) => changePeriod(event.target.value)}
              />
              <p className="truncate text-[11px] text-muted-foreground">{periodLabel}</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:contents">
              <div className="min-w-0 space-y-1">
                <Label className="text-xs sm:text-sm">{t("pages.dayLogs.from")}</Label>
                <DateField
                  value={from}
                  min={cycleBounds.from}
                  max={to || cycleBounds.to}
                  onChange={changeFrom}
                  aria-label={t("pages.dayLogs.ariaFromDate")}
                />
              </div>
              <div className="min-w-0 space-y-1">
                <Label className="text-xs sm:text-sm">{t("pages.dayLogs.to")}</Label>
                <DateField
                  value={to}
                  min={from || cycleBounds.from}
                  max={cycleBounds.to}
                  onChange={changeTo}
                  aria-label={t("pages.dayLogs.ariaToDate")}
                />
              </div>
            </div>
            {selectedEmployeeId === "all" && (
              <div className="min-w-0 space-y-1">
                <Label className="text-xs sm:text-sm">{t("pages.dayLogs.branch")}</Label>
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("pages.dayLogs.allLocations")}</SelectItem>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {formatBranchLocationLabel(branch)}
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
            <CardTitle className="text-base font-semibold">{t("pages.dayLogs.dayWiseLogs")}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("pages.dayLogs.perDayRecordsFor")}{" "}
              <span className="font-medium text-foreground">{employeeName}</span>.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedEmployeeId === "all" ? (
                workforceTypeFilter === "all"
                  ? t("pages.dayLogs.scopeAll")
                  : t("pages.dayLogs.scopeWorkforceType", {
                      type: WORKFORCE_TYPE_LABELS[workforceTypeFilter],
                    })
              ) : (
                <>
                  {t("pages.dayLogs.employeeIdLabel")}{" "}
                  {selectedEmployee?.employeeCode ??
                    selectedEmployee?.employeeId ??
                    selectedEmployee?.id ??
                    "-"}
                  {selectedEmployee?.department
                    ? ` · ${t("pages.dayLogs.departmentLabel", { department: selectedEmployee.department })}`
                    : ""}
                  {selectedEmployee ? (
                    <>
                      {" · "}
                      <WorkforceTypeBadge role={selectedEmployee.role} className="align-middle" />
                    </>
                  ) : null}
                </>
              )}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 min-[420px]:flex-row min-[420px]:flex-wrap min-[420px]:items-center sm:w-auto sm:justify-end">
            <div className="inline-flex min-h-11 w-full items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground min-[420px]:w-auto">
              <CalendarRange className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {from && to
                  ? `${periodLabel} · ${formatDisplayDateRange(from, to)}`
                  : from || to
                    ? formatDisplayDate(from || to)
                    : t("pages.dayLogs.selectPeriod")}
              </span>
            </div>
            <Button
              variant="outline"
              className="min-h-11 w-full min-[420px]:w-auto"
              disabled={employeeRows.length === 0}
              onClick={() =>
                downloadAttendanceExcel(
                  `ATD-Attendance-${attendanceCycleFileSlug(periodKey)}-${selectedEmployeeId === "all" ? "all" : (selectedEmployee?.employeeCode ?? selectedEmployeeId).toLowerCase()}.xls`,
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
                  {
                    periodLabel,
                    from,
                    to,
                  },
                )
              }
            >
              {selectedEmployeeId === "all"
                ? t("pages.dayLogs.exportAll")
                : t("pages.dayLogs.export")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-4 pt-0 sm:px-4 sm:pb-5">
          {loadingEmployeeRows && <LoadingState label={t("pages.loading.dayLogs")} compact />}
          {employeeError && <p className="text-sm text-destructive">{employeeError}</p>}
          {!loadingEmployeeRows && !employeeError && (
            <AttendanceDayList
              records={employeeRows}
              showEmployee={selectedEmployeeId === "all"}
              emptyText={t("pages.dayLogs.empty")}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
