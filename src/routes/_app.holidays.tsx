import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { formatDisplayDate, indiaDateKey } from "@/lib/india-date";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Holiday } from "@/types/domain";
import { useAuth } from "@/lib/auth";
import { reportsApi } from "@/services/api";
import { CalendarDays, Pencil, Plus, Trash2 } from "lucide-react";

const HOLIDAY_MANAGERS = new Set(["hr", "main_admin", "developer_admin"]);

type HolidayTiming = "today" | "upcoming" | "past";

function holidayDateKey(date: string) {
  return date.slice(0, 10);
}

function holidayTiming(date: string, today: string): HolidayTiming {
  const key = holidayDateKey(date);
  if (key === today) return "today";
  if (key > today) return "upcoming";
  return "past";
}

export const Route = createFileRoute("/_app/holidays")({
  component: HolidaysPage,
});

function HolidaysPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canManage = !!user && HOLIDAY_MANAGERS.has(user.role);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [deleteHolidayTarget, setDeleteHolidayTarget] = useState<Holiday | null>(null);
  const [form, setForm] = useState({
    name: "",
    date: "",
    description: "",
    type: "Public" as Holiday["type"],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const today = indiaDateKey();
  const { upcomingHolidays, completedHolidays } = useMemo(() => {
    const upcoming: Holiday[] = [];
    const completed: Holiday[] = [];
    for (const holiday of holidays) {
      if (holidayDateKey(holiday.date) >= today) upcoming.push(holiday);
      else completed.push(holiday);
    }
    upcoming.sort((a, b) => holidayDateKey(a.date).localeCompare(holidayDateKey(b.date)));
    completed.sort((a, b) => holidayDateKey(b.date).localeCompare(holidayDateKey(a.date)));
    return { upcomingHolidays: upcoming, completedHolidays: completed };
  }, [holidays, today]);

  useEffect(() => {
    reportsApi
      .holidays()
      .then(setHolidays)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  function resetForm() {
    setEditing(null);
    setForm({ name: "", date: "", description: "", type: "Public" });
    setShowForm(false);
  }

  function openCreateDialog() {
    setEditing(null);
    setForm({ name: "", date: "", description: "", type: "Public" });
    setShowForm(true);
  }

  function openEditDialog(holiday: Holiday) {
    setEditing(holiday);
    setForm({
      name: holiday.name,
      date: holiday.date,
      description: holiday.description ?? "",
      type: holiday.type,
    });
    setShowForm(true);
  }

  async function saveHoliday(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.date) {
      toast.error(t("pages.holidays.toastFieldsRequired"));
      return;
    }
    const payload = {
      name: form.name,
      date: form.date,
      description: form.description || undefined,
      type: form.type,
      status: "ACTIVE",
    };
    try {
      const saved = editing
        ? await reportsApi.updateHoliday(editing.id, payload)
        : await reportsApi.createHoliday(payload);
      setHolidays((prev) =>
        editing ? prev.map((row) => (row.id === saved.id ? saved : row)) : [saved, ...prev],
      );
      toast.success(editing ? t("pages.holidays.toastUpdated") : t("pages.holidays.toastAdded"));
      resetForm();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function deleteHoliday(holiday: Holiday) {
    try {
      await reportsApi.deleteHoliday(holiday.id);
      setHolidays((prev) => prev.filter((row) => row.id !== holiday.id));
      toast.success(t("pages.holidays.toastDeleted"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const holidayTypeLabel = (type: Holiday["type"]) => {
    if (type === "Public") return t("pages.holidays.public");
    if (type === "Optional") return t("pages.holidays.optional");
    return t("pages.holidays.restricted");
  };

  const timingLabel = (timing: HolidayTiming) => {
    if (timing === "today") return t("pages.holidays.today");
    if (timing === "upcoming") return t("pages.holidays.upcoming");
    return t("pages.holidays.completed");
  };

  const colCount = canManage ? 5 : 4;

  function WhenBadge({ timing }: { timing: HolidayTiming }) {
    const isUpcoming = timing !== "past";
    return (
      <Badge
        className={cn(
          isUpcoming
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-border bg-muted text-muted-foreground",
          timing === "today" && "border-transparent bg-primary text-primary-foreground",
        )}
      >
        {timingLabel(timing)}
      </Badge>
    );
  }

  function SectionHeading({ label, upcoming }: { label: string; upcoming?: boolean }) {
    return (
      <p
        className={cn(
          "text-[11px] font-semibold uppercase tracking-[0.14em]",
          upcoming ? "text-primary" : "text-muted-foreground",
        )}
      >
        {label}
      </p>
    );
  }

  function HolidayCard({ holiday }: { holiday: Holiday }) {
    const timing = holidayTiming(holiday.date, today);
    const isUpcoming = timing !== "past";
    return (
      <Card
        className={cn(
          isUpcoming && "border-primary/40 bg-primary/[0.04]",
          timing === "today" && "border-primary/60 bg-primary/10",
          !isUpcoming && "border-dashed bg-muted/30",
        )}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className={cn("font-semibold", !isUpcoming && "text-muted-foreground line-through")}>
                  {holiday.name}
                </p>
                <WhenBadge timing={timing} />
              </div>
              <p
                className={cn(
                  "mt-1 flex items-center gap-1.5 text-sm text-muted-foreground",
                  !isUpcoming && "line-through",
                )}
              >
                <CalendarDays className="h-4 w-4" /> {formatDisplayDate(holiday.date)}
              </p>
              {holiday.description && (
                <p
                  className={cn(
                    "mt-2 text-sm text-muted-foreground",
                    !isUpcoming && "line-through",
                  )}
                >
                  {holiday.description}
                </p>
              )}
            </div>
            <Badge variant="outline">{holidayTypeLabel(holiday.type)}</Badge>
          </div>
          {canManage && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => openEditDialog(holiday)}>
                <Pencil className="mr-2 h-4 w-4" /> {t("common.edit")}
              </Button>
              <Button
                className="bg-red-600 text-white hover:bg-red-700"
                onClick={() => setDeleteHolidayTarget(holiday)}
              >
                <Trash2 className="mr-2 h-4 w-4" /> {t("common.delete")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  function HolidayTableRow({ holiday }: { holiday: Holiday }) {
    const timing = holidayTiming(holiday.date, today);
    const isUpcoming = timing !== "past";
    return (
      <TableRow
        className={cn(
          isUpcoming && "bg-primary/[0.04] hover:bg-primary/[0.07]",
          timing === "today" && "bg-primary/10 hover:bg-primary/[0.14]",
          !isUpcoming && "text-muted-foreground",
        )}
      >
        <TableCell className={cn(!isUpcoming && "line-through")}>
          {formatDisplayDate(holiday.date)}
        </TableCell>
        <TableCell className="font-medium">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn(!isUpcoming && "line-through")}>{holiday.name}</span>
            <WhenBadge timing={timing} />
          </div>
        </TableCell>
        <TableCell>
          <Badge variant="outline">{holidayTypeLabel(holiday.type)}</Badge>
        </TableCell>
        <TableCell
          className={cn(
            "max-w-xs truncate text-muted-foreground",
            !isUpcoming && "line-through",
          )}
        >
          {holiday.description || "—"}
        </TableCell>
        {canManage && (
          <TableCell className="text-right">
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => openEditDialog(holiday)}>
                <Pencil className="mr-2 h-4 w-4" /> {t("common.edit")}
              </Button>
              <Button
                size="sm"
                className="bg-red-600 text-white hover:bg-red-700"
                onClick={() => setDeleteHolidayTarget(holiday)}
              >
                <Trash2 className="mr-2 h-4 w-4" /> {t("common.delete")}
              </Button>
            </div>
          </TableCell>
        )}
      </TableRow>
    );
  }

  function TableSectionRow({ label, upcoming }: { label: string; upcoming?: boolean }) {
    return (
      <TableRow className="hover:bg-transparent">
        <TableCell
          colSpan={colCount}
          className={cn(
            "py-2 text-[11px] font-semibold uppercase tracking-[0.14em]",
            upcoming ? "bg-primary/10 text-primary" : "bg-muted/50 text-muted-foreground",
          )}
        >
          {label}
        </TableCell>
      </TableRow>
    );
  }

  if (user?.role === "driver") {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div>
      <PageHeader
        title={t("pages.holidays.title")}
        description={t("pages.holidays.subtitle")}
        actions={
          canManage ? (
            <Button size="sm" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" /> {t("pages.holidays.addHoliday")}
            </Button>
          ) : undefined
        }
      />
      {loading && <LoadingState label={t("pages.loading.holidays")} />}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid gap-3 md:hidden">
        {upcomingHolidays.length > 0 && (
          <>
            <SectionHeading upcoming label={t("pages.holidays.upcoming")} />
            {upcomingHolidays.map((holiday) => (
              <HolidayCard key={holiday.id} holiday={holiday} />
            ))}
          </>
        )}
        {completedHolidays.length > 0 && (
          <>
            <SectionHeading label={t("pages.holidays.completed")} />
            {completedHolidays.map((holiday) => (
              <HolidayCard key={holiday.id} holiday={holiday} />
            ))}
          </>
        )}
      </div>
      {!loading && holidays.length === 0 && (
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground md:hidden">
          {t("pages.holidays.empty")}
        </div>
      )}
      <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Holiday</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {upcomingHolidays.length > 0 && (
                <>
                  <TableSectionRow upcoming label={t("pages.holidays.upcoming")} />
                  {upcomingHolidays.map((holiday) => (
                    <HolidayTableRow key={holiday.id} holiday={holiday} />
                  ))}
                </>
              )}
              {completedHolidays.length > 0 && (
                <>
                  <TableSectionRow label={t("pages.holidays.completed")} />
                  {completedHolidays.map((holiday) => (
                    <HolidayTableRow key={holiday.id} holiday={holiday} />
                  ))}
                </>
              )}
            </TableBody>
          </Table>
        </div>
        {!loading && holidays.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">{t("pages.holidays.empty")}</div>
        )}
      </div>

      <Dialog open={showForm} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? t("pages.holidays.edit") : t("pages.holidays.add")}</DialogTitle>
            <DialogDescription>
              Holidays are company-wide. Nine hours of holiday work earns one Comp Off credit.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveHoliday} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <DateField
                value={form.date}
                onChange={(next) => setForm((current) => ({ ...current, date: next }))}
                aria-label="Holiday date"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={form.type}
                onValueChange={(type) =>
                  setForm((current) => ({ ...current, type: type as Holiday["type"] }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Public">{t("pages.holidays.public")}</SelectItem>
                  <SelectItem value="Optional">{t("pages.holidays.optional")}</SelectItem>
                  <SelectItem value="Restricted">{t("pages.holidays.restricted")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Description (optional)</Label>
              <Input
                value={form.description}
                onChange={(e) =>
                  setForm((current) => ({ ...current, description: e.target.value }))
                }
              />
            </div>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={resetForm}>
                {t("common.cancel")}
              </Button>
              <Button type="submit">
                {editing ? t("pages.holidays.updateHoliday") : t("pages.holidays.createHoliday")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteHolidayTarget}
        onOpenChange={(open) => !open && setDeleteHolidayTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("pages.holidays.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteHolidayTarget
                ? `This will remove ${deleteHolidayTarget.name} from the holiday calendar.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (!deleteHolidayTarget) return;
                void deleteHoliday(deleteHolidayTarget);
                setDeleteHolidayTarget(null);
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
