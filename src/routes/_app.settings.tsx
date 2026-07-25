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
  moduleAccessApi,
  integrationClientsApi,
  usersApi,
  type SystemHealth,
} from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
import { indiaDateKeyShift } from "@/lib/india-date";
import {
  ROLE_LABELS,
  type IntegrationClient,
  type IntegrationScope,
  type ModuleKey,
  type Role,
} from "@/types/domain";
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
  Blocks,
  Copy,
  KeyRound,
  Unplug,
} from "lucide-react";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

const MODULE_LABELS: Record<ModuleKey, string> = {
  DASHBOARD: "Dashboard",
  PEOPLE: "People",
  ATTENDANCE: "Attendance",
  TASKS: "Work Planner",
  EMPLOYEE_REQUESTS: "Requests",
  LEAVE: "Leave",
  COMPANY: "Company",
  PROFILE: "Profile",
  COMMUNICATIONS: "Updates",
  SYSTEM: "System",
};

const BACKEND_ROLE_TO_UI: Record<string, Role> = {
  DEVELOPER_ADMIN: "developer_admin",
  MAIN_ADMIN: "main_admin",
  CEO: "ceo",
  HR: "hr",
  MANAGER: "manager",
  EMPLOYEE: "employee",
  SALES: "sales",
  DRIVER: "driver",
  FIELD_STAFF: "field_staff",
};

