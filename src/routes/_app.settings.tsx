import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  auditApi,
  biometricApi,
  branchesApi,
  reportsApi,
  securitySettingsApi,
  usersApi,
} from "@/services/api";
import { BellRing, Building2, CalendarCheck, Fingerprint, Shield, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { PasswordInput } from "@/components/common/PasswordInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const [counts, setCounts] = useState({
    users: 0,
    branches: 0,
    departments: 0,
    devices: 0,
    holidays: 0,
    auditLogs: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [predefinedPassword, setPredefinedPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordConfigured, setPasswordConfigured] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    Promise.all([
      usersApi.list(),
      branchesApi.list(),
      branchesApi.departments(),
      biometricApi.list(),
      reportsApi.holidays(),
      auditApi.list(),
      securitySettingsApi.get(),
    ])
      .then(([users, branches, departments, devices, holidays, auditLogs, security]) => {
        setCounts({
          users: users.length,
          branches: branches.length,
          departments: departments.length,
          devices: devices.length,
          holidays: holidays.length,
          auditLogs: auditLogs.length,
        });
        setPasswordConfigured(security.predefinedPasswordConfigured);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        title="System Settings"
        description="Read-only operational configuration currently active in the backend."
      />
      {loading && <p className="text-sm text-muted-foreground">Loading settings...</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="User accounts" value={counts.users} icon={Users} />
        <StatCard label="Branches" value={counts.branches} icon={Building2} />
        <StatCard label="Departments" value={counts.departments} icon={Shield} />
        <StatCard label="Biometric devices" value={counts.devices} icon={Fingerprint} />
        <StatCard label="Holidays" value={counts.holidays} icon={CalendarCheck} />
        <StatCard label="Audit logs" value={counts.auditLogs} icon={BellRing} />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-sm">Runtime Policy</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <SettingRow label="Authentication" value="Cookie-based sessions" />
          <SettingRow label="Public signup" value="Disabled" />
          <SettingRow label="Role access" value="Backend RBAC enforced" />
          <SettingRow label="Attendance source" value="Thumb scanner and mobile GPS" />
        </CardContent>
      </Card>

      {user && ["developer_admin", "main_admin", "hr"].includes(user.role) && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-sm">Predefined New-Account Password</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              {passwordConfigured
                ? "A predefined password is configured. Its value is never displayed or stored as plain text."
                : "No predefined password is configured yet."}
            </p>
            <form
              className="grid max-w-xl gap-4 sm:grid-cols-2"
              onSubmit={async (event) => {
                event.preventDefault();
                if (predefinedPassword !== confirmPassword) {
                  toast.error("Passwords do not match");
                  return;
                }
                setSavingPassword(true);
                try {
                  await securitySettingsApi.updatePredefinedPassword(predefinedPassword);
                  setPasswordConfigured(true);
                  setPredefinedPassword("");
                  setConfirmPassword("");
                  toast.success("Predefined password updated");
                } catch (err) {
                  toast.error((err as Error).message);
                } finally {
                  setSavingPassword(false);
                }
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="predefined-password">New predefined password</Label>
                <PasswordInput
                  id="predefined-password"
                  value={predefinedPassword}
                  onChange={(event) => setPredefinedPassword(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-predefined-password">Confirm password</Label>
                <PasswordInput
                  id="confirm-predefined-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={savingPassword}>
                  Update predefined password
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}
