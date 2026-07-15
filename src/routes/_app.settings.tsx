import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auditApi, biometricApi, branchesApi, reportsApi, usersApi } from "@/services/api";
import { BellRing, Building2, CalendarCheck, Fingerprint, Shield, Users } from "lucide-react";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
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

  useEffect(() => {
    Promise.all([
      usersApi.list(),
      branchesApi.list(),
      branchesApi.departments(),
      biometricApi.list(),
      reportsApi.holidays(),
      auditApi.list(),
    ])
      .then(([users, branches, departments, devices, holidays, auditLogs]) => {
        setCounts({
          users: users.length,
          branches: branches.length,
          departments: departments.length,
          devices: devices.length,
          holidays: holidays.length,
          auditLogs: auditLogs.length,
        });
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
