import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CreateLoginForm } from "@/components/users/CreateLoginForm";
import { BulkLoginSheet } from "@/components/users/BulkLoginSheet";
import { BulkEditLoginSheet } from "@/components/users/BulkEditLoginSheet";
import { UserDevicesDialog } from "@/components/users/UserDevicesDialog";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ROLE_LABELS, type Branch, type Department, type Role, type User } from "@/types/domain";
import { branchesApi, usersApi } from "@/services/api";
import { useAuth } from "@/lib/auth";
import { formatDisplayDate, formatDisplayDateTime, indiaDateKeyShift } from "@/lib/india-date";
import { Plus, Trash2, Key, Loader2, MonitorSmartphone, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/common/PasswordInput";
import { PasswordMatchHint } from "@/components/common/PasswordMatchHint";
import { TableToolbar } from "@/components/common/TableToolbar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  hasUnassignedDesignation,
  matchesDirectoryPerson,
  occupiedDesignations,
  occupiedRoles,
  type DirectoryFilters,
} from "@/lib/directory-filters";
import {
  matchesWorkforceTypeFilter,
  occupiedWorkforceTypes,
  WORKFORCE_TYPE_LABELS,
  type WorkforceTypeFilter,
} from "@/lib/workforce-type";
import { passwordMeetsPolicy, passwordPolicyError } from "@/lib/password-policy";
import { WorkforceTypeBadge } from "@/components/common/WorkforceTypeBadge";

export const Route = createFileRoute("/_app/users")({
  component: UsersPage,
  validateSearch: (search: Record<string, unknown>) => ({
    create: search.create === "1" || search.create === 1 || search.create === true,
  }),
});

const LOGIN_STATUS_FILTERS = ["created", "password_change", "active", "inactive"] as const;

