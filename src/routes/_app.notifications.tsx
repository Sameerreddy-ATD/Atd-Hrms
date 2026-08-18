import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { useAuth } from "@/lib/auth";
import {
  clearNotifications,
  disableDesktopAlerts,
  enableDesktopAlerts,
  filterVisibleNotifications,
  getDesktopAlertStatus,
  hydrateNotificationInbox,
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
  ChevronRight,
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

function destinationFor(item: NotificationItem, role?: string): string | undefined {
  if (item.href) {
    if (item.href === "/holidays" && role === "driver") return undefined;
    return item.href;
  }
  if (item.type === "announcement") return "/announcements";
  if (item.type === "task") return "/tasks";
  if (item.type === "birthday") return "/dashboard";
  if (item.type === "holiday") return role === "driver" ? undefined : "/holidays";
  if (item.type === "attendance") {
    const title = item.title.toLowerCase();
    if (title.includes("punch") || title.includes("correction")) return "/attendance/corrections";
    return "/attendance/mine";
  }
  if (item.type === "leave") {
    const title = item.title.toLowerCase();
    if (title.includes("pending") || title.includes("approval")) return "/leave/approvals";
    if (title.includes("weekly")) return "/leave/apply";
    return "/leave/history";
  }
  const title = item.title.toLowerCase();
  if (title.includes("expense") || title.includes("hr document") || title.includes("certificate")) {
    return "/employee-services";
  }
  if (title.includes("onboarding") || title.includes("offboarding")) return "/checklists";
  if (title.includes("password")) return "/users";
  if (title.includes("suspension")) return "/profile";
  return undefined;
}

function typeMeta(type: NotificationItem["type"], t: (key: string) => string) {
  if (type === "leave") {
    return {
      icon: ClipboardCheck,
      label: t("pages.notifications.categoryLeave"),
      className: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
    };
  }
  if (type === "holiday") {
    return {
      icon: CalendarCheck,
      label: t("pages.notifications.holiday"),
      className: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    };
  }
  if (type === "birthday") {
    return {
      icon: Cake,
      label: t("pages.notifications.birthday"),
      className: "bg-pink-500/12 text-pink-700 dark:text-pink-300",
    };
  }
  if (type === "announcement") {
    return {
      icon: Megaphone,
      label: t("pages.notifications.announcement"),
      className: "bg-sky-500/12 text-sky-800 dark:text-sky-300",
    };
  }
  if (type === "task") {
    return {
      icon: ListTodo,
      label: t("pages.notifications.task"),
      className: "bg-teal-500/12 text-teal-800 dark:text-teal-300",
    };
  }
  if (type === "attendance") {
    return {
      icon: MapPin,
      label: t("pages.notifications.categoryAttendance"),
      className: "bg-primary/12 text-primary",
    };
  }
  return { icon: Bell, label: t("pages.notifications.update"), className: "bg-muted text-muted-foreground" };
}

function NotificationsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
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
    return notificationPreferencesApi
      .get()
      .then((pref) => {
        hydrateNotificationInbox({ ids: pref.dismissedIds, at: pref.inboxClearedAt });
      })
      .catch(() => undefined)
      .then(() => notificationsApi.list())
      .then((data) => setItems(filterVisibleNotifications(data)));
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
        toast.success(
          native ? t("pages.notifications.appNotificationsOn") : t("pages.notifications.browserAlertsOn"),
        );
      } else {
        await disableDesktopAlerts();
        toast.success(
          native ? t("pages.notifications.appNotificationsOff") : t("pages.notifications.browserAlertsOff"),
        );
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      refreshAlertStatus();
      setToggling(false);
    }
  };

  const pageDescription = native
    ? t("pages.notifications.descriptionNative")
    : pwa
      ? t("pages.notifications.descriptionPwa")
      : t("pages.notifications.descriptionBrowser");

  return (
    <div>
      <PageHeader
        title={t("pages.notifications.title")}
        description={pageDescription}
        actions={
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={items.length === 0}
            onClick={() => {
              const snapshot = items;
              clearNotifications(snapshot);
              setItems([]);
              void notificationsApi.clear(snapshot.map((item) => item.id)).catch(() => undefined);
              void clearAppBadgeSafe();
              toast.success(t("pages.notifications.notificationsCleared"));
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t("pages.notifications.clearAll")}
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
                {native
                  ? t("pages.notifications.appNotifications")
                  : pwa
                    ? t("pages.notifications.homeScreenAlerts")
                    : t("pages.notifications.browserAlerts")}
              </p>
              <Badge
                variant="outline"
                className={
                  alertStatus.effectivelyEnabled
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "text-muted-foreground"
                }
              >
                {alertStatus.effectivelyEnabled ? t("pages.notifications.on") : t("pages.notifications.off")}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground sm:text-sm">
              {native
                ? t("pages.notifications.alertsHelpNative")
                : pwa
                  ? t("pages.notifications.alertsHelpPwa")
                  : t("pages.notifications.alertsHelpBrowser")}
            </p>
          </div>
          <Switch
            className="shrink-0"
            checked={alertStatus.effectivelyEnabled}
            disabled={toggling}
            onCheckedChange={(next) => void onToggleAlerts(next)}
            aria-label={
              native ? t("pages.notifications.appNotifications") : t("pages.notifications.browserAlerts")
            }
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
                {pwa ? t("pages.notifications.onHomeScreen") : t("pages.notifications.addToHomeScreen")}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {pwa
                  ? t("pages.notifications.pwaOnHomeScreenHelp")
                  : t("pages.notifications.addToHomeScreenHelp")}
              </p>
              {pwa && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 min-h-11 w-full min-[420px]:w-auto"
                  onClick={() => {
                    toast.message(t("pages.shell.refreshing"));
                    void hardRefreshApp();
                  }}
                >
                  <RefreshCw className="mr-2 h-4 w-4" /> {t("pages.notifications.refreshApp")}
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
                      <Download className="mr-2 h-4 w-4" /> {t("pages.notifications.addToHomeScreen")}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full min-[420px]:w-auto"
                    onClick={() => setShowInstallHelp((current) => !current)}
                  >
                    {showInstallHelp ? t("pages.notifications.hideSteps") : t("pages.notifications.howToAdd")}
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
          <p>{t("pages.notifications.alertsBlocked")}</p>
        </div>
      )}

      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">{t("pages.notifications.inbox")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("pages.notifications.inboxHelp")}</p>
        </div>
        {!loading && (
          <p className="shrink-0 text-xs text-muted-foreground">
            {items.length === 0
              ? t("pages.notifications.none")
              : items.length === 1
                ? t("pages.notifications.updateOne", { count: items.length })
                : t("pages.notifications.updates", { count: items.length })}
          </p>
        )}
      </div>

      {loading && <LoadingState label={t("pages.loading.notifications")} />}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {items.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-border/80">
          {items.map((n, index) => {
            const meta = typeMeta(n.type, t);
            const Icon = meta.icon;
            const href = destinationFor(n, user?.role);
            const rowClass = cn(
              "flex w-full items-start gap-3 bg-card px-4 py-3.5 text-left sm:px-5",
              index > 0 && "border-t border-border/70",
              href &&
                "min-h-14 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none active:bg-muted/55",
            );
            const body = (
              <>
                <div
                  className={cn(
                    "mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl",
                    meta.className,
                  )}
                >
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
                  <p className="mt-0.5 text-sm font-semibold tracking-tight text-foreground">
                    {n.title}
                  </p>
                  <p className="mt-0.5 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                    {n.desc}
                  </p>
                  {n.type === "announcement" && n.authorName && (
                    <p className="mt-1 text-xs font-medium text-muted-foreground">
                      {t("pages.notifications.fromAuthor", { name: n.authorName })}
                    </p>
                  )}
                </div>
                {href && (
                  <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground/70" aria-hidden />
                )}
              </>
            );
            if (href) {
              return (
                <button
                  key={n.id}
                  type="button"
                  className={rowClass}
                  onClick={() => {
                    void navigate({ to: href as never });
                  }}
                >
                  {body}
                </button>
              );
            }
            return (
              <article key={n.id} className={rowClass}>
                {body}
              </article>
            );
          })}
        </div>
      )}
      {!loading && items.length === 0 && (
        <EmptyState
          icon={Bell}
          title={t("pages.notifications.empty")}
          description={t("pages.notifications.emptyHelp")}
        />
      )}
    </div>
  );
}
