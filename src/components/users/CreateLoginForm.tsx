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
import { type Branch, type Department, type Role, type User } from "@/mock/types";
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
  const [unlinkedEmployees, setUnlinkedEmployees] = useState<User[]>([]);
  const [creationMode] = useState<"new" | "link">("new");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [branch, setBranch] = useState("");
  const [dept, setDept] = useState("");
  const [organizationUnitId, setOrganizationUnitId] = useState("");
  const [childOrganizationUnitId, setChildOrganizationUnitId] = useState("none");
  const [designation, setDesignation] = useState("");
  const [organizationLevel, setOrganizationLevel] = useState<
    "HEAD" | "SENIOR" | "JUNIOR" | "MEMBER"
  >("MEMBER");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState<"FEMALE" | "MALE" | "PREFER_NOT_TO_SAY">(
    "PREFER_NOT_TO_SAY",
  );
  const [employmentType, setEmploymentType] = useState<"FULL_TIME" | "PART_TIME" | "INTERN">(
    "FULL_TIME",
  );
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
        setBranch(emp.homeBranchId || branches[0]?.id || "");
        setDept(emp.departmentId || departments[0]?.id || "");
        setDesignation(emp.designation || "");
        setGender(emp.gender || "PREFER_NOT_TO_SAY");
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
        phone: undefined,
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
        payload.organizationLevel = organizationLevel;
        payload.dateOfBirth = dateOfBirth || undefined;
        payload.gender = gender;
        payload.employmentType = employmentType;
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
              <Label>Home branch</Label>
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
