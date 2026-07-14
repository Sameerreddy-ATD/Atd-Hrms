import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CreateLoginForm } from "@/components/users/CreateLoginForm";
import { PageHeader } from "@/components/common/PageHeader";
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
import { ROLE_LABELS, type User } from "@/mock/types";
import { usersApi } from "@/services/api";
import { useAuth } from "@/lib/auth";
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
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/common/PasswordInput";
import { PasswordMatchHint } from "@/components/common/PasswordMatchHint";

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
  const [showCreate, setShowCreate] = useState(false);
  const [confirmUser, setConfirmUser] = useState<User | null>(null);
  const [confirmAction, setConfirmAction] = useState<"suspend" | "reactivate">("suspend");
  const [suspensionStartsAt, setSuspensionStartsAt] = useState("");
  const [suspendedUntil, setSuspendedUntil] = useState("");
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (create) setShowCreate(true);
  }, [create]);

  function loadUsers() {
    setLoading(true);
    setError("");
    usersApi
      .list()
      .then(setUsers)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
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
    try {
      await usersApi.delete(user.id);
      setUsers((prev) => prev.filter((row) => row.id !== user.id));
      toast.success("Login account deleted successfully");
    } catch (err) {
      toast.error((err as Error).message);
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
      await usersApi.resetPassword(resetUser.id, newPassword);
      toast.success(`Password reset for ${resetUser.name}. They will change it on next login.`);
      setResetUser(null);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setResetting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="User Logins"
        description="Create, delete, deactivate, and reset passwords for employee accounts."
        actions={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" /> Create login
          </Button>
        }
      />
      {loading && <p className="text-sm text-muted-foreground">Loading users...</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Employee ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{ROLE_LABELS[u.role]}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {u.employeeCode || u.employeeId || "-"}
                  </TableCell>
                  <TableCell>
                    {u.role === "developer_admin" ? (
                      <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                        Protected
                      </Badge>
                    ) : u.active ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-200 bg-emerald-50 text-emerald-700"
                      >
                        {u.suspensionStartsAt &&
                        new Date(u.suspensionStartsAt).getTime() > Date.now()
                          ? `Suspension scheduled ${new Date(u.suspensionStartsAt).toLocaleDateString("en-IN")}`
                          : "Active"}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-slate-200 bg-slate-100 text-slate-600"
                      >
                        {u.suspendedUntil && new Date(u.suspendedUntil).getTime() > Date.now()
                          ? `Suspended until ${new Date(u.suspendedUntil).toLocaleDateString("en-IN")}`
                          : "Inactive"}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setResetUser(u);
                          setNewPassword("");
                          setConfirmPassword("");
                        }}
                        title="Reset Password"
                      >
                        <Key className="h-4 w-4" />
                      </Button>
                      {u.role === "developer_admin" ? null : u.active && !u.suspensionStartsAt ? (
                        <Button
                          size="sm"
                          className="bg-orange-600 text-white hover:bg-orange-700"
                          disabled={u.id === currentUser?.id}
                          onClick={() => {
                            setConfirmUser(u);
                            setConfirmAction("suspend");
                            const tomorrow = new Date();
                            tomorrow.setDate(tomorrow.getDate() + 1);
                            setSuspensionStartsAt(tomorrow.toISOString().slice(0, 10));
                            const endDate = new Date(tomorrow);
                            endDate.setDate(endDate.getDate() + 1);
                            setSuspendedUntil(endDate.toISOString().slice(0, 10));
                          }}
                        >
                          Suspend
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="bg-emerald-600 text-white hover:bg-emerald-700"
                          onClick={() => {
                            setConfirmUser(u);
                            setConfirmAction("reactivate");
                          }}
                        >
                          Reactivate
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={u.id === currentUser?.id || u.role === "developer_admin"}
                        onClick={() => setDeleteUser(u)}
                        title="Delete User"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!loading && users.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">No users found.</div>
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
                  <Input
                    id="suspension-start"
                    type="date"
                    min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                    value={suspensionStartsAt}
                    onChange={(event) => setSuspensionStartsAt(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="suspension-end">Suspended through</Label>
                  <Input
                    id="suspension-end"
                    type="date"
                    min={suspensionStartsAt}
                    value={suspendedUntil}
                    onChange={(event) => setSuspendedUntil(event.target.value)}
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

      <AlertDialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user login account?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the login account for {deleteUser?.name}? This will
              permanently remove their login, employee profile, attendance, leave, biometric
              mapping, and related HRMS records. This cannot be undone. Suspension does not delete
              any of this data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (!deleteUser) return;
                void performDeleteUser(deleteUser);
                setDeleteUser(null);
              }}
            >
              Delete Account
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
              Add login details, organization placement, and employment information.
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
