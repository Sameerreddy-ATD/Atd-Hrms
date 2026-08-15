import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CalendarClock, LoaderCircle, Megaphone, Plus, Power, Send, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { useAuth } from "@/lib/auth";
import { formatDisplayDateTime } from "@/lib/india-date";
import type { Announcement } from "@/types/domain";
import { announcementsApi } from "@/services/api";
import { sortAnnouncements } from "@/lib/announcements";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { NOTIFICATION_COUNT_CHANGED_EVENT } from "@/lib/browser-notifications";

export const Route = createFileRoute("/_app/announcements")({ component: AnnouncementsPage });

const TITLE_LIMIT = 120;
const MESSAGE_LIMIT = 1000;

function AnnouncementsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canManage = user?.role === "hr" || user?.role === "developer_admin";
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [filter, setFilter] = useState("active");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    title: "",
    message: "",
    priority: "NORMAL" as Announcement["priority"],
    expiresAt: "",
  });

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    return announcementsApi
      .list(canManage)
      .then(setAnnouncements)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [canManage]);

  useEffect(() => void load(), [load]);

  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener(NOTIFICATION_COUNT_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(NOTIFICATION_COUNT_CHANGED_EVENT, refresh);
  }, [load]);

  const visible = useMemo(() => {
    const now = Date.now();
    const filtered = announcements.filter((announcement) => {
      const expired = Boolean(announcement.expiresAt && +new Date(announcement.expiresAt) <= now);
      if (filter === "inactive") return !announcement.isActive;
      if (filter === "expired") return expired;
      return announcement.isActive && !expired;
    });
    return sortAnnouncements(filtered);
  }, [announcements, filter]);

  const summary = useMemo(() => {
    const now = Date.now();
    return announcements.reduce(
      (result, announcement) => {
        const expired = Boolean(announcement.expiresAt && +new Date(announcement.expiresAt) <= now);
        if (announcement.isActive && !expired) result.active += 1;
        if (announcement.isActive && !expired && announcement.priority === "URGENT") {
          result.urgent += 1;
        }
        if (expired) result.expired += 1;
        return result;
      },
      { active: 0, urgent: 0, expired: 0 },
    );
  }, [announcements]);

  async function publish(event: React.FormEvent) {
    event.preventDefault();
    if (!form.expiresAt || new Date(form.expiresAt) <= new Date()) {
      toast.error(t("pages.announcementsPage.toastFutureDate"));
      return;
    }
    setSaving(true);
    try {
      await announcementsApi.create({
        title: form.title,
        message: form.message,
        priority: form.priority,
        expiresAt: new Date(form.expiresAt).toISOString(),
      });
      setForm({ title: "", message: "", priority: "NORMAL", expiresAt: "" });
      setShowComposer(false);
      await load();
      toast.success(t("pages.announcementsPage.toastPublished"));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteAnnouncement() {
    if (!deleteTarget || deleteConfirmation !== "DELETE") return;
    setDeleting(true);
    try {
      await announcementsApi.deletePermanently(deleteTarget.id, deleteConfirmation);
      setDeleteTarget(null);
      setDeleteConfirmation("");
      await load();
      toast.success(t("pages.announcementsPage.toastDeleted"));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={t("announcements.title")}
        description={t("announcements.subtitle")}
        actions={
          canManage ? (
            <>
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t("pages.announcementsPage.filterActive")}</SelectItem>
                  <SelectItem value="expired">{t("pages.announcementsPage.filterExpired")}</SelectItem>
                  <SelectItem value="inactive">{t("pages.announcementsPage.filterInactive")}</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => setShowComposer((current) => !current)}>
                {showComposer ? <X className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                {showComposer ? t("common.close") : t("announcements.compose")}
              </Button>
            </>
          ) : undefined
        }
      />

      {canManage && !loading && !error && (
        <div className="mb-5 grid grid-cols-1 divide-y rounded-lg border bg-muted/25 min-[400px]:grid-cols-3 min-[400px]:divide-x min-[400px]:divide-y-0">
          {[
            [t("pages.announcementsPage.summaryActive"), summary.active],
            [t("pages.announcementsPage.summaryUrgent"), summary.urgent],
            [t("pages.announcementsPage.summaryExpired"), summary.expired],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0 px-3 py-3 text-center sm:px-4">
              <p className="text-lg font-semibold tabular-nums sm:text-xl">{value}</p>
              <p className="truncate text-xs text-muted-foreground sm:text-sm">{label}</p>
            </div>
          ))}
        </div>
      )}

      {canManage && showComposer && (
        <form
          onSubmit={publish}
          className="mb-5 grid gap-4 rounded-lg border border-primary/20 bg-primary/[0.025] p-4 sm:p-5 lg:grid-cols-2"
        >
          <div className="lg:col-span-2">
            <h2 className="font-semibold">{t("pages.announcementsPage.publishTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("announcements.contentNote")}
            </p>
          </div>
          <div className="lg:col-span-2">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <Label htmlFor="announcement-page-title">{t("announcements.titleLabel")}</Label>
              <span className="text-xs text-muted-foreground">
                {form.title.length}/{TITLE_LIMIT}
              </span>
            </div>
            <Input
              id="announcement-page-title"
              required
              minLength={3}
              maxLength={TITLE_LIMIT}
              value={form.title}
              placeholder={t("pages.announcementsPage.titlePlaceholder")}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
            />
          </div>
          <div className="lg:col-span-2">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <Label htmlFor="announcement-page-message">{t("announcements.message")}</Label>
              <span className="text-xs text-muted-foreground">
                {form.message.length}/{MESSAGE_LIMIT}
              </span>
            </div>
            <Textarea
              id="announcement-page-message"
              required
              minLength={3}
              maxLength={MESSAGE_LIMIT}
              rows={5}
              value={form.message}
              placeholder={t("pages.announcementsPage.messagePlaceholder")}
              onChange={(event) =>
                setForm((current) => ({ ...current, message: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("pages.announcementsPage.priority")}</Label>
            <Select
              value={form.priority}
              onValueChange={(priority: Announcement["priority"]) =>
                setForm((current) => ({ ...current, priority }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NORMAL">{t("common.normal")}</SelectItem>
                <SelectItem value="IMPORTANT">{t("pages.announcementsPage.important")}</SelectItem>
                <SelectItem value="URGENT">{t("common.urgent")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="announcement-page-expiry">{t("pages.announcementsPage.displayUntil")}</Label>
            <Input
              id="announcement-page-expiry"
              required
              type="datetime-local"
              value={form.expiresAt}
              onChange={(event) =>
                setForm((current) => ({ ...current, expiresAt: event.target.value }))
              }
            />
          </div>
          <div className="flex justify-end lg:col-span-2">
            <Button type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {saving ? t("pages.announcementsPage.publishing") : t("pages.announcementsPage.publishAnnouncement")}
            </Button>
          </div>
        </form>
      )}

      {loading && <LoadingState label={t("pages.loading.announcements")} />}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!loading && !error && visible.length === 0 && (
        <EmptyState
          title={t("announcements.empty")}
          description={t("announcements.emptyHint")}
          action={
            canManage && !showComposer ? (
              <Button onClick={() => setShowComposer(true)}>
                <Plus className="mr-2 h-4 w-4" /> {t("announcements.compose")}
              </Button>
            ) : undefined
          }
        />
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {visible.map((announcement) => (
          <Card
            key={announcement.id}
            className={
              announcement.priority === "URGENT"
                ? "border-l-4 border-l-red-500"
                : announcement.priority === "IMPORTANT"
                  ? "border-l-4 border-l-amber-500"
                  : "border-l-4 border-l-primary/50"
            }
          >
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-primary/10 p-2 text-primary">
                  <Megaphone className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="break-words font-semibold">{announcement.title}</h2>
                    <Badge variant={announcement.priority === "URGENT" ? "destructive" : "outline"}>
                      {announcement.priority.toLowerCase()}
                    </Badge>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                    {announcement.message}
                  </p>
                  <div className="mt-4 grid gap-2 border-t pt-3 text-xs text-muted-foreground sm:grid-cols-2 sm:items-center">
                    <span>{t("pages.announcementsPage.publishedBy", { name: announcement.authorName })}</span>
                    <span className="flex items-start gap-1.5 sm:justify-self-end sm:text-right">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {announcement.expiresAt
                        ? t("pages.announcementsPage.until", {
                            when: formatDisplayDateTime(announcement.expiresAt),
                          })
                        : t("pages.announcementsPage.furtherNotice")}
                    </span>
                  </div>
                  {canManage && (
                    <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            if (announcement.isActive)
                              await announcementsApi.deactivate(announcement.id);
                            else await announcementsApi.update(announcement.id, { isActive: true });
                            await load();
                            toast.success(
                              announcement.isActive
                                ? t("pages.announcementsPage.toastDeactivated")
                                : t("pages.announcementsPage.toastReactivated"),
                            );
                          } catch (err) {
                            toast.error((err as Error).message);
                          }
                        }}
                      >
                        <Power className="mr-2 h-4 w-4" />
                        {announcement.isActive
                          ? t("pages.announcementsPage.deactivate")
                          : t("pages.announcementsPage.reactivate")}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDeleteTarget(announcement)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> {t("pages.announcementsPage.permanentlyDelete")}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setDeleteTarget(null);
            setDeleteConfirmation("");
          }
        }}
      >
        <AlertDialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("pages.announcementsPage.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("pages.announcementsPage.deleteDescription", { title: deleteTarget?.title ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="announcement-delete-confirmation">
              {t("pages.announcementsPage.deleteConfirmLabel")}
            </Label>
            <Input
              id="announcement-delete-confirmation"
              autoComplete="off"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              placeholder={t("pages.announcementsPage.deleteConfirmPlaceholder")}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={deleteConfirmation !== "DELETE" || deleting}
              onClick={() => void deleteAnnouncement()}
            >
              {deleting && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
              {t("pages.announcementsPage.permanentlyDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
