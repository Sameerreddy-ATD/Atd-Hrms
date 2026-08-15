import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CreateLoginForm } from "@/components/users/CreateLoginForm";
import { BulkLoginSheet } from "@/components/users/BulkLoginSheet";
import { BulkEditLoginSheet } from "@/components/users/BulkEditLoginSheet";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { ROLE_LABELS, type Branch, type Department, type User } from "@/types/domain";
import { branchesApi, usersApi } from "@/services/api";
import { useAuth } from "@/lib/auth";
import { formatDisplayDate, formatDisplayDateTime, indiaDateKeyShift } from "@/lib/india-date";
import { Plus, Trash2, Key, Loader2 } from "lucide-react";
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
import { Search } from "lucide-react";

export const Route = createFileRoute("/_app/users")({
  component: UsersPage,
  validateSearch: (search: Record<string, unknown>) => ({
    create: search.create === "1" || search.create === 1 || search.create === true,
  }),
});

function UsersPage() {
  const { user: currentUser } = useAuth();
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
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

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
      toast.error("You cannot suspend your own login");
      return;
    }
    if (!suspensionStartsAt || !suspendedUntil) {
      toast.error("Choose the suspension start and end dates");
      return;
    }
    try {
      const updated = await usersApi.suspend(
        user.id,
        `${suspensionStartsAt}T00:00:00.000Z`,
        `${suspendedUntil}T23:59:59.999Z`,
      );
      setUsers((prev) => prev.map((row) => (row.id === user.id ? { ...row, ...updated } : row)));
      toast.success(`Login suspended until ${suspendedUntil}`);
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
      toast.success("Login reactivated");
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
      toast.success("Employment ended; login closed and history retained");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const canResetPassword = newPassword.length >= 8 && passwordsMatch;

  async function performResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetUser) return;
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setResetting(true);
    try {
      const updated = await usersApi.resetPassword(resetUser.id, newPassword);
      setUsers((prev) =>
        prev.map((row) => (row.id === resetUser.id ? { ...row, ...updated } : row)),
      );
      toast.success(
        `Password reset for ${resetUser.name}. Status is Created until they sign in again.`,
      );
      setResetUser(null);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setResetting(false);
    }
  }

  const visibleUsers = useMemo(() => {
    const search = query.trim().toLowerCase();
    return users.filter((user) => {
      if (roleFilter !== "all" && user.role !== roleFilter) return false;
      const lifecycle = resolveUserLoginLifecycle(user);
      if (statusFilter === "created" && lifecycle !== "CREATED") return false;
      if (statusFilter === "password_change" && lifecycle !== "PASSWORD_CHANGE") return false;
      if (statusFilter === "active" && lifecycle !== "ACTIVE") return false;
      if (
        statusFilter === "inactive" &&
        lifecycle !== "INACTIVE" &&
        lifecycle !== "SUSPENDED" &&
        lifecycle !== "LOCKED"
      ) {
        return false;
      }
      const searchable =
        `${user.name} ${user.email} ${user.employeeCode ?? ""} ${user.employeeId ?? ""}`.toLowerCase();
      return !search || searchable.includes(search);
    });
  }, [query, roleFilter, statusFilter, users]);

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
        title="User Logins"
        description="Create, suspend, offboard, reactivate, and reset employee accounts. Status moves from Created → Password change → Active."
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
              <Plus className="mr-2 h-4 w-4" /> Create login
            </Button>
          </>
        }
      />
      {loading && <LoadingState label="Loading user logins" />}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <TableToolbar>
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, email, or employee ID"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="created">Created</SelectItem>
            <SelectItem value="password_change">Password change</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Left company / blocked</SelectItem>
          </SelectContent>
        </Select>
      </TableToolbar>
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
                  <p className="text-muted-foreground">Role</p>
                  <p className="mt-0.5">{ROLE_LABELS[user.role]}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Last login</p>
                  <p className="mt-0.5">{formatLastLogin(user.lastLoginAt)}</p>
                </div>
                {user.department && (
                  <div>
                    <p className="text-muted-foreground">Department</p>
                    <p className="mt-0.5 break-words">{user.department}</p>
                  </div>
                )}
                {user.designation && (
                  <div>
                    <p className="text-muted-foreground">Designation</p>
                    <p className="mt-0.5 break-words">{user.designation}</p>
                  </div>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" onClick={() => openReset(user)}>
                  <Key className="h-4 w-4" /> Reset password
                </Button>
                {user.role !== "developer_admin" &&
                  (user.active && !user.suspensionStartsAt ? (
                    <Button
                      size="sm"
                      className="bg-orange-600 text-white hover:bg-orange-700"
                      disabled={user.id === currentUser?.id}
                      onClick={() => openSuspend(user)}
                    >
                      Suspend
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="bg-emerald-600 text-white hover:bg-emerald-700"
                      onClick={() => openReactivate(user)}
                    >
                      Reactivate
                    </Button>
                  ))}
                {canOffboardUser(user, currentUser?.id) && (
                  <Button
                    className="col-span-2"
                    size="sm"
                    variant="destructive"
                    onClick={() => setDeleteUser(user)}
                  >
                    <Trash2 className="h-4 w-4" /> Offboard employee
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Employee ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleUsers.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{ROLE_LABELS[u.role]}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {u.employeeCode || u.employeeId || "-"}
                  </TableCell>
                  <TableCell>
                    <LoginStatus user={u} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatLastLogin(u.lastLoginAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openReset(u)}
                        title="Reset Password"
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
                          Suspend
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="bg-emerald-600 text-white hover:bg-emerald-700"
                          onClick={() => openReactivate(u)}
                        >
                          Reactivate
                        </Button>
                      )}
                      {canOffboardUser(u, currentUser?.id) && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setDeleteUser(u)}
                          title="Offboard employee — end employment and close login"
                        >
                          <Trash2 className="h-4 w-4" />
                          Offboard
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
            No user logins match these filters.
          </div>
        )}
      </div>

      <AlertDialog open={!!confirmUser} onOpenChange={(open) => !open && setConfirmUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "suspend" ? "Temporarily suspend login?" : "Reactivate login?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "suspend"
                ? `Choose the final suspension day for ${confirmUser?.name}. Login access returns automatically after that day.`
                : `This will allow ${confirmUser?.name} to sign in again.`}
            </AlertDialogDescription>
            {confirmAction === "suspend" && (
              <div className="grid gap-3 pt-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="suspension-start">Suspension starts</Label>
                  <DateField
                    id="suspension-start"
                    min={indiaDateKeyShift(1)}
                    value={suspensionStartsAt}
                    onChange={setSuspensionStartsAt}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="suspension-end">Suspended through</Label>
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
            <AlertDialogCancel>Cancel</AlertDialogCancel>
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
              {confirmAction === "suspend" ? "Suspend account" : "Reactivate"}
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
            <AlertDialogTitle>End employment and close login?</AlertDialogTitle>
            <AlertDialogDescription>
              This marks {deleteUser?.name} as left the company: they cannot sign in, disappear from
              birthdays and active attendance, and an offboarding checklist is started. Past records
              are kept.
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
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
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
              Offboard employee
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!resetUser} onOpenChange={(open) => !open && setResetUser(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={performResetPassword}>
            <DialogHeader>
              <DialogTitle>Reset Password for {resetUser?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="new">New Password</Label>
                <PasswordInput
                  id="new"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirm Password</Label>
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
                Cancel
              </Button>
              <Button type="submit" disabled={resetting || !canResetPassword}>
                {resetting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Reset Password
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[92dvh]">
          <DialogHeader className="border-b border-border px-5 py-4 sm:px-6">
            <DialogTitle>Create employee account</DialogTitle>
            <DialogDescription>
              Set employee ID, week-off policy, organization placement, and sign-in details.
            </DialogDescription>
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

function LoginStatus({ user }: { user: User }) {
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
            : "Employment ended; login closed"
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
        className="shrink-0 border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300"
        title="Signed in once; must set a new password"
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
