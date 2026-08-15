import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import type {
  LeaveBalance,
  LeaveTypeOption,
  WeeklyOffPolicy,
  WeeklyOffRequest,
} from "@/types/domain";
import { StatusBadge } from "@/components/common/StatusBadge";
import { CalendarClock, CalendarDays, CheckCircle2, ShieldCheck, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/leave/apply")({
  component: ApplyLeavePage,
});

function ApplyLeavePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [types, setTypes] = useState<LeaveTypeOption[]>([]);
  const [typeId, setTypeId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [medicalDocumentUrl, setMedicalDocumentUrl] = useState("");
  const [medicalFile, setMedicalFile] = useState<File | null>(null);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [weeklyOffs, setWeeklyOffs] = useState<WeeklyOffRequest[]>([]);
  const [weeklyOffDate, setWeeklyOffDate] = useState("");
  const [weeklyOffReason, setWeeklyOffReason] = useState("");
  const [weeklyOffSaving, setWeeklyOffSaving] = useState(false);
  const [approverName, setApproverName] = useState<string | null>(null);
  const [approverLoading, setApproverLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [typesLoading, setTypesLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [requestKind, setRequestKind] = useState<"leave" | "weekly-off">("leave");
  const [weeklyOffPolicy, setWeeklyOffPolicy] = useState<WeeklyOffPolicy>("SELECTABLE");
  const todayString = indiaDateKey();

  useEffect(() => {
    Promise.all([leaveApi.types(), leaveApi.myBalance(), leaveApi.weeklyOffs()])
      .then(([rows, balanceRows, weeklyRows]) => {
        setTypes(rows);
        setTypeId(rows[0]?.id ?? "");
        setBalances(balanceRows);
        setWeeklyOffs(weeklyRows);
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
  const selectedType = types.find((type) => type.id === typeId);
  const isCompOff = selectedType?.code === "COMP_OFF";
  const requiresApprover = selectedType?.approvalRequired !== false;
  const selectedBalance = balances.find((item) => item.code === selectedType?.code)?.balance ?? 0;
  const requestedDays =
    from && to && from <= to
      ? Math.max(1, Math.round((+new Date(to) - +new Date(from)) / 86400000) + 1)
      : 0;

  useEffect(() => {
    if (!isCompOff || !from) return;
    if (to !== from) setTo(from);
  }, [isCompOff, from, to]);

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!typeId) errs.type = t("pages.leaveApply.errTypeRequired");
    if (!from) {
      errs.from = t("pages.leaveApply.errFromRequired");
    } else if (from < todayString) {
      errs.from = t("pages.leaveApply.errFromPast");
    }
    if (!to) {
      errs.to = t("pages.leaveApply.errToRequired");
    } else if (to < todayString) {
      errs.to = t("pages.leaveApply.errToPast");
    }
    if (from && to && from > to) errs.to = t("pages.leaveApply.errToAfterStart");
    if (isCompOff && from && to && from !== to) {
      errs.to = t("pages.leaveApply.errCompOffSingleDay");
    }
    if (reason.trim().length < 3) errs.reason = t("pages.leaveApply.errReasonMin");
    if (reason.length > 1000) errs.reason = t("pages.leaveApply.errReasonMax");
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const calendarDays = Math.max(1, Math.round((+new Date(to) - +new Date(from)) / 86400000) + 1);
    const days = isCompOff ? 1 : calendarDays;
    setLoading(true);
    try {
      let medicalUrl = medicalDocumentUrl.trim() || undefined;
      if (selectedType?.requiresMedicalDocument && medicalFile) {
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
      await leaveApi.apply({
        leaveTypeId: typeId,
        fromDate: from,
        toDate: isCompOff ? from : to,
        days,
        session: "FULL",
        reason: reason.trim(),
        medicalDocumentUrl: medicalUrl,
      });
      toast.success(
        selectedType?.code === "COMP_OFF"
          ? t("pages.leaveApply.toastCompOffSubmitted")
          : t("pages.leaveApply.toastLeaveSubmitted"),
      );
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
      {!typesLoading && requestKind === "leave" && (
        <>
          <section
            className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            aria-label={t("pages.leaveApply.leavePoliciesAria")}
          >
            {types.map((type) => {
              const balance = balances.find((item) => item.code === type.code)?.balance ?? 0;
              const selected = type.id === typeId;
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setTypeId(type.id)}
                  className={cn(
                    "rounded-lg border bg-card p-4 text-left transition-colors",
                    selected
                      ? "border-primary/50 bg-primary/[0.03] ring-1 ring-primary/30"
                      : "border-border/80 hover:border-primary/30 hover:bg-muted/30",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{type.name}</p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums">{balance}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("pages.leaveApply.availableCredit").toLowerCase()}
                      </p>
                    </div>
                    <InfoButton title={type.name} className="-mr-1 -mt-1">
                      {type.description || t("pages.leaveApply.defaultTypeDescription")}
                    </InfoButton>
                  </div>
                  <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    {selected ? (
                      <>
                        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                        {t("pages.leaveApply.selected")}
                      </>
                    ) : (
                      t("pages.leaveApply.tapToSelect")
                    )}
                  </p>
                </button>
              );
            })}
          </section>
          <div className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <Card>
              <CardContent className="p-4 sm:p-6">
                {!approverLoading && requiresApprover && !approverName && (
                  <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {t("pages.leaveApply.noHeadAvailable")}
                  </p>
                )}
                {!approverLoading && requiresApprover && approverName && (
                  <p className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    {t("pages.leaveApply.sentToHeadPrefix")}{" "}
                    <span className="font-medium text-foreground">{approverName}</span>
                    {t("pages.leaveApply.sentToHeadSuffix")}
                  </p>
                )}
                {selectedType?.code === "COMP_OFF" && (
                  <p className="mb-4 flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                    {t("pages.leaveApply.compOffApprovalNote")}
                  </p>
                )}
                <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
                  {!typeId && (
                    <p className="sm:col-span-2 text-sm text-muted-foreground">
                      {t("pages.leaveApply.selectTypeToContinue")}
                    </p>
                  )}
                  {errors.type && (
                    <p className="sm:col-span-2 text-xs text-destructive">{errors.type}</p>
                  )}
                  {selectedType?.requiresMedicalDocument && (
                    <div className="space-y-1.5 sm:col-span-2">
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
                  <div className="space-y-1.5">
                    <Label htmlFor="from">{t("pages.leaveApply.from")}</Label>
                    <DateField
                      id="from"
                      value={from}
                      min={todayString}
                      max={to || undefined}
                      onChange={(nextFrom) => {
                        setFrom(nextFrom);
                        if (isCompOff) setTo(nextFrom);
                        else if (to && nextFrom && to < nextFrom) setTo(nextFrom);
                      }}
                    />
                    {errors.from && <p className="text-xs text-destructive">{errors.from}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="to">
                      {isCompOff ? t("pages.leaveApply.date") : t("pages.leaveApply.to")}
                    </Label>
                    <DateField
                      id="to"
                      value={to}
                      min={from || todayString}
                      disabled={isCompOff}
                      onChange={setTo}
                    />
                    {errors.to && <p className="text-xs text-destructive">{errors.to}</p>}
                    {isCompOff && (
                      <p className="text-xs text-muted-foreground">
                        {t("pages.leaveApply.compOffOneDay")}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
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
                  <div className="sm:col-span-2 flex justify-end gap-2">
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
                        (requiresApprover && (approverLoading || !approverName))
                      }
                    >
                      {t("pages.leaveApply.submit")}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
            <aside className="rounded-lg border bg-muted/20 p-4 lg:sticky lg:top-4 lg:self-start">
              <h2 className="text-sm font-semibold">{t("pages.missedPunch.requestSummary")}</h2>
              <div className="mt-4 space-y-4">
                <LeaveSummary
                  icon={ShieldCheck}
                  label={t("pages.leaveApply.leaveType")}
                  value={selectedType?.name ?? t("pages.leaveApply.notSelected")}
                />
                <LeaveSummary
                  icon={CalendarDays}
                  label={t("pages.leaveApply.requested")}
                  value={
                    requestedDays
                      ? t("pages.leaveApply.dayCount", { count: requestedDays })
                      : t("pages.leaveApply.selectDates")
                  }
                />
                <LeaveSummary
                  icon={CheckCircle2}
                  label={t("pages.leaveApply.availableCredit")}
                  value={String(selectedBalance)}
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
              {requestedDays > selectedBalance && selectedType?.paid && (
                <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                  {t("pages.leaveApply.exceedsCredit", {
                    count: requestedDays - selectedBalance,
                  })}
                </p>
              )}
            </aside>
          </div>
        </>
      )}
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
            <h2 className="text-sm font-semibold">{t("pages.missedPunch.requestSummary")}</h2>
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
