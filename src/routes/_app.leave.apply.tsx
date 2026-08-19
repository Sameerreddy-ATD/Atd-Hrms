import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { InfoButton } from "@/components/common/InfoButton";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingState } from "@/components/common/LoadingState";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { leaveApi, employeesApi } from "@/services/api";
import { useAuth } from "@/lib/auth";
import { formatDisplayDate, indiaDateKey, indiaDateKeyShift } from "@/lib/india-date";
import {
  autoAllocateLeaveTypes,
  eachDateKeys,
  sickDaysUsedInMonth,
  sickLeaveMonthCap,
  sortLeaveTypesForApply,
  weekOffSkipKeys,
} from "@/lib/leave-allocation";
import type {
  LeaveBalance,
  LeaveRequest,
  LeaveTypeOption,
  WeeklyOffPolicy,
  WeeklyOffRequest,
} from "@/types/domain";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Minus,
  Plus,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/leave/apply")({
  component: ApplyLeavePage,
});

type Allocation = Record<string, number>;

function ApplyLeavePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [types, setTypes] = useState<LeaveTypeOption[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [medicalDocumentUrl, setMedicalDocumentUrl] = useState("");
  const [medicalFile, setMedicalFile] = useState<File | null>(null);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [weeklyOffs, setWeeklyOffs] = useState<WeeklyOffRequest[]>([]);
  const [myLeaves, setMyLeaves] = useState<LeaveRequest[]>([]);
  const [weeklyOffDate, setWeeklyOffDate] = useState("");
  const [weeklyOffReason, setWeeklyOffReason] = useState("");
  const [weeklyOffSaving, setWeeklyOffSaving] = useState(false);
  const [approverName, setApproverName] = useState<string | null>(null);
  const [approverLoading, setApproverLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [typesLoading, setTypesLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [requestKind, setRequestKind] = useState<"leave" | "weekly-off">("leave");
  const [duration, setDuration] = useState<"FULL" | "HALF">("FULL");
  const [halfSlot, setHalfSlot] = useState<"FIRST_HALF" | "SECOND_HALF">("FIRST_HALF");
  const [weeklyOffPolicy, setWeeklyOffPolicy] = useState<WeeklyOffPolicy>("SELECTABLE");
  const [allocation, setAllocation] = useState<Allocation>({});
  const [manuallyEdited, setManuallyEdited] = useState(false);
  const todayString = indiaDateKey();

  const session = duration === "HALF" ? halfSlot : "FULL";
  const sortedTypes = useMemo(() => sortLeaveTypesForApply(types), [types]);

  const rangeEnd = duration === "HALF" ? from : to;
  const rangeKeys = useMemo(
    () => (from && rangeEnd ? eachDateKeys(from, rangeEnd) : []),
    [from, rangeEnd],
  );
  const approvedWeekOffKeys = useMemo(
    () =>
      weeklyOffs
        .filter((row) => row.status === "APPROVED")
        .map((row) => row.date.slice(0, 10)),
    [weeklyOffs],
  );
  const pendingWeekOffInRange = useMemo(
    () =>
      weeklyOffs.filter(
        (row) =>
          row.status === "PENDING" &&
          rangeKeys.includes(row.date.slice(0, 10)),
      ),
    [weeklyOffs, rangeKeys],
  );
  const skippedWeekOffKeys = useMemo(
    () =>
      weekOffSkipKeys({
        policy: weeklyOffPolicy,
        dateKeys: rangeKeys,
        approvedWeeklyOffKeys: approvedWeekOffKeys,
      }),
    [weeklyOffPolicy, rangeKeys, approvedWeekOffKeys],
  );

  const requestedDays = useMemo(() => {
    if (!from) return 0;
    if (duration === "HALF") {
      if (skippedWeekOffKeys.includes(from)) return 0;
      return 0.5;
    }
    if (!to || from > to) return 0;
    return Math.max(0, rangeKeys.length - skippedWeekOffKeys.length);
  }, [from, to, duration, rangeKeys, skippedWeekOffKeys]);

  const sickType = useMemo(() => types.find((row) => row.code === "SICK"), [types]);
  const sickMonthMax = sickType?.maxPerMonth ?? 2;
  const sickMonthKey = from.slice(0, 7);
  const sickUsedThisMonth = useMemo(
    () =>
      sickType && sickMonthKey
        ? sickDaysUsedInMonth(myLeaves, sickType.name, sickMonthKey)
        : 0,
    [myLeaves, sickType, sickMonthKey],
  );
  const sickMonthRemaining = useMemo(() => {
    const balance = balances.find((row) => row.code === "SICK")?.balance ?? 0;
    return sickLeaveMonthCap(balance, sickMonthMax, sickUsedThisMonth);
  }, [balances, sickMonthMax, sickUsedThisMonth]);
  const sickSpansMonths = Boolean(
    duration !== "HALF" && from && to && from.slice(0, 7) !== to.slice(0, 7),
  );

  const allocatedTypes = useMemo(
    () =>
      types.filter((t) => (allocation[t.id] ?? 0) > 0),
    [types, allocation],
  );

  const requiresMedical = allocatedTypes.some((t) => t.requiresMedicalDocument);
  const requiresApprover = allocatedTypes.some((t) => t.approvalRequired);

  const totalAllocated = useMemo(
    () =>
      Object.values(allocation).reduce((s, v) => s + v, 0),
    [allocation],
  );

  const paidDays = useMemo(() => {
    return allocatedTypes
      .filter((t) => t.paid && t.code !== "LOP")
      .reduce((s, t) => s + (allocation[t.id] ?? 0), 0);
  }, [allocatedTypes, allocation]);

  const unpaidDays = useMemo(() => {
    const lop = types.find((t) => t.code === "LOP");
    return lop ? allocation[lop.id] ?? 0 : 0;
  }, [types, allocation]);

  useEffect(() => {
    Promise.all([leaveApi.types(), leaveApi.myBalance(), leaveApi.weeklyOffs(), leaveApi.mine()])
      .then(([rows, balanceRows, weeklyRows, leaveRows]) => {
        setTypes(rows);
        setBalances(balanceRows);
        setWeeklyOffs(weeklyRows);
        setMyLeaves(leaveRows);
      })
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setTypesLoading(false));
  }, []);

  useEffect(() => {
    if (!user?.employeeId) {
      setWeeklyOffPolicy("SELECTABLE");
      return;
    }
    if (user.weeklyOffPolicy) {
      setWeeklyOffPolicy(user.weeklyOffPolicy);
      return;
    }
    employeesApi
      .get(user.employeeId)
      .then((profile) => setWeeklyOffPolicy(profile?.weeklyOffPolicy || "SELECTABLE"))
      .catch(() => setWeeklyOffPolicy("SELECTABLE"));
  }, [user?.employeeId, user?.weeklyOffPolicy]);

  useEffect(() => {
    if (!user?.employeeId) {
      setApproverName(null);
      setApproverLoading(false);
      return;
    }
    setApproverLoading(true);
    leaveApi
      .approver()
      .then((result) => setApproverName(result.approverName))
      .catch(() => setApproverName(null))
      .finally(() => setApproverLoading(false));
  }, [user?.employeeId]);

  // Auto-allocate when dates/duration change (unless user manually edited)
  useEffect(() => {
    if (requestedDays <= 0 || types.length === 0) {
      if (!manuallyEdited) setAllocation({});
      return;
    }
    if (!manuallyEdited) {
      setAllocation(autoAllocateLeaveTypes(requestedDays, types, balances));
    }
  }, [requestedDays, types, balances, manuallyEdited]);

  const handleAutoAllocate = useCallback(() => {
    if (requestedDays <= 0) return;
    setAllocation(autoAllocateLeaveTypes(requestedDays, types, balances));
    setManuallyEdited(false);
  }, [requestedDays, types, balances]);

  const updateAlloc = useCallback(
    (typeId: string, days: number) => {
      setManuallyEdited(true);
      setAllocation((prev) => {
        const next = { ...prev };
        if (days <= 0) {
          delete next[typeId];
        } else {
          const type = types.find((row) => row.id === typeId);
          let nextDays = Math.round(days * 100) / 100;
          if (type?.code === "SICK") {
            nextDays = Math.min(nextDays, sickSpansMonths ? 0 : sickMonthRemaining);
          }
          if (type?.code === "COMP_OFF") {
            const cap = balances.find((row) => row.code === "COMP_OFF")?.balance ?? 0;
            nextDays = Math.min(Math.floor(nextDays), Math.floor(cap));
          }
          if (nextDays <= 0) delete next[typeId];
          else next[typeId] = nextDays;
        }
        return next;
      });
    },
    [types, balances, sickMonthRemaining, sickSpansMonths],
  );

  const stepAlloc = useCallback(
    (typeId: string, delta: number) => {
      const type = types.find((row) => row.id === typeId);
      const step = type?.code === "COMP_OFF" ? 1 : 0.5;
      const current = allocation[typeId] ?? 0;
      updateAlloc(typeId, Math.max(0, current + delta * step));
    },
    [allocation, types, updateAlloc],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!from) {
      errs.from = t("pages.leaveApply.errFromRequired");
    } else if (from < todayString) {
      errs.from = t("pages.leaveApply.errFromPast");
    }
    if (duration === "HALF" && from && skippedWeekOffKeys.includes(from)) {
      errs.from = t("pages.leaveApply.errWeekOffCannotBeLeave");
    }
    if (duration !== "HALF") {
      if (!to) {
        errs.to = t("pages.leaveApply.errToRequired");
      } else if (to < todayString) {
        errs.to = t("pages.leaveApply.errToPast");
      }
      if (from && to && from > to) errs.to = t("pages.leaveApply.errToAfterStart");
      if (from && to && from <= to && requestedDays <= 0) {
        errs.to = t("pages.leaveApply.errAllDaysAreWeekOff");
      }
    }
    if (reason.trim().length < 3) errs.reason = t("pages.leaveApply.errReasonMin");
    if (reason.length > 1000) errs.reason = t("pages.leaveApply.errReasonMax");
    if (totalAllocated <= 0) errs.allocation = t("pages.leaveApply.errTypeRequired");
    if (requestedDays > 0 && Math.abs(totalAllocated - requestedDays) > 0.01) {
      errs.allocation = t("pages.leaveApply.allocTotalMismatch", { total: requestedDays });
    }
    // Check per-type balance
    for (const type of allocatedTypes) {
      if (type.code === "LOP") continue;
      const bal = balances.find((b) => b.code === type.code)?.balance ?? 0;
      if ((allocation[type.id] ?? 0) > bal) {
        errs[`alloc_${type.id}`] = t("pages.leaveApply.allocExceedsBalance", { balance: bal });
      }
      if (type.code === "SICK") {
        if (sickSpansMonths) {
          errs[`alloc_${type.id}`] = t("pages.leaveApply.errSickCrossMonth");
        } else if ((allocation[type.id] ?? 0) > sickMonthRemaining) {
          errs[`alloc_${type.id}`] = t("pages.leaveApply.errSickMonthlyCap", {
            max: sickMonthMax,
            remaining: sickMonthRemaining,
          });
        }
      }
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      let medicalUrl = medicalDocumentUrl.trim() || undefined;
      if (requiresMedical && medicalFile) {
        if (medicalFile.size > 1_500_000) {
          toast.error(t("pages.leaveApply.toastMedicalTooLarge"));
          setLoading(false);
          return;
        }
        const { fileToBase64 } = await import("@/lib/file-upload");
        const upload = await fileToBase64(medicalFile);
        const stored = await leaveApi.uploadMedicalFile(upload);
        medicalUrl = stored.url;
      }

      const nonZero = Object.entries(allocation)
        .filter(([, days]) => days > 0)
        .map(([leaveTypeId, days]) => ({ leaveTypeId, days }));

      if (nonZero.length === 1) {
        // Single type — use the original endpoint for backwards compatibility
        await leaveApi.apply({
          leaveTypeId: nonZero[0].leaveTypeId,
          fromDate: from,
          toDate: duration === "HALF" ? from : to,
          days: nonZero[0].days,
          session,
          reason: reason.trim(),
          medicalDocumentUrl: medicalUrl,
        });
      } else {
        await leaveApi.applySplit({
          fromDate: from,
          toDate: duration === "HALF" ? from : to,
          session,
          reason: reason.trim(),
          medicalDocumentUrl: medicalUrl,
          allocations: nonZero,
        });
      }
      toast.success(t("pages.leaveApply.splitSubmitted"));
      navigate({ to: "/leave/history" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function submitWeeklyOff(e: React.FormEvent) {
    e.preventDefault();
    if (!weeklyOffDate) return toast.error(t("pages.leaveApply.toastSelectWeeklyOffDate"));
    setWeeklyOffSaving(true);
    try {
      const request = await leaveApi.requestWeeklyOff(
        weeklyOffDate,
        weeklyOffReason.trim() || undefined,
      );
      setWeeklyOffs((current) => [request, ...current]);
      setWeeklyOffDate("");
      setWeeklyOffReason("");
      toast.success(
        request.status === "APPROVED"
          ? t("pages.leaveApply.toastSundayConfirmed")
          : t("pages.leaveApply.toastWeeklyOffSent"),
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setWeeklyOffSaving(false);
    }
  }

  async function cancelWeeklyOff(id: string) {
    setWeeklyOffSaving(true);
    try {
      const updated = await leaveApi.cancelWeeklyOff(id);
      setWeeklyOffs((current) => current.map((item) => (item.id === id ? updated : item)));
      toast.success(t("pages.leaveApply.toastWeeklyOffCancelled"));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setWeeklyOffSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={t("pages.leaveApply.title")}
        description={t("pages.leaveApply.subtitle")}
        actions={
          <InfoButton title={t("pages.leaveApply.process")}>
            {t("pages.leaveApply.processHelp")}
          </InfoButton>
        }
      />
      <div className="mb-5 grid w-full grid-cols-2 rounded-lg border bg-muted/30 p-1 sm:w-[26rem]">
        <Button
          type="button"
          variant={requestKind === "leave" ? "default" : "ghost"}
          className="whitespace-normal"
          onClick={() => setRequestKind("leave")}
        >
          <CalendarDays className="h-4 w-4" /> {t("pages.leaveApply.leaveRequestTab")}
        </Button>
        <Button
          type="button"
          variant={requestKind === "weekly-off" ? "default" : "ghost"}
          className="whitespace-normal"
          onClick={() => setRequestKind("weekly-off")}
        >
          <CalendarClock className="h-4 w-4" /> {t("pages.leaveApply.weeklyOffTab")}
        </Button>
      </div>
      {typesLoading && <LoadingState label={t("pages.loading.leaveOptions")} />}

      {/* ─── Leave Request ─── */}
      {!typesLoading && requestKind === "leave" && (
        <div className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <Card>
            <CardContent className="space-y-5 p-4 sm:p-6">
              {!approverLoading && requiresApprover && !approverName && (
                <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {t("pages.leaveApply.noHeadAvailable")}
                </p>
              )}
              {!approverLoading && requiresApprover && approverName && (
                <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  {t("pages.leaveApply.sentToHeadPrefix")}{" "}
                  <span className="font-medium text-foreground">{approverName}</span>
                  {t("pages.leaveApply.sentToHeadSuffix")}
                </p>
              )}

              <form onSubmit={submit} className="space-y-5" noValidate>
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm leading-6 text-muted-foreground">
                  <p>{t("pages.leaveApply.autoAllocateOrderHelp")}</p>
                  <p className="mt-1">
                    {weeklyOffPolicy === "SUNDAY_FIXED"
                      ? t("pages.leaveApply.sundaySkippedHelp")
                      : t("pages.leaveApply.selectableWeekOffFirstHelp")}
                  </p>
                </div>
                {/* Duration */}
                <div className="space-y-1.5">
                  <Label>{t("pages.leaveApply.duration")}</Label>
                  <div className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/30 p-1">
                    <Button
                      type="button"
                      variant={duration === "FULL" ? "default" : "ghost"}
                      onClick={() => {
                        setDuration("FULL");
                        setManuallyEdited(false);
                      }}
                    >
                      {t("pages.leaveApply.fullDay")}
                    </Button>
                    <Button
                      type="button"
                      variant={duration === "HALF" ? "default" : "ghost"}
                      onClick={() => {
                        setDuration("HALF");
                        if (from) setTo(from);
                        setManuallyEdited(false);
                      }}
                    >
                      {t("pages.leaveApply.halfDay")}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("pages.leaveApply.halfDayHelp")}
                  </p>
                </div>

                {/* Half-day slot */}
                {duration === "HALF" && (
                  <div className="space-y-1.5">
                    <Label>{t("pages.leaveApply.halfDaySlot")}</Label>
                    <div className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/30 p-1">
                      <Button
                        type="button"
                        variant={halfSlot === "FIRST_HALF" ? "default" : "ghost"}
                        onClick={() => setHalfSlot("FIRST_HALF")}
                      >
                        {t("pages.leaveApply.preLunch")}
                      </Button>
                      <Button
                        type="button"
                        variant={halfSlot === "SECOND_HALF" ? "default" : "ghost"}
                        onClick={() => setHalfSlot("SECOND_HALF")}
                      >
                        {t("pages.leaveApply.postLunch")}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Dates */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="from">
                      {duration === "HALF"
                        ? t("pages.leaveApply.date")
                        : t("pages.leaveApply.from")}
                    </Label>
                    <DateField
                      id="from"
                      value={from}
                      min={todayString}
                      max={duration === "HALF" ? undefined : to || undefined}
                      onChange={(nextFrom) => {
                        setFrom(nextFrom);
                        setManuallyEdited(false);
                        if (duration === "HALF") setTo(nextFrom);
                        else if (to && nextFrom && to < nextFrom) setTo(nextFrom);
                      }}
                    />
                    {errors.from && <p className="text-xs text-destructive">{errors.from}</p>}
                  </div>
                  {duration !== "HALF" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="to">{t("pages.leaveApply.to")}</Label>
                      <DateField
                        id="to"
                        value={to}
                        min={from || todayString}
                        onChange={(v) => {
                          setTo(v);
                          setManuallyEdited(false);
                        }}
                      />
                      {errors.to && <p className="text-xs text-destructive">{errors.to}</p>}
                    </div>
                  )}
                </div>

                {requestedDays > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/[0.03] px-3 py-2">
                      <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
                      <span className="text-sm font-medium">
                        {requestedDays === 0.5
                          ? t("pages.leaveApply.halfDayCount", {
                              slot:
                                halfSlot === "FIRST_HALF"
                                  ? t("pages.leaveApply.preLunch")
                                  : t("pages.leaveApply.postLunch"),
                            })
                          : t("pages.leaveApply.dayCount", { count: requestedDays })}
                      </span>
                    </div>
                    {skippedWeekOffKeys.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {t("pages.leaveApply.skippedWeekOffDays", {
                          dates: skippedWeekOffKeys.map((key) => formatDisplayDate(key)).join(", "),
                        })}
                      </p>
                    )}
                    {pendingWeekOffInRange.length > 0 && (
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        {t("pages.leaveApply.pendingWeekOffCountsAsLeave", {
                          dates: pendingWeekOffInRange
                            .map((row) => formatDisplayDate(row.date))
                            .join(", "),
                        })}{" "}
                        <button
                          type="button"
                          className="font-medium text-primary underline-offset-2 hover:underline"
                          onClick={() => setRequestKind("weekly-off")}
                        >
                          {t("pages.leaveApply.weeklyOffTab")}
                        </button>
                      </p>
                    )}
                  </div>
                )}
                {duration === "HALF" && from && skippedWeekOffKeys.includes(from) && (
                  <p className="text-xs text-destructive">
                    {t("pages.leaveApply.errWeekOffCannotBeLeave")}
                  </p>
                )}
                {duration !== "HALF" && from && to && from <= to && requestedDays <= 0 && (
                  <p className="text-xs text-destructive">
                    {t("pages.leaveApply.errAllDaysAreWeekOff")}
                  </p>
                )}

                {/* ─── Leave Type Allocation ─── */}
                {requestedDays > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-sm font-semibold">
                        {t("pages.leaveApply.allocateLeaveTypes")}
                      </Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={handleAutoAllocate}
                      >
                        <Sparkles className="h-3 w-3" />
                        {t("pages.leaveApply.autoAllocate")}
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {sortedTypes.map((type) => {
                        const bal = balances.find((b) => b.code === type.code)?.balance ?? 0;
                        const isLop = type.code === "LOP";
                        const isSick = type.code === "SICK";
                        const isComp = type.code === "COMP_OFF";
                        const days = allocation[type.id] ?? 0;
                        const typeCap = isSick
                          ? sickSpansMonths
                            ? 0
                            : sickMonthRemaining
                          : isLop
                            ? 365
                            : isComp
                              ? Math.floor(bal)
                              : bal;
                        const exceedsBal = !isLop && days > typeCap;
                        const errKey = `alloc_${type.id}`;
                        const plusDisabled = days >= typeCap;

                        return (
                          <div
                            key={type.id}
                            className={cn(
                              "flex flex-wrap items-center gap-3 rounded-xl border p-3 transition-colors sm:flex-nowrap",
                              days > 0
                                ? exceedsBal
                                  ? "border-destructive/30 bg-destructive/[0.03]"
                                  : "border-primary/25 bg-primary/[0.03]"
                                : "border-border/80 bg-card",
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-medium">{type.name}</p>
                                {isSick && (
                                  <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                                    {t("pages.leaveApply.sickMonthlyBadge", { max: sickMonthMax })}
                                  </span>
                                )}
                                {!type.paid && (
                                  <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                    {t("pages.leaveApply.unpaidDays").split("(")[0].trim()}
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {isLop
                                  ? t("pages.leaveApply.unlimited")
                                  : isSick
                                    ? t("pages.leaveApply.sickMonthlyCapDetail", {
                                        max: sickMonthMax,
                                        used: sickUsedThisMonth,
                                        remaining: sickMonthRemaining,
                                        balance: bal,
                                      })
                                    : type.code === "COMP_OFF"
                                      ? t("pages.leaveApply.compOffEarnedHelp", { count: bal })
                                      : t("pages.leaveApply.balanceAvailable", { count: bal })}
                              </p>
                              {errors[errKey] && (
                                <p className="mt-1 text-xs text-destructive">{errors[errKey]}</p>
                              )}
                            </div>

                            {/* Stepper */}
                            <div className="flex shrink-0 items-center gap-1.5">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                disabled={days <= 0}
                                onClick={() => stepAlloc(type.id, -1)}
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </Button>
                              <Input
                                type="number"
                                min={0}
                                max={typeCap}
                                step={0.5}
                                value={days || ""}
                                placeholder="0"
                                className="h-8 w-16 text-center tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                onChange={(e) => {
                                  const v = parseFloat(e.target.value);
                                  updateAlloc(type.id, Number.isNaN(v) ? 0 : v);
                                }}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                disabled={plusDisabled}
                                onClick={() => stepAlloc(type.id, 1)}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Allocation total bar */}
                    <div
                      className={cn(
                        "flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium",
                        Math.abs(totalAllocated - requestedDays) < 0.01
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                          : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
                      )}
                    >
                      <span>{t("pages.leaveApply.totalAllocated")}</span>
                      <span className="tabular-nums">
                        {totalAllocated} / {requestedDays}{" "}
                        {t("pages.leaveApply.daysToUse").toLowerCase()}
                      </span>
                    </div>
                    {errors.allocation && (
                      <p className="text-xs text-destructive">{errors.allocation}</p>
                    )}
                  </div>
                )}

                {/* Medical document */}
                {requiresMedical && (
                  <div className="space-y-1.5">
                    <Label htmlFor="medical-document-file">
                      {t("pages.leaveApply.medicalCertLabel")}
                    </Label>
                    <Input
                      id="medical-document-file"
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                      onChange={(event) => {
                        setMedicalFile(event.target.files?.[0] ?? null);
                        setMedicalDocumentUrl("");
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("pages.leaveApply.medicalCertHelp")}
                    </p>
                  </div>
                )}

                {/* Reason */}
                <div className="space-y-1.5">
                  <Label htmlFor="reason">{t("pages.corrections.reason")}</Label>
                  <Textarea
                    id="reason"
                    rows={4}
                    value={reason}
                    maxLength={1000}
                    onChange={(e) => setReason(e.target.value.slice(0, 1000))}
                  />
                  <div className="flex items-center justify-between gap-3">
                    {errors.reason ? (
                      <p className="text-xs text-destructive">{errors.reason}</p>
                    ) : (
                      <span />
                    )}
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {t("pages.leaveApply.charsLeft", { count: 1000 - reason.length })}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate({ to: "/leave/history" })}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      loading ||
                      typesLoading ||
                      requestedDays <= 0 ||
                      (requiresApprover && (approverLoading || !approverName))
                    }
                  >
                    {t("pages.leaveApply.submit")}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Sidebar summary */}
          <aside className="rounded-lg border bg-muted/20 p-4 lg:sticky lg:top-4 lg:self-start">
            <h2 className="text-sm font-semibold">{t("pages.leaveApply.requestSummary")}</h2>
            <div className="mt-4 space-y-4">
              <LeaveSummary
                icon={CalendarDays}
                label={t("pages.leaveApply.requested")}
                value={
                  requestedDays
                    ? requestedDays === 0.5
                      ? t("pages.leaveApply.halfDayCount", {
                          slot:
                            halfSlot === "FIRST_HALF"
                              ? t("pages.leaveApply.preLunch")
                              : t("pages.leaveApply.postLunch"),
                        })
                      : t("pages.leaveApply.dayCount", { count: requestedDays })
                    : t("pages.leaveApply.selectDates")
                }
              />
              <LeaveSummary
                icon={UserRound}
                label={t("pages.leaveApply.approver")}
                value={
                  requiresApprover
                    ? approverLoading
                      ? t("pages.leaveApply.checking")
                      : (approverName ?? t("pages.leaveApply.notAssigned"))
                    : t("pages.leaveApply.noApproval")
                }
              />
            </div>

            {/* Allocation breakdown in sidebar */}
            {allocatedTypes.length > 0 && (
              <div className="mt-5 space-y-2 border-t pt-4">
                <h3 className="text-xs font-semibold text-muted-foreground">
                  {t("pages.leaveApply.allocationBreakdown")}
                </h3>
                {allocatedTypes.map((type) => (
                  <div
                    key={type.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="min-w-0 truncate">{type.name}</span>
                    <span className="shrink-0 tabular-nums font-medium">
                      {allocation[type.id]}d
                    </span>
                  </div>
                ))}
                {paidDays > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                    <Wallet className="h-3 w-3" />
                    {t("pages.leaveApply.paidDays")}: {paidDays}
                  </div>
                )}
                {unpaidDays > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <Wallet className="h-3 w-3" />
                    {t("pages.leaveApply.unpaidDays")}: {unpaidDays}
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      )}

      {/* ─── Weekly Off Request ─── */}
      {!typesLoading && requestKind === "weekly-off" && (
        <div className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="mb-5 flex items-start gap-3">
                <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <h2 className="font-semibold">
                    {weeklyOffPolicy === "SUNDAY_FIXED"
                      ? t("pages.leaveApply.sundayWeekOff")
                      : t("pages.leaveApply.weeklyOff")}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {weeklyOffPolicy === "SUNDAY_FIXED"
                      ? t("pages.leaveApply.sundayFixedHelp")
                      : t("pages.leaveApply.selectableWeeklyOffHelp")}
                  </p>
                  {weeklyOffPolicy === "SELECTABLE" && (
                    <p className="mt-2 text-sm leading-6 text-foreground">
                      {t("pages.leaveApply.selectableWeekOffFirstHelp")}
                    </p>
                  )}
                </div>
              </div>
              {weeklyOffPolicy === "SUNDAY_FIXED" ? (
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-5">
                  <p className="text-sm font-medium text-foreground">
                    {t("pages.leaveApply.fixedSundayActive")}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {t("pages.leaveApply.fixedSundayContactHelp")}
                  </p>
                </div>
              ) : (
                <>
                  {!approverLoading && approverName && (
                    <p className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                      {t("pages.leaveApply.sentToHeadPrefix")}{" "}
                      <span className="font-medium text-foreground">{approverName}</span>
                      {t("pages.leaveApply.sentToHeadSuffix")}
                    </p>
                  )}
                  <form onSubmit={submitWeeklyOff} className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="weekly-off-date">
                        {t("pages.leaveApply.requestedDateLabel")}
                      </Label>
                      <DateField
                        id="weekly-off-date"
                        value={weeklyOffDate}
                        min={indiaDateKeyShift(0)}
                        onChange={setWeeklyOffDate}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="weekly-off-reason">
                        {t("pages.leaveApply.reasonOptional")}
                      </Label>
                      <Input
                        id="weekly-off-reason"
                        value={weeklyOffReason}
                        maxLength={500}
                        placeholder={t("pages.leaveApply.notePlaceholder")}
                        onChange={(event) => setWeeklyOffReason(event.target.value)}
                      />
                    </div>
                    <div className="flex justify-end gap-2 sm:col-span-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => navigate({ to: "/leave/history" })}
                      >
                        {t("common.cancel")}
                      </Button>
                      <Button type="submit" disabled={weeklyOffSaving || !weeklyOffDate}>
                        {weeklyOffSaving
                          ? t("pages.leaveApply.sending")
                          : t("pages.leaveApply.submit")}
                      </Button>
                    </div>
                  </form>
                  {weeklyOffs.length > 0 && (
                    <div className="mt-5 space-y-2">
                      <h3 className="text-sm font-semibold">
                        {t("pages.leaveApply.recentWeeklyOffRequests")}
                      </h3>
                      {weeklyOffs.slice(0, 6).map((request) => (
                        <div
                          key={request.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-3 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="font-medium">{formatDisplayDate(request.date)}</p>
                            {request.reviewedByName && (
                              <p className="text-xs text-muted-foreground">
                                {request.status === "REJECTED"
                                  ? t("pages.leaveApply.rejectedBy", {
                                      name: request.reviewedByName,
                                    })
                                  : request.status === "APPROVED"
                                    ? t("pages.leaveApply.approvedBy", {
                                        name: request.reviewedByName,
                                      })
                                    : request.reviewedByName}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <StatusBadge status={request.status} />
                            {(request.status === "PENDING" || request.status === "APPROVED") && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={weeklyOffSaving}
                                onClick={() => void cancelWeeklyOff(request.id)}
                              >
                                {t("common.cancel")}
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
          <aside className="rounded-lg border bg-muted/20 p-4 lg:sticky lg:top-4 lg:self-start">
            <h2 className="text-sm font-semibold">{t("pages.leaveApply.requestSummary")}</h2>
            <div className="mt-4 space-y-4">
              <LeaveSummary
                icon={CalendarClock}
                label={t("pages.leaveApply.policy")}
                value={
                  weeklyOffPolicy === "SUNDAY_FIXED"
                    ? t("pages.leaveApply.sundayFixedValue")
                    : t("pages.leaveApply.selectableValue")
                }
              />
              {weeklyOffPolicy === "SELECTABLE" && (
                <>
                  <LeaveSummary
                    icon={CalendarDays}
                    label={t("pages.leaveApply.requestedDateLabel")}
                    value={weeklyOffDate || t("pages.leaveApply.selectADate")}
                  />
                  <LeaveSummary
                    icon={UserRound}
                    label={t("pages.leaveApply.approver")}
                    value={
                      approverLoading
                        ? t("pages.leaveApply.checking")
                        : (approverName ?? t("pages.leaveApply.notAssigned"))
                    }
                  />
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function LeaveSummary({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3 text-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="break-words font-medium">{value}</p>
      </div>
    </div>
  );
}
