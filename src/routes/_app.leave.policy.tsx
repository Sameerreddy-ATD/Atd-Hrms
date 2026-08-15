import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { InfoButton } from "@/components/common/InfoButton";
import { LoadingState } from "@/components/common/LoadingState";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatCard } from "@/components/common/StatCard";
import type { LeaveTypeOption, User } from "@/types/domain";
import { employeesApi, leaveApi } from "@/services/api";
import { formatDisplayDate } from "@/lib/india-date";
import { CalendarCheck, ChevronRight, Pencil, Search, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/leave/policy")({ component: PolicyPage });

type BalanceRow = Awaited<ReturnType<typeof leaveApi.listAllBalances>>[number];

function PolicyPage() {
  const { t } = useTranslation();
  const [types, setTypes] = useState<LeaveTypeOption[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [editing, setEditing] = useState<BalanceRow | null>(null);
  const [adjustment, setAdjustment] = useState("0");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypePaid, setNewTypePaid] = useState(true);
  const [creatingType, setCreatingType] = useState(false);
  const [compOffCredits, setCompOffCredits] = useState<
    Awaited<ReturnType<typeof leaveApi.compOffCredits>>
  >([]);

  useEffect(() => {
    let active = true;
    Promise.all([leaveApi.types(true), employeesApi.list()])
      .then(([policyRows, employeeRows]) => {
        if (!active) return;
        const available = employeeRows.filter(
          (employee) => employee.employeeId && employee.active !== false,
        );
        setTypes(policyRows);
        setEmployees(available);
      })
      .catch((err) => toast.error((err as Error).message))
      .finally(() => active && setDirectoryLoading(false));
    return () => {
      active = false;
    };
  }, []);

  async function loadBalances(employeeId: string, showLoading = true) {
    if (!employeeId) return;
    if (showLoading) setBalancesLoading(true);
    try {
      const [balanceRows, creditRows] = await Promise.all([
        leaveApi.listAllBalances(employeeId),
        leaveApi.compOffCredits(employeeId).catch(() => []),
      ]);
      setBalances(balanceRows);
      setCompOffCredits(creditRows);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      if (showLoading) setBalancesLoading(false);
    }
  }

  async function createCustomType() {
    if (newTypeName.trim().length < 2) return toast.error(t("pages.leavePolicy.toastEnterTypeName"));
    setCreatingType(true);
    try {
      const created = await leaveApi.createType({ name: newTypeName.trim(), paid: newTypePaid });
      setTypes((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewTypeName("");
      toast.success(t("pages.leavePolicy.toastCustomTypeCreated"));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreatingType(false);
    }
  }

  async function toggleTypeActive(type: LeaveTypeOption) {
    try {
      const updated = await leaveApi.updateType(type.id, { active: !type.active });
      setTypes((current) => current.map((row) => (row.id === type.id ? updated : row)));
      toast.success(
        updated.active
          ? t("pages.leavePolicy.toastTypeActivated")
          : t("pages.leavePolicy.toastTypeDeactivated"),
      );
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function selectEmployee(employeeId: string) {
    setSelectedEmployeeId(employeeId);
    setBalances([]);
    void loadBalances(employeeId);
  }

  async function saveAdjustment() {
    if (!editing || reason.trim().length < 3) return toast.error(t("pages.leavePolicy.toastEnterReason"));
    const amount = Number(adjustment);
    if (!Number.isFinite(amount)) return toast.error(t("pages.leavePolicy.toastEnterValidAdjustment"));
    setSaving(true);
    try {
      await leaveApi.adjustBalance(editing.employeeId, editing.leaveTypeId, amount, reason.trim());
      toast.success(t("pages.leavePolicy.toastCreditUpdated"));
      setEditing(null);
      setReason("");
      await loadBalances(editing.employeeId, false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return employees;
    return employees.filter((employee) =>
      `${employee.name} ${employee.employeeCode ?? employee.employeeId} ${employee.department ?? ""}`
        .toLowerCase()
        .includes(query),
    );
  }, [employees, search]);
  const selectedEmployee = employees.find(
    (employee) => (employee.employeeId ?? employee.id) === selectedEmployeeId,
  );
  const creditTotals = useMemo(() => {
    if (!balances.length) return null;
    return {
      credited: balances.reduce((sum, row) => sum + row.entitled, 0),
      used: balances.reduce((sum, row) => sum + row.used, 0),
      available: balances.reduce((sum, row) => sum + row.balance, 0),
    };
  }, [balances]);

  return (
    <div>
      <PageHeader
        title={t("pages.leavePolicy.title")}
        description={t("pages.leavePolicy.subtitle")}
        actions={
          <InfoButton title={t("pages.leavePolicy.managing")}>
            {t("pages.leavePolicy.managingHelp")}
          </InfoButton>
        }
      />

      <section className="mb-4 space-y-3" aria-label="Leave policies">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {types.map((type) => (
            <div
              key={type.id}
              className="min-w-[12rem] shrink-0 rounded-lg border bg-card px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold">{type.name}</p>
                <InfoButton title={type.name} className="-mr-1 -mt-0.5">
                  {type.description || t("pages.leavePolicy.defaultTypeDescription")}
                </InfoButton>
              </div>
              <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <CalendarCheck className="h-3 w-3 text-primary" />
                {type.paid ? t("pages.leavePolicy.creditBased") : t("pages.leavePolicy.recordedSeparately")}
                {!type.active ? ` · ${t("pages.leavePolicy.inactive")}` : ""}
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 h-7 px-2 text-xs"
                onClick={() => void toggleTypeActive(type)}
              >
                {type.active ? t("pages.leavePolicy.deactivate") : t("pages.leavePolicy.activate")}
              </Button>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="new-leave-type">{t("pages.leavePolicy.addCustomType")}</Label>
            <Input
              id="new-leave-type"
              value={newTypeName}
              onChange={(event) => setNewTypeName(event.target.value)}
              placeholder="e.g. Marriage Leave"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={newTypePaid}
              onChange={(event) => setNewTypePaid(event.target.checked)}
            />
            {t("pages.leavePolicy.paidCreditBased")}
          </label>
          <Button type="button" disabled={creatingType} onClick={() => void createCustomType()}>
            {creatingType ? t("pages.leavePolicy.creating") : t("pages.leavePolicy.createType")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("pages.leavePolicy.protectedTypesNote")}</p>
      </section>

      <section className="overflow-hidden rounded-md border border-border bg-background">
        <div className="border-b border-border px-4 py-4 sm:px-5">
          <h2 className="font-semibold">{t("pages.leavePolicy.employeeCreditsTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("pages.leavePolicy.employeeCreditsHelp")}</p>
        </div>

        {directoryLoading ? (
          <LoadingState label={t("pages.loading.leavePolicy")} />
        ) : (
          <div className="grid min-h-0 lg:min-h-[420px] lg:grid-cols-[minmax(260px,0.34fr)_minmax(0,1fr)]">
            <aside className="border-b border-border lg:border-b-0 lg:border-r">
              <div className="border-b border-border p-3">
                <div className="mb-2 lg:hidden">
                  <Select value={selectedEmployeeId} onValueChange={selectEmployee}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("pages.leavePolicy.chooseEmployee")} />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredEmployees.map((employee) => {
                        const employeeId = employee.employeeId ?? employee.id;
                        return (
                          <SelectItem key={employeeId} value={employeeId}>
                            {employee.name} - {employee.employeeCode ?? employeeId}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t("pages.leavePolicy.searchEmployees")}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="hidden max-h-72 overflow-y-auto p-2 lg:block lg:max-h-[520px]">
                {filteredEmployees.map((employee) => {
                  const employeeId = employee.employeeId ?? employee.id;
                  const selected = employeeId === selectedEmployeeId;
                  return (
                    <button
                      key={employeeId}
                      type="button"
                      onClick={() => selectEmployee(employeeId)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-3 py-3 text-left transition-colors",
                        selected ? "bg-primary/10 text-foreground" : "hover:bg-muted/70",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
                          selected
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        <UserRound className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {employee.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {employee.employeeCode ?? employee.employeeId} ·{" "}
                          {employee.department ?? t("pages.leavePolicy.noUnit")}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  );
                })}
                {!filteredEmployees.length && (
                  <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                    {t("pages.leavePolicy.noEmployeesMatch")}
                  </p>
                )}
              </div>
            </aside>

            <div className="min-w-0 p-4 sm:p-5">
              {!selectedEmployee ? (
                <div className="flex min-h-72 flex-col items-center justify-center text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <UserRound className="h-6 w-6" />
                  </span>
                  <p className="mt-3 font-semibold">{t("pages.leavePolicy.selectEmployee")}</p>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                    {t("pages.leavePolicy.selectEmployeeHelp")}
                  </p>
                </div>
              ) : balancesLoading ? (
                <LoadingState
                  label={t("pages.leavePolicy.loadingEmployeeCredits", {
                    name: selectedEmployee.name,
                  })}
                />
              ) : (
                <div>
                  <div className="mb-4 flex flex-col gap-1 border-b border-border pb-4">
                    <h3 className="text-lg font-semibold">{selectedEmployee.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {selectedEmployee.employeeCode ?? selectedEmployee.employeeId} ·{" "}
                      {selectedEmployee.department ?? t("pages.leavePolicy.noOrganizationUnit")}
                    </p>
                  </div>
                  {creditTotals && (
                    <div className="mb-4 grid gap-3 sm:grid-cols-3">
                      <StatCard
                        label={t("pages.leavePolicy.credited")}
                        value={creditTotals.credited}
                        icon={CalendarCheck}
                      />
                      <StatCard label={t("pages.leavePolicy.used")} value={creditTotals.used} icon={Pencil} />
                      <StatCard
                        label={t("pages.leavePolicy.available")}
                        value={creditTotals.available}
                        icon={UserRound}
                        tone="success"
                      />
                    </div>
                  )}
                  <div className="space-y-3">
                    {balances.map((row) => (
                      <div
                        key={row.id}
                        className="grid gap-3 rounded-md border border-border p-4 md:grid-cols-[minmax(0,1fr)_repeat(3,minmax(70px,0.35fr))_auto] md:items-center"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold">{row.leaveType}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {t("pages.leavePolicy.manualAdjustment", {
                              value: row.manualAdjustment,
                            })}
                          </p>
                        </div>
                        <CreditValue label={t("pages.leavePolicy.credited")} value={row.entitled} />
                        <CreditValue label={t("pages.leavePolicy.used")} value={row.used} />
                        <CreditValue label={t("pages.leavePolicy.available")} value={row.balance} emphasize />
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full sm:w-auto"
                          onClick={() => {
                            setEditing(row);
                            setAdjustment(String(row.manualAdjustment));
                          }}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          {t("pages.leavePolicy.editCredit")}
                        </Button>
                      </div>
                    ))}
                    {!balances.length && (
                      <p className="py-10 text-center text-sm text-muted-foreground">
                        {t("pages.leavePolicy.noCreditsConfigured")}
                      </p>
                    )}
                  </div>
                  {compOffCredits.length > 0 && (
                    <div className="mt-6 space-y-2">
                      <h4 className="text-sm font-semibold">{t("pages.leavePolicy.compOffLedger")}</h4>
                      {compOffCredits.slice(0, 12).map((credit) => (
                        <div
                          key={credit.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                        >
                          <span className="tabular-nums">
                            {formatDisplayDate(credit.earnedDate)}
                          </span>
                          <span className="text-muted-foreground">{credit.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("pages.leavePolicy.updateCreditTitle")}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="font-semibold">{editing.employeeName}</p>
                <p className="text-sm text-muted-foreground">{editing.leaveType}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manual-adjustment">{t("pages.leavePolicy.manualCreditAdjustment")}</Label>
                <Input
                  id="manual-adjustment"
                  type="number"
                  step="0.5"
                  value={adjustment}
                  onChange={(event) => setAdjustment(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t("pages.leavePolicy.adjustmentHelp")}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adjustment-reason">{t("pages.leavePolicy.reason")}</Label>
                <Textarea
                  id="adjustment-reason"
                  rows={3}
                  maxLength={500}
                  placeholder={t("pages.leavePolicy.reasonPlaceholder")}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
                <p className="text-right text-xs text-muted-foreground">{reason.length}/500</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              {t("pages.leavePolicy.cancel")}
            </Button>
            <Button onClick={saveAdjustment} disabled={saving}>
              {saving ? t("pages.leavePolicy.saving") : t("pages.leavePolicy.saveCredit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreditValue({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-semibold ${emphasize ? "text-primary" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}
