import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  DesktopTable,
  MobileList,
  MobileListFields,
  MobileListHeader,
  MobileListItem,
  ResponsiveListShell,
} from "@/components/common/ResponsiveList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ResolvedShiftSource, RosterWeek, ShiftTemplate } from "@/types/domain";
import { useAuth } from "@/lib/auth";
import {
  addDaysIso,
  expectedWorkMinutesFromSegments,
  formatDuration,
  formatSegmentLabel,
  formatSegmentsSummary,
  hmToMinutes,
  minutesToHm,
  mondayOfWeek,
  suggestShiftCode,
  todayIsoLocal,
  weekDayIsos,
} from "@/lib/shiftDisplay";
import { rosterApi, shiftTemplatesApi } from "@/services/api";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_app/shifts")({
  component: ShiftManagementPage,
});

type SegmentForm = {
  key: string;
  startTime: string;
  endTime: string;
  endDayOffset: 0 | 1;
};

type FormState = {
  name: string;
  code: string;
  description: string;
  timezone: string;
  graceInMinutes: string;
  graceOutMinutes: string;
  segments: SegmentForm[];
};

const emptySegment = (): SegmentForm => ({
  key: crypto.randomUUID(),
  startTime: "09:00",
  endTime: "18:00",
  endDayOffset: 0,
});

const emptyForm = (): FormState => ({
  name: "",
  code: "",
  description: "",
  timezone: "Asia/Kolkata",
  graceInMinutes: "30",
  graceOutMinutes: "30",
  segments: [emptySegment()],
});

function sourceBadgeVariant(
  source: ResolvedShiftSource,
  explicitNoShift?: boolean,
): "default" | "secondary" | "outline" | "destructive" {
  if (explicitNoShift) return "destructive";
  if (source === "DAY_OVERRIDE") return "default";
  if (source === "ROSTER") return "secondary";
  if (source === "DEFAULT") return "outline";
  return "outline";
}

function sourceLabelKey(source: ResolvedShiftSource, explicitNoShift?: boolean) {
  if (explicitNoShift) return "pages.shifts.sourceNoShift";
  if (source === "DAY_OVERRIDE") return "pages.shifts.sourceOverride";
  if (source === "ROSTER") return "pages.shifts.sourceRoster";
  if (source === "DEFAULT") return "pages.shifts.sourceDefault";
  return "pages.shifts.sourceNone";
}

const ROSTER_NO_SHIFT_VALUE = "__NO_SHIFT__";

function formatWeekdayShort(iso: string, locale: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    dt,
  );
}

function ShiftManagementPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const canWrite = user?.role === "developer_admin" || user?.role === "hr" || user?.role === "main_admin";

  const [tab, setTab] = useState("templates");
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ShiftTemplate | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [codeTouched, setCodeTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const initialFormRef = useRef("");

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ShiftTemplate | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<ShiftTemplate | null>(null);

  const [weekStart, setWeekStart] = useState(() => mondayOfWeek(todayIsoLocal()));
  const [roster, setRoster] = useState<RosterWeek | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState("");
  const [assigningKey, setAssigningKey] = useState<string | null>(null);

  const derivedMinutes = useMemo(() => {
    const segs = form.segments
      .map((s) => {
        const startMinute = hmToMinutes(s.startTime);
        const endMinute = hmToMinutes(s.endTime);
        if (startMinute == null || endMinute == null) return null;
        return { startMinute, endMinute, endDayOffset: s.endDayOffset };
      })
      .filter((s): s is NonNullable<typeof s> => s != null);
    return expectedWorkMinutesFromSegments(segs);
  }, [form.segments]);

  const loadTemplates = useCallback(async () => {
    setError("");
    try {
      const rows = await shiftTemplatesApi.list(true);
      setTemplates(rows);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRoster = useCallback(async (start: string) => {
    setRosterError("");
    setRosterLoading(true);
    try {
      const data = await rosterApi.week({ weekStart: start });
      setRoster(data);
    } catch (err) {
      setRosterError((err as Error).message);
      setRoster(null);
    } finally {
      setRosterLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    if (tab === "roster") void loadRoster(weekStart);
  }, [tab, weekStart, loadRoster]);

  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    shiftTemplatesApi
      .get(detailId)
      .then(setDetail)
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setDetailLoading(false));
  }, [detailId]);

  useEffect(() => {
    if (!formDirty || !showForm) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [formDirty, showForm]);

  const filteredTemplates = useMemo(() => {
    return templates.filter((row) => {
      if (statusFilter === "ACTIVE" && !row.active) return false;
      if (statusFilter === "INACTIVE" && row.active) return false;
      return true;
    });
  }, [templates, statusFilter]);

  const weekDays = useMemo(() => weekDayIsos(weekStart), [weekStart]);
  const activeTemplates = useMemo(() => templates.filter((t) => t.active), [templates]);

  function markForm(next: FormState | ((current: FormState) => FormState)) {
    setForm((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      setFormDirty(JSON.stringify(resolved) !== initialFormRef.current);
      return resolved;
    });
  }

  function resetForm() {
    setEditing(null);
    setForm(emptyForm());
    setCodeTouched(false);
    setShowForm(false);
    setFormDirty(false);
    initialFormRef.current = "";
  }

  function requestCloseForm() {
    if (formDirty) {
      setDiscardOpen(true);
      return;
    }
    resetForm();
  }

  function openCreate() {
    setEditing(null);
    const blank = emptyForm();
    setForm(blank);
    initialFormRef.current = JSON.stringify(blank);
    setFormDirty(false);
    setCodeTouched(false);
    setShowForm(true);
  }

  function openEdit(row: ShiftTemplate) {
    setEditing(row);
    const next: FormState = {
      name: row.name,
      code: row.code,
      description: row.description ?? "",
      timezone: row.timezone || "Asia/Kolkata",
      graceInMinutes: String(row.graceInMinutes ?? 30),
      graceOutMinutes: String(row.graceOutMinutes ?? 30),
      segments: (row.segments.length ? row.segments : [{ startMinute: 540, endMinute: 1080, endDayOffset: 0 }]).map(
        (seg) => ({
          key: crypto.randomUUID(),
          startTime: minutesToHm(seg.startMinute),
          endTime: minutesToHm(seg.endMinute),
          endDayOffset: (seg.endDayOffset === 1 ? 1 : 0) as 0 | 1,
        }),
      ),
    };
    setForm(next);
    initialFormRef.current = JSON.stringify(next);
    setFormDirty(false);
    setCodeTouched(true);
    setShowForm(true);
  }

  function onNameChange(name: string) {
    markForm((current) => ({
      ...current,
      name,
      code: codeTouched || editing ? current.code : suggestShiftCode(name),
    }));
  }

  async function saveTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || (!editing && !form.code.trim())) {
      toast.error(t("pages.shifts.toastFieldsRequired"));
      return;
    }
    const segments = form.segments.map((seg, index) => {
      const startMinute = hmToMinutes(seg.startTime);
      const endMinute = hmToMinutes(seg.endTime);
      if (startMinute == null || endMinute == null) return null;
      return {
        sequence: index + 1,
        startMinute,
        endMinute,
        endDayOffset: seg.endDayOffset,
      };
    });
    if (segments.some((s) => s == null)) {
      toast.error(t("pages.shifts.toastInvalidTime"));
      return;
    }
    const graceIn = Number(form.graceInMinutes);
    const graceOut = Number(form.graceOutMinutes);
    if (
      !Number.isInteger(graceIn) ||
      !Number.isInteger(graceOut) ||
      graceIn < 0 ||
      graceIn > 240 ||
      graceOut < 0 ||
      graceOut > 240
    ) {
      toast.error(t("pages.shifts.toastGraceInvalid"));
      return;
    }

    setSaving(true);
    try {
      const payloadSegments = segments as Array<{
        sequence: number;
        startMinute: number;
        endMinute: number;
        endDayOffset: 0 | 1;
      }>;
      const saved = editing
        ? await shiftTemplatesApi.update(editing.id, {
            name: form.name.trim(),
            description: form.description.trim() || null,
            timezone: form.timezone || "Asia/Kolkata",
            graceInMinutes: graceIn,
            graceOutMinutes: graceOut,
            segments: payloadSegments,
          })
        : await shiftTemplatesApi.create({
            name: form.name.trim(),
            code: form.code.trim().toUpperCase(),
            description: form.description.trim() || null,
            timezone: form.timezone || "Asia/Kolkata",
            graceInMinutes: graceIn,
            graceOutMinutes: graceOut,
            segments: payloadSegments,
          });
      setTemplates((prev) =>
        editing
          ? prev.map((row) => (row.id === saved.id ? { ...row, ...saved } : row))
          : [saved, ...prev],
      );
      if (detailId === saved.id) setDetail(saved);
      toast.success(editing ? t("pages.shifts.toastUpdated") : t("pages.shifts.toastCreated"));
      resetForm();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deactivateTemplate(row: ShiftTemplate) {
    try {
      const saved = await shiftTemplatesApi.deactivate(row.id);
      setTemplates((prev) => prev.map((item) => (item.id === saved.id ? { ...item, ...saved } : item)));
      setDetail((current) => (current && current.id === saved.id ? { ...current, ...saved } : current));
      toast.success(t("pages.shifts.toastDeactivated"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function reactivateTemplate(row: ShiftTemplate) {
    try {
      const saved = await shiftTemplatesApi.reactivate(row.id);
      setTemplates((prev) => prev.map((item) => (item.id === saved.id ? { ...item, ...saved } : item)));
      setDetail((current) => (current && current.id === saved.id ? { ...current, ...saved } : current));
      toast.success(t("pages.shifts.toastReactivated"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function assignRosterShift(employeeId: string, workDate: string, shiftIdOrNoShift: string) {
    if (!canWrite) return;
    const key = `${employeeId}:${workDate}`;
    setAssigningKey(key);
    try {
      const shiftId = shiftIdOrNoShift === ROSTER_NO_SHIFT_VALUE ? null : shiftIdOrNoShift;
      await rosterApi.assign({ employeeId, workDate, shiftId, source: "MANUAL" });
      toast.success(t("pages.shifts.toastRosterSaved"));
      await loadRoster(weekStart);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAssigningKey(null);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("pages.shifts.title")}
        description={t("pages.shifts.subtitle")}
        actions={
          canWrite && tab === "templates" ? (
            <Button size="sm" onClick={openCreate} className="min-h-11 w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" /> {t("pages.shifts.addTemplate")}
            </Button>
          ) : null
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:max-w-md">
          <TabsTrigger value="templates" className="min-h-11">
            {t("pages.shifts.tabTemplates")}
          </TabsTrigger>
          <TabsTrigger value="roster" className="min-h-11">
            {t("pages.shifts.tabRoster")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-4 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("pages.shifts.filterStatusAll")}</SelectItem>
                <SelectItem value="ACTIVE">{t("pages.shifts.filterActive")}</SelectItem>
                <SelectItem value="INACTIVE">{t("pages.shifts.filterInactive")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading && <LoadingState label={t("pages.loading.shifts")} />}
          {error && <p className="text-sm text-destructive">{error}</p>}

          {!loading && (
            <ResponsiveListShell>
              <MobileList>
                {filteredTemplates.map((row) => (
                  <MobileListItem key={row.id}>
                    <MobileListHeader
                      title={row.name}
                      meta={row.code}
                      trailing={<StatusBadge status={row.active ? "Active" : "Inactive"} />}
                    />
                    <MobileListFields>
                      <div>
                        <p className="text-sm text-muted-foreground">{formatSegmentsSummary(row.segments)}</p>
                        <p className="mt-1 text-sm">
                          {row.expectedWorkLabel ?? formatDuration(row.expectedWorkMinutes)} ·{" "}
                          {t("pages.shifts.employeesCount", { count: row.assignedEmployees ?? 0 })}
                        </p>
                      </div>
                    </MobileListFields>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => setDetailId(row.id)}>
                        {t("pages.shifts.view")}
                      </Button>
                      {canWrite && (
                        <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
                          {t("common.edit")}
                        </Button>
                      )}
                    </div>
                  </MobileListItem>
                ))}
              </MobileList>

              <DesktopTable>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("pages.shifts.colName")}</TableHead>
                      <TableHead>{t("pages.shifts.colCode")}</TableHead>
                      <TableHead>{t("pages.shifts.colSegments")}</TableHead>
                      <TableHead>{t("pages.shifts.colDuration")}</TableHead>
                      <TableHead>{t("pages.shifts.colStatus")}</TableHead>
                      <TableHead>{t("pages.shifts.colEmployees")}</TableHead>
                      <TableHead className="text-right">{t("pages.shifts.colActions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTemplates.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="font-mono text-xs">{row.code}</TableCell>
                        <TableCell className="max-w-xs text-sm text-muted-foreground">
                          {formatSegmentsSummary(row.segments)}
                        </TableCell>
                        <TableCell>
                          {row.expectedWorkLabel ?? formatDuration(row.expectedWorkMinutes)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={row.active ? "Active" : "Inactive"} />
                        </TableCell>
                        <TableCell>{row.assignedEmployees ?? 0}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="ghost" onClick={() => setDetailId(row.id)}>
                              {t("pages.shifts.view")}
                            </Button>
                            {canWrite && (
                              <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
                                {t("common.edit")}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </DesktopTable>
            </ResponsiveListShell>
          )}

          {!loading && filteredTemplates.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("pages.shifts.emptyTemplates")}</p>
          )}
        </TabsContent>

        <TabsContent value="roster" className="mt-4 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="min-h-11 min-w-11"
                aria-label={t("pages.shifts.prevWeek")}
                onClick={() => setWeekStart((w) => addDaysIso(w, -7))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input
                type="date"
                className="w-full sm:w-44"
                value={weekStart}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) setWeekStart(mondayOfWeek(v));
                }}
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="min-h-11 min-w-11"
                aria-label={t("pages.shifts.nextWeek")}
                onClick={() => setWeekStart((w) => addDaysIso(w, 7))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("pages.shifts.weekRange", { start: weekStart, end: addDaysIso(weekStart, 6) })}
            </p>
          </div>

          {rosterLoading && <LoadingState label={t("pages.loading.shiftsRoster")} />}
          {rosterError && <p className="text-sm text-destructive">{rosterError}</p>}

          {!rosterLoading && roster && (
            <>
              <div className="md:hidden space-y-3">
                {roster.employees.map((emp) =>
                  weekDays.map((day) => {
                    const cell = emp.days[day];
                    const key = `${emp.employeeId}:${day}`;
                    return (
                      <div key={key} className="rounded-lg border border-border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{emp.name}</p>
                            <p className="text-xs text-muted-foreground">{emp.employeeCode}</p>
                            <p className="mt-1 text-sm">{formatWeekdayShort(day, i18n.language)}</p>
                          </div>
                          <Badge variant={sourceBadgeVariant(cell?.source ?? "NONE", cell?.explicitNoShift)}>
                            {t(sourceLabelKey(cell?.source ?? "NONE", cell?.explicitNoShift))}
                          </Badge>
                        </div>
                        <div className="mt-3">
                          {cell?.explicitNoShift ? (
                            <p className="mb-2 text-sm font-medium">{t("pages.shifts.sourceNoShift")}</p>
                          ) : null}
                          <Select
                            value={
                              cell?.explicitNoShift
                                ? ROSTER_NO_SHIFT_VALUE
                                : (cell?.shiftId ?? undefined)
                            }
                            disabled={!canWrite || assigningKey === key}
                            onValueChange={(value) => void assignRosterShift(emp.employeeId, day, value)}
                          >
                            <SelectTrigger className="min-h-11 w-full">
                              <SelectValue placeholder={t("pages.shifts.selectShift")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={ROSTER_NO_SHIFT_VALUE}>
                                {t("pages.shifts.sourceNoShift")}
                              </SelectItem>
                              {(cell?.shiftId && !activeTemplates.some((tpl) => tpl.id === cell.shiftId)
                                ? [
                                    ...activeTemplates,
                                    {
                                      id: cell.shiftId,
                                      name: cell.shiftName ?? cell.code ?? cell.shiftId,
                                    },
                                  ]
                                : activeTemplates
                              ).map((tpl) => (
                                <SelectItem key={tpl.id} value={tpl.id}>
                                  {tpl.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    );
                  }),
                )}
                {roster.employees.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t("pages.shifts.emptyRoster")}</p>
                )}
              </div>

              <div className="hidden md:block overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 z-10 min-w-[180px] bg-background">
                        {t("common.employee")}
                      </TableHead>
                      {weekDays.map((day) => (
                        <TableHead key={day} className="min-w-[160px]">
                          {formatWeekdayShort(day, i18n.language)}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roster.employees.map((emp) => (
                      <TableRow key={emp.employeeId}>
                        <TableCell className="sticky left-0 z-10 bg-background">
                          <div className="font-medium">{emp.name}</div>
                          <div className="text-xs text-muted-foreground">{emp.employeeCode}</div>
                        </TableCell>
                        {weekDays.map((day) => {
                          const cell = emp.days[day];
                          const key = `${emp.employeeId}:${day}`;
                          return (
                            <TableCell key={day} className="align-top">
                              <div className="space-y-2">
                                <Badge
                                  variant={sourceBadgeVariant(cell?.source ?? "NONE", cell?.explicitNoShift)}
                                  className="font-normal"
                                >
                                  {t(sourceLabelKey(cell?.source ?? "NONE", cell?.explicitNoShift))}
                                </Badge>
                                {cell?.explicitNoShift ? (
                                  <p className="text-sm font-medium">{t("pages.shifts.sourceNoShift")}</p>
                                ) : null}
                                <Select
                                  value={
                                    cell?.explicitNoShift
                                      ? ROSTER_NO_SHIFT_VALUE
                                      : (cell?.shiftId ?? undefined)
                                  }
                                  disabled={!canWrite || assigningKey === key}
                                  onValueChange={(value) => void assignRosterShift(emp.employeeId, day, value)}
                                >
                                  <SelectTrigger className="h-9 w-full min-w-[140px]">
                                    <SelectValue placeholder={t("pages.shifts.selectShift")} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value={ROSTER_NO_SHIFT_VALUE}>
                                      {t("pages.shifts.sourceNoShift")}
                                    </SelectItem>
                                    {(cell?.shiftId && !activeTemplates.some((tpl) => tpl.id === cell.shiftId)
                                      ? [
                                          ...activeTemplates,
                                          {
                                            id: cell.shiftId,
                                            name: cell.shiftName ?? cell.code ?? cell.shiftId,
                                          },
                                        ]
                                      : activeTemplates
                                    ).map((tpl) => (
                                      <SelectItem key={tpl.id} value={tpl.id}>
                                        {tpl.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {roster.employees.length === 0 && (
                  <p className="p-4 text-sm text-muted-foreground">{t("pages.shifts.emptyRoster")}</p>
                )}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (!open) requestCloseForm();
        }}
      >
        <DialogContent
          className="max-h-[90dvh] max-w-2xl overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]"
          onPointerDownOutside={(e) => {
            if (formDirty) {
              e.preventDefault();
              setDiscardOpen(true);
            }
          }}
          onEscapeKeyDown={(e) => {
            if (formDirty) {
              e.preventDefault();
              setDiscardOpen(true);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {editing ? t("pages.shifts.editTemplate") : t("pages.shifts.createTemplate")}
            </DialogTitle>
            <DialogDescription>{t("pages.shifts.formHelp")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void saveTemplate(e)} className="space-y-5">
            <section className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="shift-name">{t("pages.shifts.fieldName")} *</Label>
                  <Input id="shift-name" value={form.name} onChange={(e) => onNameChange(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="shift-code">{t("pages.shifts.fieldCode")} *</Label>
                  <Input
                    id="shift-code"
                    value={form.code}
                    disabled={!!editing}
                    onChange={(e) => {
                      setCodeTouched(true);
                      markForm((current) => ({
                        ...current,
                        code: e.target.value.toUpperCase(),
                      }));
                    }}
                    className="font-mono uppercase"
                  />
                  <p className="text-xs text-muted-foreground">{t("pages.shifts.codeHelp")}</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="shift-tz">{t("pages.shifts.fieldTimezone")}</Label>
                  <Input
                    id="shift-tz"
                    value={form.timezone}
                    onChange={(e) => markForm((current) => ({ ...current, timezone: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="shift-desc">{t("pages.shifts.fieldDescription")}</Label>
                  <Textarea
                    id="shift-desc"
                    rows={2}
                    value={form.description}
                    onChange={(e) => markForm((current) => ({ ...current, description: e.target.value }))}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{t("pages.shifts.sectionSegments")}</h3>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    markForm((current) => ({
                      ...current,
                      segments: [...current.segments, emptySegment()],
                    }))
                  }
                >
                  <Plus className="mr-1 h-4 w-4" /> {t("pages.shifts.addSegment")}
                </Button>
              </div>
              <div className="space-y-3">
                {form.segments.map((seg, index) => (
                  <div key={seg.key} className="rounded-lg border border-border p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">
                        {t("pages.shifts.segmentN", { n: index + 1 })}
                      </p>
                      {form.segments.length > 1 && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 text-destructive"
                          aria-label={t("pages.shifts.removeSegment")}
                          onClick={() =>
                            markForm((current) => ({
                              ...current,
                              segments: current.segments.filter((s) => s.key !== seg.key),
                            }))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label>{t("pages.shifts.fieldStart")}</Label>
                        <Input
                          type="time"
                          value={seg.startTime}
                          onChange={(e) =>
                            markForm((current) => ({
                              ...current,
                              segments: current.segments.map((s) =>
                                s.key === seg.key ? { ...s, startTime: e.target.value } : s,
                              ),
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t("pages.shifts.fieldEnd")}</Label>
                        <Input
                          type="time"
                          value={seg.endTime}
                          onChange={(e) =>
                            markForm((current) => ({
                              ...current,
                              segments: current.segments.map((s) =>
                                s.key === seg.key ? { ...s, endTime: e.target.value } : s,
                              ),
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t("pages.shifts.fieldEnds")}</Label>
                        <Select
                          value={String(seg.endDayOffset)}
                          onValueChange={(value) =>
                            markForm((current) => ({
                              ...current,
                              segments: current.segments.map((s) =>
                                s.key === seg.key
                                  ? { ...s, endDayOffset: value === "1" ? 1 : 0 }
                                  : s,
                              ),
                            }))
                          }
                        >
                          <SelectTrigger data-testid="segment-ends">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">{t("pages.shifts.endsSameDay")}</SelectItem>
                            <SelectItem value="1">{t("pages.shifts.endsNextDay")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                {t("pages.shifts.derivedDuration")}:{" "}
                <span className="font-medium text-foreground">{formatDuration(derivedMinutes)}</span>
              </p>
            </section>

            <section className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="grace-in">{t("pages.shifts.fieldGraceIn")}</Label>
                <Input
                  id="grace-in"
                  type="number"
                  min={0}
                  max={240}
                  value={form.graceInMinutes}
                  onChange={(e) => markForm((current) => ({ ...current, graceInMinutes: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="grace-out">{t("pages.shifts.fieldGraceOut")}</Label>
                <Input
                  id="grace-out"
                  type="number"
                  min={0}
                  max={240}
                  value={form.graceOutMinutes}
                  onChange={(e) => markForm((current) => ({ ...current, graceOutMinutes: e.target.value }))}
                />
              </div>
            </section>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={requestCloseForm}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? t("common.loading") : editing ? t("pages.shifts.saveTemplate") : t("pages.shifts.createTemplate")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Sheet open={!!detailId} onOpenChange={(open) => !open && setDetailId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{detail?.name ?? t("pages.shifts.detailTitle")}</SheetTitle>
            <SheetDescription>{detail?.code}</SheetDescription>
          </SheetHeader>
          {detailLoading && <LoadingState label={t("pages.loading.shifts")} />}
          {detail && !detailLoading && (
            <div className="mt-6 space-y-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("pages.shifts.colSegments")}
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {detail.segments.map((seg) => (
                    <li key={seg.id ?? `${seg.sequence}-${seg.startMinute}`}>
                      {formatSegmentLabel(seg)}
                      {seg.endDayOffset === 1 ? ` · ${t("pages.shifts.endsNextDay")}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("pages.shifts.colDuration")}
                </p>
                <p className="mt-1 text-sm font-medium">
                  {detail.expectedWorkLabel ?? formatDuration(detail.expectedWorkMinutes)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("pages.shifts.fieldTimezone")}
                </p>
                <p className="mt-1 text-sm">{detail.timezone}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("pages.shifts.colStatus")}
                </p>
                <div className="mt-1">
                  <StatusBadge status={detail.active ? "Active" : "Inactive"} />
                </div>
              </div>
              {detail.description ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("pages.shifts.fieldDescription")}
                  </p>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{detail.description}</p>
                </div>
              ) : null}
              {canWrite && (
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(detail)}>
                    {t("common.edit")}
                  </Button>
                  {detail.active ? (
                    <Button size="sm" variant="outline" onClick={() => setDeactivateTarget(detail)}>
                      {t("pages.shifts.deactivate")}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => void reactivateTemplate(detail)}>
                      {t("pages.shifts.reactivate")}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deactivateTarget} onOpenChange={(open) => !open && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("pages.shifts.deactivateTitle", { name: deactivateTarget?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("pages.shifts.deactivateBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deactivateTarget) void deactivateTemplate(deactivateTarget);
                setDeactivateTarget(null);
              }}
            >
              {t("pages.shifts.deactivate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("pages.shifts.discardTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("pages.shifts.discardBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("pages.shifts.keepEditing")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDiscardOpen(false);
                resetForm();
              }}
            >
              {t("pages.shifts.discardChanges")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
