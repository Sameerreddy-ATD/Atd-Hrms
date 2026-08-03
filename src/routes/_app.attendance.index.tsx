import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
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
import type { Branch, Department, User } from "@/types/domain";
import { branchesApi, employeesApi } from "@/services/api";
import { indiaDateKey } from "@/lib/india-date";
import { useAuth } from "@/lib/auth";
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
import { Search, ArrowRight, MapPin } from "lucide-react";

export const Route = createFileRoute("/_app/attendance/")({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: search.q ? String(search.q) : undefined,
  }),
  component: AttendanceOverviewPage,
});

function AttendanceOverviewPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [q, setQ] = useState(search.q || "");
  const canOpenMine = Boolean(
    user?.employeeId &&
      !["developer_admin"].includes(user.role),
  );

  useEffect(() => {
    setQ(search.q || "");
  }, [search.q]);

  const [branch, setBranch] = useState("all");
  const [dept, setDept] = useState("all");
  const [employees, setEmployees] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
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
          if (employee.role === "developer_admin" || employee.role === "main_admin") return false;
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
    const today = indiaDateKey();
    sessionStorage.setItem(
      "attendance-day-log-selection",
      JSON.stringify({
        employeeId: employee.employeeId || employee.id,
        employeeName: employee.name,
        from: today,
        to: today,
      }),
    );
    void navigate({ to: "/attendance/locations" });
  }

  return (
    <div>
      <PageHeader
        title="Employee Attendance"
        description="Browse people, then open day logs for punch times, location, and movement."
        actions={
          <div className="flex w-full flex-col gap-2 min-[420px]:w-auto min-[420px]:flex-row">
            <Button asChild variant="outline">
              <Link to="/attendance/locations">
                <MapPin className="mr-1.5 size-4" />
                Day logs
              </Link>
            </Button>
            {canOpenMine && (
              <Button asChild variant="outline">
                <Link to="/attendance/mine">My Attendance</Link>
              </Button>
            )}
          </div>
        }
      />

      <TableToolbar>
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search employee..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>

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

      {loading && <LoadingState label="Loading attendance logs" />}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <ResponsiveListShell>
        <MobileList>
          {filteredEmployees.map((employee) => (
            <MobileListItem key={employee.employeeId || employee.id}>
              <MobileListHeader
                title={employee.name}
                meta={employee.employeeCode ?? employee.employeeId ?? employee.id}
              />
              <MobileListFields>
                <MobileListField
                  label="Department"
                  value={employee.department ?? departmentName(employee.departmentId)}
                />
                <MobileListField label="Branch" value={branchName(employee.homeBranchId)} />
              </MobileListFields>
              <MobileListActions>
                <Button
                  className="w-full"
                  size="sm"
                  variant="outline"
                  onClick={() => openDayLogs(employee)}
                >
                  Open Day Logs <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </MobileListActions>
            </MobileListItem>
          ))}
        </MobileList>
        <DesktopTable>
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
        </DesktopTable>
        {!loading && filteredEmployees.length === 0 && (
          <div className="p-6">
            <EmptyState
              title="No employees found"
              description="Try clearing filters or changing the search text."
            />
          </div>
        )}
      </ResponsiveListShell>
    </div>
  );
}
