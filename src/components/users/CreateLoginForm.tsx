import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PasswordInput } from "@/components/common/PasswordInput";
import { Button } from "@/components/ui/button";
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
import {
  COMPANY_LABELS,
  PARENT_COMPANY_NAME,
  type BankAccountType,
  type Branch,
  type CompanyEntity,
  type Department,
  type Role,
  type User,
} from "@/types/domain";
import { branchesApi, employeesApi, usersApi } from "@/services/api";

const CAN_CREATE: Record<Role, Role[]> = {
  developer_admin: [
    "developer_admin",
    "main_admin",
    "ceo",
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
  const [managerId, setManagerId] = useState("automatic");
  const [organizationLevel, setOrganizationLevel] = useState<
    "HEAD" | "SENIOR" | "JUNIOR" | "MEMBER"
  >("MEMBER");
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
  const role: Role = selectedUnit
    ? selectedUnit.name === "Executive Leadership"
      ? "ceo"
      : selectedUnit.name === "Human Resources"
        ? "hr"
        : selectedUnit.name === "Administration" && organizationLevel === "HEAD"
          ? "main_admin"
          : selectedUnit.name === "Drivers"
            ? "driver"
            : organizationLevel === "HEAD"
              ? "manager"
              : selectedUnit.name.toLowerCase().includes("sales")
                ? "sales"
                : "employee"
    : "employee";
  const positionTitle = selectedUnit
    ? organizationLevel === "HEAD"
      ? `${selectedUnit.name} Head`
      : organizationLevel === "MEMBER"
        ? selectedUnit.name
        : `${organizationLevel === "SENIOR" ? "Senior" : "Junior"} ${selectedUnit.name}`
    : "Select an organization unit";

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
        // Filter out employees that already have user login accounts
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

  // Sync details from selected employee if linking
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
        setManagerId(emp.managerId || "automatic");
        setJoiningDate(emp.joiningDate || "");
        setGender(emp.gender || "PREFER_NOT_TO_SAY");
        setBloodGroup(emp.bloodGroup || "");
        setEmploymentType(emp.employmentType || "FULL_TIME");
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
        name: creationMode === "link" ? name : name,
        email,
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
        payload.employeeCode = employeeCode || undefined;
        payload.homeBranchId = branch || undefined;
        payload.departmentId = dept || undefined;
        payload.designation = designation.trim() || positionTitle;
        payload.managerId = managerId === "automatic" ? undefined : managerId;
        payload.organizationLevel = organizationLevel;
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
          ? "User login linked to employee account"
          : "Login and employee profile created",
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
        className="grid max-h-[calc(100dvh-6rem)] min-w-0 grid-cols-1 gap-x-5 gap-y-4 overflow-y-auto px-3 py-4 sm:max-h-[calc(92dvh-8rem)] sm:grid-cols-2 sm:px-6 sm:py-5"
      >
        <div className="sm:col-span-2">
          <h3 className="text-sm font-semibold text-foreground">Account details</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Sign-in information and the employee's internal ID.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Employee ID</Label>
          <Input
            placeholder="Auto-generated when empty"
            value={employeeCode}
            onChange={(e) => setEmployeeCode(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Full name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={creationMode === "link"}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={creationMode === "link"}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Personal phone number</Label>
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Employee's personal contact number"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Company phone number (optional)</Label>
          <Input
            type="tel"
            value={companyPhone}
            onChange={(e) => setCompanyPhone(e.target.value)}
            placeholder="Company-provided number"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Temporary password</Label>
          <PasswordInput
            value={temporaryPassword}
            autoComplete="new-password"
            required
            minLength={10}
            onChange={(e) => setTemporaryPassword(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            At least 10 characters, including an uppercase letter and number. The user changes it
            after first sign in.
          </p>
        </div>

        {creationMode === "new" && (
          <>
            <div className="border-t border-border pt-4 sm:col-span-2">
              <h3 className="text-sm font-semibold text-foreground">Organization assignment</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Place the employee in the company hierarchy. Access is assigned automatically.
              </p>
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
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Used only for attendance and geofence rules.
              </p>
            </div>

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
              <Label>Job title (optional)</Label>
              <Input
                value={designation}
                placeholder={positionTitle}
                onChange={(e) => setDesignation(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Organization level</Label>
              <Select
                value={organizationLevel}
                onValueChange={(value) => setOrganizationLevel(value as typeof organizationLevel)}
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
              <Label>Reporting manager</Label>
              <Select value={managerId} onValueChange={setManagerId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="automatic">Assign from organization structure</SelectItem>
                  {employees
                    .filter((employee) => employee.employeeId)
                    .map((employee) => (
                      <SelectItem key={employee.employeeId} value={employee.employeeId!}>
                        {employee.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border border-border bg-muted/40 px-4 py-3 sm:col-span-2">
              <p className="text-xs font-medium text-muted-foreground">Position preview</p>
              <p className="mt-1 text-base font-semibold text-foreground">{positionTitle}</p>
              <p className="mt-1 break-words text-xs text-muted-foreground">
                {selectedUnit?.parentDepartmentId
                  ? `${departments.find((unit) => unit.id === selectedUnit.parentDepartmentId)?.name ?? "Organization"} / ${selectedUnit.name}`
                  : (selectedUnit?.name ?? "Choose a unit to continue")}
              </p>
            </div>

            <div className="border-t border-border pt-4 sm:col-span-2">
              <h3 className="text-sm font-semibold text-foreground">Employment details</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Personal details and employment type. Reporting follows the organization structure.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Date of Birth</Label>
              <Input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Joining date</Label>
              <Input
                type="date"
                value={joiningDate}
                onChange={(e) => setJoiningDate(e.target.value)}
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
                <Input type="time" value={shiftEnd} onChange={(e) => setShiftEnd(e.target.value)} />
              </div>
            </div>

            <div className="border-t border-border pt-4 sm:col-span-2">
              <h3 className="text-sm font-semibold text-foreground">Banking details</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Account numbers are encrypted before they are stored.
              </p>
            </div>

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

            <div className="border-t border-border pt-4 sm:col-span-2">
              <h3 className="text-sm font-semibold text-foreground">Statutory identifiers</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                PAN, Aadhaar, and UAN are encrypted and access-restricted.
              </p>
            </div>
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
          </>
        )}

        <div className="sticky -bottom-5 z-10 -mx-5 mt-2 flex flex-col-reverse gap-2 border-t border-border bg-background px-5 py-4 sm:col-span-2 sm:-mx-6 sm:flex-row sm:justify-end sm:px-6">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} className="w-full sm:w-auto">
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={loading} className="w-full sm:min-w-36 sm:w-auto">
            {loading ? "Creating..." : "Create account"}
          </Button>
        </div>
      </form>
    </div>
  );
}
