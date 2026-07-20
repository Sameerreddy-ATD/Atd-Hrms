import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { StatCard } from "@/components/common/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  auditApi,
  biometricApi,
  branchesApi,
  reportsApi,
  systemApi,
  usersApi,
  type SystemHealth,
} from "@/services/api";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import {
  Activity,
  AlertTriangle,
  BellRing,
  Building2,
  CalendarCheck,
  Clock3,
  Database,
  Fingerprint,
  MemoryStick,
  RefreshCw,
  Shield,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const isDeveloperAdmin = user?.role === "developer_admin";
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
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState("");
  const previousHealth = useRef<SystemHealth["status"] | null>(null);

  const refreshHealth = useCallback(async () => {
    setHealthError("");
    try {
      const next = await systemApi.health();
      setHealth(next);
      if (next.status === "DEGRADED" && previousHealth.current !== "DEGRADED") {
        toast.error("System health is degraded. Review the uptime panel.");
      }
      if (next.status === "HEALTHY" && previousHealth.current === "DEGRADED") {
        toast.success("System health has recovered");
      }
      previousHealth.current = next.status;
    } catch (err) {
      setHealthError((err as Error).message);
      if (previousHealth.current !== "DEGRADED") {
        toast.error("Unable to complete the system health check");
      }
      previousHealth.current = "DEGRADED";
    } finally {
      setHealthLoading(false);
    }
  }, []);

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

  useEffect(() => {
    if (!isDeveloperAdmin) return;
    void refreshHealth();
    const intervalId = window.setInterval(() => void refreshHealth(), 30_000);
    return () => window.clearInterval(intervalId);
  }, [isDeveloperAdmin, refreshHealth]);

  return (
    <div>
      <PageHeader
        title="System Settings"
        description="Read-only operational configuration currently active in the backend."
      />
      {loading && <LoadingState label="Loading system settings" />}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {isDeveloperAdmin && (
        <Card
          className={`mb-6 overflow-hidden ${health?.status === "DEGRADED" || healthError ? "border-destructive/50" : "border-emerald-200 dark:border-emerald-900"}`}
        >
          <CardHeader className="flex flex-row items-start justify-between gap-3 border-b p-4 sm:p-5">
            <div className="flex min-w-0 items-start gap-3">
              <div
                className={`rounded-md p-2 ${health?.status === "DEGRADED" || healthError ? "bg-destructive/10 text-destructive" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"}`}
              >
                {health?.status === "DEGRADED" || healthError ? (
                  <AlertTriangle className="h-5 w-5" />
                ) : (
                  <Activity className="h-5 w-5" />
                )}
              </div>
              <div>
                <CardTitle className="text-base">System Uptime</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Live backend and database health, refreshed every 30 seconds.
                </p>
              </div>
            </div>
            <Button
              size="icon"
              variant="outline"
              disabled={healthLoading}
              aria-label="Refresh system health"
              onClick={() => {
                setHealthLoading(true);
                void refreshHealth();
              }}
              title="Refresh health check"
            >
              <RefreshCw className={`h-4 w-4 ${healthLoading ? "animate-spin" : ""}`} />
            </Button>
          </CardHeader>
          <CardContent className="p-4 sm:p-5">
            {healthError && (
              <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                Health check failed: {healthError}
              </div>
            )}
            {health && (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-semibold ${health.status === "HEALTHY" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" : "bg-destructive/10 text-destructive"}`}
                  >
                    {health.status === "HEALTHY" ? "All systems operational" : "Attention required"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Checked {new Date(health.checkedAt).toLocaleString()}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <HealthMetric
                    icon={Clock3}
                    label="Backend uptime"
                    value={formatUptime(health.uptimeSeconds)}
                    detail={`Started ${new Date(health.backendStartedAt).toLocaleString()}`}
                  />
                  <HealthMetric
                    icon={Database}
                    label="Database"
                    value={health.database.reachable ? "Connected" : "Unavailable"}
                    detail={`${health.database.latencyMs} ms response`}
                    warning={!health.database.reachable || health.database.latencyMs > 1500}
                  />
                  <HealthMetric
                    icon={MemoryStick}
                    label="Host memory"
                    value={`${health.memory.usedPercent}% used`}
                    detail={`Backend process ${health.memory.processRssMb} MB`}
                    warning={health.memory.usedPercent > 92}
                  />
                  <HealthMetric
                    icon={Activity}
                    label="System load"
                    value={String(health.loadAverage)}
                    detail={`Node.js ${health.nodeVersion}`}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

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

function formatUptime(totalSeconds: number) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m`;
}

function HealthMetric({
  icon: Icon,
  label,
  value,
  detail,
  warning = false,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  detail: string;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-3 ${warning ? "border-destructive/30 bg-destructive/5" : "bg-muted/20"}`}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <p className={`mt-2 font-semibold ${warning ? "text-destructive" : ""}`}>{value}</p>
      <p className="mt-1 break-words text-xs text-muted-foreground">{detail}</p>
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
