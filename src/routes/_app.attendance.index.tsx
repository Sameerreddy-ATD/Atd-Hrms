import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import type { Branch, Department, User } from "@/mock/types";
import { attendanceApi, branchesApi, employeesApi } from "@/services/api";
import { downloadCsv } from "@/lib/csv";
import { attendanceSourceLabel } from "@/lib/attendance-labels";
import { Search, ArrowRight, Calendar } from "lucide-react";

export const Route = createFileRoute("/_app/attendance/")({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: search.q ? String(search.q) : undefined,
  }),
  component: AttendanceOverviewPage,
});

function AttendanceOverviewPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [q, setQ] = useState(search.q || "");

  useEffect(() => {
    setQ(search.q || "");
  }, [search.q]);

  const [branch, setBranch] = useState("all");
  const [dept, setDept] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [employees, setEmployees] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    Promise.all([employeesApi.list(), branchesApi.list(), branchesApi.departments()])
      .then(([employeeRows, branchRows, departmentRows]) => {
        setEmployees(employeeRows);
        setBranches(branchRows);
        setDepartments(departmentRows);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const branchName = (id?: string) => branches.find((b) => b.id === id)?.name ?? "-";
  const departmentName = (id?: string) => departments.find((d) => d.id === id)?.name ?? "-";

  const filteredEmployees = useMemo(
    () =>
      [...employees]
        .filter((employee) => {
          const haystack =
            `${employee.name} ${employee.email} ${employee.employeeCode ?? ""} ${employee.employeeId ?? ""}`.toLowerCase();
          if (q && !haystack.includes(q.toLowerCase())) return false;
          if (branch !== "all" && employee.homeBranchId !== branch) return false;
          if (dept !== "all" && employee.departmentId !== dept) return false;
          return true;
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [employees, q, branch, dept],
  );

  function openDayLogs(employee: User) {
    sessionStorage.setItem(
      "attendance-day-log-selection",
      JSON.stringify({
        employeeId: employee.employeeId || employee.id,
        employeeName: employee.name,
        from: from || new Date().toISOString().slice(0, 10),
        to: to || from || new Date().toISOString().slice(0, 10),
      }),
    );
    void navigate({ to: "/attendance/locations" });
  }

  async function exportAllAttendance() {
    setExporting(true);
    try {
      const rows = await attendanceApi.list({
        from: from || undefined,
        to: to || undefined,
        branchId: branch !== "all" ? branch : undefined,
        departmentId: dept !== "all" ? dept : undefined,
        limit: !from && !to ? "none" : undefined,
      });
      downloadCsv(
        `attendance-overview-${from || "all"}-to-${to || "all"}.csv`,
        rows.map((row) => ({
          employee: row.employeeName,
          employeeId: row.employeeId,
          date: row.date,
          homeBranch: branchName(row.homeBranchId),
          actualBranch: branchName(row.actualBranchId),
          punchIn: row.punchIn ?? "",
          punchOut: row.punchOut ?? "",
          source: attendanceSourceLabel(row, branches),
          status: row.status,
        })),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Attendance Overview"
        description="Employee-wise attendance directory. Open any employee to review day-wise logs and movement details."
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={exporting}
            onClick={() => void exportAllAttendance()}
          >
            {exporting ? "Exporting..." : "Export All Employees"}
          </Button>
        }
      />

      <TableToolbar>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search employee..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="justify-start text-left font-normal sm:w-[240px]">
              <Calendar className="mr-2 h-4 w-4" />
              {from || to ? (
                <span>
                  {from ? from : "Start"} to {to ? to : "End"}
                </span>
              ) : (
                <span>Date range for export</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-4" align="start">
            <div className="space-y-4">
              <h4 className="font-semibold leading-none text-sm">Select Date Range</h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="overview-from" className="text-xs">
                    Start Date
                  </Label>
                  <Input
                    id="overview-from"
                    type="date"
                    value={from}
                    max={to || undefined}
                    onChange={(e) => {
                      const nextFrom = e.target.value;
                      setFrom(nextFrom);
                      if (to && nextFrom && to < nextFrom) setTo(nextFrom);
                    }}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="overview-to" className="text-xs">
                    End Date
                  </Label>
                  <Input
                    id="overview-to"
                    type="date"
                    value={to}
                    min={from || undefined}
                    onChange={(e) => setTo(e.target.value)}
                    className="h-8"
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setFrom("");
                  setTo("");
                }}
              >
                Clear Selection
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <Select value={branch} onValueChange={setBranch}>
          <SelectTrigger className="sm:w-44">
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

        <Select value={dept} onValueChange={setDept}>
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableToolbar>

      {loading && <p className="text-sm text-muted-foreground">Loading employees...</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead className="text-right">Navigation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEmployees.map((employee) => (
                <TableRow key={employee.employeeId || employee.id}>
                  <TableCell>
                    <div className="font-semibold">{employee.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {employee.employeeCode ?? employee.employeeId ?? employee.id}
                    </div>
                  </TableCell>
                  <TableCell>
                    {employee.department ?? departmentName(employee.departmentId)}
                  </TableCell>
                  <TableCell>{branchName(employee.homeBranchId)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => openDayLogs(employee)}>
                      Open Day Logs <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!loading && filteredEmployees.length === 0 && (
          <div className="p-6">
            <EmptyState
              title="No employees found"
              description="Try clearing filters or changing the search text."
            />
          </div>
        )}
      </div>
    </div>
  );
}
