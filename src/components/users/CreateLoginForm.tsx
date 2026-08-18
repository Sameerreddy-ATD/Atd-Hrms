import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { CalendarDays, CalendarRange, Check, IdCard, KeyRound, UserRound } from "lucide-react";
import { PasswordInput } from "@/components/common/PasswordInput";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import {
  CEO_NO_UNIT_LABEL,
  CEO_NO_UNIT_VALUE,
  FLEET_DRIVER_TEAM_NAME,
  formatDepartmentPath,
  inferLoginRoleFromDepartment,
} from "@/lib/department-label";

const CAN_CREATE: Record<Role, Role[]> = {
  developer_admin: [
    "ceo",
    "chief_of_staff",
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
  chief_of_staff: [],
  manager: [],
  employee: [],
  sales: [],
  driver: [],
  field_staff: [],
};

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
  if (role === "ceo" || role === "main_admin" || role === "manager" || role === "chief_of_staff")
    return "HEAD";
  if (role === "hr") return "SENIOR";
  return "MEMBER";
}

function defaultTitleForRole(role: Role, unitName?: string): string {
  if (role === "ceo") return "CEO";
  if (role === "chief_of_staff") return "Chief of Staff";
  if (role === "main_admin") return unitName ? `${unitName} Head` : "Administration Head";
  if (role === "hr") return "HR";
  if (role === "manager") return unitName ? `${unitName} Head` : "Department Head";
  if (role === "sales") return unitName || "Sales";
  if (role === "driver") return "Bowser Pilot";
  if (role === "field_staff") return "Field Staff";
  return unitName || "Team Member";
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
  const [designation, setDesignation] = useState("");
  const [organizationLevel, setOrganizationLevel] = useState<
    "HEAD" | "SENIOR" | "JUNIOR" | "MEMBER"
  >("MEMBER");
  const [weeklyOffPolicy, setWeeklyOffPolicy] = useState<WeeklyOffPolicy>("SELECTABLE");
  const [attendanceRequired, setAttendanceRequired] = useState(true);
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

  const departmentsByPath = useMemo(
    () =>
      [...departments].sort((a, b) =>
        formatDepartmentPath(a, departments).localeCompare(formatDepartmentPath(b, departments)),
      ),
    [departments],
  );
  const selectedUnit =
    dept && dept !== CEO_NO_UNIT_VALUE
      ? departments.find((department) => department.id === dept)
      : undefined;
  const role: Role = useMemo(
    () =>
      dept === CEO_NO_UNIT_VALUE || !dept
        ? "ceo"
        : inferLoginRoleFromDepartment(selectedUnit, departments),
    [dept, selectedUnit, departments],
  );
  const isCeo = role === "ceo";
  const isBowserPilot = role === "driver";
  const needsOrganizationUnit = !isCeo;
  const needsAttendanceConfig = !isCeo;
  const positionTitle = designation.trim() || defaultTitleForRole(role, selectedUnit?.name);

  useEffect(() => {
    setOrganizationLevel(defaultLevelForRole(role));
    if (isCeo) {
      setAttendanceRequired(false);
    } else if (role === "driver") {
      setAttendanceRequired(true);
    }
  }, [role, isCeo]);

  useEffect(() => {
    Promise.all([
      branchesApi.list(),
      branchesApi.departments(),
      employeesApi.list(),
      usersApi.list(),
    ])
      .then(([branchRows, departmentRows, employeeRows, usersList]) => {
        setBranches(branchRows);
        setDepartments(departmentRows);
        const userEmpIds = new Set(usersList.map((u) => u.employeeId).filter(Boolean));
        const unlinked = employeeRows.filter((e) => !userEmpIds.has(e.employeeId));
        setUnlinkedEmployees(unlinked);
        if (unlinked.length > 0) {
          setSelectedEmployeeId(unlinked[0].employeeId ?? "");
        }

        setBranch((current) => current || branchRows[0]?.id || "");
        setDept((current) => current || departmentRows[0]?.id || "");
      })
      .catch(() => {
        setBranches([]);
        setDepartments([]);
        setUnlinkedEmployees([]);
      });
  }, []);

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
    if (!temporaryPassword) {
      toast.error("Temporary password is required");
      return;
    }
    if (!allowed.includes(role)) {
      toast.error(`You cannot create a ${ROLE_LABELS[role]} login`);
      return;
    }
    if (isBowserPilot) {
      if (phone.replace(/\D/g, "").length < 10) {
        toast.error("Bowser Pilots sign in with a mobile number");
        return;
      }
    } else if (!isCeo && !email.trim()) {
      toast.error("Work email is required for Team Member sign-in");
      return;
    } else if (!email.trim() && !phone.trim()) {
      toast.error("Email or mobile number is required");
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("Enter a valid email");
      return;
    }
    if (!isBowserPilot && !email.trim() && phone.replace(/\D/g, "").length < 10) {
      toast.error("Enter a valid mobile number");
      return;
    }
    if (needsOrganizationUnit && (!dept || dept === CEO_NO_UNIT_VALUE)) {
      toast.error(
        isBowserPilot
          ? `Select ${FLEET_DRIVER_TEAM_NAME} for this Bowser Pilot`
          : "Select an organization unit",
      );
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
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        companyPhone: companyPhone.trim() || undefined,
        companyEntity,
        active: true,
        mustChangePassword: true,
        password: temporaryPassword,
      };

      if (creationMode === "link") {
        payload.employeeId = selectedEmployeeId;
      } else {
        payload.employeeCode = employeeCode.trim() || undefined;
        payload.homeBranchId = branch || undefined;
        payload.departmentId = isCeo ? null : dept || undefined;
        payload.designation = designation.trim() || positionTitle;
        payload.managerId = null;
        payload.organizationLevel = isCeo ? "HEAD" : organizationLevel;
        payload.weeklyOffPolicy = isCeo ? undefined : weeklyOffPolicy;
        payload.attendanceRequired = isCeo ? false : attendanceRequired;
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
            <Label htmlFor="create-email">
              {isBowserPilot ? "Email (optional)" : "Work email"}
            </Label>
            <Input
              id="create-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={creationMode === "link"}
              placeholder="name@anytimediesel.com"
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
            <Label>
              {isBowserPilot ? "Mobile number (required for Bowser Pilot sign-in)" : "Personal phone"}
            </Label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={creationMode === "link"}
              inputMode="tel"
              placeholder="98xxxxxxxx"
              required={isBowserPilot}
            />
            <p className="text-xs text-muted-foreground">
              {isBowserPilot
                ? `Used on the Bowser Pilots login. Place them under ${FLEET_DRIVER_TEAM_NAME}.`
                : "Optional if work email is set. Field staff can also use mobile sign-in when needed."}
            </p>
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
              title="Organization"
              description="Pick the org unit — login type follows the hierarchy. Department heads are assigned under Departments (not here)."
            >
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

              <div className="space-y-1.5 sm:col-span-2">
                <Label>Organization unit</Label>
                <Select value={dept || CEO_NO_UNIT_VALUE} onValueChange={setDept}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select organization unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CEO_NO_UNIT_VALUE}>{CEO_NO_UNIT_LABEL}</SelectItem>
                    {departmentsByPath.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {formatDepartmentPath(d, departments)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {isBowserPilot
                    ? `Bowser Pilots belong under ${FLEET_DRIVER_TEAM_NAME}.`
                    : isCeo
                      ? "CEO sits above departments — no reporting manager needed."
                      : "Leave approval uses department heads assigned under Departments."}
                </p>
              </div>

              {!isCeo && (
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
                  <p className="text-xs text-muted-foreground">
                    For unit heads, also assign them under Departments so leave routing stays correct.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Job title (optional)</Label>
                <Input
                  value={designation}
                  placeholder={defaultTitleForRole(role, selectedUnit?.name)}
                  onChange={(e) => setDesignation(e.target.value)}
                />
              </div>

              <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 sm:col-span-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Position preview
                </p>
                <p className="mt-1 text-base font-semibold text-foreground">{positionTitle}</p>
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  {isCeo
                    ? "Company-wide · sits above departments"
                    : selectedUnit
                      ? formatDepartmentPath(selectedUnit, departments)
                      : "Choose a unit to continue"}
                </p>
              </div>
            </FormSection>

            {needsAttendanceConfig && (
              <FormSection
                icon={CalendarDays}
                title="Attendance & leave"
                description="Turn off for people who do not mark attendance or take leave."
              >
                <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-3 sm:col-span-2">
                  <div className="min-w-0 space-y-1">
                    <Label htmlFor="create-attendance-required" className="cursor-pointer">
                      Require attendance & leave
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      When off, this login skips punch, face check-in, and leave menus.
                    </p>
                  </div>
                  <Switch
                    id="create-attendance-required"
                    checked={attendanceRequired}
                    onCheckedChange={setAttendanceRequired}
                  />
                </div>
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
            )}

            <FormSection
              icon={UserRound}
              title="Employment details"
              description="Joining date, contract type, and personal employment records."
            >
              <div className="space-y-1.5">
                <Label htmlFor="create-login-joining">Joining date</Label>
                <DateField
                  id="create-login-joining"
                  value={joiningDate}
                  onChange={setJoiningDate}
                />
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
                <Label htmlFor="create-login-dob">Date of birth</Label>
                <DateField
                  id="create-login-dob"
                  value={dateOfBirth}
                  onChange={setDateOfBirth}
                  max={indiaDateKey()}
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
