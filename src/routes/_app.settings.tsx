import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
  profileSelfEditApi,
  profileVerificationPolicyApi,
  profileApi,
  type SystemHealth,
} from "@/services/api";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { PasswordInput } from "@/components/common/PasswordInput";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { formatDisplayDateTime, indiaDateKeyShift } from "@/lib/india-date";
import {
  ROLE_LABELS,
  type IntegrationClient,
  type IntegrationScope,
  type ModuleKey,
  type ProfileSelfEditFieldKey,
  type ProfileSelfEditPolicy,
  type ProfileVerificationPolicy,
  type Role,
} from "@/types/domain";
import {
  Activity,
  AlertTriangle,
  BellRing,
  Building2,
  CalendarCheck,
  Clock3,
  CloudUpload,
  Database,
  Fingerprint,
  MemoryStick,
  RefreshCw,
  Settings2,
  Shield,
  Trash2,
  Users,
  BadgeCheck,
  Blocks,
  Copy,
  KeyRound,
  Unplug,
  UserCog,
} from "lucide-react";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

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
  const { t } = useTranslation();
  const { user } = useAuth();
  const moduleLabel = (module: ModuleKey) => t(`pages.settings.moduleLabels.${module}`);
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
  const [moduleDefaults, setModuleDefaults] = useState<Record<string, ModuleKey[]>>({});
  const [moduleAccessSaving, setModuleAccessSaving] = useState(false);
  const [integrationClients, setIntegrationClients] = useState<IntegrationClient[]>([]);
  const [integrationName, setIntegrationName] = useState("");
  const [integrationExpiry, setIntegrationExpiry] = useState("");
  const [integrationScopes, setIntegrationScopes] = useState<IntegrationScope[]>([
    "employees:read",
  ]);
  const [integrationSaving, setIntegrationSaving] = useState(false);
  const [generatedApiKey, setGeneratedApiKey] = useState("");
  const [supportEnabled, setSupportEnabled] = useState(false);
  const [supportUpdatedAt, setSupportUpdatedAt] = useState<string | null>(null);
  const [supportExpiresAt, setSupportExpiresAt] = useState<string | null>(null);
  const [supportPassword, setSupportPassword] = useState("");
  const [supportPasswordConfirm, setSupportPasswordConfirm] = useState("");
  const [supportTtlHours, setSupportTtlHours] = useState(4);
  const [supportSaving, setSupportSaving] = useState(false);
  const [supportLoading, setSupportLoading] = useState(false);
  const [profileSelfEdit, setProfileSelfEdit] = useState<ProfileSelfEditPolicy | null>(null);
  const [profileSelfEditLoading, setProfileSelfEditLoading] = useState(false);
  const [profileSelfEditSaving, setProfileSelfEditSaving] = useState(false);
  const [profileFieldDialogOpen, setProfileFieldDialogOpen] = useState(false);
  const [draftAllowedFields, setDraftAllowedFields] = useState<ProfileSelfEditFieldKey[]>([]);
  const [enableAfterFieldSave, setEnableAfterFieldSave] = useState(false);
  const [profileVerification, setProfileVerification] = useState<ProfileVerificationPolicy | null>(
    null,
  );
  const [profileVerificationLoading, setProfileVerificationLoading] = useState(false);
  const [profileVerificationSaving, setProfileVerificationSaving] = useState(false);
  const [resettingVerification, setResettingVerification] = useState(false);

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
      // Only Developer Admin may list logins; other admins still get the rest of the counts.
      isDeveloperAdmin ? usersApi.list() : Promise.resolve([]),
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
  }, [isDeveloperAdmin]);

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
      .then(({ modules, matrix, defaults }) => {
        setModuleKeys(modules);
        setModuleMatrix(matrix);
        setModuleDefaults(defaults ?? {});
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

  useEffect(() => {
    if (!isDeveloperAdmin) return;
    setSupportLoading(true);
    void systemApi
      .supportPasswordStatus()
      .then((status) => {
        setSupportEnabled(status.enabled);
        setSupportUpdatedAt(status.updatedAt);
        setSupportExpiresAt(status.expiresAt);
      })
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setSupportLoading(false));
  }, [isDeveloperAdmin]);

  useEffect(() => {
    if (!isDeveloperAdmin) return;
    setProfileSelfEditLoading(true);
    void profileSelfEditApi
      .get()
      .then((policy) => {
        setProfileSelfEdit(policy);
        setDraftAllowedFields(policy.allowedFields);
      })
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setProfileSelfEditLoading(false));
  }, [isDeveloperAdmin]);

  useEffect(() => {
    if (!isDeveloperAdmin) return;
    setProfileVerificationLoading(true);
    void profileVerificationPolicyApi
      .get()
      .then(setProfileVerification)
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setProfileVerificationLoading(false));
  }, [isDeveloperAdmin]);

  async function saveProfileSelfEditPolicy(next: {
    enabled: boolean;
    allowedFields: ProfileSelfEditFieldKey[];
  }) {
    setProfileSelfEditSaving(true);
    try {
      const policy = await profileSelfEditApi.update(next);
      setProfileSelfEdit(policy);
      setDraftAllowedFields(policy.allowedFields);
      toast.success(
        policy.enabled
          ? "Employees can edit the selected profile fields"
          : "Employee profile editing is turned off",
      );
      return policy;
    } catch (err) {
      toast.error((err as Error).message);
      return null;
    } finally {
      setProfileSelfEditSaving(false);
    }
  }

  async function saveProfileVerificationPolicy(next: {
    enabled: boolean;
    targetRoles: string[];
  }) {
    setProfileVerificationSaving(true);
    try {
      const policy = await profileVerificationPolicyApi.update(next);
      setProfileVerification(policy);
      toast.success(
        policy.enabled
          ? t("pages.profileVerification.policyEnabledToast", {
              count: policy.targetRoles.length,
            })
          : t("pages.profileVerification.policyDisabledToast"),
      );
      return policy;
    } catch (err) {
      toast.error((err as Error).message);
      return null;
    } finally {
      setProfileVerificationSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("pages.settings.title")}
        description={t("pages.settings.subtitle")}
      />
      {loading && <LoadingState label={t("pages.loading.settings")} />}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {isDeveloperAdmin && (
        <Card>
          <CardHeader className="gap-1 border-b border-border/80 px-4 py-3.5 sm:px-5">
            <div className="flex items-start gap-3">
              <span className="rounded-md bg-primary/10 p-2 text-primary">
                <Blocks className="h-5 w-5" />
              </span>
              <div>
                <CardTitle className="text-base">{t("pages.settings.moduleAccess")}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("pages.settings.moduleAccessHelp")}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={moduleAccessSaving || Object.keys(moduleDefaults).length === 0}
                onClick={() => setModuleMatrix({ ...moduleDefaults })}
              >
                {t("pages.settings.resetDefaults")}
              </Button>
            </div>
            <div className="space-y-3 md:hidden">
              {Object.entries(BACKEND_ROLE_TO_UI).map(([backendRole, uiRole]) => {
                const immutable = backendRole === "DEVELOPER_ADMIN";
                return (
                  <div key={backendRole} className="rounded-lg border bg-background p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{ROLE_LABELS[uiRole]}</p>
                      {!immutable && (
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={moduleAccessSaving}
                            onClick={() =>
                              setModuleMatrix((current) => ({
                                ...current,
                                [backendRole]: [...moduleKeys],
                              }))
                            }
                          >
                            {t("pages.settings.all")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={moduleAccessSaving}
                            onClick={() =>
                              setModuleMatrix((current) => ({
                                ...current,
                                [backendRole]: ["DASHBOARD", "PROFILE"],
                              }))
                            }
                          >
                            {t("pages.settings.minimal")}
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 space-y-2">
                      {moduleKeys.map((module) => {
                        const enabled =
                          immutable || (moduleMatrix[backendRole] ?? []).includes(module);
                        return (
                          <div
                            key={module}
                            className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2"
                          >
                            <span className="min-w-0 text-sm">{moduleLabel(module)}</span>
                            <Switch
                              checked={enabled}
                              disabled={immutable || moduleAccessSaving}
                              aria-label={`${ROLE_LABELS[uiRole]} ${moduleLabel(module)}`}
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
                    <th className="px-3 py-3 font-semibold">{t("pages.settings.role")}</th>
                    {moduleKeys.map((module) => (
                      <th key={module} className="px-2 py-3 text-center text-xs font-semibold">
                        {moduleLabel(module)}
                      </th>
                    ))}
                    <th className="px-2 py-3 text-center text-xs font-semibold">
                      {t("pages.settings.quick")}
                    </th>
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
                              aria-label={`${ROLE_LABELS[uiRole]} ${moduleLabel(module)}`}
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
                      <td className="px-2 py-3 text-center">
                        {backendRole === "DEVELOPER_ADMIN" ? (
                          <span className="text-xs text-muted-foreground">{t("pages.settings.locked")}</span>
                        ) : (
                          <div className="flex justify-center gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              disabled={moduleAccessSaving}
                              onClick={() =>
                                setModuleMatrix((current) => ({
                                  ...current,
                                  [backendRole]: [...moduleKeys],
                                }))
                              }
                            >
                              {t("pages.settings.all")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              disabled={moduleAccessSaving}
                              onClick={() =>
                                setModuleMatrix((current) => ({
                                  ...current,
                                  [backendRole]: ["DASHBOARD", "PROFILE"],
                                }))
                              }
                            >
                              {t("pages.settings.min")}
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                disabled={moduleAccessSaving || Object.keys(moduleDefaults).length === 0}
                onClick={() => setModuleMatrix({ ...moduleDefaults })}
              >
                {t("pages.settings.resetDefaults")}
              </Button>
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
                {moduleAccessSaving ? t("pages.settings.saving") : t("pages.settings.saveModules")}
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
                <UserCog className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-base">Employee profile editing</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  When enabled, employees can update only the fields you select. Employment, role,
                  email, and organization fields stay admin-controlled. Changes are audited.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Allow employees to edit profile details</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {profileSelfEditLoading
                    ? "Loading policy…"
                    : profileSelfEdit?.enabled
                      ? `On · ${profileSelfEdit.allowedFields.length} field${
                          profileSelfEdit.allowedFields.length === 1 ? "" : "s"
                        } allowed`
                      : "Off · profiles stay view-only for employees"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={Boolean(profileSelfEdit?.enabled)}
                  disabled={profileSelfEditLoading || profileSelfEditSaving || !profileSelfEdit}
                  aria-label="Allow employees to edit profile details"
                  onCheckedChange={(checked) => {
                    if (!profileSelfEdit) return;
                    if (checked && profileSelfEdit.allowedFields.length === 0) {
                      setDraftAllowedFields(profileSelfEdit.allowedFields);
                      setEnableAfterFieldSave(true);
                      setProfileFieldDialogOpen(true);
                      toast.message("Choose which fields employees may edit");
                      return;
                    }
                    void saveProfileSelfEditPolicy({
                      enabled: checked,
                      allowedFields: profileSelfEdit.allowedFields,
                    });
                  }}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="size-9 shrink-0"
                  disabled={profileSelfEditLoading || profileSelfEditSaving || !profileSelfEdit}
                  aria-label={t("pages.settings.chooseFields")}
                  title={t("pages.settings.chooseFields")}
                  onClick={() => {
                    if (!profileSelfEdit) return;
                    setDraftAllowedFields(profileSelfEdit.allowedFields);
                    setEnableAfterFieldSave(false);
                    setProfileFieldDialogOpen(true);
                  }}
                >
                  <Settings2 className="size-4" />
                </Button>
              </div>
            </div>
            {profileSelfEdit && profileSelfEdit.allowedFields.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {profileSelfEdit.availableFields
                  .filter((field) => profileSelfEdit.allowedFields.includes(field.key))
                  .map((field) => (
                    <span
                      key={field.key}
                      className="rounded-md border border-border/70 bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                    >
                      {field.label}
                    </span>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog
        open={profileFieldDialogOpen}
        onOpenChange={(open) => {
          if (profileSelfEditSaving) return;
          setProfileFieldDialogOpen(open);
          if (!open) setEnableAfterFieldSave(false);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editable profile fields</DialogTitle>
            <DialogDescription>
              Employees can change only the checked fields on My Profile when editing is enabled.
              Email, role, department, and other employment fields are never self-editable.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {["Identity and contact", "Banking", "Statutory", "Emergency"].map((group) => {
              const fields =
                profileSelfEdit?.availableFields.filter((field) => field.group === group) ?? [];
              if (fields.length === 0) return null;
              return (
                <div key={group} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group}
                  </p>
                  <div className="space-y-2 rounded-md border border-border/70 p-2">
                    {fields.map((field) => {
                      const checked = draftAllowedFields.includes(field.key);
                      return (
                        <label
                          key={field.key}
                          className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/40"
                        >
                          <Checkbox
                            checked={checked}
                            disabled={profileSelfEditSaving}
                            onCheckedChange={(next) => {
                              setDraftAllowedFields((current) =>
                                next === true
                                  ? [...new Set([...current, field.key])]
                                  : current.filter((item) => item !== field.key),
                              );
                            }}
                          />
                          <span className="text-sm">{field.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={profileSelfEditSaving}
              onClick={() => {
                setProfileFieldDialogOpen(false);
                setEnableAfterFieldSave(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={profileSelfEditSaving || !profileSelfEdit}
              onClick={() => {
                if (!profileSelfEdit) return;
                if (
                  draftAllowedFields.length === 0 &&
                  (enableAfterFieldSave || profileSelfEdit.enabled)
                ) {
                  toast.error("Select at least one field");
                  return;
                }
                void saveProfileSelfEditPolicy({
                  enabled: enableAfterFieldSave ? true : profileSelfEdit.enabled,
                  allowedFields: draftAllowedFields,
                }).then((policy) => {
                  if (policy) {
                    setProfileFieldDialogOpen(false);
                    setEnableAfterFieldSave(false);
                  }
                });
              }}
            >
              {profileSelfEditSaving ? "Saving…" : "Save fields"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isDeveloperAdmin && (
        <Card>
          <CardHeader className="gap-1 border-b border-border/80 px-4 py-3.5 sm:px-5">
            <div className="flex items-start gap-3">
              <span className="rounded-md bg-primary/10 p-2 text-primary">
                <KeyRound className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">Support access</CardTitle>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      supportEnabled
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {supportLoading ? "…" : supportEnabled ? "Enabled" : "Not set"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Time-limited break-glass password for non–Developer Admin accounts (1–24 hours).
                  It signs you in without changing that person’s own password, and every use is
                  audited. Clear it when done.
                </p>
                {supportEnabled && supportUpdatedAt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Last updated {formatDisplayDateTime(supportUpdatedAt)}
                    {supportExpiresAt
                      ? ` · expires ${formatDisplayDateTime(supportExpiresAt)}`
                      : ""}
                  </p>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 px-4 py-4 sm:px-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="support-password">
                  {supportEnabled ? "New support password" : "Support password"}
                </Label>
                <PasswordInput
                  id="support-password"
                  value={supportPassword}
                  onChange={(event) => setSupportPassword(event.target.value)}
                  autoComplete="new-password"
                  disabled={supportSaving}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="support-password-confirm">Confirm password</Label>
                <PasswordInput
                  id="support-password-confirm"
                  value={supportPasswordConfirm}
                  onChange={(event) => setSupportPasswordConfirm(event.target.value)}
                  autoComplete="new-password"
                  disabled={supportSaving}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="support-ttl">Expires after</Label>
                <select
                  id="support-ttl"
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm sm:h-9"
                  value={supportTtlHours}
                  onChange={(event) => setSupportTtlHours(Number(event.target.value))}
                  disabled={supportSaving}
                >
                  <option value={1}>1 hour</option>
                  <option value={4}>4 hours (recommended)</option>
                  <option value={8}>8 hours</option>
                  <option value={12}>12 hours</option>
                  <option value={24}>24 hours (maximum)</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              At least 10 characters with an uppercase letter and a number. Legacy unlimited support
              passwords are rejected until you set a new one with an expiry.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              {supportEnabled && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto"
                      disabled={supportSaving}
                    >
                      Clear support password
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear support password?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Accounts will only accept each user’s own password until you set a new
                        support password.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          setSupportSaving(true);
                          void systemApi
                            .setSupportPassword(null)
                            .then((status) => {
                              setSupportEnabled(status.enabled);
                              setSupportUpdatedAt(status.updatedAt);
                              setSupportExpiresAt(status.expiresAt);
                              setSupportPassword("");
                              setSupportPasswordConfirm("");
                              toast.success("Support password cleared");
                            })
                            .catch((err) => toast.error((err as Error).message))
                            .finally(() => setSupportSaving(false));
                        }}
                      >
                        Clear
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <Button
                type="button"
                className="w-full sm:w-auto"
                disabled={supportSaving || !supportPassword}
                onClick={() => {
                  if (supportPassword !== supportPasswordConfirm) {
                    toast.error("Passwords do not match");
                    return;
                  }
                  if (
                    supportPassword.length < 10 ||
                    !/[A-Z]/.test(supportPassword) ||
                    !/[0-9]/.test(supportPassword)
                  ) {
                    toast.error(
                      "Password must be at least 10 characters with an uppercase letter and a number",
                    );
                    return;
                  }
                  setSupportSaving(true);
                  void systemApi
                    .setSupportPassword(supportPassword, supportTtlHours)
                    .then((status) => {
                      setSupportEnabled(status.enabled);
                      setSupportUpdatedAt(status.updatedAt);
                      setSupportExpiresAt(status.expiresAt);
                      setSupportPassword("");
                      setSupportPasswordConfirm("");
                      toast.success(
                        status.enabled
                          ? `Support password saved (expires ${status.expiresAt ? formatDisplayDateTime(status.expiresAt) : "soon"})`
                          : "Support password cleared",
                      );
                    })
                    .catch((err) => toast.error((err as Error).message))
                    .finally(() => setSupportSaving(false));
                }}
              >
                {supportSaving ? "Saving…" : supportEnabled ? "Update password" : "Set password"}
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
                  <Input
                    readOnly
                    value={generatedApiKey}
                    className="font-mono text-base sm:text-xs"
                  />
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
                <DateField
                  id="integration-expiry"
                  min={indiaDateKeyShift(1)}
                  value={integrationExpiry}
                  onChange={setIntegrationExpiry}
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
                        {client.lastUsedAt ? formatDisplayDateTime(client.lastUsedAt) : "Never"}
                        {client.expiresAt
                          ? ` · Expires ${formatDisplayDateTime(client.expiresAt)}`
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
              title={t("pages.settings.refreshHealth")}
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
                    Checked {formatDisplayDateTime(health.checkedAt)}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  <HealthMetric
                    icon={Clock3}
                    label="Backend uptime"
                    value={formatUptime(health.uptimeSeconds)}
                    detail={`Started ${formatDisplayDateTime(health.backendStartedAt)}`}
                  />
                  <HealthMetric
                    icon={Database}
                    label="Database"
                    value={health.database.reachable ? "Connected" : "Unavailable"}
                    detail={`${health.database.latencyMs} ms response`}
                    warning={!health.database.reachable || health.database.latencyMs > 1500}
                  />
                  <HealthMetric
                    icon={CloudUpload}
                    label="Drive backup"
                    value={
                      health.backup?.finishedAt
                        ? formatDisplayDateTime(health.backup.finishedAt)
                        : "Never"
                    }
                    detail={
                      health.backup?.fileName
                        ? `Last pushed · ${health.backup.fileName}`
                        : "Google Drive daily dump"
                    }
                    warning={!health.backup?.available || health.backup.stale}
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
        <StatCard label="Work Locations" value={counts.branches} icon={Building2} />
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
        <Card>
          <CardHeader className="gap-1 border-b border-border/80 px-4 py-3.5 sm:px-5">
            <div className="flex items-start gap-3">
              <span className="rounded-md bg-primary/10 p-2 text-primary">
                <BadgeCheck className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-base">
                  {t("pages.profileVerification.policyTitle")}
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("pages.profileVerification.policyHelp")}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{t("pages.profileVerification.policyToggle")}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {profileVerificationLoading
                    ? t("pages.profileVerification.policyLoading")
                    : profileVerification?.enabled
                      ? t("pages.profileVerification.policyOn", {
                          count: profileVerification.targetRoles.length,
                        })
                      : t("pages.profileVerification.policyOff")}
                </p>
              </div>
              <Switch
                checked={Boolean(profileVerification?.enabled)}
                disabled={
                  profileVerificationLoading ||
                  profileVerificationSaving ||
                  !profileVerification
                }
                aria-label={t("pages.profileVerification.policyToggle")}
                onCheckedChange={(checked) => {
                  if (!profileVerification) return;
                  if (checked && profileVerification.targetRoles.length === 0) {
                    toast.message(t("pages.profileVerification.policySelectRolesFirst"));
                    return;
                  }
                  void saveProfileVerificationPolicy({
                    enabled: checked,
                    targetRoles: profileVerification.targetRoles,
                  });
                }}
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">{t("pages.profileVerification.policyWho")}</p>
              <p className="text-xs text-muted-foreground">
                {t("pages.profileVerification.policyWhoHelp")}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(profileVerification?.availableRoles ?? []).map((role) => {
                  const checked = Boolean(profileVerification?.targetRoles.includes(role.key));
                  return (
                    <label
                      key={role.key}
                      className="flex items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm"
                    >
                      <Checkbox
                        checked={checked}
                        disabled={
                          profileVerificationLoading ||
                          profileVerificationSaving ||
                          !profileVerification
                        }
                        onCheckedChange={(next) => {
                          if (!profileVerification) return;
                          const targetRoles =
                            next === true
                              ? [...profileVerification.targetRoles, role.key]
                              : profileVerification.targetRoles.filter((key) => key !== role.key);
                          void saveProfileVerificationPolicy({
                            enabled:
                              profileVerification.enabled && targetRoles.length > 0
                                ? profileVerification.enabled
                                : false,
                            targetRoles,
                          });
                        }}
                      />
                      <span>{role.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-dashed border-border/80 p-3">
              <p className="text-xs text-muted-foreground">
                {t("pages.profileCorrections.resetVerificationHelp")}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                disabled={resettingVerification}
                onClick={() => {
                  if (!window.confirm(t("pages.profileCorrections.resetConfirm"))) return;
                  setResettingVerification(true);
                  void profileApi
                    .resetVerification()
                    .then((result) =>
                      toast.success(
                        t("pages.profileCorrections.resetSuccess", { count: result.count }),
                      ),
                    )
                    .catch((err) => toast.error((err as Error).message))
                    .finally(() => setResettingVerification(false));
                }}
              >
                <RefreshCw className="h-4 w-4" />
                {t("pages.profileCorrections.resetVerification")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
