import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import type { Department, User } from "@/types/domain";
import { organizationApi } from "@/services/api";
import { formatDepartmentPath } from "@/lib/department-label";
import { indiaDateKey } from "@/lib/india-date";

type HeadRow = {
  id: string;
  employeeId: string;
  employeeName?: string;
  isPrimary?: boolean;
  effectiveFrom: string;
  effectiveTo?: string | null;
  employee?: { employeeId: string; name: string; employeeCode: string; designation?: string };
};
type AssignmentRow = {
  id: string;
  employeeId: string;
  departmentId: string;
  organizationLevel: string;
  isPrimary: boolean;
  effectiveFrom: string;
  effectiveTo?: string | null;
  department?: { departmentId: string; name: string; unitCode: string };
};

export function OrganizationUnitDetailSheet({
  unit,
  departments,
  employees,
  open,
  onOpenChange,
  onRefresh,
}: {
  unit: Department | null;
  departments: Department[];
  employees: User[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("overview");
  const [heads, setHeads] = useState<HeadRow[]>([]);
  const [headHistory, setHeadHistory] = useState<HeadRow[]>([]);
  const [viewers, setViewers] = useState<HeadRow[]>([]);
  const [viewerHistory, setViewerHistory] = useState<HeadRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [newHeadId, setNewHeadId] = useState("");
  const [newHeadPrimary, setNewHeadPrimary] = useState(false);
  const [newViewerId, setNewViewerId] = useState("");
  const [transferEmployeeId, setTransferEmployeeId] = useState("");
  const [transferTargetId, setTransferTargetId] = useState("");
  const [transferLevel, setTransferLevel] = useState<"HEAD" | "SENIOR" | "JUNIOR" | "MEMBER">(
    "MEMBER",
  );
  const [transferReason, setTransferReason] = useState("");
  const [transferEffectiveDate, setTransferEffectiveDate] = useState(() => indiaDateKey(new Date()));
  const [selectedAssignmentHistory, setSelectedAssignmentHistory] = useState<AssignmentRow[]>([]);
  const todayKey = indiaDateKey(new Date());

  const unitEmployees = useMemo(
    () =>
      employees.filter(
        (row) =>
          row.departmentId === unit?.id &&
          row.status !== "TERMINATED" &&
          row.status !== "INACTIVE" &&
          row.employeeStatus !== "TERMINATED",
      ),
    [employees, unit?.id],
  );

  const activeUnits = useMemo(
    () => departments.filter((row) => row.active !== false),
    [departments],
  );

  const headCandidates = useMemo(
    () =>
      employees.filter(
        (row) =>
          row.employeeId &&
          row.status !== "TERMINATED" &&
          row.status !== "INACTIVE" &&
          row.employeeStatus !== "TERMINATED",
      ),
    [employees],
  );

  const loadDetails = useCallback(async () => {
    if (!unit?.id) return;
    setLoading(true);
    try {
      const [activeHeads, headsHist, activeViewers, viewersHist] = await Promise.all([
        organizationApi.unitHeads(unit.id),
        organizationApi.headHistory(unit.id),
        organizationApi.unitViewers(unit.id),
        organizationApi.viewerHistory(unit.id),
      ]);
      setHeads(activeHeads);
      setHeadHistory(headsHist);
      setViewers(activeViewers);
      setViewerHistory(viewersHist);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [unit?.id]);

  useEffect(() => {
    if (open && unit) void loadDetails();
  }, [open, unit, loadDetails]);

  async function addHead() {
    if (!unit || !newHeadId) return;
    try {
      await organizationApi.addUnitHead(unit.id, {
        employeeId: newHeadId,
        isPrimary: newHeadPrimary,
      });
      toast.success(t("pages.departments.toastHeadAdded"));
      setNewHeadId("");
      setNewHeadPrimary(false);
      await loadDetails();
      await onRefresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function makePrimaryHead(assignmentId: string) {
    if (!unit) return;
    try {
      await organizationApi.makePrimaryUnitHead(unit.id, assignmentId);
      toast.success(t("pages.departments.toastHeadPrimaryChanged"));
      await loadDetails();
      await onRefresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function endHead(assignmentId: string) {
    if (!unit) return;
    try {
      await organizationApi.endUnitHead(unit.id, assignmentId, {
        effectiveTo: indiaDateKey(new Date()),
      });
      toast.success(t("pages.departments.toastHeadEnded"));
      await loadDetails();
      await onRefresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function addViewer() {
    if (!unit || !newViewerId) return;
    try {
      await organizationApi.addUnitViewer(unit.id, { employeeId: newViewerId });
      toast.success(t("pages.departments.toastViewerAdded"));
      setNewViewerId("");
      await loadDetails();
      await onRefresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function endViewer(assignmentId: string) {
    if (!unit) return;
    try {
      await organizationApi.endUnitViewer(unit.id, assignmentId, {
        effectiveTo: indiaDateKey(new Date()),
      });
      toast.success(t("pages.departments.toastViewerEnded"));
      await loadDetails();
      await onRefresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function transferEmployee() {
    if (!transferEmployeeId || !transferTargetId) return;
    if (transferEffectiveDate > todayKey) {
      toast.error(t("pages.departments.toastTransferFutureBlocked"));
      return;
    }
    try {
      await organizationApi.transferEmployee({
        employeeId: transferEmployeeId,
        newOrganizationUnitId: transferTargetId,
        newOrganizationLevel: transferLevel,
        effectiveDate: transferEffectiveDate,
        reason: transferReason.trim() || undefined,
      });
      toast.success(t("pages.departments.toastTransferComplete"));
      setTransferEmployeeId("");
      setTransferReason("");
      setTransferEffectiveDate(todayKey);
      setSelectedAssignmentHistory([]);
      await onRefresh();
      await loadEmployeeHistory(transferEmployeeId);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function loadEmployeeHistory(employeeId: string) {
    try {
      const rows = await organizationApi.employeeAssignments(employeeId);
      setSelectedAssignmentHistory(rows);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  if (!unit) return null;

  const parent = departments.find((row) => row.id === unit.parentDepartmentId);
  const childCount = departments.filter((row) => row.parentDepartmentId === unit.id).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col overflow-hidden sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{unit.name}</SheetTitle>
          <SheetDescription>{t("pages.departments.unitDetailDescription")}</SheetDescription>
        </SheetHeader>

        <Tabs value={tab} onValueChange={setTab} className="mt-4 flex min-h-0 flex-1 flex-col">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">{t("pages.departments.tabOverview")}</TabsTrigger>
            <TabsTrigger value="heads">{t("pages.departments.tabHeads")}</TabsTrigger>
            <TabsTrigger value="viewers">{t("pages.departments.tabViewers")}</TabsTrigger>
            <TabsTrigger value="people">{t("pages.departments.tabPeople")}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-3 overflow-y-auto text-sm">
            <div className="grid gap-2">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t("pages.departments.unitCodeLabel")}</span>
                <span className="font-mono text-xs">{unit.unitCode ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t("pages.departments.tableType")}</span>
                <span>{unit.unitType ?? "TEAM"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t("pages.departments.reportsUnder")}</span>
                <span className="text-right">
                  {parent
                    ? formatDepartmentPath(parent, departments)
                    : t("pages.departments.ceoTopLevel")}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t("pages.departments.statusLabel")}</span>
                <Badge variant={unit.active === false ? "secondary" : "default"}>
                  {unit.active === false
                    ? t("pages.departments.inactive")
                    : t("pages.departments.active")}
                </Badge>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t("pages.departments.directCount")}</span>
                <span>{unit.directEmployeeCount ?? unit.memberCount ?? 0}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t("pages.departments.descendantCount")}</span>
                <span>{unit.totalDescendantEmployeeCount ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t("pages.departments.childUnits")}</span>
                <span>{childCount}</span>
              </div>
            </div>
          </TabsContent>

          <TabsContent
            value="heads"
            className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto"
          >
            {loading ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : (
              <>
                <ul className="space-y-2">
                  {heads.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {row.employeeName ?? row.employee?.name ?? row.employeeId}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {row.isPrimary
                            ? t("pages.departments.primaryHead")
                            : t("pages.departments.coHead")}
                          {" · "}
                          {row.effectiveFrom}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {!row.isPrimary ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void makePrimaryHead(row.id)}
                          >
                            {t("pages.departments.makePrimary")}
                          </Button>
                        ) : null}
                        <Button size="sm" variant="outline" onClick={() => void endHead(row.id)}>
                          {t("pages.departments.endAssignment")}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="space-y-2 border-t border-border pt-3">
                  <Label>{t("pages.departments.addHead")}</Label>
                  <Select value={newHeadId} onValueChange={setNewHeadId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("pages.departments.selectEmployee")} />
                    </SelectTrigger>
                    <SelectContent>
                      {headCandidates.map((row) => (
                        <SelectItem key={row.employeeId!} value={row.employeeId!}>
                          {row.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={newHeadPrimary}
                      onChange={(e) => setNewHeadPrimary(e.target.checked)}
                    />
                    {t("pages.departments.markPrimaryHead")}
                  </label>
                  <Button type="button" disabled={!newHeadId} onClick={() => void addHead()}>
                    {t("pages.departments.addHeadBtn")}
                  </Button>
                </div>
                {headHistory.length > heads.length && (
                  <div className="border-t border-border pt-3">
                    <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                      {t("pages.departments.history")}
                    </p>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {headHistory.map((row) => (
                        <li key={row.id}>
                          {row.employeeName ?? row.employee?.name ?? row.employeeId} · {row.effectiveFrom}
                          {row.effectiveTo ? ` → ${row.effectiveTo}` : " → present"}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent
            value="viewers"
            className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto"
          >
            <p className="text-xs text-muted-foreground">{t("pages.departments.viewerOnlyNote")}</p>
            <ul className="space-y-2">
              {viewers.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                  <div>
                    <p className="font-medium">
                      {row.employeeName ?? row.employee?.name ?? row.employeeId}
                    </p>
                    <p className="text-xs text-muted-foreground">{row.effectiveFrom}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void endViewer(row.id)}>
                    {t("pages.departments.endAssignment")}
                  </Button>
                </li>
              ))}
            </ul>
            <div className="space-y-2 border-t border-border pt-3">
              <Label>{t("pages.departments.addViewer")}</Label>
              <Select value={newViewerId} onValueChange={setNewViewerId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("pages.departments.selectEmployee")} />
                </SelectTrigger>
                <SelectContent>
                  {headCandidates.map((row) => (
                    <SelectItem key={row.employeeId!} value={row.employeeId!}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" disabled={!newViewerId} onClick={() => void addViewer()}>
                {t("pages.departments.addViewerBtn")}
              </Button>
            </div>
            {viewerHistory.length > viewers.length && (
              <div className="border-t border-border pt-3">
                <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                  {t("pages.departments.history")}
                </p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {viewerHistory.map((row) => (
                    <li key={row.id}>
                      {row.employeeName ?? row.employee?.name ?? row.employeeId} · {row.effectiveFrom}
                      {row.effectiveTo ? ` → ${row.effectiveTo}` : " → present"}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </TabsContent>

          <TabsContent
            value="people"
            className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto"
          >
            <div>
              <p className="mb-2 text-sm font-medium">{t("pages.departments.directEmployees")}</p>
              <ul className="space-y-1 text-sm">
                {unitEmployees.map((row) => (
                  <li key={row.employeeId} className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="truncate text-left hover:underline"
                      onClick={() => void loadEmployeeHistory(row.employeeId!)}
                    >
                      {row.name}
                    </button>
                    <span className="text-xs text-muted-foreground">{row.designation}</span>
                  </li>
                ))}
                {unitEmployees.length === 0 && (
                  <li className="text-muted-foreground">
                    {t("pages.departments.noDirectEmployees")}
                  </li>
                )}
              </ul>
            </div>

            {selectedAssignmentHistory.length > 0 && (
              <div className="rounded-md border border-border p-3 text-xs">
                <p className="mb-2 font-medium">{t("pages.departments.assignmentHistory")}</p>
                {selectedAssignmentHistory.map((row) => (
                  <div key={row.id} className="mb-1">
                    {(row as AssignmentRow & { department?: { name: string } }).department?.name ??
                      row.departmentId}{" "}
                    · {row.organizationLevel} · {row.effectiveFrom}
                    {row.effectiveTo ? ` → ${row.effectiveTo}` : " → present"}
                    {row.isPrimary ? " · primary" : ""}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-sm font-medium">{t("pages.departments.transferEmployee")}</p>
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
                <p>
                  <span className="text-muted-foreground">{t("pages.departments.transferCurrentUnit")}: </span>
                  <span className="font-medium">{unit.name}</span>
                </p>
                {transferTargetId ? (
                  <p className="mt-1">
                    <span className="text-muted-foreground">{t("pages.departments.transferNewUnit")}: </span>
                    <span className="font-medium">
                      {departments.find((row) => row.id === transferTargetId)?.name ?? ""}
                    </span>
                  </p>
                ) : null}
                <p className="mt-1">
                  <span className="text-muted-foreground">{t("pages.departments.organizationLevel")}: </span>
                  <span className="font-medium">{transferLevel}</span>
                </p>
                <p className="mt-1">
                  <span className="text-muted-foreground">{t("pages.departments.effectiveDate")}: </span>
                  <span className="font-medium">{transferEffectiveDate}</span>
                </p>
                {transferReason.trim() ? (
                  <p className="mt-1">
                    <span className="text-muted-foreground">{t("pages.departments.transferReasonLabel")}: </span>
                    <span className="font-medium">{transferReason.trim()}</span>
                  </p>
                ) : null}
              </div>
              <Label htmlFor="org-transfer-employee">{t("pages.departments.selectEmployee")}</Label>
              <Select value={transferEmployeeId} onValueChange={setTransferEmployeeId}>
                <SelectTrigger id="org-transfer-employee">
                  <SelectValue placeholder={t("pages.departments.selectEmployee")} />
                </SelectTrigger>
                <SelectContent>
                  {unitEmployees.map((row) => (
                    <SelectItem key={row.employeeId!} value={row.employeeId!}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Label htmlFor="org-transfer-target">{t("pages.departments.transferNewUnit")}</Label>
              <Select value={transferTargetId} onValueChange={setTransferTargetId}>
                <SelectTrigger id="org-transfer-target">
                  <SelectValue placeholder={t("pages.departments.transferTarget")} />
                </SelectTrigger>
                <SelectContent>
                  {activeUnits
                    .filter((row) => row.id !== unit.id)
                    .map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {formatDepartmentPath(row, departments)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Label htmlFor="org-transfer-level">{t("pages.departments.organizationLevel")}</Label>
              <Select
                value={transferLevel}
                onValueChange={(v) => setTransferLevel(v as typeof transferLevel)}
              >
                <SelectTrigger id="org-transfer-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["HEAD", "SENIOR", "JUNIOR", "MEMBER"] as const).map((level) => (
                    <SelectItem key={level} value={level}>
                      {level}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Label htmlFor="org-transfer-effective-date">{t("pages.departments.effectiveDate")}</Label>
              <Input
                id="org-transfer-effective-date"
                type="date"
                max={todayKey}
                value={transferEffectiveDate}
                onChange={(e) => setTransferEffectiveDate(e.target.value)}
              />
              <Label htmlFor="org-transfer-reason">{t("pages.departments.transferReasonLabel")}</Label>
              <Input
                id="org-transfer-reason"
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder={t("pages.departments.transferReason")}
              />
              {transferEmployeeId && transferTargetId && (
                <p className="text-xs text-muted-foreground">
                  {t("pages.departments.transferPreview", {
                    from: unit.name,
                    to: departments.find((row) => row.id === transferTargetId)?.name ?? "",
                  })}
                </p>
              )}
              <Button
                type="button"
                disabled={!transferEmployeeId || !transferTargetId || transferEffectiveDate > todayKey}
                onClick={() => void transferEmployee()}
              >
                {t("pages.departments.transferBtn")}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
