import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { announcementsApi, notificationsApi } from "@/services/api";
import type { Announcement, NotificationItem } from "@/mock/types";
import { useAuth } from "@/lib/auth";
import {
  clearNotifications,
  disableDesktopAlerts,
  enableDesktopAlerts,
  filterVisibleNotifications,
  getDesktopAlertStatus,
  syncDesktopAlertsWithPermission,
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
  Send,
  Power,
} from "lucide-react";

export const Route = createFileRoute("/_app/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [alertStatus, setAlertStatus] = useState(getDesktopAlertStatus);
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [announcementSaving, setAnnouncementSaving] = useState(false);
  const [announcementForm, setAnnouncementForm] = useState({
    title: "",
    message: "",
    priority: "NORMAL" as Announcement["priority"],
    expiresAt: "",
  });
  const canManageAnnouncements = user?.role === "hr" || user?.role === "developer_admin";

  const loadNotifications = useCallback(() => {
    return notificationsApi.list().then((data) => setItems(filterVisibleNotifications(data)));
  }, []);

  const loadAnnouncements = useCallback(() => {
    return announcementsApi.list(canManageAnnouncements).then(setAnnouncements);
  }, [canManageAnnouncements]);

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

    Promise.all([loadNotifications(), loadAnnouncements()])
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("focus", refreshAlertStatus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [loadAnnouncements, loadNotifications, refreshAlertStatus]);

  const iconFor = (type: NotificationItem["type"]) => {
    if (type === "leave") return ClipboardCheck;
    if (type === "holiday") return CalendarCheck;
    if (type === "birthday") return Cake;
    if (type === "announcement") return Megaphone;
    return Bell;
  };

  async function publishAnnouncement(event: React.FormEvent) {
    event.preventDefault();
    setAnnouncementSaving(true);
    try {
      await announcementsApi.create({
        title: announcementForm.title,
        message: announcementForm.message,
        priority: announcementForm.priority,
        expiresAt: announcementForm.expiresAt
          ? new Date(announcementForm.expiresAt).toISOString()
          : null,
      });
      setAnnouncementForm({ title: "", message: "", priority: "NORMAL", expiresAt: "" });
      await Promise.all([loadAnnouncements(), loadNotifications()]);
      toast.success("Announcement published to all users");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAnnouncementSaving(false);
    }
  }

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
                onClick={() => {
                  disableDesktopAlerts();
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

      {canManageAnnouncements && (
        <Card className="mb-4 overflow-hidden border-primary/20">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-4 flex items-start gap-3">
              <div className="rounded-md bg-primary/10 p-2 text-primary">
                <Megaphone className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold">Company announcement</h2>
                <p className="text-sm text-muted-foreground">
                  Publish an update that will be visible to every signed-in employee.
                </p>
              </div>
            </div>
            <form onSubmit={publishAnnouncement} className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-1.5 lg:col-span-2">
                <Label htmlFor="announcement-title">Title</Label>
                <Input
                  id="announcement-title"
                  value={announcementForm.title}
                  maxLength={160}
                  required
                  placeholder="Office update, event, or important notice"
                  onChange={(event) =>
                    setAnnouncementForm((current) => ({ ...current, title: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5 lg:col-span-2">
                <Label htmlFor="announcement-message">Message</Label>
                <Textarea
                  id="announcement-message"
                  value={announcementForm.message}
                  maxLength={3000}
                  required
                  rows={4}
                  placeholder="Write the announcement clearly for all employees."
                  onChange={(event) =>
                    setAnnouncementForm((current) => ({ ...current, message: event.target.value }))
                  }
                />
                <p className="text-right text-xs text-muted-foreground">
                  {announcementForm.message.length}/3000
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select
                  value={announcementForm.priority}
                  onValueChange={(priority: Announcement["priority"]) =>
                    setAnnouncementForm((current) => ({ ...current, priority }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NORMAL">Normal</SelectItem>
                    <SelectItem value="IMPORTANT">Important</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="announcement-expiry">Expiry (optional)</Label>
                <Input
                  id="announcement-expiry"
                  type="datetime-local"
                  value={announcementForm.expiresAt}
                  onChange={(event) =>
                    setAnnouncementForm((current) => ({
                      ...current,
                      expiresAt: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="flex justify-end lg:col-span-2">
                <Button type="submit" disabled={announcementSaving} className="w-full sm:w-auto">
                  <Send className="mr-2 h-4 w-4" />
                  {announcementSaving ? "Publishing..." : "Publish to Everyone"}
                </Button>
              </div>
            </form>

            {announcements.length > 0 && (
              <div className="mt-5 border-t pt-4">
                <p className="mb-3 text-sm font-semibold">Published announcements</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {announcements.slice(0, 8).map((announcement) => (
                    <div
                      key={announcement.id}
                      className="flex min-w-0 items-start gap-3 rounded-md border p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium">{announcement.title}</p>
                          <Badge variant="outline">{announcement.priority.toLowerCase()}</Badge>
                          {!announcement.isActive && <Badge variant="secondary">Inactive</Badge>}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {announcement.message}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title={
                          announcement.isActive
                            ? "Deactivate announcement"
                            : "Reactivate announcement"
                        }
                        onClick={async () => {
                          try {
                            if (announcement.isActive)
                              await announcementsApi.deactivate(announcement.id);
                            else await announcementsApi.update(announcement.id, { isActive: true });
                            await Promise.all([loadAnnouncements(), loadNotifications()]);
                            toast.success(
                              announcement.isActive
                                ? "Announcement deactivated"
                                : "Announcement reactivated",
                            );
                          } catch (err) {
                            toast.error((err as Error).message);
                          }
                        }}
                      >
                        <Power
                          className={`h-4 w-4 ${announcement.isActive ? "text-rose-600" : "text-emerald-600"}`}
                        />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!canManageAnnouncements && announcements.length > 0 && (
        <section className="mb-4" aria-labelledby="company-announcements-heading">
          <div className="mb-3 flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            <h2 id="company-announcements-heading" className="font-semibold">
              Company announcements
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {announcements.map((announcement) => (
              <Card
                key={announcement.id}
                className={
                  announcement.priority === "URGENT"
                    ? "border-rose-300 bg-rose-50/50 dark:border-rose-900 dark:bg-rose-950/10"
                    : announcement.priority === "IMPORTANT"
                      ? "border-amber-300 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/10"
                      : "border-primary/20"
                }
              >
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-semibold">{announcement.title}</h3>
                    <Badge variant="outline">{announcement.priority.toLowerCase()}</Badge>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {announcement.message}
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {announcement.authorName} · {new Date(announcement.publishAt).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

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
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : alertStatus.permission === "denied"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : ""
            }
          >
            {alertStatus.effectivelyEnabled ? "Alerts active" : "Alerts inactive"}
          </Badge>
        </CardContent>
      </Card>

      {alertStatus.permission === "denied" && (
        <p className="mb-4 text-sm text-amber-700">
          Notification access is blocked in your browser or phone settings. Enable it there, then
          return here and tap Enable Alerts again.
        </p>
      )}

      {loading && <p className="text-sm text-muted-foreground">Loading notifications...</p>}
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
