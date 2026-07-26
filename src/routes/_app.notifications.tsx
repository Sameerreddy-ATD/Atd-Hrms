import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { notificationsApi, notificationPreferencesApi } from "@/services/api";
import type { NotificationItem } from "@/types/domain";
import {
  clearNotifications,
  disableDesktopAlerts,
  enableDesktopAlerts,
  filterVisibleNotifications,
  getDesktopAlertStatus,
  syncDesktopAlertsWithPermission,
  NOTIFICATION_COUNT_CHANGED_EVENT,
} from "@/lib/browser-notifications";
import {
  detectPwaPlatform,
  installInstructionCopy,
  isAppInstalled,
  clearAppBadgeSafe,
} from "@/lib/pwa-install";
import {
  Bell,
  BellOff,
  CalendarCheck,
  ClipboardCheck,
  Cake,
  Download,
  Trash2,
  Megaphone,
  Smartphone,
  ShieldAlert,
  CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/_app/notifications")({
  component: NotificationsPage,
});

function NotificationPreferencesCard() {
  const [digestMode, setDigestMode] = useState("immediate");
  const [categories, setCategories] = useState<Record<string, boolean>>({
    leave: true,
    tasks: true,
    claims: true,
    checklists: true,
    corrections: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void notificationPreferencesApi
      .get()
      .then((pref) => {
        setDigestMode(pref.digestMode === "off" ? "off" : "immediate");
        if (pref.categories && typeof pref.categories === "object") {
          setCategories((current) => ({ ...current, ...pref.categories }));
        }
      })
      .catch(() => undefined);
  }, []);

  return (
    <Card className="mb-4 border-border/80 shadow-none">
      <CardContent className="space-y-3 p-4">
        <h2 className="text-sm font-semibold">Digest preferences</h2>
        <p className="text-xs text-muted-foreground">
          In-app alerts only — email digests are not enabled. Choose off or immediate notifications.
          Push still only sends for urgent/important announcements.
        </p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: "off", label: "Off" },
              { id: "immediate", label: "Immediate" },
            ] as const
          ).map((mode) => (
            <Button
              key={mode.id}
              size="sm"
              variant={digestMode === mode.id ? "default" : "outline"}
              onClick={() => setDigestMode(mode.id)}
            >
              {mode.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          {Object.entries(categories).map(([key, enabled]) => (
            <label key={key} className="flex items-center gap-2 capitalize">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) =>
                  setCategories((current) => ({ ...current, [key]: event.target.checked }))
                }
              />
              {key}
            </label>
          ))}
        </div>
        <Button
          size="sm"
          disabled={saving}
          onClick={() => {
            setSaving(true);
            void notificationPreferencesApi
              .save({ digestMode, categories })
              .then(() => toast.success("Preferences saved"))
              .catch((error) => toast.error((error as Error).message))
              .finally(() => setSaving(false));
          }}
        >
          Save preferences
        </Button>
      </CardContent>
    </Card>
  );
}