function UsersPage() {
  const { t } = useTranslation();
  const { user: currentUser, updateCurrentUser } = useAuth();
  const { create } = useSearch({ from: "/_app/users" });
  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmUser, setConfirmUser] = useState<User | null>(null);
  const [confirmAction, setConfirmAction] = useState<"suspend" | "reactivate">("suspend");
  const [suspensionStartsAt, setSuspensionStartsAt] = useState("");
  const [suspendedUntil, setSuspendedUntil] = useState("");
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [devicesUser, setDevicesUser] = useState<User | null>(null);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [workforceTypeFilter, setWorkforceTypeFilter] = useState<WorkforceTypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [designation, setDesignation] = useState("all");

  const applyDeviceCount = useCallback((userId: string, count: number) => {
    setUsers((current) =>
      current.map((row) => (row.id === userId ? { ...row, activeDeviceCount: count } : row)),
    );
  }, []);

  useEffect(() => {
    loadUsers();
    Promise.all([branchesApi.list(), branchesApi.departments()])
      .then(([branchRows, departmentRows]) => {
        setBranches(branchRows);
        setDepartments(departmentRows);
      })
      .catch((err) => setError((err as Error).message));
    const statusTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadUsers(false);
    }, 45_000);
    return () => window.clearInterval(statusTimer);
  }, []);

  useEffect(() => {
    if (create) setShowCreate(true);
  }, [create]);

  function loadUsers(showLoading = true) {
    if (showLoading) setLoading(true);
    setError("");
    usersApi
      .list()
      .then(setUsers)
      .catch((err) => setError((err as Error).message))
      .finally(() => {
        if (showLoading) setLoading(false);
      });
  }

  async function suspendUser(user: User) {
    if (user.id === currentUser?.id) {
      toast.error(t("pages.users.toastCannotSuspendSelf"));
      return;
    }
    if (!suspensionStartsAt || !suspendedUntil) {
      toast.error(t("pages.users.toastChooseDates"));
      return;
    }
    try {
      const updated = await usersApi.suspend(
        user.id,
        `${suspensionStartsAt}T00:00:00.000Z`,
        `${suspendedUntil}T23:59:59.999Z`,
      );
      setUsers((prev) => prev.map((row) => (row.id === user.id ? { ...row, ...updated } : row)));
      toast.success(t("pages.users.toastSuspendedUntil", { date: suspendedUntil }));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function reactivateUser(user: User) {
    try {
      const updated = await usersApi.update(user.id, {
        status: "ACTIVE",
        suspensionStartsAt: null,
        suspendedUntil: null,
      });
      setUsers((prev) => prev.map((row) => (row.id === user.id ? { ...row, ...updated } : row)));
      toast.success(t("pages.users.toastReactivated"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function setAttendanceRequired(user: User, required: boolean) {
    if (!user.employeeId) {
      toast.error(t("pages.users.toastNoEmployeeForAttendance"));
      return;
    }
    try {
      const updated = await usersApi.update(user.id, { attendanceRequired: required });
      setUsers((prev) => prev.map((row) => (row.id === user.id ? { ...row, ...updated } : row)));
      if (currentUser?.id === user.id) updateCurrentUser(updated);
      toast.success(
        required
          ? t("pages.users.toastAttendanceOn", { name: user.name.split(" ")[0] })
          : t("pages.users.toastAttendanceOff", { name: user.name.split(" ")[0] }),
      );
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function performDeleteUser(user: User) {
    if (deleteConfirmation !== "OFFBOARD" && deleteConfirmation !== "DEACTIVATE") return;
    setDeleting(true);
    try {
      await usersApi.delete(user.id, deleteConfirmation);
      setUsers((prev) =>
        prev.map((row) =>
          row.id === user.id
            ? {
                ...row,
                active: false,
                status: "INACTIVE",
                employeeStatus: "TERMINATED",
                deactivatedAt: new Date().toISOString(),
                suspendedUntil: undefined,
                suspensionStartsAt: undefined,
                loginLifecycle: "INACTIVE",
              }
            : row,
        ),
      );
      setDeleteUser(null);
      setDeleteConfirmation("");
      toast.success(t("pages.users.toastEmploymentEnded"));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const canResetPassword = passwordMeetsPolicy(newPassword) && passwordsMatch;

  async function performResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetUser) return;
    if (!passwordMeetsPolicy(newPassword)) {
      toast.error(passwordPolicyError());
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t("pages.users.toastPasswordMismatch"));
      return;
    }
    setResetting(true);
    try {
      const updated = await usersApi.resetPassword(resetUser.id, newPassword);
      setUsers((prev) =>
        prev.map((row) => (row.id === resetUser.id ? { ...row, ...updated } : row)),
      );
      toast.success(t("pages.users.toastPasswordReset", { name: resetUser.name }));
      setResetUser(null);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setResetting(false);
    }
  }

  const directoryFilters: DirectoryFilters = useMemo(
    () => ({
      company: "all",
      branch: "all",
      unit: "all",
      designation,
      employmentType: "all",
    }),
    [designation],
  );
  const roleOrder = useMemo(() => Object.keys(ROLE_LABELS) as Role[], []);

  const facetedUsers = useCallback(
    (skip?: "designation" | "role" | "status" | "workforceType") => {
      const directorySkip = skip === "designation" ? skip : undefined;
      return users.filter((user) => {
        if (!matchesDirectoryPerson(user, directoryFilters, null, directorySkip)) {
          return false;
        }
        if (skip !== "workforceType" && !matchesWorkforceTypeFilter(user, workforceTypeFilter)) {
          return false;
        }
        if (skip !== "role" && roleFilter !== "all" && user.role !== roleFilter) return false;
        if (skip !== "status" && statusFilter !== "all") {
          if (loginStatusBucket(user) !== statusFilter) return false;
        }
        return true;
      });
    },
    [users, directoryFilters, roleFilter, workforceTypeFilter, statusFilter],
  );

  const designationOptions = useMemo(
    () => occupiedDesignations(facetedUsers("designation")),
    [facetedUsers],
  );
  const roleOptions = useMemo(
    () => occupiedRoles(facetedUsers("role"), roleOrder),
    [facetedUsers, roleOrder],
  );
  const workforceTypeOptions = useMemo(
    () => occupiedWorkforceTypes(facetedUsers("workforceType")),
    [facetedUsers],
  );
  const statusOptions = useMemo(() => {
    const present = new Set(facetedUsers("status").map(loginStatusBucket));
    return LOGIN_STATUS_FILTERS.filter((value) => present.has(value));
  }, [facetedUsers]);
  const showUnassignedDesignation = useMemo(
    () => hasUnassignedDesignation(facetedUsers("designation")),
    [facetedUsers],
  );

  const visibleUsers = useMemo(() => {
    const search = query.trim().toLowerCase();
    return facetedUsers().filter((user) => {
      if (!search) return true;
      const searchable =
        `${user.name} ${user.email} ${user.employeeCode ?? ""} ${user.employeeId ?? ""} ${user.phone ?? ""} ${user.companyPhone ?? ""} ${user.designation ?? ""}`.toLowerCase();
      return searchable.includes(search);
    });
  }, [facetedUsers, query]);

  const filtersActive =
    Boolean(query.trim()) ||
    designation !== "all" ||
    roleFilter !== "all" ||
    workforceTypeFilter !== "all" ||
    statusFilter !== "all";

  useEffect(() => {
    if (designation === "all") return;
    if (designation === "none") {
      if (!showUnassignedDesignation) setDesignation("all");
      return;
    }
    if (!designationOptions.includes(designation)) setDesignation("all");
  }, [designation, designationOptions, showUnassignedDesignation]);

  useEffect(() => {
    if (roleFilter !== "all" && !roleOptions.includes(roleFilter as Role)) {
      setRoleFilter("all");
    }
  }, [roleFilter, roleOptions]);

  useEffect(() => {
    if (
      workforceTypeFilter !== "all" &&
      !workforceTypeOptions.includes(workforceTypeFilter)
    ) {
      setWorkforceTypeFilter("all");
    }
  }, [workforceTypeFilter, workforceTypeOptions]);

  useEffect(() => {
    if (statusFilter !== "all" && !statusOptions.includes(statusFilter as (typeof LOGIN_STATUS_FILTERS)[number])) {
      setStatusFilter("all");
    }
  }, [statusFilter, statusOptions]);

  function clearLoginFilters() {
    setQuery("");
    setDesignation("all");
    setRoleFilter("all");
    setWorkforceTypeFilter("all");
    setStatusFilter("all");
  }

  function openReset(user: User) {
    setResetUser(user);
    setNewPassword("");
    setConfirmPassword("");
  }

  function openSuspend(user: User) {
    setConfirmUser(user);
    setConfirmAction("suspend");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setSuspensionStartsAt(tomorrow.toISOString().slice(0, 10));
    const endDate = new Date(tomorrow);
    endDate.setDate(endDate.getDate() + 1);
    setSuspendedUntil(endDate.toISOString().slice(0, 10));
  }

  function openReactivate(user: User) {
    setConfirmUser(user);
    setConfirmAction("reactivate");
  }

  return (
    <div>
      <PageHeader
        title={t("pages.users.title")}
        description={t("pages.users.subtitle")}
        actions={
          <>
            <BulkLoginSheet
              branches={branches}
              departments={departments}
              existingEmployees={users}
              onImported={loadUsers}
            />
            <BulkEditLoginSheet
              branches={branches}
              departments={departments}
              existingUsers={users}
              onSaved={loadUsers}
            />
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" /> {t("pages.users.createLogin")}
            </Button>
          </>
        }
      />
      {loading && <LoadingState label={t("pages.loading.users")} />}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <TableToolbar>
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("pages.users.search")}
          />
        </div>
        <Select value={designation} onValueChange={setDesignation}>
          <SelectTrigger className="sm:w-52" aria-label={t("pages.users.filterDesignation")}>
            <SelectValue placeholder={t("pages.users.filterDesignation")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("pages.users.allDesignations")}</SelectItem>
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
          <SelectTrigger className="sm:w-44" aria-label={t("pages.users.filterWorkforceType")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("pages.users.allWorkforceTypes")}</SelectItem>
            {workforceTypeOptions.map((value) => (
              <SelectItem key={value} value={value}>
                {WORKFORCE_TYPE_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="sm:w-44" aria-label={t("pages.users.filterRole")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("pages.users.allRoles")}</SelectItem>
            {roleOptions.map((value) => (
              <SelectItem key={value} value={value}>
                {ROLE_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-48" aria-label={t("pages.users.filterStatus")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("pages.users.allStatuses")}</SelectItem>
            {statusOptions.map((value) => (
              <SelectItem key={value} value={value}>
                {value === "created"
                  ? t("pages.users.statusCreated")
                  : value === "password_change"
                    ? t("pages.users.statusPasswordChange")
                    : value === "active"
                      ? t("pages.users.statusActive")
                      : t("pages.users.statusInactive")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtersActive && (
          <Button variant="ghost" size="sm" onClick={clearLoginFilters}>
            <X className="h-4 w-4" />
            {t("pages.users.clearFilters")}
          </Button>
        )}
      </TableToolbar>
      {!loading && (
        <p className="mb-3 text-xs text-muted-foreground">
          {t("pages.users.showingCount", { shown: visibleUsers.length, total: users.length })}
        </p>
      )}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="space-y-2 p-3 md:hidden">
          {visibleUsers.map((user) => (
            <div key={user.id} className="rounded-lg border bg-background p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </div>
                <LoginStatus user={user} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-muted-foreground">Employee ID</p>
                  <p className="mt-0.5 font-mono">{user.employeeCode || user.employeeId || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("pages.users.workforceType")}</p>
                  <div className="mt-0.5">
                    <WorkforceTypeBadge role={user.role} />
                  </div>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("common.role")}</p>
                  <p className="mt-0.5">{ROLE_LABELS[user.role]}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Last login</p>
                  <p className="mt-0.5">{formatLastLogin(user.lastLoginAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Devices</p>
                  <p className="mt-0.5">{describeDeviceCount(user.activeDeviceCount)}</p>
                </div>
                {user.designation && (
                  <div>
                    <p className="text-muted-foreground">{t("pages.employees.designation")}</p>
                    <p className="mt-0.5 break-words">{user.designation}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground">{t("pages.users.joined")}</p>
                  <p className="mt-0.5">
                    {user.joiningDate ? formatDisplayDate(user.joiningDate) : "-"}
                  </p>
                </div>
                {user.employeeId && user.role !== "developer_admin" && (
                  <div className="col-span-2 flex items-start justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2.5">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium text-foreground">
                        {t("pages.users.attendanceLeave")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("pages.users.attendanceLeaveHint")}
                      </p>
                    </div>
                    <Switch
                      checked={user.attendanceRequired !== false}
                      onCheckedChange={(checked) => void setAttendanceRequired(user, checked)}
                      aria-label={t("pages.users.attendanceLeave")}
                    />
                  </div>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" onClick={() => openReset(user)}>
                  <Key className="h-4 w-4" /> {t("pages.users.resetPassword")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDevicesUser(user)}>
                  <MonitorSmartphone className="h-4 w-4" /> {t("pages.users.devicesBtn")}
                </Button>
                {user.role !== "developer_admin" &&
                  (user.active && !user.suspensionStartsAt ? (
                    <Button
                      size="sm"
                      className="bg-orange-600 text-white hover:bg-orange-700"
                      disabled={user.id === currentUser?.id}
                      onClick={() => openSuspend(user)}
                    >
                      {t("pages.users.suspendBtn")}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="bg-emerald-600 text-white hover:bg-emerald-700"
                      onClick={() => openReactivate(user)}
                    >
                      {t("pages.users.reactivate")}
                    </Button>
                  ))}
                {canOffboardUser(user, currentUser?.id) && (
                  <Button
                    className="col-span-2"
                    size="sm"
                    variant="destructive"
                    onClick={() => setDeleteUser(user)}
                  >
                    <Trash2 className="h-4 w-4" /> {t("pages.users.offboardConfirmBtn")}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <Table className="min-w-[1020px]">
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("common.email")}</TableHead>
                <TableHead>{t("pages.users.workforceType")}</TableHead>
                <TableHead>{t("common.role")}</TableHead>
                <TableHead>{t("common.employeeId")}</TableHead>
                <TableHead>{t("pages.users.joined")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead>{t("pages.users.attendanceLeave")}</TableHead>
                <TableHead>{t("pages.users.lastLogin")}</TableHead>
                <TableHead>{t("pages.users.devicesBtn")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleUsers.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="font-medium">{u.name}</div>
                    {u.designation ? (
                      <div className="text-xs text-muted-foreground">{u.designation}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <WorkforceTypeBadge role={u.role} />
                  </TableCell>
                  <TableCell>{ROLE_LABELS[u.role]}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {u.employeeCode || u.employeeId || "-"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {u.joiningDate ? formatDisplayDate(u.joiningDate) : "-"}
                  </TableCell>
                  <TableCell>
                    <LoginStatus user={u} />
                  </TableCell>
                  <TableCell>
                    {u.employeeId && u.role !== "developer_admin" ? (
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={u.attendanceRequired !== false}
                          onCheckedChange={(checked) => void setAttendanceRequired(u, checked)}
                          aria-label={t("pages.users.attendanceLeave")}
                        />
                        <span className="text-xs text-muted-foreground">
                          {u.attendanceRequired === false
                            ? t("pages.users.attendanceOff")
                            : t("pages.users.attendanceOn")}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatLastLogin(u.lastLoginAt)}
                  </TableCell>
                  <TableCell className="text-xs">
                    <button
                      type="button"
                      className="rounded underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setDevicesUser(u)}
                    >
                      {describeDeviceCount(u.activeDeviceCount)}
                    </button>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDevicesUser(u)}
                        title={t("pages.users.signedInDevices")}
                      >
                        <MonitorSmartphone className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openReset(u)}
                        title={t("pages.users.resetPassword")}
                      >
                        <Key className="h-4 w-4" />
                      </Button>
                      {u.role === "developer_admin" ? null : u.active && !u.suspensionStartsAt ? (
                        <Button
                          size="sm"
                          className="bg-orange-600 text-white hover:bg-orange-700"
                          disabled={u.id === currentUser?.id}
                          onClick={() => openSuspend(u)}
                        >
                          {t("pages.users.suspendBtn")}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="bg-emerald-600 text-white hover:bg-emerald-700"
                          onClick={() => openReactivate(u)}
                        >
                          {t("pages.users.reactivate")}
                        </Button>
                      )}
                      {canOffboardUser(u, currentUser?.id) && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setDeleteUser(u)}
                          title={t("pages.users.offboard")}
                        >
                          <Trash2 className="h-4 w-4" />
                          {t("pages.users.offboardShort")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!loading && visibleUsers.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {t("pages.users.noneFound")}
          </div>
        )}
      </div>

      <AlertDialog open={!!confirmUser} onOpenChange={(open) => !open && setConfirmUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "suspend"
                ? t("pages.users.suspendTitle")
                : t("pages.users.reactivateTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "suspend"
                ? t("pages.users.suspendDescription", { name: confirmUser?.name })
                : t("pages.users.reactivateDescription", { name: confirmUser?.name })}
            </AlertDialogDescription>
            {confirmAction === "suspend" && (
              <div className="grid gap-3 pt-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="suspension-start">{t("pages.users.suspensionStarts")}</Label>
                  <DateField
                    id="suspension-start"
                    min={indiaDateKeyShift(1)}
                    value={suspensionStartsAt}
                    onChange={setSuspensionStartsAt}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="suspension-end">{t("pages.users.suspensionEnds")}</Label>
                  <DateField
                    id="suspension-end"
                    min={suspensionStartsAt}
                    value={suspendedUntil}
                    onChange={setSuspendedUntil}
                  />
                </div>
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={
                confirmAction === "suspend"
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              }
              onClick={() => {
                if (!confirmUser) return;
                void (confirmAction === "suspend"
                  ? suspendUser(confirmUser)
                  : reactivateUser(confirmUser));
                setConfirmUser(null);
              }}
            >
              {confirmAction === "suspend"
                ? t("pages.users.suspend")
                : t("pages.users.reactivate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleteUser}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setDeleteUser(null);
            setDeleteConfirmation("");
          }
        }}
      >
        <AlertDialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("pages.users.offboardTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("pages.users.offboardDescription", { name: deleteUser?.name })}
            </AlertDialogDescription>
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-semibold">What changes immediately</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 sm:text-sm">
                <li>Login is closed and any active sessions are revoked</li>
                <li>Employee is marked terminated (left company)</li>
                <li>Hidden from birthday lists and active attendance reminders</li>
                <li>Offboarding checklist is started when a linked employee exists</li>
              </ul>
              <p className="mt-3 font-semibold">History retained</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 sm:text-sm">
                <li>Employee profile and account audit record</li>
                <li>Past attendance punches, daily summaries, and correction requests</li>
                <li>Leave requests, emergency contact, and biometric mappings</li>
                <li>Assets, tasks, and other operational history</li>
              </ul>
              <p className="mt-2 text-xs leading-5">
                A Developer Admin can reactivate the login later if employment resumes.
              </p>
            </div>
            <div className="space-y-2 pt-2 text-left">
              <Label htmlFor="delete-confirmation">
                Type <span className="font-mono font-semibold">OFFBOARD</span> to approve
              </Label>
              <Input
                id="delete-confirmation"
                autoComplete="off"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                placeholder="OFFBOARD"
              />
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={
                (deleteConfirmation !== "OFFBOARD" && deleteConfirmation !== "DEACTIVATE") ||
                deleting
              }
              onClick={() => {
                if (!deleteUser) return;
                void performDeleteUser(deleteUser);
              }}
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("pages.users.offboardConfirmBtn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UserDevicesDialog
        user={devicesUser}
        onOpenChange={(open) => !open && setDevicesUser(null)}
        onCountChange={applyDeviceCount}
      />

      <Dialog open={!!resetUser} onOpenChange={(open) => !open && setResetUser(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={performResetPassword}>
            <DialogHeader>
              <DialogTitle>
                {t("pages.users.resetPasswordFor", { name: resetUser?.name })}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="new">{t("pages.users.newPassword")}</Label>
                <PasswordInput
                  id="new"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">{t("pages.users.confirmPassword")}</Label>
                <PasswordInput
                  id="confirm"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <PasswordMatchHint password={newPassword} confirm={confirmPassword} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResetUser(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={resetting || !canResetPassword}>
                {resetting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("pages.users.resetPassword")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[92dvh]">
          <DialogHeader className="border-b border-border px-5 py-4 sm:px-6">
            <DialogTitle>{t("pages.users.createAccountTitle")}</DialogTitle>
            <DialogDescription>{t("pages.users.createAccountDescription")}</DialogDescription>
          </DialogHeader>
          <CreateLoginForm
            onCreated={(created) => {
              setUsers((prev) => [created, ...prev]);
              setShowCreate(false);
            }}
            onCancel={() => setShowCreate(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function loginStatusBucket(user: User): (typeof LOGIN_STATUS_FILTERS)[number] {
  const lifecycle = resolveUserLoginLifecycle(user);
  if (lifecycle === "CREATED") return "created";
  if (lifecycle === "PASSWORD_CHANGE") return "password_change";
  if (lifecycle === "ACTIVE") return "active";
  return "inactive";
}

function resolveUserLoginLifecycle(user: User): NonNullable<User["loginLifecycle"]> {
  if (user.loginLifecycle) return user.loginLifecycle;
  if (user.status === "LOCKED") return "LOCKED";
  if (user.status === "INACTIVE" || user.active === false) {
    if (
      user.suspensionStartsAt &&
      user.suspendedUntil &&
      new Date(user.suspensionStartsAt).getTime() <= Date.now() &&
      new Date(user.suspendedUntil).getTime() > Date.now()
    ) {
      return "SUSPENDED";
    }
    return "INACTIVE";
  }
  if (!user.lastLoginAt) return "CREATED";
  if (user.mustChangePassword) return "PASSWORD_CHANGE";
  return "ACTIVE";
}

/** Offboard only for accounts that have not already left the company. */
function canOffboardUser(user: User, currentUserId?: string) {
  if (user.role === "developer_admin") return false;
  if (currentUserId && user.id === currentUserId) return false;
  if (user.status === "INACTIVE") return false;
  if (user.employeeStatus === "TERMINATED") return false;
  if (user.deactivatedAt) return false;
  if (resolveUserLoginLifecycle(user) === "INACTIVE") return false;
  return true;
}

function formatLastLogin(value?: string | null) {
  if (!value) return "Never";
  return formatDisplayDateTime(value);
}

function describeDeviceCount(count?: number) {
  if (!count) return "None";
  return count === 1 ? "1 device" : `${count} devices`;
}

function LoginStatus({ user }: { user: User }) {
  const { t } = useTranslation();
  if (user.role === "developer_admin") {
    return (
      <Badge
        variant="outline"
        className="shrink-0 border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400"
      >
        Protected
      </Badge>
    );
  }

  const lifecycle = resolveUserLoginLifecycle(user);
  const scheduled =
    user.suspensionStartsAt && new Date(user.suspensionStartsAt).getTime() > Date.now();

  if (lifecycle === "LOCKED") {
    return (
      <Badge
        variant="outline"
        className="shrink-0 border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400"
      >
        Blocked
      </Badge>
    );
  }
  if (lifecycle === "SUSPENDED") {
    return (
      <Badge
        variant="outline"
        className="max-w-44 shrink-0 whitespace-normal border-orange-200 bg-orange-50 text-center text-orange-800 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-300"
      >
        {user.suspendedUntil
          ? `Suspended until ${formatDisplayDate(user.suspendedUntil)}`
          : "Suspended"}
      </Badge>
    );
  }
  if (lifecycle === "INACTIVE") {
    return (
      <Badge
        variant="outline"
        className="max-w-44 shrink-0 whitespace-normal border-border bg-muted text-center text-muted-foreground"
        title={
          user.deactivatedAt
            ? `Left company on ${formatDisplayDate(user.deactivatedAt)}`
            : t("pages.users.employmentEnded")
        }
      >
        Left company
      </Badge>
    );
  }
  if (lifecycle === "CREATED") {
    return (
      <Badge
        variant="outline"
        className="shrink-0 border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-300"
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
        className="shrink-0 border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300"
        title={t("pages.users.mustSetPassword")}
      >
        Password change
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="max-w-44 shrink-0 whitespace-normal border-emerald-200 bg-emerald-50 text-center text-emerald-700 dark:text-emerald-400"
    >
      {scheduled ? `Suspends ${formatDisplayDate(user.suspensionStartsAt!)}` : "Active"}
    </Badge>
  );
}
