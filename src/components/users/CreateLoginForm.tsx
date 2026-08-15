import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { CalendarDays, CalendarRange, Check, IdCard, KeyRound, UserRound } from "lucide-react";
import { PasswordInput } from "@/components/common/PasswordInput";
import { Button } from "@/components/ui/button";
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
import { useAuth } from "@/lib/auth";
import { indiaDateKey } from "@/lib/india-date";
import { cn } from "@/lib/utils";
import {
  COMPANY_LABELS,
  PARENT_COMPANY_NAME,
  ROLE_LABELS,
  type BankAccountType,
  type Branch,
  type CompanyEntity,
  type Department,
  type Role,
  type User,
  type WeeklyOffPolicy,
} from "@/types/domain";
import { branchesApi, employeesApi, usersApi } from "@/services/api";
import { formatBranchLocationLabel } from "@/lib/branch-label";

const CAN_CREATE: Record<Role, Role[]> = {
  developer_admin: [
    "ceo",
    "main_admin",
    "hr",
    "manager",
    "employee",
    "sales",
    "driver",
    "field_staff",
  ],
  main_admin: [],
  hr: [],
  ceo: [],
  manager: [],
  employee: [],
  sales: [],
  driver: [],
  field_staff: [],
};

const LOGIN_ROLE_OPTIONS: { value: Role; label: string; hint: string }[] = [
  { value: "ceo", label: "CEO", hint: "Company-wide executive overview; no attendance required" },
  { value: "main_admin", label: "Admin", hint: "Administration head with company setup access" },
  { value: "hr", label: "HR", hint: "People, leave, and attendance operations" },
  {
    value: "manager",
    label: "Department Head",
    hint: "Team head — assign units under Departments (multi-head supported)",
  },
  { value: "employee", label: "Employee", hint: "Standard employee workspace" },
  { value: "sales", label: "Sales Team", hint: "Sales / field sales workspace" },
  { value: "driver", label: "Driver", hint: "Driver attendance and work tools" },
  { value: "field_staff", label: "Field Staff", hint: "Field attendance workspace" },
];

const WEEK_OFF_OPTIONS: {
  value: WeeklyOffPolicy;
  title: string;
  description: string;
  icon: typeof CalendarDays;
}[] = [
  {
    value: "SUNDAY_FIXED",
    title: "Sunday fixed",
    description: "Every Sunday is week off automatically. No request or approval needed.",
    icon: CalendarDays,
  },
  {
    value: "SELECTABLE",
    title: "Selectable with approval",
    description:
      "Employee picks one day each Monday–Sunday week. Sundays auto-confirm; other days need organization-head approval.",
    icon: CalendarRange,
  },
];

function defaultLevelForRole(role: Role): "HEAD" | "SENIOR" | "JUNIOR" | "MEMBER" {
  if (role === "ceo" || role === "main_admin" || role === "manager") return "HEAD";
  if (role === "hr") return "SENIOR";
  return "MEMBER";
}

function defaultTitleForRole(role: Role, unitName?: string): string {
  if (role === "ceo") return "CEO";
  if (role === "main_admin") return unitName ? `${unitName} Head` : "Administration Head";
  if (role === "hr") return "HR";
  if (role === "manager") return unitName ? `${unitName} Head` : "Department Head";
  if (role === "sales") return unitName || "Sales";
  if (role === "driver") return "Driver";
  if (role === "field_staff") return "Field Staff";
  return unitName || "Employee";
}

function FormSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof UserRound;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="sm:col-span-2">
      <div className="mb-4 flex items-start gap-3 border-b border-border/80 pb-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function CreateLoginForm({
  onCreated,
  onCancel,
}: {
  onCreated?: (user: User) => void;
  onCancel?: () => void;
}) {
  const { user } = useAuth();
  const allowed = user ? CAN_CREATE[user.role] : [];
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [unlinkedEmployees, setUnlinkedEmployees] = useState<User[]>([]);
  const [creationMode] = useState<"new" | "link">("new");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyEntity, setCompanyEntity] = useState<CompanyEntity>("ANYTIME_DIESEL");
  const [branch, setBranch] = useState("");
  const [dept, setDept] = useState("");
  const [organizationUnitId, setOrganizationUnitId] = useState("");
  const [childOrganizationUnitId, setChildOrganizationUnitId] = useState("none");
  const [designation, setDesignation] = useState("");
  const [managerId, setManagerId] = useState("none");
  const [loginRole, setLoginRole] = useState<Role>("employee");
  const [organizationLevel, setOrganizationLevel] = useState<
    "HEAD" | "SENIOR" | "JUNIOR" | "MEMBER"
  >("MEMBER");
  const [weeklyOffPolicy, setWeeklyOffPolicy] = useState<WeeklyOffPolicy>("SELECTABLE");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [gender, setGender] = useState<"FEMALE" | "MALE" | "PREFER_NOT_TO_SAY">(
    "PREFER_NOT_TO_SAY",
  );
  const [bloodGroup, setBloodGroup] = useState("");
  const [employmentType, setEmploymentType] = useState<"FULL_TIME" | "PART_TIME" | "INTERN">(
    "FULL_TIME",
  );
  const [shiftType, setShiftType] = useState<"DAY" | "NIGHT">("DAY");
  const [shiftStart, setShiftStart] = useState("09:00");
  const [shiftEnd, setShiftEnd] = useState("18:00");
  const [bankAccountHolderName, setBankAccountHolderName] = useState("");
  const [bankAccountType, setBankAccountType] = useState<BankAccountType | "">("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankIfscCode, setBankIfscCode] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [aadhaarNumber, setAadhaarNumber] = useState("");
  const [uanNumber, setUanNumber] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const topLevelUnits = useMemo(
    () => departments.filter((department) => !department.parentDepartmentId),
    [departments],
  );
  const childUnits = useMemo(
    () => departments.filter((department) => department.parentDepartmentId === organizationUnitId),
    [departments, organizationUnitId],
  );
  const selectedUnit = departments.find((department) => department.id === dept);
  const role: Role = loginRole;
  const isCeo = role === "ceo";
  const needsOrganizationUnit = !isCeo;
  const needsAttendanceConfig = !isCeo;
  const roleOption = LOGIN_ROLE_OPTIONS.find((option) => option.value === role);
  const positionTitle = designation.trim() || defaultTitleForRole(role, selectedUnit?.name);

  function changeLoginRole(nextRole: Role) {
    setLoginRole(nextRole);
    setOrganizationLevel(defaultLevelForRole(nextRole));
    if (nextRole === "ceo") {
      setOrganizationUnitId("");
      setChildOrganizationUnitId("none");
      setDept("");
    } else if (!organizationUnitId) {
      const firstTopLevel = departments.find((department) => !department.parentDepartmentId);
      if (firstTopLevel) {
        setOrganizationUnitId(firstTopLevel.id);
        setDept(firstTopLevel.id);
      }
    }
  }

  useEffect(() => {
    Promise.all([
      branchesApi.list(),
      branchesApi.departments(),
      employeesApi.list(),
      usersApi.list(),
    ])
      .then(([branchRows, departmentRows, employees, usersList]) => {
        setBranches(branchRows);
        setDepartments(departmentRows);
        setEmployees(employees);
        const userEmpIds = new Set(usersList.map((u) => u.employeeId).filter(Boolean));
        const unlinked = employees.filter((e) => !userEmpIds.has(e.employeeId));
        setUnlinkedEmployees(unlinked);
        if (unlinked.length > 0) {
          setSelectedEmployeeId(unlinked[0].employeeId ?? "");
        }

        setBranch((current) => current || branchRows[0]?.id || "");
        const firstTopLevel = departmentRows.find((department) => !department.parentDepartmentId);
        setOrganizationUnitId((current) => current || firstTopLevel?.id || "");
        setDept((current) => current || firstTopLevel?.id || "");
      })
      .catch(() => {
        setBranches([]);
        setDepartments([]);
        setEmployees([]);
        setUnlinkedEmployees([]);
      });
  }, []);

  useEffect(() => {
    const selectedChild = childOrganizationUnitId === "none" ? "" : childOrganizationUnitId;
    setDept(selectedChild || organizationUnitId);
  }, [organizationUnitId, childOrganizationUnitId]);

  useEffect(() => {
    if (
      childOrganizationUnitId !== "none" &&
      !childUnits.some((unit) => unit.id === childOrganizationUnitId)
    ) {
      setChildOrganizationUnitId("none");
    }
  }, [childOrganizationUnitId, childUnits]);

  useEffect(() => {
    if (creationMode === "link" && selectedEmployeeId) {
      const emp = unlinkedEmployees.find((e) => e.employeeId === selectedEmployeeId);
      if (emp) {
        setName(emp.name);
        setEmail(emp.email || "");
        setPhone(emp.phone || "");
        setCompanyPhone(emp.companyPhone || "");
        setCompanyEntity(emp.companyEntity || "ANYTIME_DIESEL");
        setBranch(emp.homeBranchId || branches[0]?.id || "");
        setDept(emp.departmentId || departments[0]?.id || "");
        setDesignation(emp.designation || "");
        setManagerId(emp.managerId || "none");
        setJoiningDate(emp.joiningDate || "");
        setGender(emp.gender || "PREFER_NOT_TO_SAY");
        setBloodGroup(emp.bloodGroup || "");
        setEmploymentType(emp.employmentType || "FULL_TIME");
        setWeeklyOffPolicy(emp.weeklyOffPolicy || "SELECTABLE");
        setEmployeeCode(emp.employeeCode || "");
      }
    }
  }, [creationMode, selectedEmployeeId, unlinkedEmployees, branches, departments]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (creationMode === "new" && !name) {
      toast.error("Full name is required");
      return;
    }
    if (!email || !temporaryPassword) {
      toast.error("Email and temporary password are required");
      return;
    }
    if (needsOrganizationUnit && !dept) {
      toast.error("Select an organization unit");
      return;
    }
    if (
      temporaryPassword.length < 10 ||
      !/[A-Z]/.test(temporaryPassword) ||
      !/[0-9]/.test(temporaryPassword)
    ) {
      toast.error("Password must be at least 10 characters with an uppercase letter and number");
      return;
    }
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = {
        name,
        email,
        phone: phone.trim() || undefined,
        companyPhone: companyPhone.trim() || undefined,
        companyEntity,
        active: true,
        mustChangePassword: true,
        password: temporaryPassword,
        role,
      };

      if (creationMode === "link") {
        payload.employeeId = selectedEmployeeId;
      } else {
        payload.employeeCode = employeeCode.trim() || undefined;
        payload.homeBranchId = branch || undefined;
        payload.departmentId = isCeo ? dept || null : dept || undefined;
        payload.designation = designation.trim() || positionTitle;
        payload.managerId = managerId === "none" ? null : managerId;
        payload.organizationLevel = isCeo ? "HEAD" : organizationLevel;
        payload.weeklyOffPolicy = isCeo ? undefined : weeklyOffPolicy;
        payload.dateOfBirth = dateOfBirth || undefined;
        payload.joiningDate = joiningDate || undefined;
        payload.gender = gender;
        payload.bloodGroup = bloodGroup || undefined;
        payload.employmentType = employmentType;
        payload.bankAccountHolderName = bankAccountHolderName.trim() || undefined;
        payload.bankAccountType = bankAccountType || undefined;
        payload.bankAccountNumber = bankAccountNumber.trim() || undefined;
        payload.bankIfscCode = bankIfscCode.trim().toUpperCase() || undefined;
        payload.panNumber = panNumber.trim().toUpperCase() || undefined;
        payload.aadhaarNumber = aadhaarNumber.replace(/\s+/g, "") || undefined;
        payload.uanNumber = uanNumber.replace(/\s+/g, "") || undefined;
        payload.shiftType = shiftType;
        payload.shiftStartMinutes =
          Number(shiftStart.slice(0, 2)) * 60 + Number(shiftStart.slice(3));
        payload.shiftEndMinutes = Number(shiftEnd.slice(0, 2)) * 60 + Number(shiftEnd.slice(3));
        payload.attendanceMode = "BOTH";
        payload.isFieldEmployee = ["sales", "driver", "field_staff"].includes(role);
      }

      const created = await usersApi.create(payload);
      toast.success(
        creationMode === "link"
          ? "Login linked — status is Created until they sign in"
          : "Login created — status is Created until first sign-in",
      );
      onCreated?.(created);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!user || allowed.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        You don't have permission to create user logins.
      </div>
    );
  }

  return (
    <div className="min-h-0 w-full">
      <form
        onSubmit={submit}
        className="grid max-h-[calc(100dvh-6rem)] min-w-0 grid-cols-1 gap-6 overflow-y-auto px-3 py-4 sm:max-h-[calc(92dvh-8rem)] sm:px-6 sm:py-5"
      >
        <FormSection
          icon={IdCard}
          title="Identity & sign-in"
          description="Set the employee ID they will use across attendance and records, plus login credentials."
        >
          <div className="space-y-1.5">
            <Label htmlFor="create-employee-id">Employee ID</Label>
            <Input
              id="create-employee-id"
              className="font-mono"
              placeholder="Leave blank to auto-generate"
              value={employeeCode}
              onChange={(e) => setEmployeeCode(e.target.value.trimStart())}
              maxLength={40}
            />
            <p className="text-xs text-muted-foreground">
              Editable later from Employees. Must be unique across the company.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create-full-name">Full name</Label>
            <Input
              id="create-full-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={creationMode === "link"}
              required={creationMode === "new"}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create-email">Email</Label>
            <Input
              id="create-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={creationMode === "link"}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create-temp-password">Temporary password</Label>
            <PasswordInput
              id="create-temp-password"
              value={temporaryPassword}
              autoComplete="new-password"
              required
              minLength={10}
              onChange={(e) => setTemporaryPassword(e.target.value)}
            />
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              At least 10 characters with an uppercase letter and a number. Changed after first
              sign-in.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Personal phone</Label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Personal contact number"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Company phone (optional)</Label>
            <Input
              type="tel"
              value={companyPhone}
              onChange={(e) => setCompanyPhone(e.target.value)}
              placeholder="Company-provided number"
            />
          </div>
        </FormSection>

        {creationMode === "new" && (
          <>
            <FormSection
              icon={UserRound}
              title="Organization & role"
              description="Login role controls modules. Place the person in a unit; heads are assigned later under Departments."
            >
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Login role</Label>
                <Select value={loginRole} onValueChange={(value) => changeLoginRole(value as Role)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOGIN_ROLE_OPTIONS.filter((option) => allowed.includes(option.value)).map(
                      (option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
                {roleOption && <p className="text-xs text-muted-foreground">{roleOption.hint}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Employer company</Label>
                <Select
                  value={companyEntity}
                  onValueChange={(value) => setCompanyEntity(value as CompanyEntity)}
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
                <p className="text-xs text-muted-foreground">Group: {PARENT_COMPANY_NAME}</p>
              </div>

              <div className="space-y-1.5">
                <Label>Attendance location</Label>
                <Select value={branch} onValueChange={setBranch}>
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
                <p className="text-xs text-muted-foreground">
                  {isCeo
                    ? "Optional for CEO records; CEO accounts do not mark attendance."
                    : "Used for attendance and geofence rules."}
                </p>
              </div>

              {!isCeo && (
                <>
                  <div className="space-y-1.5">
                    <Label>Main organization unit</Label>
                    <Select value={organizationUnitId} onValueChange={setOrganizationUnitId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select main unit" />
                      </SelectTrigger>
                      <SelectContent>
                        {topLevelUnits.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Child organization unit</Label>
                    <Select
                      value={childOrganizationUnitId}
                      onValueChange={setChildOrganizationUnitId}
                      disabled={childUnits.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select child unit" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Use main unit</SelectItem>
                        {childUnits.map((unit) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Organization level</Label>
                    <Select
                      value={organizationLevel}
                      onValueChange={(value) =>
                        setOrganizationLevel(value as typeof organizationLevel)
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
                </>
              )}

              <div className="space-y-1.5">
                <Label>Job title (optional)</Label>
                <Input
                  value={designation}
                  placeholder={defaultTitleForRole(role, selectedUnit?.name)}
                  onChange={(e) => setDesignation(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Reporting manager</Label>
                <Select value={managerId} onValueChange={setManagerId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Leave empty (recommended)</SelectItem>
                    {employees
                      .filter((employee) => employee.employeeId)
                      .map((employee) => (
                        <SelectItem key={employee.employeeId} value={employee.employeeId!}>
                          {employee.name}
                          {employee.employeeCode ? ` · ${employee.employeeCode}` : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Leave approval uses organization heads set under Departments.
                </p>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 sm:col-span-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Position preview
                </p>
                <p className="mt-1 text-base font-semibold text-foreground">{positionTitle}</p>
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  {ROLE_LABELS[role]}
                  {isCeo
                    ? " · company-wide access · sits above departments"
                    : selectedUnit?.parentDepartmentId
                      ? ` · ${departments.find((unit) => unit.id === selectedUnit.parentDepartmentId)?.name ?? "Organization"} / ${selectedUnit.name}`
                      : selectedUnit?.name
                        ? ` · ${selectedUnit.name}`
                        : " · choose a unit to continue"}
                </p>
              </div>
            </FormSection>

            {needsAttendanceConfig && (
              <FormSection
                icon={CalendarDays}
                title="Week off policy"
                description="Choose how this employee's weekly off works with attendance and leave."
              >
                <div
                  className="grid gap-3 sm:col-span-2 sm:grid-cols-2"
                  role="radiogroup"
                  aria-label="Week off policy"
                >
                  {WEEK_OFF_OPTIONS.map((option) => {
                    const selected = weeklyOffPolicy === option.value;
                    const OptionIcon = option.icon;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setWeeklyOffPolicy(option.value)}
                        className={cn(
                          "relative rounded-lg border p-4 text-left transition-colors",
                          selected
                            ? "border-primary bg-primary/5 shadow-[inset_0_0_0_1px] shadow-primary/30"
                            : "border-border bg-background hover:border-primary/40 hover:bg-muted/30",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <OptionIcon
                              className={cn(
                                "h-4 w-4",
                                selected ? "text-primary" : "text-muted-foreground",
                              )}
                              aria-hidden="true"
                            />
                            <span className="text-sm font-semibold text-foreground">
                              {option.title}
                            </span>
                          </div>
                          <span
                            className={cn(
                              "flex h-5 w-5 items-center justify-center rounded-full border",
                              selected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-muted-foreground/40",
                            )}
                          >
                            {selected && <Check className="h-3 w-3" aria-hidden="true" />}
                          </span>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          {option.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </FormSection>
            )}

            <FormSection
              icon={UserRound}
              title="Employment details"
              description="Personal and shift information for the employee profile."
            >
              <div className="space-y-1.5">
                <Label htmlFor="create-login-dob">Date of birth</Label>
                <DateField
                  id="create-login-dob"
                  value={dateOfBirth}
                  onChange={setDateOfBirth}
                  max={indiaDateKey()}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="create-login-joining">Joining date</Label>
                <DateField
                  id="create-login-joining"
                  value={joiningDate}
                  onChange={setJoiningDate}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Gender</Label>
                <Select
                  value={gender}
                  onValueChange={(value) =>
                    setGender(value as "FEMALE" | "MALE" | "PREFER_NOT_TO_SAY")
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
                  value={bloodGroup || "not_provided"}
                  onValueChange={(value) => setBloodGroup(value === "not_provided" ? "" : value)}
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
                  value={employmentType}
                  onValueChange={(value) =>
                    setEmploymentType(value as "FULL_TIME" | "PART_TIME" | "INTERN")
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
                <Label>Shift</Label>
                <Select
                  value={shiftType}
                  onValueChange={(value: "DAY" | "NIGHT") => {
                    setShiftType(value);
                    setShiftStart(value === "NIGHT" ? "21:00" : "09:00");
                    setShiftEnd(value === "NIGHT" ? "06:00" : "18:00");
                  }}
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
                    value={shiftStart}
                    onChange={(e) => setShiftStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Shift ends</Label>
                  <Input
                    type="time"
                    value={shiftEnd}
                    onChange={(e) => setShiftEnd(e.target.value)}
                  />
                </div>
              </div>
            </FormSection>

            <FormSection
              icon={KeyRound}
              title="Banking details"
              description="Account numbers are encrypted before they are stored."
            >
              <div className="space-y-1.5">
                <Label>Account holder name</Label>
                <Input
                  value={bankAccountHolderName}
                  onChange={(event) => setBankAccountHolderName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Account type</Label>
                <Select
                  value={bankAccountType || "not_provided"}
                  onValueChange={(value) =>
                    setBankAccountType(value === "not_provided" ? "" : (value as BankAccountType))
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
              <div className="space-y-1.5">
                <Label>Account number</Label>
                <Input
                  autoComplete="off"
                  value={bankAccountNumber}
                  onChange={(event) => setBankAccountNumber(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>IFSC code</Label>
                <Input
                  autoCapitalize="characters"
                  value={bankIfscCode}
                  onChange={(event) => setBankIfscCode(event.target.value.toUpperCase())}
                  maxLength={11}
                />
              </div>
            </FormSection>

            <FormSection
              icon={IdCard}
              title="Statutory identifiers"
              description="PAN, Aadhaar, and UAN are encrypted and access-restricted."
            >
              <div className="space-y-1.5">
                <Label>PAN number</Label>
                <Input
                  autoComplete="off"
                  autoCapitalize="characters"
                  value={panNumber}
                  onChange={(event) => setPanNumber(event.target.value.toUpperCase())}
                  maxLength={10}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Aadhaar number</Label>
                <Input
                  autoComplete="off"
                  inputMode="numeric"
                  value={aadhaarNumber}
                  onChange={(event) => setAadhaarNumber(event.target.value)}
                  maxLength={14}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>UAN number (optional)</Label>
                <Input
                  autoComplete="off"
                  inputMode="numeric"
                  value={uanNumber}
                  onChange={(event) => setUanNumber(event.target.value)}
                  maxLength={12}
                />
              </div>
            </FormSection>
          </>
        )}

        <div className="sticky -bottom-5 z-10 -mx-3 mt-1 flex flex-col-reverse gap-2 border-t border-border bg-background/95 px-3 py-4 backdrop-blur sm:-mx-6 sm:flex-row sm:justify-end sm:px-6">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} className="w-full sm:w-auto">
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={loading} className="w-full sm:min-w-40 sm:w-auto">
            {loading ? "Creating..." : "Create account"}
          </Button>
        </div>
      </form>
    </div>
  );
}
