import { useEffect, useState } from "react";
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
import { ROLE_LABELS, type Branch, type Department, type Role, type User } from "@/mock/types";
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
  main_admin: ["ceo", "hr", "manager", "employee"],
  hr: ["employee", "manager", "sales", "driver", "field_staff"],
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
  const [managers, setManagers] = useState<User[]>([]);
  const [unlinkedEmployees, setUnlinkedEmployees] = useState<User[]>([]);
  const [creationMode] = useState<"new" | "link">("new");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>(allowed[0] ?? "employee");
  const [branch, setBranch] = useState("");
  const [dept, setDept] = useState("");
  const [managerId, setManagerId] = useState("none");
  const [designation, setDesignation] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState<"FEMALE" | "MALE" | "PREFER_NOT_TO_SAY">(
    "PREFER_NOT_TO_SAY",
  );
  const [employmentType, setEmploymentType] = useState<"FULL_TIME" | "PART_TIME" | "INTERN">(
    "FULL_TIME",
  );
  const usePredefinedPassword = false;
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [loading, setLoading] = useState(false);

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
        setManagers(
          employees.filter((employee) =>
            ["manager", "hr", "main_admin", "developer_admin"].includes(employee.role),
          ),
        );

        // Filter out employees that already have user login accounts
        const userEmpIds = new Set(usersList.map((u) => u.employeeId).filter(Boolean));
        const unlinked = employees.filter((e) => !userEmpIds.has(e.employeeId));
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
        setManagers([]);
        setUnlinkedEmployees([]);
      });
  }, []);

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
        setManagerId(emp.managerId || "none");
      }
    }
  }, [creationMode, selectedEmployeeId, unlinkedEmployees, branches, departments]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (creationMode === "new" && !name) {
      toast.error("Full name is required");
      return;
    }
    if (!email || (!usePredefinedPassword && !temporaryPassword)) {
      toast.error("Email and temporary password are required");
      return;
    }
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = {
        name: creationMode === "link" ? name : name,
        email,
        role,
        phone: undefined,
        active: true,
        mustChangePassword: true,
        password: usePredefinedPassword ? undefined : temporaryPassword,
      };

      if (creationMode === "link") {
        payload.employeeId = selectedEmployeeId;
      } else {
        payload.employeeCode = employeeCode || undefined;
        payload.homeBranchId = branch || undefined;
        payload.departmentId = dept || undefined;
        payload.designation = designation || undefined;
        payload.managerId = managerId === "none" ? undefined : managerId;
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
    <div className="w-full">
      <form onSubmit={submit} className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Employee Code / ID (Predefined)</Label>
            <Input
              placeholder="Leave blank to auto-generate (e.g. EMP-0001)"
              value={employeeCode}
              onChange={(e) => setEmployeeCode(e.target.value)}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Full name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={creationMode === "link"}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={creationMode === "link"}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Temporary password</Label>
            <PasswordInput
              value={temporaryPassword}
              autoComplete="new-password"
              onChange={(e) => setTemporaryPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The user changes this after first sign in.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowed.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {creationMode === "new" && (
            <>
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

              <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                <Label>Department</Label>
                <Select value={dept} onValueChange={setDept}>
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
                <Input value={designation} onChange={(e) => setDesignation(e.target.value)} />
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

              <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                <Label>Reporting manager</Label>
                <Select value={managerId} onValueChange={setManagerId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No manager</SelectItem>
                    {managers.map((manager) => (
                      <SelectItem
                        key={manager.employeeId ?? manager.id}
                        value={manager.employeeId ?? manager.id}
                      >
                        {manager.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end lg:col-span-3 mt-2">
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={loading} className="w-full sm:w-auto">
              Create login
            </Button>
          </div>
      </form>
    </div>
  );
}
