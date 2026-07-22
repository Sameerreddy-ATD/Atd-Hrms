import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { notificationsApi } from "@/services/api";
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
  Bell,
  BellOff,
  CalendarCheck,
  ClipboardCheck,
  Cake,
  Download,
  Trash2,
  Megaphone,
} from "lucide-react";

export const Route = createFileRoute("/_app/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [alertStatus, setAlertStatus] = useState(getDesktopAlertStatus);
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);

  const loadNotifications = useCallback(() => {
    return notificationsApi.list().then((data) => setItems(filterVisibleNotifications(data)));
  }, []);

  const refreshAlertStatus = useCallback(() => {
    syncDesktopAlertsWithPermission();
    setAlertStatus(getDesktopAlertStatus());
  }, []);

  useEffect(() => {
    refreshAlertStatus();

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") refreshAlertStatus();
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("focus", refreshAlertStatus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const intervalId = window.setInterval(refreshAlertStatus, 5000);

    loadNotifications()
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("focus", refreshAlertStatus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(intervalId);
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
        description="Relevant requests, assignments, account notices, holidays, and birthdays."
        actions={
          <>
            {alertStatus.effectivelyEnabled ? (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await disableDesktopAlerts();
                  refreshAlertStatus();
                  toast.success("Browser alerts disabled in app");
                }}
              >
                <BellOff className="mr-2 h-4 w-4" />
                Disable Alerts
              </Button>
            ) : (
              <Button
                variant="outline"
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
            {installPrompt && (
              <Button
                variant="outline"
                size="sm"
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
                <Download className="mr-2 h-4 w-4" /> Install App
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={items.length === 0}
              onClick={() => {
                clearNotifications(items);
                setItems([]);
                toast.success("Notifications cleared");
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Clear Notifications
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-medium">Browser alert status</p>
            <p className="text-xs text-muted-foreground">
              App alerts: {alertStatus.effectivelyEnabled ? "On" : "Off"} · Browser permission:{" "}
              {permissionLabel}
            </p>
          </div>
          <Badge
            variant="outline"
            className={
              alertStatus.effectivelyEnabled
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400"
                : alertStatus.permission === "denied"
                  ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-400"
                  : ""
            }
          >
            {alertStatus.effectivelyEnabled ? "Alerts active" : "Alerts inactive"}
          </Badge>
        </CardContent>
        <CardContent className="border-t px-4 py-3 text-xs text-muted-foreground">
          Installed Android apps can receive company alerts in the background. On iPhone or iPad
          16.4 and later, add the app to the Home Screen, open it from the icon, then tap Enable
          Alerts.
        </CardContent>
      </Card>

      {alertStatus.permission === "denied" && (
        <p className="mb-4 text-sm text-amber-700 dark:text-amber-400">
          Notification access is blocked in your browser or phone settings. Enable it there, then
          return here and tap Enable Alerts again.
        </p>
      )}

      {loading && <LoadingState label="Loading notifications" />}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="space-y-3">
        {items.map((n) => {
          const Icon = iconFor(n.type);
          return (
            <Card key={n.id}>
              <CardContent className="flex items-start gap-3 p-4">
                <div
                  className={`rounded-md p-2 ${
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
                    <Badge variant="outline" className="text-[10px]">
                      Anytime Diesel
                    </Badge>
                    <span className="text-[10px] font-medium uppercase text-muted-foreground">
                      {n.type}
                    </span>
                    {n.priority && n.priority !== "NORMAL" && (
                      <Badge variant={n.priority === "URGENT" ? "destructive" : "secondary"}>
                        {n.priority.toLowerCase()}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm font-medium capitalize">{n.title}</p>
                  <p className="text-sm text-muted-foreground">{n.desc}</p>
                  {n.type === "announcement" && n.authorName && (
                    <p className="mt-1 text-xs font-medium text-muted-foreground">
                      Published by {n.authorName}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(n.time).toLocaleString()}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {!loading && items.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          No notifications yet.
        </div>
      )}
    </div>
  );
}
