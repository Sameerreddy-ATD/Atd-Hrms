import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Megaphone, Power, Send } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
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
import type { Announcement } from "@/mock/types";
import { announcementsApi } from "@/services/api";

export const Route = createFileRoute("/_app/announcements")({ component: AnnouncementsPage });

const TITLE_LIMIT = 120;
const MESSAGE_LIMIT = 1000;

function AnnouncementsPage() {
  const { user } = useAuth();
  const canManage = user?.role === "hr" || user?.role === "developer_admin";
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [filter, setFilter] = useState("active");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
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

  const visible = useMemo(() => {
    const now = Date.now();
    return announcements.filter((announcement) => {
      const expired = Boolean(announcement.expiresAt && +new Date(announcement.expiresAt) <= now);
      if (filter === "inactive") return !announcement.isActive;
      if (filter === "expired") return expired;
      return announcement.isActive && !expired;
    });
  }, [announcements, filter]);

  async function publish(event: React.FormEvent) {
    event.preventDefault();
    if (!form.expiresAt || new Date(form.expiresAt) <= new Date()) {
      toast.error("Select a future display-until date and time");
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
      await load();
      toast.success("Announcement published to everyone");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Announcements"
        description="Company updates published for every Anytime Diesel employee."
        actions={
          canManage ? (
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          ) : undefined
        }
      />

      {canManage && (
        <form
          onSubmit={publish}
          className="mb-5 grid gap-4 rounded-lg border bg-card p-4 sm:p-5 lg:grid-cols-2"
        >
          <div className="lg:col-span-2">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <Label htmlFor="announcement-page-title">Title</Label>
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
              placeholder="Clear announcement title"
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
            />
          </div>
          <div className="lg:col-span-2">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <Label htmlFor="announcement-page-message">Announcement</Label>
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
              placeholder="Write the update employees need to know."
              onChange={(event) =>
                setForm((current) => ({ ...current, message: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
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
                <SelectItem value="NORMAL">Normal</SelectItem>
                <SelectItem value="IMPORTANT">Important</SelectItem>
                <SelectItem value="URGENT">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="announcement-page-expiry">Display until</Label>
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
              <Send className="mr-2 h-4 w-4" />
              {saving ? "Publishing..." : "Publish Announcement"}
            </Button>
          </div>
        </form>
      )}

      {loading && <p className="text-sm text-muted-foreground">Loading announcements...</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!loading && !error && visible.length === 0 && (
        <EmptyState
          title="No announcements"
          description={
            filter === "active"
              ? "There are no active company announcements."
              : `There are no ${filter} announcements.`
          }
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {visible.map((announcement) => (
          <Card
            key={announcement.id}
            className={
              announcement.priority === "URGENT"
                ? "border-red-300"
                : announcement.priority === "IMPORTANT"
                  ? "border-amber-300"
                  : "border-primary/20"
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
                  <div className="mt-4 flex flex-col gap-2 border-t pt-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                    <span>Published by {announcement.authorName}</span>
                    <span className="flex items-center gap-1.5">
                      <CalendarClock className="h-3.5 w-3.5" />
                      Until{" "}
                      {announcement.expiresAt
                        ? new Date(announcement.expiresAt).toLocaleString()
                        : "further notice"}
                    </span>
                  </div>
                  {canManage && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3 w-full sm:w-auto"
                      onClick={async () => {
                        try {
                          if (announcement.isActive)
                            await announcementsApi.deactivate(announcement.id);
                          else await announcementsApi.update(announcement.id, { isActive: true });
                          await load();
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
                      <Power className="mr-2 h-4 w-4" />
                      {announcement.isActive ? "Deactivate" : "Reactivate"}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
