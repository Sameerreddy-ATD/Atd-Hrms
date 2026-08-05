import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
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
import type { BankAccountType, Branch, CompanyEntity, Department, User } from "@/types/domain";
import { COMPANY_LABELS, ROLE_LABELS } from "@/types/domain";
import { branchesApi, employeesApi, shiftsApi } from "@/services/api";
import { Search, Pencil, UserCog } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatDisplayDate } from "@/lib/india-date";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { EmergencyContactSection } from "@/components/profile/EmergencyContactSection";

export const Route = createFileRoute("/_app/employees")({
  component: EmployeesPage,
});

const PAGE_SIZE = 100;

function EmployeesPage() {
  const { user: currentUser } = useAuth();
  const [employees, setEmployees] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [shiftCatalog, setShiftCatalog] = useState<
    Array<{
      id: string;
      name: string;
      code: string;
      shiftType: "DAY" | "NIGHT";
      startMinutes: number;
      endMinutes: number;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState("all");
  const [dept, setDept] = useState("all");

  const [editingEmployee, setEditingEmployee] = useState<User | null>(null);
  const [hrManagingEmployee, setHrManagingEmployee] = useState<User | null>(null);
  const [hrManagerId, setHrManagerId] = useState("");
  const [hrSaving, setHrSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    phone: "",
    companyPhone: "",
    companyEntity: "ANYTIME_DIESEL" as CompanyEntity,
    homeBranchId: "",
    departmentId: "",
    designation: "",
    bloodGroup: "" as NonNullable<User["bloodGroup"]> | "",
    bankAccountType: "" as BankAccountType | "",
    bankAccountHolderName: "",
    bankAccountNumber: "",
    bankIfscCode: "",
    panNumber: "",
    aadhaarNumber: "",
    uanNumber: "",
    dateOfBirth: "",
    gender: "PREFER_NOT_TO_SAY" as "FEMALE" | "MALE" | "PREFER_NOT_TO_SAY",
    employmentType: "FULL_TIME" as "FULL_TIME" | "PART_TIME" | "INTERN",
    organizationLevel: "MEMBER" as "HEAD" | "SENIOR" | "JUNIOR" | "MEMBER",
    attendanceMode: "BOTH" as "THUMB_ONLY" | "MOBILE_GPS_ONLY" | "BOTH",
    shiftType: "DAY" as "DAY" | "NIGHT",
    shiftStartMinutes: 540,
    shiftEndMinutes: 1080,
  });

  const canEdit = currentUser?.role === "developer_admin";
  const canHrManage = currentUser?.role === "hr";
  const canOpenEmployeeActions = canEdit || canHrManage;
  const canSeeCompanyDirectory = Boolean(
    currentUser && ["developer_admin", "main_admin", "ceo", "hr"].includes(currentUser.role),
  );

  useEffect(() => {
    Promise.all([
      employeesApi.list({ limit: PAGE_SIZE, offset: 0 }),
      branchesApi.list(),
      branchesApi.departments(),
      shiftsApi.list().catch(() => []),
    ])
      .then(([employeeRows, branchRows, departmentRows, shiftRows]) => {
        setEmployees(employeeRows);
        setHasMore(employeeRows.length === PAGE_SIZE);
        setBranches(branchRows);
        setDepartments(departmentRows);
        setShiftCatalog(shiftRows);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
    const statusTimer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void employeesApi
        .list({ limit: PAGE_SIZE, offset: 0 })
        .then((rows) => setEmployees((current) => [...rows, ...current.slice(PAGE_SIZE)]))
        .catch(() => undefined);
    }, 45_000);
    return () => window.clearInterval(statusTimer);
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = await employeesApi.list({ limit: PAGE_SIZE, offset: employees.length });
      setEmployees((current) => [...current, ...next]);
      setHasMore(next.length === PAGE_SIZE);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  async function openHrManageDialog(emp: User) {
    let fullEmployee = emp;
    try {
      fullEmployee = (await employeesApi.get(emp.employeeId ?? emp.id)) ?? emp;
    } catch (error) {
      toast.error((error as Error).message);
      return;
    }
    setHrManagingEmployee(fullEmployee);
    setHrManagerId(fullEmployee.managerId ?? "");
  }

  async function saveHrManager(event: React.FormEvent) {
    event.preventDefault();
    if (!hrManagingEmployee) return;
    setHrSaving(true);
    try {
      const updated = await employeesApi.update(
        hrManagingEmployee.employeeId ?? hrManagingEmployee.id,
        { managerId: hrManagerId },
      );
      setEmployees((current) =>
        current.map((row) =>
          (row.employeeId ?? row.id) === (updated.employeeId ?? updated.id)
            ? { ...row, ...updated }
            : row,
        ),
      );
      setHrManagingEmployee((current) => (current ? { ...current, ...updated } : current));
      toast.success("Reporting manager updated");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setHrSaving(false);
    }
  }

  async function openEditDialog(emp: User) {
    let fullEmployee = emp;
    try {
      fullEmployee = (await employeesApi.get(emp.employeeId ?? emp.id)) ?? emp;
    } catch (error) {
      toast.error((error as Error).message);
      return;
    }
    setEditingEmployee(fullEmployee);
    setEditForm({
      name: fullEmployee.name || "",
      email: fullEmployee.email || "",
      phone: fullEmployee.phone || "",
      companyPhone: fullEmployee.companyPhone || "",
      companyEntity: fullEmployee.companyEntity || "ANYTIME_DIESEL",
      homeBranchId: fullEmployee.homeBranchId || "",
      departmentId: fullEmployee.departmentId || "",
      designation: fullEmployee.designation || "",
      bloodGroup: fullEmployee.bloodGroup || "",
      bankAccountType: fullEmployee.bankAccountType || "",
      bankAccountHolderName: fullEmployee.bankAccountHolderName || "",
      bankAccountNumber: fullEmployee.bankAccountNumber || "",
      bankIfscCode: fullEmployee.bankIfscCode || "",
      panNumber: fullEmployee.panNumber || "",
      aadhaarNumber: fullEmployee.aadhaarNumber || "",
      uanNumber: fullEmployee.uanNumber || "",
      dateOfBirth: fullEmployee.dateOfBirth || "",
      gender: fullEmployee.gender || "PREFER_NOT_TO_SAY",
      employmentType: fullEmployee.employmentType || "FULL_TIME",
      organizationLevel: fullEmployee.organizationLevel || "MEMBER",
      attendanceMode: "BOTH",
      shiftType: fullEmployee.shiftType || "DAY",
      shiftStartMinutes: fullEmployee.shiftStartMinutes ?? 540,
      shiftEndMinutes: fullEmployee.shiftEndMinutes ?? 1080,
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
        companyPhone: editForm.companyPhone || undefined,
        companyEntity: editForm.companyEntity,
        homeBranchId: editForm.homeBranchId || undefined,
        departmentId: editForm.departmentId || undefined,
        designation: editForm.designation || undefined,
        bloodGroup: editForm.bloodGroup || undefined,
        bankAccountType: editForm.bankAccountType || undefined,
        bankAccountHolderName: editForm.bankAccountHolderName || undefined,
        bankAccountNumber: editForm.bankAccountNumber || undefined,
        bankIfscCode: editForm.bankIfscCode || undefined,
        panNumber: editForm.panNumber || undefined,
        aadhaarNumber: editForm.aadhaarNumber || undefined,
        uanNumber: editForm.uanNumber || undefined,
        dateOfBirth: editForm.dateOfBirth || undefined,
        gender: editForm.gender,
        employmentType: editForm.employmentType,
        organizationLevel: editForm.organizationLevel,
        attendanceMode: "BOTH" as const,
        shiftType: editForm.shiftType,
        shiftStartMinutes: editForm.shiftStartMinutes,
        shiftEndMinutes: editForm.shiftEndMinutes,
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

  const visibleDepartments = useMemo(() => {
    if (canSeeCompanyDirectory) return departments;
    const allowedIds = new Set(employees.map((employee) => employee.departmentId).filter(Boolean));
    const allowedNames = new Set(employees.map((employee) => employee.department).filter(Boolean));
    return departments.filter(
      (department) => allowedIds.has(department.id) || allowedNames.has(department.name),
    );
  }, [canSeeCompanyDirectory, departments, employees]);

  return (
    <div>
      <PageHeader
        title="Employees"
        description={
          canEdit
            ? "Developer Admin can edit full employee profiles and emergency contacts."
            : canHrManage
              ? "HR can set reporting managers and update emergency contacts for employees in scope. Full profile edits remain with Developer Admin."
              : canSeeCompanyDirectory
                ? "Directory of employees across branches and organization units."
                : "Employees in your organization unit and its child teams."
        }
      />
      {loading && <LoadingState label="Loading employees" />}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <TableToolbar>
        <div className="relative min-w-52 flex-1">
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
            {visibleDepartments.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableToolbar>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="space-y-2 p-3 md:hidden">
          {rows.map((employee) => (
            <div
              key={employee.id}
              className="rounded-lg border bg-background p-3 [content-visibility:auto] [contain-intrinsic-size:170px]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{employee.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{employee.email}</p>
                </div>
                <EmployeeAccountStatus employee={employee} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Employee ID</p>
                  <p className="mt-0.5 font-mono">{employee.employeeCode ?? employee.employeeId}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Role</p>
                  <p className="mt-0.5">{ROLE_LABELS[employee.role]}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Department</p>
                  <p className="mt-0.5 break-words">{employee.department ?? "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Branch</p>
                  <p className="mt-0.5 break-words">
                    {branches.find((item) => item.id === employee.homeBranchId)?.name ??
                      employee.homeBranchName ??
                      "-"}
                  </p>
                </div>
              </div>
              {canOpenEmployeeActions && (
                <Button
                  className="mt-3 w-full"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    canEdit ? void openEditDialog(employee) : void openHrManageDialog(employee)
                  }
                >
                  {canEdit ? (
                    <>
                      <Pencil className="h-4 w-4" /> Edit details
                    </>
                  ) : (
                    <>
                      <UserCog className="h-4 w-4" /> Manager & emergency
                    </>
                  )}
                </Button>
              )}
            </div>
          ))}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Employee ID</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Home Branch</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                {canOpenEmployeeActions && <TableHead className="w-[80px]">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((u) => (
                <TableRow
                  key={u.id}
                  className="[content-visibility:auto] [contain-intrinsic-size:52px]"
                >
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
                  <TableCell className="text-sm">{u.phone ?? "-"}</TableCell>
                  <TableCell>
                    <EmployeeAccountStatus employee={u} />
                  </TableCell>
                  {canOpenEmployeeActions && (
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          canEdit ? void openEditDialog(u) : void openHrManageDialog(u)
                        }
                        title={canEdit ? "Edit details" : "Manager and emergency contact"}
                      >
                        {canEdit ? <Pencil className="h-4 w-4" /> : <UserCog className="h-4 w-4" />}
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
        {hasMore && !q && branch === "all" && dept === "all" && (
          <div className="border-t p-3 text-center">
            <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
              {loadingMore ? "Loading employees..." : "Load more employees"}
            </Button>
          </div>
        )}
      </div>

      {editingEmployee && (
        <Dialog open={!!editingEmployee} onOpenChange={(open) => !open && setEditingEmployee(null)}>
          <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[92dvh]">
            <DialogHeader className="border-b border-border px-5 py-4 sm:px-6">
              <DialogTitle>Edit Employee Details</DialogTitle>
            </DialogHeader>
            <form onSubmit={saveEmployee} className="flex min-h-0 flex-1 flex-col">
              <div className="grid flex-1 grid-cols-1 gap-x-5 gap-y-4 overflow-y-auto px-3 py-4 sm:grid-cols-2 sm:px-6 sm:py-5">
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
                  <Label>Personal phone</Label>
                  <Input
                    value={editForm.phone}
                    onChange={(e) => setEditForm((c) => ({ ...c, phone: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Company phone</Label>
                  <Input
                    value={editForm.companyPhone}
                    onChange={(e) =>
                      setEditForm((current) => ({ ...current, companyPhone: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Employer company</Label>
                  <Select
                    value={editForm.companyEntity}
                    onValueChange={(value) =>
                      setEditForm((current) => ({
                        ...current,
                        companyEntity: value as CompanyEntity,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(COMPANY_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Attendance location</Label>
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
                  <Label>Organization level</Label>
                  <Select
                    value={editForm.organizationLevel}
                    onValueChange={(value) =>
                      setEditForm((current) => ({
                        ...current,
                        organizationLevel: value as typeof current.organizationLevel,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HEAD">Head</SelectItem>
                      <SelectItem value="SENIOR">Senior</SelectItem>
                      <SelectItem value="JUNIOR">Junior</SelectItem>
                      <SelectItem value="MEMBER">Member</SelectItem>
                    </SelectContent>
                  </Select>
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
                  <Label>Blood group</Label>
                  <Select
                    value={editForm.bloodGroup || "not_provided"}
                    onValueChange={(value) =>
                      setEditForm((current) => ({
                        ...current,
                        bloodGroup:
                          value === "not_provided"
                            ? ""
                            : (value as NonNullable<User["bloodGroup"]>),
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not_provided">Not provided</SelectItem>
                      {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
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
                <div className="border-t border-border pt-4 sm:col-span-2">
                  <h3 className="text-sm font-semibold">Banking and statutory details</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sensitive identifiers are encrypted before storage.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Account holder name</Label>
                  <Input
                    value={editForm.bankAccountHolderName}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        bankAccountHolderName: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Account type</Label>
                  <Select
                    value={editForm.bankAccountType || "not_provided"}
                    onValueChange={(value) =>
                      setEditForm((current) => ({
                        ...current,
                        bankAccountType: value === "not_provided" ? "" : (value as BankAccountType),
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not_provided">Not provided</SelectItem>
                      {["SAVINGS", "CURRENT", "SALARY", "NRE", "NRO", "OTHER"].map((value) => (
                        <SelectItem key={value} value={value}>
                          {value.charAt(0) + value.slice(1).toLowerCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {[
                  ["Account number", "bankAccountNumber"],
                  ["IFSC code", "bankIfscCode"],
                  ["PAN number", "panNumber"],
                  ["Aadhaar number", "aadhaarNumber"],
                  ["UAN number", "uanNumber"],
                ].map(([label, key]) => (
                  <div className="space-y-1.5" key={key}>
                    <Label>{label}</Label>
                    <Input
                      autoComplete="off"
                      value={editForm[key as keyof typeof editForm] as string}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                    />
                  </div>
                ))}
                <div className="border-t border-border pt-4 sm:col-span-2">
                  <h3 className="text-sm font-semibold">Attendance configuration</h3>
                </div>
                {shiftCatalog.length > 0 && (
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Shift catalog</Label>
                    <Select
                      value={
                        shiftCatalog.find(
                          (shift) =>
                            shift.shiftType === editForm.shiftType &&
                            shift.startMinutes === editForm.shiftStartMinutes &&
                            shift.endMinutes === editForm.shiftEndMinutes,
                        )?.id ?? "custom"
                      }
                      onValueChange={(value) => {
                        if (value === "custom") return;
                        const shift = shiftCatalog.find((row) => row.id === value);
                        if (!shift) return;
                        setEditForm((current) => ({
                          ...current,
                          shiftType: shift.shiftType,
                          shiftStartMinutes: shift.startMinutes,
                          shiftEndMinutes: shift.endMinutes,
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a catalog shift" />
                      </SelectTrigger>
                      <SelectContent>
                        {shiftCatalog.map((shift) => (
                          <SelectItem key={shift.id} value={shift.id}>
                            {shift.name}
                          </SelectItem>
                        ))}
                        <SelectItem value="custom">Custom times</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Shift</Label>
                  <Select
                    value={editForm.shiftType}
                    onValueChange={(value: "DAY" | "NIGHT") =>
                      setEditForm((current) => ({
                        ...current,
                        shiftType: value,
                        shiftStartMinutes: value === "NIGHT" ? 1260 : 540,
                        shiftEndMinutes: value === "NIGHT" ? 360 : 1080,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DAY">Day shift</SelectItem>
                      <SelectItem value="NIGHT">Night shift</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:col-span-2">
                  <div className="space-y-1.5">
                    <Label>Shift starts</Label>
                    <Input
                      type="time"
                      value={`${String(Math.floor(editForm.shiftStartMinutes / 60)).padStart(2, "0")}:${String(editForm.shiftStartMinutes % 60).padStart(2, "0")}`}
                      onChange={(event) => {
                        const [hours, minutes] = event.target.value.split(":").map(Number);
                        setEditForm((current) => ({
                          ...current,
                          shiftStartMinutes: hours * 60 + minutes,
                        }));
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Shift ends</Label>
                    <Input
                      type="time"
                      value={`${String(Math.floor(editForm.shiftEndMinutes / 60)).padStart(2, "0")}:${String(editForm.shiftEndMinutes % 60).padStart(2, "0")}`}
                      onChange={(event) => {
                        const [hours, minutes] = event.target.value.split(":").map(Number);
                        setEditForm((current) => ({
                          ...current,
                          shiftEndMinutes: hours * 60 + minutes,
                        }));
                      }}
                    />
                  </div>
                </div>
                <div className="rounded-md border border-border p-3 sm:col-span-2">
                  <EmergencyContactSection
                    employeeId={editingEmployee.employeeId ?? editingEmployee.id}
                    value={editingEmployee.emergencyContact}
                    canEdit
                    onSaved={(next) =>
                      setEditingEmployee((current) =>
                        current ? { ...current, emergencyContact: next } : current,
                      )
                    }
                  />
                </div>
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/30 sm:col-span-2">
                  <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
                    Flexible attendance enabled
                  </p>
                  <p className="mt-1 text-xs leading-5 text-emerald-700 dark:text-emerald-400">
                    Every employee can use a biometric scanner or mobile location. A session started
                    on one method can be completed using the other.
                  </p>
                </div>
              </div>
              <DialogFooter className="border-t border-border bg-background px-5 py-4 sm:px-6">
                <Button type="button" variant="outline" onClick={() => setEditingEmployee(null)}>
                  Cancel
                </Button>
                <Button type="submit">Save Changes</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {hrManagingEmployee && (
        <Dialog
          open={!!hrManagingEmployee}
          onOpenChange={(open) => !open && setHrManagingEmployee(null)}
        >
          <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-h-[92dvh]">
            <DialogHeader className="border-b border-border px-5 py-4 sm:px-6">
              <DialogTitle>HR employee update</DialogTitle>
              <DialogDescription>
                {hrManagingEmployee.name} · reporting manager and emergency contact only.
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4 sm:px-6">
              <form onSubmit={(event) => void saveHrManager(event)} className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Reporting manager</Label>
                  <Select
                    value={hrManagerId || "none"}
                    onValueChange={(value) => setHrManagerId(value === "none" ? "" : value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select manager" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No reporting manager</SelectItem>
                      {employees
                        .filter(
                          (candidate) =>
                            (candidate.employeeId ?? candidate.id) !==
                            (hrManagingEmployee.employeeId ?? hrManagingEmployee.id),
                        )
                        .map((candidate) => (
                          <SelectItem
                            key={candidate.employeeId ?? candidate.id}
                            value={candidate.employeeId ?? candidate.id}
                          >
                            {candidate.name}
                            {candidate.employeeCode ? ` (${candidate.employeeCode})` : ""}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Current: {hrManagingEmployee.managerName ?? "Not assigned"}
                  </p>
                </div>
                <Button type="submit" disabled={hrSaving} className="w-full sm:w-auto">
                  {hrSaving ? "Saving…" : "Save reporting manager"}
                </Button>
              </form>
              <EmergencyContactSection
                employeeId={hrManagingEmployee.employeeId ?? hrManagingEmployee.id}
                value={hrManagingEmployee.emergencyContact}
                canEdit
                onSaved={(next) =>
                  setHrManagingEmployee((current) =>
                    current ? { ...current, emergencyContact: next } : current,
                  )
                }
              />
            </div>
            <DialogFooter className="border-t border-border bg-background px-5 py-4 sm:px-6">
              <Button type="button" variant="outline" onClick={() => setHrManagingEmployee(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function EmployeeAccountStatus({ employee }: { employee: User }) {
  const scheduledSuspension =
    employee.suspensionStartsAt && new Date(employee.suspensionStartsAt).getTime() > Date.now();
  if (scheduledSuspension) {
    return (
      <Badge
        variant="outline"
        className="max-w-44 whitespace-normal border-amber-200 bg-amber-50 text-center text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300"
      >
        Suspends {formatDisplayDate(employee.suspensionStartsAt!)}
      </Badge>
    );
  }

  const lifecycle =
    employee.loginLifecycle ??
    (employee.accountStatus === "LOCKED"
      ? "LOCKED"
      : employee.accountStatus === "SUSPENDED"
        ? "SUSPENDED"
        : employee.accountStatus === "INACTIVE" || !employee.active
          ? "INACTIVE"
          : !employee.lastLoginAt
            ? "CREATED"
            : employee.mustChangePassword
              ? "PASSWORD_CHANGE"
              : "ACTIVE");

  if (lifecycle === "LOCKED") {
    return (
      <Badge
        variant="outline"
        className="border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400"
      >
        Blocked
      </Badge>
    );
  }
  if (lifecycle === "SUSPENDED") {
    return (
      <Badge
        variant="outline"
        className="max-w-44 whitespace-normal border-orange-200 bg-orange-50 text-center text-orange-800 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-300"
      >
        Suspended
        {employee.suspendedUntil
          ? ` until ${formatDisplayDate(employee.suspendedUntil)}`
          : ""}
      </Badge>
    );
  }
  if (lifecycle === "CREATED") {
    return (
      <Badge
        variant="outline"
        className="border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-300"
        title="Account created; awaiting first sign-in"
      >
        Created
      </Badge>
    );
  }
  if (lifecycle === "PASSWORD_CHANGE") {
    return (
      <Badge
        variant="outline"
        className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300"
        title="Signed in once; must set a new password"
      >
        Password change
      </Badge>
    );
  }
  if (lifecycle === "ACTIVE" || employee.active) {
    return (
      <Badge
        variant="outline"
        className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400"
      >
        Active
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
      Inactive
    </Badge>
  );
}
