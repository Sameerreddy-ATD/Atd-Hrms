import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { TableToolbar } from "@/components/common/TableToolbar";
import { Badge } from "@/components/ui/badge";
import { DateField } from "@/components/ui/date-field";
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
import type {
  BankAccountType,
  Branch,
  CompanyEntity,
  Department,
  User,
  WeeklyOffPolicy,
} from "@/types/domain";
import { COMPANY_LABELS, ROLE_LABELS, WEEKLY_OFF_POLICY_LABELS } from "@/types/domain";
import { branchesApi, employeesApi, shiftsApi } from "@/services/api";
import { Search, Pencil, UserCog, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatDisplayDate, indiaDateKey } from "@/lib/india-date";
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
import { formatBranchLocationLabel, formatBranchLocationLabelById } from "@/lib/branch-label";
import { formatDepartmentPath, formatDepartmentPathById } from "@/lib/department-label";
import {
  buildUnitSubtree,
  hasUnassignedDesignation,
  hasUnassignedLocation,
  hasUnassignedUnit,
  matchesDirectoryPerson,
  occupiedBranchOptions,
  occupiedCompanyOptions,
  occupiedDesignations,
  occupiedEmploymentTypes,
  occupiedUnitOptions,
  type DirectoryFilters,
} from "@/lib/directory-filters";
import {
  matchesWorkforceTypeFilter,
  occupiedWorkforceTypes,
  WORKFORCE_TYPE_LABELS,
  type WorkforceTypeFilter,
} from "@/lib/workforce-type";
import { WorkforceTypeBadge } from "@/components/common/WorkforceTypeBadge";

export const Route = createFileRoute("/_app/employees")({
  component: EmployeesPage,
});

const PAGE_SIZE = 100;

