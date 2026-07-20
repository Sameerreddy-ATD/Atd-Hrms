import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { AttendanceTimelineSheet } from "@/components/common/AttendanceTimelineSheet";
import { AttendanceDayList } from "@/components/attendance/AttendanceDayList";
import { TableToolbar } from "@/components/common/TableToolbar";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AttendanceRecord, AttendanceTimelineEvent, Branch, User } from "@/mock/types";
import { attendanceApi, branchesApi, employeesApi, reportsApi } from "@/services/api";
import { downloadCsv, downloadAttendanceExcel } from "@/lib/csv";
import {
  movementEventLabel,
  captureSourceLabel,
  movementSourceLabel,
  movementDirectionLabel,
  punchSourceLabel,
} from "@/lib/attendance-labels";
import { formatStoredWorkedTime } from "@/lib/worked-time";
import {
  ArrowRight,
  CalendarRange,
  Compass,
  MapPin,
  Route as RouteIcon,
  Smartphone,
  Fingerprint,
} from "lucide-react";

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
    return new Date().toISOString().slice(0, 10);
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
    return new Date().toISOString().slice(0, 10);
  });
  const [branchId, setBranchId] = useState("all");
  const [employeeRows, setEmployeeRows] = useState<AttendanceRecord[]>([]);
  const [movementRows, setMovementRows] = useState<AttendanceTimelineEvent[]>([]);
  const [loadingEmployeeRows, setLoadingEmployeeRows] = useState(true);
  const [loadingMovementRows, setLoadingMovementRows] = useState(true);
  const [employeeError, setEmployeeError] = useState("");
  const [movementError, setMovementError] = useState("");
  const [selectedTimelineEmp, setSelectedTimelineEmp] = useState<{
    id: string;
    name: string;
    date: string;
  } | null>(null);

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
        from: selectedEmployeeId === "all" ? from : undefined,
        to: selectedEmployeeId === "all" ? to : undefined,
        branchId: branchId !== "all" ? branchId : undefined,
      })
      .then((rows) => {
        const filtered = rows.filter((row) => {
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

  function setToday() {
    const today = new Date().toISOString().slice(0, 10);
    setFrom(today);
    setTo(today);
  }

  function clearRange() {
    setToday();
  }

  function openTimeline(
    employeeId: string | undefined,
    employeeName: string | undefined,
    date: string | undefined,
  ) {
    if (!employeeId || !date) return;
    setSelectedTimelineEmp({ id: employeeId, name: employeeName ?? "Employee", date });
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-1.5 xl:col-span-2">
              <Label>Employee</Label>
              <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
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
            <div className={selectedEmployeeId === "all" ? "space-y-1.5" : "hidden"}>
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
            <div className={selectedEmployeeId === "all" ? "space-y-1.5" : "hidden"}>
              <Label>To</Label>
              <Input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
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
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
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
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <div className="inline-flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
              <CalendarRange className="h-3.5 w-3.5" />
              {selectedEmployeeId === "all" ? `${from} to ${to}` : "All available dates"}
            </div>
            <Button
              size="sm"
              variant="outline"
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
                      sourceIn: punchSourceLabel(row.punchInSource, row.punchInBranchId, branches),
                      sourceOut: punchSourceLabel(
                        row.punchOutSource,
                        row.punchOutBranchId,
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
                branches={branches}
                showEmployee={selectedEmployeeId === "all"}
                emptyText="No day-wise attendance records found."
              />
              <div className="hidden">
                <div className="overflow-x-auto">
                  <Table className="min-w-[920px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Home Branch</TableHead>
                        <TableHead>Actual Branch</TableHead>
                        <TableHead>Punch In</TableHead>
                        <TableHead>Punch Out</TableHead>
                        <TableHead>Worked Time</TableHead>
                        <TableHead className="text-right">Navigation</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employeeRows.map((row) => (
                        <TableRow
                          key={row.id}
                          className={
                            row.status.toLowerCase().includes("leave")
                              ? "bg-red-50/80 dark:bg-red-950/20"
                              : undefined
                          }
                        >
                          <TableCell>{row.date}</TableCell>
                          <TableCell>
                            <StatusBadge status={row.status} />
                          </TableCell>
                          <TableCell>{branchName(row.homeBranchId)}</TableCell>
                          <TableCell>{branchName(row.actualBranchId)}</TableCell>
                          <TableCell>
                            <div>{row.punchIn ?? "-"}</div>
                            <div className="mt-0.5 text-xs font-semibold text-muted-foreground">
                              {punchSourceLabel(row.punchInSource, row.punchInBranchId, branches)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>{row.punchOut ?? "-"}</div>
                            <div className="mt-0.5 text-xs font-semibold text-muted-foreground">
                              {punchSourceLabel(row.punchOutSource, row.punchOutBranchId, branches)}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium tabular-nums">
                            {formatStoredWorkedTime(row.totalHours, row.workedMinutes)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                openTimeline(row.employeeId, row.employeeName, row.date)
                              }
                            >
                              View Timeline <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {!employeeRows.length && (
                  <div className="p-6 text-sm text-muted-foreground">
                    No day-wise records found for this employee.
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="hidden">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm">Movement Logs</CardTitle>
            <Button
              size="sm"
              variant="outline"
              disabled={movementRows.length === 0}
              onClick={() =>
                downloadCsv(
                  `attendance-movements-${from}-to-${to}.csv`,
                  movementRows.map((row) => ({
                    employee: row.employeeName ?? "",
                    employeeId:
                      employees.find(
                        (employee) => (employee.employeeId || employee.id) === row.employeeId,
                      )?.employeeCode ??
                      row.employeeId ??
                      "",
                    date: row.date ?? "",
                    time: new Date(row.time).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    }),
                    movement: movementEventLabel(row),
                    captureSource: captureSourceLabel(row),
                    branch: row.branchName ?? "",
                    location: row.clientName ?? row.clientLocationName ?? "",
                    address: row.address ?? "",
                  })),
                )
              }
            >
              Export All Employees
            </Button>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Date-wise movements across mobile GPS, biometric devices, and branch or field locations.
          </p>
        </CardHeader>
        <CardContent>
          <TableToolbar>
            <div className="text-xs text-muted-foreground">
              Filters above apply to both employee day-wise logs and detailed movement logs.
            </div>
          </TableToolbar>

          {loadingMovementRows && <LoadingState label="Loading movement logs" compact />}
          {movementError && <p className="text-sm text-destructive">{movementError}</p>}
          {!loadingMovementRows && !movementError && (
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="overflow-x-auto">
                <Table className="min-w-[1160px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Movement</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead className="text-right">Navigation</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movementRows.map((row, index) => (
                      <TableRow
                        key={`${row.employeeId ?? "emp"}-${row.time}-${row.type}-${index}`}
                        className="[content-visibility:auto] [contain-intrinsic-size:52px]"
                      >
                        <TableCell className="font-medium">
                          <div>{row.employeeName ?? "-"}</div>
                          <div className="text-xs text-muted-foreground">
                            {employees.find(
                              (employee) => (employee.employeeId || employee.id) === row.employeeId,
                            )?.employeeCode ??
                              row.employeeId ??
                              "-"}
                          </div>
                        </TableCell>
                        <TableCell>{row.date ?? row.time.slice(0, 10)}</TableCell>
                        <TableCell>
                          {new Date(row.time).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const dir = movementDirectionLabel(row.type);
                            const label = movementEventLabel(row);
                            const badgeColor =
                              dir === "In"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-800/30"
                                : dir === "Out"
                                  ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-800/30"
                                  : "bg-muted text-muted-foreground border-border";
                            return (
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badgeColor}`}
                              >
                                <RouteIcon className="h-3 w-3" />
                                {label}
                              </span>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const src = captureSourceLabel(row);
                            if (src.startsWith("Biometric")) {
                              return (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-purple-50 text-purple-700 border border-purple-100 dark:bg-purple-950/20 dark:text-purple-400 dark:border-purple-900/30">
                                  <Fingerprint className="h-3.5 w-3.5" />
                                  {src}
                                </span>
                              );
                            }
                            if (src.startsWith("Mobile -")) {
                              return (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30">
                                  <Smartphone className="h-3.5 w-3.5" />
                                  {src}
                                </span>
                              );
                            }
                            return <span className="text-xs text-muted-foreground">{src}</span>;
                          })()}
                        </TableCell>
                        <TableCell>{row.branchName ?? "-"}</TableCell>
                        <TableCell className="max-w-[320px]">
                          <div className="space-y-1">
                            {row.clientName && (
                              <div
                                className="font-semibold text-xs text-foreground truncate"
                                title={row.clientName}
                              >
                                {row.clientName}
                              </div>
                            )}
                            {row.clientLocationName && (
                              <div
                                className="text-[11px] text-muted-foreground truncate"
                                title={row.clientLocationName}
                              >
                                {row.clientLocationName}
                              </div>
                            )}
                            {row.address && (
                              <div
                                className="text-[11px] text-muted-foreground/80 line-clamp-2"
                                title={row.address}
                              >
                                {row.address}
                              </div>
                            )}
                            {row.latitude && row.longitude && (
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${row.latitude},${row.longitude}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium"
                              >
                                <MapPin className="h-3 w-3 text-red-500" />
                                View GPS Map
                              </a>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openTimeline(row.employeeId, row.employeeName, row.date)}
                          >
                            <Compass className="mr-1.5 h-3.5 w-3.5" /> Timeline
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {!movementRows.length && (
                <div className="p-6 text-sm text-muted-foreground">
                  No movements found for the selected filters.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AttendanceTimelineSheet
        employeeId={selectedTimelineEmp?.id ?? ""}
        employeeName={selectedTimelineEmp?.name ?? ""}
        date={selectedTimelineEmp?.date ?? ""}
        open={!!selectedTimelineEmp}
        onOpenChange={(open) => !open && setSelectedTimelineEmp(null)}
      />
    </div>
  );
}
