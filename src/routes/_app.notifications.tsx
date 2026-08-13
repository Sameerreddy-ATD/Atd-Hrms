import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { notificationsApi, notificationPreferencesApi } from "@/services/api";
import type { NotificationItem } from "@/types/domain";
import { formatDisplayDateTime } from "@/lib/india-date";
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
  getAppSurface,
  hardRefreshApp,
  installInstructionCopy,
  isAppInstalled,
  clearAppBadgeSafe,
} from "@/lib/pwa-install";
import { cn } from "@/lib/utils";
import {
  Bell,
  BellOff,
  BellRing,
  CalendarCheck,
  ClipboardCheck,
  Cake,
  Download,
  Trash2,
  Megaphone,
  Smartphone,
  ShieldAlert,
  RefreshCw,
  ListTodo,
  MapPin,
} from "lucide-react";

export const Route = createFileRoute("/_app/notifications")({
  component: NotificationsPage,
});

const CATEGORY_LABELS: Record<string, string> = {
  leave: "Leave",
  tasks: "Tasks",
  claims: "Claims",
  checklists: "Checklists",
  corrections: "Attendance corrections",
};

function typeMeta(type: NotificationItem["type"]) {
  if (type === "leave") {
    return { icon: ClipboardCheck, label: "Leave", className: "bg-amber-500/12 text-amber-700 dark:text-amber-300" };
  }
  if (type === "holiday") {
    return { icon: CalendarCheck, label: "Holiday", className: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" };
  }
  if (type === "birthday") {
    return { icon: Cake, label: "Birthday", className: "bg-pink-500/12 text-pink-700 dark:text-pink-300" };
  }
  if (type === "announcement") {
    return { icon: Megaphone, label: "Announcement", className: "bg-sky-500/12 text-sky-800 dark:text-sky-300" };
  }
  if (type === "task") {
    return { icon: ListTodo, label: "Task", className: "bg-violet-500/12 text-violet-700 dark:text-violet-300" };
  }
  if (type === "attendance") {
    return { icon: MapPin, label: "Attendance", className: "bg-primary/12 text-primary" };
  }
  return { icon: Bell, label: "Update", className: "bg-muted text-muted-foreground" };
}

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
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">What to receive</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            These control in-app alerts. Urgent company announcements still come through when push is on.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { id: "immediate", label: "Immediate" },
              { id: "off", label: "Pause all" },
            ] as const
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setDigestMode(mode.id)}
              className={cn(
                "min-h-11 rounded-xl border px-3 text-sm font-medium transition-colors",
                digestMode === mode.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:bg-muted/60",
              )}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <ul className="divide-y divide-border/70 rounded-xl border border-border/80">
          {Object.entries(categories).map(([key, enabled]) => (
            <li key={key} className="flex min-h-12 items-center justify-between gap-3 px-3.5 py-2">
              <span className="text-sm font-medium capitalize">{CATEGORY_LABELS[key] ?? key}</span>
              <Switch
                checked={enabled}
                onCheckedChange={(next) =>
                  setCategories((current) => ({ ...current, [key]: next }))
                }
                aria-label={CATEGORY_LABELS[key] ?? key}
              />
            </li>
          ))}
        </ul>
        <Button
          className="h-11 w-full sm:w-auto"
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
  const [toggling, setToggling] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const platform = detectPwaPlatform();
  const installCopy = installInstructionCopy(platform);
  const surface = getAppSurface();
  const native = surface === "native";
  const pwa = surface === "pwa";
  const installed = isAppInstalled();
  const phone = platform === "ios" || platform === "android";

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
      if (!native) setInstallPrompt(event);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refreshAlertStatus();
        void clearAppBadgeSafe();
      }
    }

    if (!native) {
      window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    }
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
  }, [loadNotifications, native, refreshAlertStatus]);

  useEffect(() => {
    const refresh = () => {
      void loadNotifications();
    };
    window.addEventListener(NOTIFICATION_COUNT_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(NOTIFICATION_COUNT_CHANGED_EVENT, refresh);
  }, [loadNotifications]);

  const onToggleAlerts = async (next: boolean) => {
    setToggling(true);
    try {
      if (next) {
        await enableDesktopAlerts();
        toast.success(native ? "App notifications on" : "Browser alerts on");
      } else {
        await disableDesktopAlerts();
        toast.success(native ? "App notifications off" : "Browser alerts off");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      refreshAlertStatus();
      setToggling(false);
    }
  };

  const pageDescription = native
    ? "Company updates in this app. Turn on app notifications to get banners from Anytime Workforce."
    : pwa
      ? "You added Anytime Workforce to your Home Screen. Enable alerts if you want banners when the app is in the background."
      : "Leave, attendance, and company alerts. Enable browser alerts only if you want push reminders.";

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={pageDescription}
        actions={
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
            <Trash2 className="mr-2 h-4 w-4" />
            Clear all
          </Button>
        }
      />

      <Card className="mb-4 overflow-hidden border-border/80 shadow-none">
        <CardContent className="flex items-center gap-3 p-4 sm:p-5">
          <div
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-2xl",
              alertStatus.effectivelyEnabled
                ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                : "bg-muted text-muted-foreground",
            )}
          >
            {alertStatus.effectivelyEnabled ? (
              <BellRing className="h-5 w-5" />
            ) : (
              <BellOff className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold tracking-tight">
                {native ? "App notifications" : pwa ? "Home Screen alerts" : "Browser alerts"}
              </p>
              <Badge
                variant="outline"
                className={
                  alertStatus.effectivelyEnabled
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "text-muted-foreground"
                }
              >
                {alertStatus.effectivelyEnabled ? "On" : "Off"}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground sm:text-sm">
              {native
                ? "Uses this app — not Chrome. Allow Anytime Workforce in phone Settings if banners do not appear."
                : pwa
                  ? "Uses this Home Screen app’s browser permission."
                  : "Optional. In-app alerts still appear here if you leave this off."}
            </p>
          </div>
          <Switch
            className="shrink-0"
            checked={alertStatus.effectivelyEnabled}
            disabled={toggling}
            onCheckedChange={(next) => void onToggleAlerts(next)}
            aria-label={native ? "App notifications" : "Browser alerts"}
          />
        </CardContent>
      </Card>

      {phone && !native && (
        <Card className="mb-4 overflow-hidden border-border/80 shadow-none">
          <CardContent className="flex items-start gap-3 p-4 sm:p-5">
            <div className="mt-0.5 grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Smartphone className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold tracking-tight">
                {pwa ? "On your Home Screen" : "Add to Home Screen"}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {pwa
                  ? "You’re using the browser shortcut. Enable alerts above if you want banners in the background."
                  : "Optional. Add Anytime Workforce from your browser menu for a full-screen icon."}
              </p>
              {pwa && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 min-h-11 w-full min-[420px]:w-auto"
                  onClick={() => {
                    toast.message("Refreshing app…");
                    void hardRefreshApp();
                  }}
                >
                  <RefreshCw className="mr-2 h-4 w-4" /> Refresh app
                </Button>
              )}
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
                      <Download className="mr-2 h-4 w-4" /> Add to Home Screen
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full min-[420px]:w-auto"
                    onClick={() => setShowInstallHelp((current) => !current)}
                  >
                    {showInstallHelp ? "Hide steps" : "How to add"}
                  </Button>
                </div>
              )}
              {showInstallHelp && !installed && (
                <ol className="mt-3 space-y-1.5 rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground sm:text-sm">
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

      {!native && alertStatus.permission === "denied" && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Notification access is blocked in the browser. Allow it in site settings, return here, and
            turn alerts on again.
          </p>
        </div>
      )}

      <NotificationPreferencesCard />

      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight">Inbox</h2>
        {!loading && (
          <p className="text-xs text-muted-foreground">
            {items.length === 0 ? "None" : `${items.length} ${items.length === 1 ? "update" : "updates"}`}
          </p>
        )}
      </div>

      {loading && <LoadingState label="Loading notifications" />}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {items.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-border/80">
          {items.map((n, index) => {
            const meta = typeMeta(n.type);
            const Icon = meta.icon;
            return (
              <article
                key={n.id}
                className={cn(
                  "flex items-start gap-3 bg-card px-4 py-3.5 sm:px-5",
                  index > 0 && "border-t border-border/70",
                )}
              >
                <div className={cn("mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl", meta.className)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {meta.label}
                    </span>
                    {n.priority && n.priority !== "NORMAL" && (
                      <Badge variant={n.priority === "URGENT" ? "destructive" : "secondary"}>
                        {n.priority.toLowerCase()}
                      </Badge>
                    )}
                    <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                      {formatDisplayDateTime(n.time)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm font-semibold tracking-tight text-foreground">{n.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{n.desc}</p>
                  {n.type === "announcement" && n.authorName && (
                    <p className="mt-1 text-xs font-medium text-muted-foreground">From {n.authorName}</p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {!loading && items.length === 0 && (
        <EmptyState
          icon={Bell}
          title="You're all caught up"
          description="New leave, attendance, announcement, and birthday updates will appear here."
        />
      )}
    </div>
  );
}