function EmployeesPage() {
  const { t } = useTranslation();
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
  const [company, setCompany] = useState("all");
  const [designation, setDesignation] = useState("all");
  const [employmentType, setEmploymentType] = useState("all");
  const [workforceTypeFilter, setWorkforceTypeFilter] = useState<WorkforceTypeFilter>("all");

  const [editingEmployee, setEditingEmployee] = useState<User | null>(null);
  const [hrManagingEmployee, setHrManagingEmployee] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    phone: "",
    companyPhone: "",
    companyEntity: "ANYTIME_DIESEL" as CompanyEntity,
    employeeCode: "",
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
    joiningDate: "",
    gender: "PREFER_NOT_TO_SAY" as "FEMALE" | "MALE" | "PREFER_NOT_TO_SAY",
    employmentType: "FULL_TIME" as "FULL_TIME" | "PART_TIME" | "INTERN",
    organizationLevel: "MEMBER" as "HEAD" | "SENIOR" | "JUNIOR" | "MEMBER",
    weeklyOffPolicy: "SELECTABLE" as WeeklyOffPolicy,
    attendanceMode: "BOTH" as "THUMB_ONLY" | "MOBILE_GPS_ONLY" | "BOTH",
    shiftType: "DAY" as "DAY" | "NIGHT",
    shiftStartMinutes: 540,
    shiftEndMinutes: 1080,
  });

  const canEdit = currentUser?.role === "developer_admin";
  const canHrManage = currentUser?.role === "hr";
  const canOpenEmployeeActions = canEdit || canHrManage;
  const canSeeCompanyDirectory = Boolean(
    currentUser &&
      ["developer_admin", "main_admin", "ceo", "chief_of_staff", "hr"].includes(currentUser.role),
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
      employeeCode: fullEmployee.employeeCode || "",
      homeBranchId: fullEmployee.homeBranchId || "",
      departmentId: fullEmployee.departmentId || "none",
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
      joiningDate: fullEmployee.joiningDate || "",
      gender: fullEmployee.gender || "PREFER_NOT_TO_SAY",
      employmentType: fullEmployee.employmentType || "FULL_TIME",
      organizationLevel: fullEmployee.organizationLevel || "MEMBER",
      weeklyOffPolicy: fullEmployee.weeklyOffPolicy || "SELECTABLE",
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
        employeeCode: editForm.employeeCode.trim() || undefined,
        homeBranchId: editForm.homeBranchId || undefined,
        departmentId: editForm.departmentId === "none" ? null : editForm.departmentId || undefined,
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
        joiningDate: editForm.joiningDate || undefined,
        gender: editForm.gender,
        employmentType: editForm.employmentType,
        organizationLevel: editForm.organizationLevel,
        weeklyOffPolicy: editForm.weeklyOffPolicy,
        attendanceMode: "BOTH" as const,
        shiftType: editForm.shiftType,
        shiftStartMinutes: editForm.shiftStartMinutes,
        shiftEndMinutes: editForm.shiftEndMinutes,
      };
      const updated = await employeesApi.update(
        editingEmployee.employeeId ?? editingEmployee.id,
        payload as never,
      );
      setEmployees((prev) =>
        prev.map((row) => (row.employeeId === updated.employeeId ? { ...row, ...updated } : row)),
      );
      toast.success(t("pages.employees.toastEmployeeUpdated"));
      setEditingEmployee(null);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const directoryPeople = useMemo(
    () => employees.filter((employee) => employee.employeeId),
    [employees],
  );
  const directoryFilters: DirectoryFilters = useMemo(
    () => ({
      company,
      branch,
      unit: dept,
      designation,
      employmentType,
    }),
    [company, branch, dept, designation, employmentType],
  );
  const unitSubtree = useMemo(
    () => buildUnitSubtree(departments, dept),
    [departments, dept],
  );

  const visibleDepartments = useMemo(() => {
    if (canSeeCompanyDirectory) return departments;
    const allowedIds = new Set(employees.map((employee) => employee.departmentId).filter(Boolean));
    const allowedNames = new Set(employees.map((employee) => employee.department).filter(Boolean));
    return departments.filter(
      (department) => allowedIds.has(department.id) || allowedNames.has(department.name),
    );
  }, [canSeeCompanyDirectory, departments, employees]);

  const facetedPeople = useCallback(
    (skip?: keyof DirectoryFilters | "workforceType") => {
      const directorySkip = skip === "workforceType" ? undefined : skip;
      return directoryPeople.filter((person) => {
        if (!matchesDirectoryPerson(person, directoryFilters, unitSubtree, directorySkip)) {
          return false;
        }
        if (skip !== "workforceType" && !matchesWorkforceTypeFilter(person, workforceTypeFilter)) {
          return false;
        }
        return true;
      });
    },
    [directoryPeople, directoryFilters, unitSubtree, workforceTypeFilter],
  );

  const companyOptions = useMemo(
    () => occupiedCompanyOptions(facetedPeople("company")),
    [facetedPeople],
  );
  const branchOptions = useMemo(
    () => occupiedBranchOptions(facetedPeople("branch"), branches),
    [facetedPeople, branches],
  );
  const unitOptions = useMemo(
    () => occupiedUnitOptions(facetedPeople("unit"), visibleDepartments),
    [facetedPeople, visibleDepartments],
  );
  const designationOptions = useMemo(
    () => occupiedDesignations(facetedPeople("designation")),
    [facetedPeople],
  );
  const employmentTypeOptions = useMemo(
    () => occupiedEmploymentTypes(facetedPeople("employmentType")),
    [facetedPeople],
  );
  const workforceTypeOptions = useMemo(
    () => occupiedWorkforceTypes(facetedPeople("workforceType")),
    [facetedPeople],
  );
  const showUnassignedLocation = useMemo(
    () => hasUnassignedLocation(facetedPeople("branch")),
    [facetedPeople],
  );
  const showUnassignedUnit = useMemo(
    () => hasUnassignedUnit(facetedPeople("unit")),
    [facetedPeople],
  );
  const showUnassignedDesignation = useMemo(
    () => hasUnassignedDesignation(facetedPeople("designation")),
    [facetedPeople],
  );

  const rows = useMemo(() => {
    const search = q.trim().toLowerCase();
    return facetedPeople().filter((person) => {
      if (!search) return true;
      const companyLabel = person.companyEntity ? COMPANY_LABELS[person.companyEntity] : "";
      const unitLabel = formatDepartmentPathById(
        departments,
        person.departmentId || person.department,
        "",
      );
      return `${person.name} ${person.email} ${person.employeeCode ?? ""} ${person.employeeId ?? ""} ${person.phone ?? ""} ${person.companyPhone ?? ""} ${person.designation ?? ""} ${companyLabel} ${unitLabel}`
        .toLowerCase()
        .includes(search);
    });
  }, [facetedPeople, q, departments]);

  const filtersActive =
    Boolean(q.trim()) ||
    company !== "all" ||
    branch !== "all" ||
    dept !== "all" ||
    designation !== "all" ||
    employmentType !== "all" ||
    workforceTypeFilter !== "all";

  useEffect(() => {
    if (company !== "all" && !companyOptions.includes(company as (typeof companyOptions)[number])) {
      setCompany("all");
    }
  }, [company, companyOptions]);

  useEffect(() => {
    if (branch === "all") return;
    if (branch === "none") {
      if (!showUnassignedLocation) setBranch("all");
      return;
    }
    if (!branchOptions.some((row) => row.id === branch)) setBranch("all");
  }, [branch, branchOptions, showUnassignedLocation]);

  useEffect(() => {
    if (dept === "all") return;
    if (dept === "none") {
      if (!showUnassignedUnit) setDept("all");
      return;
    }
    if (!unitOptions.some((row) => row.id === dept)) setDept("all");
  }, [dept, unitOptions, showUnassignedUnit]);

  useEffect(() => {
    if (designation === "all") return;
    if (designation === "none") {
      if (!showUnassignedDesignation) setDesignation("all");
      return;
    }
    if (!designationOptions.includes(designation)) setDesignation("all");
  }, [designation, designationOptions, showUnassignedDesignation]);

  useEffect(() => {
    if (
      employmentType !== "all" &&
      !employmentTypeOptions.includes(employmentType as (typeof employmentTypeOptions)[number])
    ) {
      setEmploymentType("all");
    }
  }, [employmentType, employmentTypeOptions]);

  useEffect(() => {
    if (
      workforceTypeFilter !== "all" &&
      !workforceTypeOptions.includes(workforceTypeFilter)
    ) {
      setWorkforceTypeFilter("all");
    }
  }, [workforceTypeFilter, workforceTypeOptions]);

  function clearDirectoryFilters() {
    setQ("");
    setCompany("all");
    setBranch("all");
    setDept("all");
    setDesignation("all");
    setEmploymentType("all");
    setWorkforceTypeFilter("all");
  }

  return (
    <div>
      <PageHeader
        title={t("pages.employees.title")}
        description={
          canEdit
            ? t("pages.employees.subtitleDeveloperAdmin")
            : canHrManage
              ? t("pages.employees.subtitleHrManage")
              : currentUser?.role === "ceo"
                ? t("pages.employees.subtitleCeo")
                : currentUser?.role === "chief_of_staff"
                  ? t("pages.employees.subtitleCos")
                  : canSeeCompanyDirectory
                    ? t("pages.employees.subtitleDirectory")
                    : t("pages.employees.subtitleScoped")
        }
      />
      {loading && <LoadingState label={t("pages.loading.employees")} />}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <TableToolbar>
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("pages.employees.search")}
            className="pl-8"
          />
        </div>
        <Select value={company} onValueChange={setCompany}>
          <SelectTrigger className="sm:w-52" aria-label={t("pages.employees.filterCompany")}>
            <SelectValue placeholder={t("pages.employees.filterCompany")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("pages.employees.allCompanies")}</SelectItem>
            {companyOptions.map((value) => (
              <SelectItem key={value} value={value}>
                {COMPANY_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={branch} onValueChange={setBranch}>
          <SelectTrigger className="sm:w-44" aria-label={t("pages.employees.filterBranch")}>
            <SelectValue placeholder={t("pages.employees.filterBranch")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("pages.employees.allLocations")}</SelectItem>
            {showUnassignedLocation && (
              <SelectItem value="none">{t("pages.employees.notAssigned")}</SelectItem>
            )}
            {branchOptions.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {formatBranchLocationLabel(b)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={dept} onValueChange={setDept}>
          <SelectTrigger className="sm:w-64" aria-label={t("pages.employees.filterDepartment")}>
            <SelectValue placeholder={t("pages.employees.filterDepartment")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("pages.employees.allDepartments")}</SelectItem>
            {showUnassignedUnit && (
              <SelectItem value="none">{t("pages.employees.noDepartmentCeo")}</SelectItem>
            )}
            {unitOptions.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {formatDepartmentPath(d, departments)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={designation} onValueChange={setDesignation}>
          <SelectTrigger className="sm:w-52" aria-label={t("pages.employees.filterDesignation")}>
            <SelectValue placeholder={t("pages.employees.filterDesignation")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("pages.employees.allDesignations")}</SelectItem>
            {showUnassignedDesignation && (
              <SelectItem value="none">{t("pages.employees.notAssigned")}</SelectItem>
            )}
            {designationOptions.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={workforceTypeFilter}
          onValueChange={(value) => setWorkforceTypeFilter(value as WorkforceTypeFilter)}
        >
          <SelectTrigger className="sm:w-44" aria-label={t("pages.employees.filterWorkforceType")}>
            <SelectValue placeholder={t("pages.employees.filterWorkforceType")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("pages.employees.allWorkforceTypes")}</SelectItem>
            {workforceTypeOptions.map((value) => (
              <SelectItem key={value} value={value}>
                {WORKFORCE_TYPE_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={employmentType} onValueChange={setEmploymentType}>
          <SelectTrigger className="sm:w-44" aria-label={t("pages.employees.filterEmploymentType")}>
            <SelectValue placeholder={t("pages.employees.filterEmploymentType")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("pages.employees.allEmploymentTypes")}</SelectItem>
            {employmentTypeOptions.map((value) => (
              <SelectItem key={value} value={value}>
                {employmentTypeLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtersActive && (
          <Button variant="ghost" size="sm" onClick={clearDirectoryFilters}>
            <X className="h-4 w-4" />
            {t("pages.employees.clearFilters")}
          </Button>
        )}
      </TableToolbar>
      {!loading && (
        <p className="mb-3 text-xs text-muted-foreground">
          {t("pages.employees.showingCount", {
            shown: rows.length,
            total: directoryPeople.length,
          })}
        </p>
      )}

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
                  <div className="mt-1">
                    <WorkforceTypeBadge role={employee.role} />
                  </div>
                  {employee.employmentType && employee.employmentType !== "FULL_TIME" && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {employmentTypeLabel(employee.employmentType)}
                    </p>
                  )}
                </div>
                <EmployeeAccountStatus employee={employee} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div>
                  <p className="text-muted-foreground">{t("common.employeeId")}</p>
                  <p className="mt-0.5 font-mono">{employee.employeeCode ?? employee.employeeId}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("pages.employees.company")}</p>
                  <p className="mt-0.5 break-words">
                    {employee.companyEntity ? COMPANY_LABELS[employee.companyEntity] : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("pages.employees.designation")}</p>
                  <p className="mt-0.5 break-words">{employee.designation || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("common.department")}</p>
                  <p className="mt-0.5 break-words">
                    {employee.departmentId
                      ? formatDepartmentPathById(departments, employee.departmentId)
                      : employee.role === "ceo"
                        ? t("pages.employees.noDepartmentCeo")
                        : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("common.branch")}</p>
                  <p className="mt-0.5 break-words">
                    {formatBranchLocationLabelById(
                      branches,
                      employee.homeBranchId,
                      employee.homeBranchName ?? "-",
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("pages.employees.phones")}</p>
                  <p className="mt-0.5 break-words">
                    {formatEmployeePhones(employee.phone, employee.companyPhone)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("pages.employees.joined")}</p>
                  <p className="mt-0.5">
                    {employee.joiningDate ? formatDisplayDate(employee.joiningDate) : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("common.role")}</p>
                  <p className="mt-0.5">{ROLE_LABELS[employee.role]}</p>
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
                      <Pencil className="h-4 w-4" /> {t("pages.employees.editDetails")}
                    </>
                  ) : (
                    <>
                      <UserCog className="h-4 w-4" /> {t("pages.employees.managerEmergencyShort")}
                    </>
                  )}
                </Button>
              )}
            </div>
          ))}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <Table className="min-w-[1080px]">
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.employee")}</TableHead>
                <TableHead>{t("common.employeeId")}</TableHead>
                <TableHead>{t("pages.employees.company")}</TableHead>
                <TableHead>{t("pages.employees.workforceType")}</TableHead>
                <TableHead>{t("pages.employees.designation")}</TableHead>
                <TableHead>{t("common.department")}</TableHead>
                <TableHead>{t("common.branch")}</TableHead>
                <TableHead>{t("pages.employees.phones")}</TableHead>
                <TableHead>{t("pages.employees.joined")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                {canOpenEmployeeActions && (
                  <TableHead className="w-[80px]">{t("common.actions")}</TableHead>
                )}
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
                    {u.employmentType && u.employmentType !== "FULL_TIME" && (
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {employmentTypeLabel(u.employmentType)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {u.employeeCode ?? u.employeeId}
                  </TableCell>
                  <TableCell className="max-w-[160px] text-xs">
                    {u.companyEntity ? COMPANY_LABELS[u.companyEntity] : "-"}
                  </TableCell>
                  <TableCell>
                    <WorkforceTypeBadge role={u.role} />
                  </TableCell>
                  <TableCell className="max-w-[160px] text-sm">{u.designation || "-"}</TableCell>
                  <TableCell className="max-w-[200px] text-sm">
                    {u.departmentId
                      ? formatDepartmentPathById(departments, u.departmentId)
                      : u.role === "ceo"
                        ? t("pages.employees.noDepartmentCeo")
                        : "-"}
                  </TableCell>
                  <TableCell>
                    {formatBranchLocationLabelById(
                      branches,
                      u.homeBranchId,
                      u.homeBranchName ?? "-",
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatEmployeePhones(u.phone, u.companyPhone)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {u.joiningDate ? formatDisplayDate(u.joiningDate) : "-"}
                  </TableCell>
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
                        title={
                          canEdit
                            ? t("pages.employees.editDetails")
                            : t("pages.employees.managerEmergency")
                        }
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
          <div className="p-6 text-sm text-muted-foreground">
            {t("pages.employees.noneFound")}
          </div>
        )}
        {hasMore &&
          !q &&
          branch === "all" &&
          dept === "all" &&
          company === "all" &&
          designation === "all" &&
          employmentType === "all" && (
          <div className="border-t p-3 text-center">
            <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
              {loadingMore
                ? t("pages.employees.loadingMore")
                : t("pages.employees.loadMore")}
            </Button>
          </div>
        )}
      </div>

      {editingEmployee && (
        <Dialog open={!!editingEmployee} onOpenChange={(open) => !open && setEditingEmployee(null)}>
          <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[92dvh]">
            <DialogHeader className="border-b border-border px-5 py-4 sm:px-6">
              <DialogTitle>{t("pages.employees.editEmployeeDetailsTitle")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={saveEmployee} className="flex min-h-0 flex-1 flex-col">
              <div className="grid flex-1 grid-cols-1 gap-x-5 gap-y-4 overflow-y-auto px-3 py-4 sm:grid-cols-2 sm:px-6 sm:py-5">
                <EditSectionHeading
                  title="Identity & contact"
                  description="How this person is identified and reached."
                />
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Full name</Label>
                  <Input
                    value={editForm.name}
                    onChange={(e) => setEditForm((c) => ({ ...c, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-employee-id">Employee ID</Label>
                  <Input
                    id="edit-employee-id"
                    className="font-mono"
                    value={editForm.employeeCode}
                    onChange={(e) =>
                      setEditForm((c) => ({ ...c, employeeCode: e.target.value.trimStart() }))
                    }
                    required
                    maxLength={40}
                  />
                  <p className="text-xs text-muted-foreground">
                    Must be unique across the company.
                  </p>
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
                <EditSectionHeading
                  title="Organization"
                  description="Employer, workplace, and place on the company chart."
                />
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
                          {formatBranchLocationLabel(b)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Department</Label>
                  <Select
                    value={editForm.departmentId || "none"}
                    onValueChange={(val) => setEditForm((c) => ({ ...c, departmentId: val }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        {t("pages.employees.noDepartmentCeo")}
                      </SelectItem>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {formatDepartmentPath(d, departments)}
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
                  <p className="text-xs text-muted-foreground">
                    {editForm.organizationLevel === "HEAD"
                      ? "Setting Head also lists this person as a head of their department on the organization chart."
                      : editingEmployee?.headedDepartments &&
                          editingEmployee.headedDepartments.length > 0
                        ? `Currently heads: ${editingEmployee.headedDepartments.map((unit) => unit.name).join(" · ")}. Changing away from Head removes them from those units.`
                        : "Heads assigned under Departments also update this level to Head."}
                  </p>
                </div>
                <EditSectionHeading
                  title="Employment"
                  description="Joining, contract type, and personal employment records."
                />
                <div className="space-y-1.5">
                  <Label>Joining date</Label>
                  <DateField
                    value={editForm.joiningDate}
                    onChange={(next) => setEditForm((c) => ({ ...c, joiningDate: next }))}
                    aria-label="Joining date"
                  />
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
                <div className="space-y-1.5">
                  <Label>Date of Birth</Label>
                  <DateField
                    value={editForm.dateOfBirth}
                    max={indiaDateKey()}
                    onChange={(next) => setEditForm((c) => ({ ...c, dateOfBirth: next }))}
                    aria-label="Date of Birth"
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
                <EditSectionHeading
                  title="Banking"
                  description="Account numbers are encrypted before they are stored."
                />
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
                <EditSectionHeading
                  title="Statutory identifiers"
                  description="PAN, Aadhaar, and UAN are encrypted and access-restricted."
                />
                {[
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
                <EditSectionHeading title="Attendance configuration" />
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Week off policy</Label>
                  <Select
                    value={editForm.weeklyOffPolicy}
                    onValueChange={(value) =>
                      setEditForm((current) => ({
                        ...current,
                        weeklyOffPolicy: value as WeeklyOffPolicy,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(WEEKLY_OFF_POLICY_LABELS) as WeeklyOffPolicy[]).map((value) => (
                        <SelectItem key={value} value={value}>
                          {WEEKLY_OFF_POLICY_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {editForm.weeklyOffPolicy === "SUNDAY_FIXED"
                      ? "Sundays are marked as week off automatically. The employee cannot request another day."
                      : "Employee chooses one day per week. Sundays auto-confirm; other days need organization-head approval."}
                  </p>
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
                  {t("common.cancel")}
                </Button>
                <Button type="submit">{t("pages.employees.saveChanges")}</Button>
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
              <DialogTitle>{t("pages.employees.hrEmployeeUpdateTitle")}</DialogTitle>
              <DialogDescription>
                {t("pages.employees.hrEmployeeUpdateDescription", {
                  name: hrManagingEmployee.name,
                })}
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4 sm:px-6">
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
                {t("common.close")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function EditSectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="border-t border-border pt-4 sm:col-span-2 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold">{title}</h3>
      {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
    </div>
  );
}

function formatEmployeePhones(personal?: string, company?: string) {
  const personalPhone = personal?.trim();
  const companyPhone = company?.trim();
  if (personalPhone && companyPhone && personalPhone !== companyPhone) {
    return (
      <span>
        {personalPhone}
        <span className="mt-0.5 block text-[11px] text-muted-foreground">Work {companyPhone}</span>
      </span>
    );
  }
  return personalPhone || companyPhone || "-";
}

function employmentTypeLabel(type?: User["employmentType"]) {
  if (type === "PART_TIME") return "Part-time";
  if (type === "INTERN") return "Intern";
  return "Full-time";
}

function EmployeeAccountStatus({ employee }: { employee: User }) {
  const { t } = useTranslation();
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
        {employee.suspendedUntil ? ` until ${formatDisplayDate(employee.suspendedUntil)}` : ""}
      </Badge>
    );
  }
  if (lifecycle === "CREATED") {
    return (
      <Badge
        variant="outline"
        className="border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-300"
        title={t("pages.users.createdAwaiting")}
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
        title={t("pages.users.mustSetPassword")}
      >
        Password change
      </Badge>
    );
  }
  if (employee.status === "TERMINATED" || employee.terminatedAt) {
    return (
      <Badge
        variant="outline"
        className="border-border bg-muted text-muted-foreground"
        title={
          employee.terminatedAt
            ? `Left company on ${formatDisplayDate(employee.terminatedAt)}`
            : "Left company"
        }
      >
        Left company
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