const INTEGRATION_SCOPE_LABELS: Record<IntegrationScope, string> = {
  "employees:read": "Read employee profiles",
  "employees:write": "Create and update employees",
  "employee-events:read": "Read employee change events",
};

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
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [moduleKeys, setModuleKeys] = useState<ModuleKey[]>([]);
  const [moduleMatrix, setModuleMatrix] = useState<Record<string, ModuleKey[]>>({});
  const [moduleAccessSaving, setModuleAccessSaving] = useState(false);
  const [integrationClients, setIntegrationClients] = useState<IntegrationClient[]>([]);
  const [integrationName, setIntegrationName] = useState("");
  const [integrationExpiry, setIntegrationExpiry] = useState("");
  const [integrationScopes, setIntegrationScopes] = useState<IntegrationScope[]>([
    "employees:read",
  ]);
  const [integrationSaving, setIntegrationSaving] = useState(false);
  const [generatedApiKey, setGeneratedApiKey] = useState("");

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
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshHealth();
    }, 60_000);
    return () => window.clearInterval(intervalId);
  }, [isDeveloperAdmin, refreshHealth]);

  useEffect(() => {
    if (!isDeveloperAdmin) return;
    void moduleAccessApi
      .matrix()
      .then(({ modules, matrix }) => {
        setModuleKeys(modules);
        setModuleMatrix(matrix);
      })
      .catch((err) => toast.error((err as Error).message));
  }, [isDeveloperAdmin]);

  useEffect(() => {
    if (!isDeveloperAdmin) return;
    void integrationClientsApi
      .list()
      .then(setIntegrationClients)
      .catch((err) => toast.error((err as Error).message));
  }, [isDeveloperAdmin]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="System Settings"
        description="Monitor the system and manage protected Developer Admin configuration."
      />
      {loading && <LoadingState label="Loading system settings" />}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {isDeveloperAdmin && (
        <Card>
          <CardHeader className="gap-1 border-b border-border/80 px-4 py-3.5 sm:px-5">
            <div className="flex items-start gap-3">
              <span className="rounded-md bg-primary/10 p-2 text-primary">
                <Blocks className="h-5 w-5" />
              </span>
              <div>
                <CardTitle className="text-base">Module Access</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Control which application modules each role can open. These rules are enforced in
                  both navigation and protected APIs.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 px-4 py-4 sm:px-5">
            <div className="space-y-3 md:hidden">
              {Object.entries(BACKEND_ROLE_TO_UI).map(([backendRole, uiRole]) => {
                const immutable = backendRole === "DEVELOPER_ADMIN";
                return (
                  <div key={backendRole} className="rounded-lg border bg-background p-3">
                    <p className="text-sm font-semibold">{ROLE_LABELS[uiRole]}</p>
                    <div className="mt-3 space-y-2">
                      {moduleKeys.map((module) => {
                        const enabled =
                          immutable || (moduleMatrix[backendRole] ?? []).includes(module);
                        return (
                          <div
                            key={module}
                            className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2"
                          >
                            <span className="min-w-0 text-sm">{MODULE_LABELS[module]}</span>
                            <Switch
                              checked={enabled}
                              disabled={immutable || moduleAccessSaving}
                              aria-label={`${ROLE_LABELS[uiRole]} ${MODULE_LABELS[module]}`}
                              onCheckedChange={(checked) =>
                                setModuleMatrix((current) => ({
                                  ...current,
                                  [backendRole]: checked
                                    ? [...new Set([...(current[backendRole] ?? []), module])]
                                    : (current[backendRole] ?? []).filter(
                                        (item) => item !== module,
                                      ),
                                }))
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto rounded-md border md:block">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-3 font-semibold">Role</th>
                    {moduleKeys.map((module) => (
                      <th key={module} className="px-2 py-3 text-center text-xs font-semibold">
                        {MODULE_LABELS[module]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(BACKEND_ROLE_TO_UI).map(([backendRole, uiRole]) => (
                    <tr key={backendRole} className="border-t">
                      <td className="whitespace-nowrap px-3 py-3 font-medium">
                        {ROLE_LABELS[uiRole]}
                      </td>
                      {moduleKeys.map((module) => {
                        const immutable = backendRole === "DEVELOPER_ADMIN";
                        const enabled =
                          immutable || (moduleMatrix[backendRole] ?? []).includes(module);
                        return (
                          <td key={module} className="px-2 py-3 text-center">
                            <Switch
                              checked={enabled}
                              disabled={immutable || moduleAccessSaving}
                              aria-label={`${ROLE_LABELS[uiRole]} ${MODULE_LABELS[module]}`}
                              onCheckedChange={(checked) =>
                                setModuleMatrix((current) => ({
                                  ...current,
                                  [backendRole]: checked
                                    ? [...new Set([...(current[backendRole] ?? []), module])]
                                    : (current[backendRole] ?? []).filter(
                                        (item) => item !== module,
                                      ),
                                }))
                              }
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                className="w-full sm:w-auto"
                disabled={moduleAccessSaving || moduleKeys.length === 0}
                onClick={() => {
                  setModuleAccessSaving(true);
                  void moduleAccessApi
                    .update(moduleMatrix)
                    .then(({ matrix }) => {
                      setModuleMatrix(matrix);
                      toast.success("Module access updated");
                    })
                    .catch((err) => toast.error((err as Error).message))
                    .finally(() => setModuleAccessSaving(false));
                }}
              >
                {moduleAccessSaving ? "Saving..." : "Save module access"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isDeveloperAdmin && (
        <Card>
          <CardHeader className="gap-1 border-b border-border/80 px-4 py-3.5 sm:px-5">
            <div className="flex items-start gap-3">
              <span className="rounded-md bg-primary/10 p-2 text-primary">
                <KeyRound className="h-5 w-5" />
              </span>
              <div>
                <CardTitle className="text-base">Employee API Access</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create scoped service credentials for trusted applications. The full key is shown
                  only once and is stored in the database as a SHA-256 hash.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 px-4 py-4 sm:px-5">
            {generatedApiKey && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                <p className="font-semibold">Copy this API key now</p>
                <p className="mt-1 text-xs">
                  It cannot be displayed again after this page reloads.
                </p>
                <div className="mt-3 flex gap-2">
                  <Input readOnly value={generatedApiKey} className="font-mono text-xs" />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Copy API key"
                    onClick={() => {
                      void navigator.clipboard.writeText(generatedApiKey);
                      toast.success("API key copied");
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-[1fr_220px_auto] lg:items-end">
              <div className="space-y-2">
                <Label htmlFor="integration-name">Application name</Label>
                <Input
                  id="integration-name"
                  value={integrationName}
                  maxLength={120}
                  placeholder="Payroll production"
                  onChange={(event) => setIntegrationName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="integration-expiry">Expiry date (optional)</Label>
                <Input
                  id="integration-expiry"
                  type="date"
                  min={indiaDateKeyShift(1)}
                  value={integrationExpiry}
                  onChange={(event) => setIntegrationExpiry(event.target.value)}
                />
              </div>
              <Button
                disabled={
                  integrationSaving || !integrationName.trim() || integrationScopes.length === 0
                }
                onClick={() => {
                  setIntegrationSaving(true);
                  void integrationClientsApi
                    .create({
                      name: integrationName.trim(),
                      scopes: integrationScopes,
                      expiresAt: integrationExpiry ? `${integrationExpiry}T23:59:59.999Z` : null,
                    })
                    .then(async (created) => {
                      setGeneratedApiKey(created.apiKey);
                      setIntegrationName("");
                      setIntegrationExpiry("");
                      setIntegrationClients(await integrationClientsApi.list());
                      toast.success("Integration credential created");
                    })
                    .catch((err) => toast.error((err as Error).message))
                    .finally(() => setIntegrationSaving(false));
                }}
              >
                {integrationSaving ? "Creating..." : "Create API key"}
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {(Object.entries(INTEGRATION_SCOPE_LABELS) as [IntegrationScope, string][]).map(
                ([scope, label]) => (
                  <label
                    key={scope}
                    className="flex items-start gap-2 rounded-md border p-3 text-sm"
                  >
                    <Checkbox
                      checked={integrationScopes.includes(scope)}
                      onCheckedChange={(checked) =>
                        setIntegrationScopes((current) =>
                          checked === true
                            ? [...new Set([...current, scope])]
                            : current.filter((item) => item !== scope),
                        )
                      }
                    />
                    <span>
                      <span className="block font-medium">{label}</span>
                      <span className="font-mono text-xs text-muted-foreground">{scope}</span>
                    </span>
                  </label>
                ),
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Issued credentials</p>
              {integrationClients.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  No integration credentials have been created.
                </p>
              ) : (
                integrationClients.map((client) => (
                  <div
                    key={client.clientId}
                    className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{client.name}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                          {client.status}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {client.keyPrefix}… · {client.scopes.join(", ")}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Last used:{" "}
                        {client.lastUsedAt ? new Date(client.lastUsedAt).toLocaleString() : "Never"}
                        {client.expiresAt
                          ? ` · Expires ${new Date(client.expiresAt).toLocaleString()}`
                          : " · No expiry"}
                      </p>
                    </div>
                    {client.status === "ACTIVE" && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          void integrationClientsApi
                            .revoke(client.clientId)
                            .then(() => {
                              setIntegrationClients((current) =>
                                current.map((item) =>
                                  item.clientId === client.clientId
                                    ? {
                                        ...item,
                                        status: "REVOKED",
                                        revokedAt: new Date().toISOString(),
                                      }
                                    : item,
                                ),
                              );
                              toast.success("Integration credential revoked");
                            })
                            .catch((err) => toast.error((err as Error).message));
                        }}
                      >
                        <Unplug className="h-4 w-4" /> Revoke
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {isDeveloperAdmin && (
        <Card
          className={`overflow-hidden ${health?.status === "DEGRADED" || healthError ? "border-destructive/50" : "border-emerald-200 dark:border-emerald-900"}`}
        >
          <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border/80 px-4 py-3.5 sm:px-5">
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
          <CardContent className="space-y-4 px-4 py-4 sm:px-5">
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="User accounts" value={counts.users} icon={Users} />
        <StatCard label="Branches" value={counts.branches} icon={Building2} />
        <StatCard label="Departments" value={counts.departments} icon={Shield} />
        <StatCard label="Biometric devices" value={counts.devices} icon={Fingerprint} />
        <StatCard label="Holidays" value={counts.holidays} icon={CalendarCheck} />
        <StatCard label="Audit logs" value={counts.auditLogs} icon={BellRing} />
      </div>

      <Card>
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
        <Card className="border-destructive/40">
          <CardHeader className="gap-1 border-b border-destructive/20 px-4 py-3.5 sm:px-5">
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
          <CardContent className="space-y-4 px-4 py-4 sm:px-5">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="font-semibold">Preserved</p>
                <p className="mt-1 text-muted-foreground">
                  Your current Developer Admin login and password, branches, departments,
                  organization hierarchy, leave policies, and system settings.
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
                    Admin account, branches, departments, leave policies, and system settings will
                    remain.
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
