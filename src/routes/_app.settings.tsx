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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/common/PasswordInput";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
  Trash2,
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
  const [brandProof, setBrandProof] = useState({
    litresDelivered: "10M+",
    happyClients: "5,000+",
    appRating: "4.8 / 5",
    certification: "PESO & OMC",
  });
  const [brandProofLoading, setBrandProofLoading] = useState(isDeveloperAdmin);
  const [brandProofSaving, setBrandProofSaving] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetting, setResetting] = useState(false);

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
    void systemApi
      .brandProof()
      .then(setBrandProof)
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setBrandProofLoading(false));
    const intervalId = window.setInterval(() => void refreshHealth(), 30_000);
    return () => window.clearInterval(intervalId);
  }, [isDeveloperAdmin, refreshHealth]);

  return (
    <div>
      <PageHeader
        title="System Settings"
        description="Monitor the system and manage protected Developer Admin configuration."
      />
      {loading && <LoadingState label="Loading system settings" />}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {isDeveloperAdmin && (
        <Card className="mb-6">
          <CardHeader className="border-b p-4 sm:p-5">
            <CardTitle className="text-base">Startup Screen Details</CardTitle>
            <p className="text-sm text-muted-foreground">
              Update the company proof values shown while the application starts.
            </p>
          </CardHeader>
          <CardContent className="p-4 sm:p-5">
            {brandProofLoading ? (
              <LoadingState compact label="Loading startup details" />
            ) : (
              <form
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setBrandProofSaving(true);
                  try {
                    const saved = await systemApi.updateBrandProof(brandProof);
                    setBrandProof(saved);
                    toast.success("Startup details updated");
                  } catch (err) {
                    toast.error((err as Error).message);
                  } finally {
                    setBrandProofSaving(false);
                  }
                }}
              >
                <BrandProofInput
                  label="Litres delivered"
                  field="litresDelivered"
                  value={brandProof}
                  onChange={setBrandProof}
                />
                <BrandProofInput
                  label="Happy clients"
                  field="happyClients"
                  value={brandProof}
                  onChange={setBrandProof}
                />
                <BrandProofInput
                  label="App rating"
                  field="appRating"
                  value={brandProof}
                  onChange={setBrandProof}
                />
                <BrandProofInput
                  label="Certification"
                  field="certification"
                  value={brandProof}
                  onChange={setBrandProof}
                />
                <div className="sm:col-span-2 lg:col-span-4">
                  <Button type="submit" disabled={brandProofSaving}>
                    {brandProofSaving ? "Saving..." : "Save startup details"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}

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

      {isDeveloperAdmin && (
        <Card className="mt-6 border-destructive/40">
          <CardHeader className="border-b border-destructive/20 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-destructive/10 p-2 text-destructive">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base text-destructive">Production Data Reset</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Permanently remove testing data before creating the real company accounts.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-5">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="font-semibold">Preserved</p>
                <p className="mt-1 text-muted-foreground">
                  Your current Developer Admin login and password, branches, departments,
                  organization hierarchy, and system settings.
                </p>
              </div>
              <div className="rounded-md border border-destructive/25 bg-destructive/5 p-3">
                <p className="font-semibold text-destructive">Permanently deleted</p>
                <p className="mt-1 text-muted-foreground">
                  Other logins, employees, attendance, leave, tasks, assets, announcements,
                  notifications, devices, holidays, requests, subscriptions, and audit history.
                </p>
              </div>
            </div>
            <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="mt-4 w-full sm:w-auto">
                  <Trash2 className="h-4 w-4" />
                  Delete all testing data
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete all testing data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This cannot be undone. Take a database backup first. Your current Developer
                    Admin account, branches, departments, and system settings will remain.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-4 text-left">
                  <div className="space-y-2">
                    <Label htmlFor="reset-confirmation">
                      Type <span className="font-mono font-semibold">DELETE ALL TEST DATA</span>
                    </Label>
                    <Input
                      id="reset-confirmation"
                      autoComplete="off"
                      value={resetConfirmation}
                      onChange={(event) => setResetConfirmation(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reset-password">Developer Admin password</Label>
                    <PasswordInput
                      id="reset-password"
                      autoComplete="current-password"
                      value={resetPassword}
                      onChange={(event) => setResetPassword(event.target.value)}
                    />
                  </div>
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={
                      resetting || resetConfirmation !== "DELETE ALL TEST DATA" || !resetPassword
                    }
                    onClick={(event) => {
                      event.preventDefault();
                      setResetting(true);
                      void systemApi
                        .resetTestData({
                          confirmation: resetConfirmation,
                          password: resetPassword,
                        })
                        .then((result) => {
                          setCounts((current) => ({
                            ...current,
                            users: 1,
                            devices: 0,
                            holidays: 0,
                            auditLogs: 0,
                          }));
                          setResetOpen(false);
                          setResetConfirmation("");
                          setResetPassword("");
                          toast.success(
                            `Testing data removed: ${result.deletedUsers} logins and ${result.deletedEmployees} employees`,
                          );
                        })
                        .catch((err) => toast.error((err as Error).message))
                        .finally(() => setResetting(false));
                    }}
                  >
                    {resetting ? "Deleting..." : "Permanently delete testing data"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BrandProofInput({
  label,
  field,
  value,
  onChange,
}: {
  label: string;
  field: keyof typeof value;
  value: {
    litresDelivered: string;
    happyClients: string;
    appRating: string;
    certification: string;
  };
  onChange: React.Dispatch<React.SetStateAction<typeof value>>;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`brand-${field}`}>{label}</Label>
      <Input
        id={`brand-${field}`}
        value={value[field]}
        maxLength={field === "certification" ? 50 : 30}
        required
        onChange={(event) => onChange((current) => ({ ...current, [field]: event.target.value }))}
      />
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
