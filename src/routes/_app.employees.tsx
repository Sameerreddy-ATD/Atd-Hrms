import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { TableToolbar } from "@/components/common/TableToolbar";
import { Badge } from "@/components/ui/badge";
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
import type { Branch, Department, User } from "@/mock/types";
import { ROLE_LABELS } from "@/mock/types";
import { branchesApi, employeesApi } from "@/services/api";
import { Plus, Search, Pencil } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_app/employees")({
  component: EmployeesPage,
});

function EmployeesPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [employees, setEmployees] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState("all");
  const [dept, setDept] = useState("all");

  const [editingEmployee, setEditingEmployee] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    phone: "",
    homeBranchId: "",
    departmentId: "",
    designation: "",
    dateOfBirth: "",
    gender: "PREFER_NOT_TO_SAY" as "FEMALE" | "MALE" | "PREFER_NOT_TO_SAY",
    employmentType: "FULL_TIME" as "FULL_TIME" | "PART_TIME" | "INTERN",
    attendanceMode: "BOTH" as "THUMB_ONLY" | "MOBILE_GPS_ONLY" | "BOTH",
  });

  const canEdit = currentUser && ["developer_admin", "main_admin", "hr"].includes(currentUser.role);

  useEffect(() => {
    Promise.all([employeesApi.list(), branchesApi.list(), branchesApi.departments()])
      .then(([employeeRows, branchRows, departmentRows]) => {
        setEmployees(employeeRows);
        setBranches(branchRows);
        setDepartments(departmentRows);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const managerOptions = employees.filter((employee) =>
    ["manager", "hr", "main_admin", "developer_admin"].includes(employee.role),
  );

  async function updateManager(employee: User, managerId: string) {
    try {
      const updated = await employeesApi.update(employee.employeeId ?? employee.id, {
        managerId: managerId === "none" ? undefined : managerId,
      });
      setEmployees((prev) =>
        prev.map((row) => (row.employeeId === updated.employeeId ? { ...row, ...updated } : row)),
      );
      toast.success("Reporting manager updated");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function openEditDialog(emp: User) {
    setEditingEmployee(emp);
    setEditForm({
      name: emp.name || "",
      email: emp.email || "",
      phone: emp.phone || "",
      homeBranchId: emp.homeBranchId || "",
      departmentId: emp.departmentId || "",
      designation: emp.designation || "",
      dateOfBirth: emp.dateOfBirth || "",
      gender: emp.gender || "PREFER_NOT_TO_SAY",
      employmentType: emp.employmentType || "FULL_TIME",
      attendanceMode: "BOTH",
    });
  }

  async function saveEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!editingEmployee) return;
    try {
      const payload = {
        name: editForm.name,
        email: editForm.email || undefined,
        phone: editForm.phone || undefined,
        homeBranchId: editForm.homeBranchId || undefined,
        departmentId: editForm.departmentId || undefined,
        designation: editForm.designation || undefined,
        dateOfBirth: editForm.dateOfBirth || undefined,
        gender: editForm.gender,
        employmentType: editForm.employmentType,
        attendanceMode: "BOTH" as const,
      };
      const updated = await employeesApi.update(
        editingEmployee.employeeId ?? editingEmployee.id,
        payload,
      );
      setEmployees((prev) =>
        prev.map((row) => (row.employeeId === updated.employeeId ? { ...row, ...updated } : row)),
      );
      toast.success("Employee details updated");
      setEditingEmployee(null);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const rows = useMemo(
    () =>
      employees
        .filter((u) => u.employeeId)
        .filter((u) => {
          if (q && !`${u.name} ${u.email} ${u.employeeId}`.toLowerCase().includes(q.toLowerCase()))
            return false;
          if (branch !== "all" && u.homeBranchId !== branch) return false;
          if (dept !== "all" && u.departmentId !== dept && u.department !== dept) return false;
          return true;
        }),
    [q, branch, dept, employees],
  );

  return (
    <div>
      <PageHeader
        title="Employees"
        description="Directory of all employees across branches and departments."
        actions={
          <Button size="sm" onClick={() => navigate({ to: "/users", search: { create: true } })}>
            <Plus className="mr-2 h-4 w-4" /> Add employee
          </Button>
        }
      />
      {loading && <p className="text-sm text-muted-foreground">Loading employees...</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <TableToolbar>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, ID"
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

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Employee ID</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Home Branch</TableHead>
                <TableHead>Reporting Manager</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                {canEdit && <TableHead className="w-[80px]">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {u.employeeCode ?? u.employeeId}
                  </TableCell>
                  <TableCell>{ROLE_LABELS[u.role]}</TableCell>
                  <TableCell>{u.department ?? "-"}</TableCell>
                  <TableCell>
                    {branches.find((b) => b.id === u.homeBranchId)?.name ?? u.homeBranchName ?? "-"}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={u.managerId ?? "none"}
                      onValueChange={(value) => updateManager(u, value)}
                    >
                      <SelectTrigger className="min-w-44">
                        <SelectValue placeholder="Manager" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No manager</SelectItem>
                        {managerOptions
                          .filter((manager) => manager.employeeId !== u.employeeId)
                          .map((manager) => (
                            <SelectItem
                              key={manager.employeeId}
                              value={manager.employeeId ?? manager.id}
                            >
                              {manager.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-sm">{u.phone ?? "-"}</TableCell>
                  <TableCell>
                    {u.active ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-200 bg-emerald-50 text-emerald-700"
                      >
                        Active
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-slate-200 bg-slate-100 text-slate-600"
                      >
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEditDialog(u)}
                        title="Edit Details"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!loading && rows.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">No employees found.</div>
        )}
      </div>

      {editingEmployee && (
        <Dialog open={!!editingEmployee} onOpenChange={(open) => !open && setEditingEmployee(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Employee Details</DialogTitle>
            </DialogHeader>
            <form onSubmit={saveEmployee} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Full name</Label>
                  <Input
                    value={editForm.name}
                    onChange={(e) => setEditForm((c) => ({ ...c, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm((c) => ({ ...c, email: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input
                    value={editForm.phone}
                    onChange={(e) => setEditForm((c) => ({ ...c, phone: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Home Branch</Label>
                  <Select
                    value={editForm.homeBranchId}
                    onValueChange={(val) => setEditForm((c) => ({ ...c, homeBranchId: val }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Department</Label>
                  <Select
                    value={editForm.departmentId}
                    onValueChange={(val) => setEditForm((c) => ({ ...c, departmentId: val }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Designation</Label>
                  <Input
                    value={editForm.designation}
                    onChange={(e) => setEditForm((c) => ({ ...c, designation: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Date of Birth</Label>
                  <Input
                    type="date"
                    value={editForm.dateOfBirth}
                    onChange={(e) => setEditForm((c) => ({ ...c, dateOfBirth: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Gender</Label>
                  <Select
                    value={editForm.gender}
                    onValueChange={(value: "FEMALE" | "MALE" | "PREFER_NOT_TO_SAY") =>
                      setEditForm((current) => ({ ...current, gender: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FEMALE">Female</SelectItem>
                      <SelectItem value="MALE">Male</SelectItem>
                      <SelectItem value="PREFER_NOT_TO_SAY">Prefer not to say</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Employment type</Label>
                  <Select
                    value={editForm.employmentType}
                    onValueChange={(value: "FULL_TIME" | "PART_TIME" | "INTERN") =>
                      setEditForm((current) => ({ ...current, employmentType: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FULL_TIME">Full-time</SelectItem>
                      <SelectItem value="PART_TIME">Part-time</SelectItem>
                      <SelectItem value="INTERN">Intern</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 sm:col-span-2">
                  <p className="text-sm font-medium text-emerald-900">
                    Flexible attendance enabled
                  </p>
                  <p className="mt-1 text-xs leading-5 text-emerald-700">
                    Every employee can use a biometric scanner or mobile location. A session started
                    on one method can be completed using the other.
                  </p>
                </div>
              </div>
              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" onClick={() => setEditingEmployee(null)}>
                  Cancel
                </Button>
                <Button type="submit">Save Changes</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