function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [alertStatus, setAlertStatus] = useState(getDesktopAlertStatus);
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const platform = detectPwaPlatform();
  const installCopy = installInstructionCopy(platform);
  const installed = isAppInstalled();

  const loadNotifications = useCallback(() => {
    return notificationsApi.list().then((data) => setItems(filterVisibleNotifications(data)));
  }, []);

  const refreshAlertStatus = useCallback(() => {
    syncDesktopAlertsWithPermission();
    setAlertStatus(getDesktopAlertStatus());
  }, []);

  useEffect(() => {
    void clearAppBadgeSafe();
    refreshAlertStatus();

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refreshAlertStatus();
        void clearAppBadgeSafe();
      }
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("focus", refreshAlertStatus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    loadNotifications()
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("focus", refreshAlertStatus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadNotifications, refreshAlertStatus]);

  useEffect(() => {
    const refresh = () => {
      void loadNotifications();
    };
    window.addEventListener(NOTIFICATION_COUNT_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(NOTIFICATION_COUNT_CHANGED_EVENT, refresh);
  }, [loadNotifications]);

  const iconFor = (type: NotificationItem["type"]) => {
    if (type === "leave") return ClipboardCheck;
    if (type === "holiday") return CalendarCheck;
    if (type === "birthday") return Cake;
    if (type === "announcement") return Megaphone;
    return Bell;
  };

  const permissionLabel =
    alertStatus.permission === "granted"
      ? "Allowed"
      : alertStatus.permission === "denied"
        ? "Blocked in browser"
        : alertStatus.permission === "default"
          ? "Not requested"
          : "Not supported";

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Important leave, attendance, and company alerts. Enable browser alerts only if you want push reminders."
        actions={
          <>
            {alertStatus.effectivelyEnabled ? (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await disableDesktopAlerts();
                  refreshAlertStatus();
                  toast.success("Browser alerts disabled");
                }}
              >
                <BellOff className="mr-2 h-4 w-4" />
                Disable Alerts
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    await enableDesktopAlerts();
                    refreshAlertStatus();
                    toast.success("Browser alerts enabled");
                  } catch (err) {
                    refreshAlertStatus();
                    toast.error((err as Error).message);
                  }
                }}
              >
                <Bell className="mr-2 h-4 w-4" />
                Enable Alerts
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={items.length === 0}
              onClick={() => {
                clearNotifications(items);
                setItems([]);
                void clearAppBadgeSafe();
                toast.success("Notifications cleared");
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Clear
            </Button>
          </>
        }
      />

      <div
        className={`mb-4 grid gap-3 ${platform === "ios" || platform === "android" ? "lg:grid-cols-2" : ""}`}
      >
        <Card className="overflow-hidden border-primary/15 shadow-sm">
          <CardContent className="flex items-start gap-3 p-4">
            <div
              className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                alertStatus.effectivelyEnabled
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
              }`}
            >
              {alertStatus.effectivelyEnabled ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <Bell className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold tracking-tight">Alert delivery</p>
                <Badge
                  variant="outline"
                  className={
                    alertStatus.effectivelyEnabled
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400"
                      : ""
                  }
                >
                  {alertStatus.effectivelyEnabled ? "Active" : "Inactive"}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                App alerts: {alertStatus.effectivelyEnabled ? "On" : "Off"} · Browser permission:{" "}
                {permissionLabel}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Enable alerts only for important leave, attendance, and company updates. Laptop and
                desktop browsers are not prompted to install the app.
              </p>
            </div>
          </CardContent>
        </Card>

        {(platform === "ios" || platform === "android") && (
          <Card className="overflow-hidden shadow-sm">
            <CardContent className="flex items-start gap-3 p-4">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Smartphone className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold tracking-tight">
                  {installed ? "Installed on this phone" : "Optional phone install"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {installed
                    ? "You’re using the full-screen Anytime Diesel Employees app."
                    : "Install from your phone browser menu if you want a home-screen icon. This is optional."}
                </p>
                {!installed && (
                  <div className="mt-3 flex flex-col gap-2 min-[420px]:flex-row">
                    {installPrompt && (
                      <Button
                        size="sm"
                        className="w-full min-[420px]:w-auto"
                        onClick={async () => {
                          const promptEvent = installPrompt as Event & {
                            prompt: () => Promise<void>;
                            userChoice: Promise<{ outcome: string }>;
                          };
                          await promptEvent.prompt();
                          await promptEvent.userChoice;
                          setInstallPrompt(null);
                        }}
                      >
                        <Download className="mr-2 h-4 w-4" /> Install app
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full min-[420px]:w-auto"
                      onClick={() => setShowInstallHelp((current) => !current)}
                    >
                      {showInstallHelp ? "Hide steps" : "Installation steps"}
                    </Button>
                  </div>
                )}
                {showInstallHelp && !installed && (
                  <ol className="mt-3 space-y-1.5 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground sm:text-sm">
                    {installCopy.steps.map((step, index) => (
                      <li key={step} className="flex gap-2">
                        <span className="font-semibold text-primary">{index + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {alertStatus.permission === "denied" && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Notification access is blocked in browser or phone settings. Enable it there, return
            here, and tap Enable Alerts again.
          </p>
        </div>
      )}

      <NotificationPreferencesCard />

      {loading && <LoadingState label="Loading notifications" />}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="space-y-3">
        {items.map((n) => {
          const Icon = iconFor(n.type);
          return (
            <Card
              key={n.id}
              className="overflow-hidden border-border/80 shadow-sm transition-colors hover:border-primary/25"
            >
              <CardContent className="flex items-start gap-3 p-4">
                <div
                  className={`rounded-xl p-2.5 ${
                    n.type === "leave"
                      ? "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400"
                      : n.type === "holiday"
                        ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400"
                        : n.type === "birthday"
                          ? "bg-pink-50 text-pink-600 dark:bg-pink-950/30 dark:text-pink-400"
                          : n.type === "announcement"
                            ? "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"
                            : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px] tracking-wide">
                      Anytime Diesel
                    </Badge>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {n.type}
                    </span>
                    {n.priority && n.priority !== "NORMAL" && (
                      <Badge variant={n.priority === "URGENT" ? "destructive" : "secondary"}>
                        {n.priority.toLowerCase()}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm font-semibold tracking-tight text-foreground">{n.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{n.desc}</p>
                  {n.type === "announcement" && n.authorName && (
                    <p className="mt-1 text-xs font-medium text-muted-foreground">
                      Published by {n.authorName}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Date(n.time).toLocaleString()}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {!loading && items.length === 0 && (
        <EmptyState
          title="You're all caught up"
          description="New leave, attendance, announcement, and birthday updates will appear here."
        />
      )}
    </div>
  );
}
