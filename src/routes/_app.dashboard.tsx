import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { formatDisplayDate, formatDisplayDateRange, indiaDateKey } from "@/lib/india-date";
import { BIRTHDAY_LOOKAHEAD_DAYS, futureBirthdays, upcomingBirthdays } from "@/lib/birthdays";
import { PageHeader } from "@/components/common/PageHeader";
import { BirthdayMarquee } from "@/components/layout/BirthdayMarquee";
import { DashboardAnnouncements } from "@/components/layout/DashboardAnnouncements";
import { StatCard } from "@/components/common/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ROLE_LABELS,
  type AttendanceRecord,
  type AttendanceTimelineEvent,
  type Branch,
  type EmployeeAssetInvestment,
  type LeaveRequest,
  type User,
  type WorkTask,
} from "@/types/domain";
import {
  assetsApi,
  attendanceApi,
  branchesApi,
  employeesApi,
  leaveApi,
  tasksApi,
  usersApi,
} from "@/services/api";
import { downloadCsv } from "@/lib/csv";
import { formatWorkedTime, workedTime } from "@/lib/worked-time";
import { subscribeToAttendanceChanges } from "@/lib/attendance-live";
import { attendanceSourceLabel } from "@/lib/attendance-labels";
import { formatBranchLocationLabel, formatBranchLocationLabelById } from "@/lib/branch-label";
import { cn } from "@/lib/utils";
import {
  FaceAttendanceDialog,
  type AttendanceCapture,
} from "@/components/face/FaceAttendanceDialog";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  Fingerprint,
  LogIn,
  LogOut,
  MapPin,
  PlaneTakeoff,
  UserCheck,
  Users,
  Cake,
  Clock3,
  ArrowRight,
  BriefcaseBusiness,
  IndianRupee,
  ListTodo,
  Package,
} from "lucide-react";

interface BirthdayItem {
  employeeId: string;
  name: string;
  designation?: string;
  department?: string;
  dateOfBirth?: string;
  isToday: boolean;
  daysUntil: number;
}

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

function isPresentStatus(status: string) {
  return status === "Full Day" || status === "Half Day" || status.startsWith("Present");
}

function countUniquePresent(rows: AttendanceRecord[]) {
  const ids = new Set<string>();
  for (const row of rows) {
    if (isPresentStatus(row.status)) ids.add(row.employeeId);
  }
  return ids.size;
}

function countBranchPresent(rows: AttendanceRecord[], branchId: string) {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.actualBranchId === branchId && isPresentStatus(row.status)) {
      ids.add(row.employeeId);
    }
  }
  return ids.size;
}

function isFieldPresentRow(row: AttendanceRecord) {
  return (
    row.status.includes("Field") ||
    (row.fieldHours ?? 0) > 0 ||
    (row.fieldVisitCount ?? 0) > 0
  );
}

function countFieldPresent(rows: AttendanceRecord[]) {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!isPresentStatus(row.status)) continue;
    if (isFieldPresentRow(row)) ids.add(row.employeeId);
  }
  return ids.size;
}

/** Present people not at a listed branch and not already counted as field. */
function countOtherLocationPresent(rows: AttendanceRecord[], listedBranchIds: Set<string>) {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!isPresentStatus(row.status)) continue;
    const atListedBranch = Boolean(row.actualBranchId && listedBranchIds.has(row.actualBranchId));
    if (atListedBranch || isFieldPresentRow(row)) continue;
    ids.add(row.employeeId);
  }
  return ids.size;
}

function countStatus(rows: AttendanceRecord[], status: string) {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.status === status) ids.add(row.employeeId);
  }
  return ids.size;
}

function countStatusIncludes(rows: AttendanceRecord[], fragment: string) {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.status.includes(fragment)) ids.add(row.employeeId);
  }
  return ids.size;
}

function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [timeline, setTimeline] = useState<AttendanceTimelineEvent[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [people, setPeople] = useState<User[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [secondaryLoading, setSecondaryLoading] = useState(false);
  const [error, setError] = useState("");
  const [birthdays, setBirthdays] = useState<BirthdayItem[]>([]);
  const [executiveTasks, setExecutiveTasks] = useState<WorkTask[]>([]);
  const [employeeInvestments, setEmployeeInvestments] = useState<EmployeeAssetInvestment[]>([]);

  const ownAttendanceRoles = useMemo(
    () => ["employee", "sales", "driver", "field_staff"].includes(user?.role ?? ""),
    [user?.role],
  );
  const selfPunchRoles = Boolean(
    user?.employeeId &&
      user.attendanceRequired !== false &&
      !["developer_admin"].includes(user.role),
  );

  const refreshDashboard = useCallback(() => {
    setReloadKey((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!user?.employeeId) return;
    let refreshTimer: number | undefined;
    return subscribeToAttendanceChanges(() => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(refreshDashboard, 250);
    });
  }, [refreshDashboard, user?.employeeId]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const adminPeopleRoles = ["developer_admin"];

    setSummaryLoading(true);
    setSecondaryLoading(true);
    setError("");

    Promise.all([
      ownAttendanceRoles
        ? attendanceApi.today().then((row) => (row ? [row] : []))
        : attendanceApi.list({ from: indiaDateKey(), to: indiaDateKey() }),
      selfPunchRoles ? attendanceApi.myTimeline().catch(() => []) : Promise.resolve([]),
      branchesApi.list(),
      adminPeopleRoles.includes(user.role) ? usersApi.list() : employeesApi.list(),
      employeesApi.birthdays().catch(() => []),
    ])
      .then(([attendanceRows, timelineRows, branchRows, peopleRows, birthdayRows]) => {
        if (!active) return;
        setAttendance(attendanceRows);
        setTimeline(timelineRows);
        setBranches(branchRows);
        setPeople(peopleRows);
        setBirthdays(upcomingBirthdays(birthdayRows));
      })
      .catch((err) => {
        if (active) setError((err as Error).message || "Unable to load dashboard");
      })
      .finally(() => {
        if (active) setSummaryLoading(false);
      });

    Promise.all([
      leaveApi.list().catch(() => []),
      user.role === "ceo" || user.role === "chief_of_staff"
        ? tasksApi.list("team", { limit: 1000, offset: 0 }).catch(() => [])
        : [],
      user.role === "ceo" ? assetsApi.investmentSummary().catch(() => []) : [],
    ])
      .then(([leaveRows, taskRows, investmentRows]) => {
        if (!active) return;
        setLeaves(leaveRows);
        setExecutiveTasks(taskRows);
        setEmployeeInvestments(investmentRows);
      })
      .finally(() => {
        if (active) setSecondaryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [ownAttendanceRoles, reloadKey, selfPunchRoles, user?.id]);

  if (!user) return null;

  if (summaryLoading) {
    return (
      <div>
        <PageHeader
          eyebrow={t("pages.dashboard.eyebrow")}
          title={t("pages.dashboard.welcome", { name: user.name?.split(" ")[0] ?? "there" })}
          description={`${ROLE_LABELS[user.role]} · ${t("pages.dashboard.loadingWorkspace")}`}
        />
        <DashboardSkeleton />
      </div>
    );
  }

  const todayAttendance = ownAttendanceRoles
    ? attendance
    : attendance.filter((row) => row.date === indiaDateKey());
  const total = people.filter((person) => person.employeeId && person.active !== false).length;
  const attendanceRequiredTotal = people.filter(
    (person) =>
      person.employeeId &&
      person.active !== false &&
      person.attendanceRequired !== false &&
      !["developer_admin"].includes(person.role),
  ).length;
  const presentToday = countUniquePresent(todayAttendance);
  const absent = countStatus(todayAttendance, "Absent");
  const onLeave = countStatusIncludes(todayAttendance, "Leave");
  const fieldPresent = countFieldPresent(todayAttendance);
  const missed = countStatusIncludes(todayAttendance, "Missed");
  const pendingLeaves = leaves.filter((l) => l.status === "Pending").length;
  const pendingLeaveRows = leaves.filter((leave) => leave.status === "Pending").slice(0, 8);
  const listedBranchIds = new Set(branches.map((branch) => branch.id));
  const branchPresentCounts = branches.map((branch) => ({
    branch,
    present: countBranchPresent(todayAttendance, branch.id),
  }));
  const otherPresent = countOtherLocationPresent(todayAttendance, listedBranchIds);
  const isExecutive = user.role === "ceo" || user.role === "chief_of_staff";
  const headerDescription = isExecutive
    ? t(user.role === "ceo" ? "pages.dashboard.descriptionCeo" : "pages.dashboard.descriptionCos", {
        date: formatDisplayDate(new Date()),
      })
    : `${ROLE_LABELS[user.role]} · ${formatDisplayDate(new Date())}`;

  return (
    <div className="aw-enter w-full min-w-0 max-w-full space-y-1 overflow-x-hidden">
      <PageHeader
        eyebrow={t("pages.dashboard.eyebrow")}
        title={t("pages.dashboard.welcome", { name: user.name?.split(" ")[0] ?? "there" })}
        description={headerDescription}
      />

      <BirthdayMarquee />
      {user.role !== "driver" && <DashboardAnnouncements />}

      {secondaryLoading && (
        <div className="mb-3 text-xs font-medium text-muted-foreground">
          {t("pages.dashboard.updating")}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {["employee", "sales", "driver", "field_staff"].includes(user.role) ? (
        <EmployeeDashboard
          user={user}
          timeline={timeline}
          branches={branches}
          birthdays={birthdays}
          onAttendanceChanged={refreshDashboard}
          attendanceReady={!summaryLoading}
        />
      ) : user.role === "manager" ? (
        <ManagerDashboard
          user={user}
          data={{
            present: presentToday,
            onLeave,
            pendingLeaves,
            missed,
          }}
          attendance={todayAttendance}
          timeline={timeline}
          branches={branches}
          birthdays={birthdays}
          onAttendanceChanged={refreshDashboard}
          attendanceReady={!summaryLoading}
        />
      ) : user.role === "hr" || user.role === "developer_admin" ? (
        <HRDashboard
          user={user}
          data={{
            total,
            present: presentToday,
            onLeave,
            missed,
            fieldPresent,
            pendingLeaves,
          }}
          pendingLeaveRows={pendingLeaveRows}
          branchPresentCounts={branchPresentCounts}
          otherPresent={otherPresent}
          timeline={timeline}
          branches={branches}
          birthdays={birthdays}
          onAttendanceChanged={refreshDashboard}
          attendanceReady={!summaryLoading}
        />
      ) : isExecutive ? (
        <ExecutiveDashboard
          user={user}
          variant={user.role === "ceo" ? "ceo" : "cos"}
          data={{
            total,
            attendanceRequiredTotal,
            present: presentToday,
            absent,
            missed,
            branchPresentCounts,
            fieldPresent,
            otherPresent,
            pendingLeaves,
            onLeave,
          }}
          branches={branches}
          birthdays={birthdays}
          tasks={executiveTasks}
          investments={employeeInvestments}
          pendingLeaveRows={pendingLeaveRows}
          timeline={timeline}
          onAttendanceChanged={refreshDashboard}
          attendanceReady={!summaryLoading}
        />
      ) : (
        <AdminDashboard
          user={user}
          data={{
            total,
            present: presentToday,
            absent,
            pendingLeaves,
            users: people.length,
            branches: branches.length,
          }}
          attendance={todayAttendance}
          timeline={timeline}
          branches={branches}
          birthdays={birthdays}
          onAttendanceChanged={refreshDashboard}
          attendanceReady={!summaryLoading}
        />
      )}
    </div>
  );
}

/**
 * Owns the one-second tick for the running work timer.
 *
 * The clock used to live in MarkAttendanceCard, so every second re-rendered
 * that whole card — punch buttons, branch panels, face capture triggers — to
 * advance a single line of text. Keeping the state down here means the tick
 * repaints only the duration.
 */
function LiveWorkedTime({
  baseMilliseconds,
  since,
}: {
  baseMilliseconds: number;
  /** Start of the currently open stretch, or null when the day is closed. */
  since: number | null;
}) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (since === null) return;
    const tick = () => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [since]);

  const label = formatWorkedTime(
    since === null ? baseMilliseconds : baseMilliseconds + Math.max(0, now - since),
  );

  return (
    <p
      className="truncate font-mono text-xl font-semibold tabular-nums tracking-tight text-foreground min-[360px]:text-2xl sm:text-3xl md:text-4xl"
      aria-live="polite"
      aria-label={`${t("pages.dashboard.workedToday")} ${label}`}
    >
      {label}
    </p>
  );
}

function DashboardSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4" aria-label={t("pages.dashboard.loadingAria")}>
      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-md border bg-card p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-14" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border bg-card p-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-4 h-24 w-full" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        </div>
        <div className="rounded-md border bg-card p-4">
          <Skeleton className="h-4 w-40" />
          <div className="mt-4 space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

function EmployeeDashboard({
  user,
  timeline,
  branches,
  birthdays,
  onAttendanceChanged,
  attendanceReady,
}: {
  user: User;
  timeline: AttendanceTimelineEvent[];
  branches: Branch[];
  birthdays: BirthdayItem[];
  onAttendanceChanged: () => void;
  attendanceReady: boolean;
}) {
  return (
    <div className="min-w-0 max-w-full space-y-4">
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        {user.attendanceRequired !== false && (
          <MarkAttendanceCard
            user={user}
            timeline={timeline}
            branches={branches}
            onAttendanceChanged={onAttendanceChanged}
            attendanceReady={attendanceReady}
            className="min-w-0 lg:col-span-2"
          />
        )}
        <UpcomingBirthdaysCard birthdays={birthdays} />
      </div>
    </div>
  );
}

function MarkAttendanceCard({
  user,
  timeline,
  branches,
  onAttendanceChanged,
  className,
  attendanceReady,
}: {
  user: User;
  timeline: AttendanceTimelineEvent[];
  branches: Branch[];
  onAttendanceChanged: () => void;
  className?: string;
  attendanceReady: boolean;
}) {
  const { t } = useTranslation();
  const [actionLoading, setActionLoading] = useState(false);
  const [faceAction, setFaceAction] = useState<"check-in" | "check-out" | null>(null);
  const [optimisticSession, setOptimisticSession] = useState<{
    state: "CHECKED_IN" | "CHECKED_OUT";
    startedAt?: number;
  } | null>(null);
  const [leaveCheckIn, setLeaveCheckIn] = useState<AttendanceCapture | null>(null);
  // Nothing here depends on the passing second any more; only the open stretch
  // does, and LiveWorkedTime tracks that on its own.
  const workSession = useMemo(() => workedTime(timeline), [timeline]);
  const isCheckedIn = optimisticSession
    ? optimisticSession.state === "CHECKED_IN"
    : workSession.isCheckedIn;
  const runningSince = isCheckedIn
    ? optimisticSession?.state === "CHECKED_IN" && optimisticSession.startedAt
      ? optimisticSession.startedAt
      : workSession.activeStart
    : null;
  const effectiveFirstCheckIn =
    workSession.firstCheckIn ??
    (optimisticSession?.state === "CHECKED_IN" && optimisticSession.startedAt
      ? new Date(optimisticSession.startedAt)
      : undefined);
  const firstCheckInLabel = effectiveFirstCheckIn
    ? new Intl.DateTimeFormat("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Kolkata",
      }).format(effectiveFirstCheckIn)
    : t("pages.dashboard.notCheckedIn");
  const homeBranch = branches.find((branch) => branch.id === user.homeBranchId);
  const branchName = formatBranchLocationLabel(homeBranch);

  useEffect(() => {
    if (!optimisticSession) return;
    if (
      (optimisticSession.state === "CHECKED_IN" && workSession.isCheckedIn) ||
      (optimisticSession.state === "CHECKED_OUT" && !workSession.isCheckedIn)
    ) {
      setOptimisticSession(null);
    }
  }, [optimisticSession, workSession.isCheckedIn]);

  useEffect(() => {
    let cancelled = false;
    async function flushQueue() {
      if (!navigator.onLine) return;
      const { listOfflinePunches, removeOfflinePunch, writePunchTicket } =
        await import("@/lib/offline-punch-queue");
      try {
        const nextTicket = await attendanceApi.punchTicket();
        writePunchTicket(nextTicket.ticket, nextTicket.expiresAt);
      } catch {
        /* keep the last valid ticket if refresh fails */
      }
      const queue = await listOfflinePunches(user.employeeId);
      for (const entry of queue) {
        if (cancelled) return;
        try {
          if (entry.kind === "check-in") {
            const payload = entry.payload;
            if (payload.faceVerification) {
              await removeOfflinePunch(entry.id);
              toast.error(t("pages.dashboard.toastFaceExpired"));
              continue;
            }
            await attendanceApi.checkIn({
              employeeId: entry.employeeId || user.employeeId || "",
              latitude: payload.latitude,
              longitude: payload.longitude,
              locationAccuracy: payload.locationAccuracy,
              mobileDeviceId: payload.mobileDeviceId,
              confirmLeaveCancellation: payload.confirmLeaveCancellation,
              eventTime: payload.eventTime ?? entry.createdAt,
              punchTicket: entry.ticket,
              captureNonce: entry.nonce,
              deferred: true,
            });
          } else {
            await attendanceApi.checkOut({
              latitude: entry.payload.latitude,
              longitude: entry.payload.longitude,
              locationAccuracy: entry.payload.locationAccuracy,
              eventTime: entry.payload.eventTime ?? entry.createdAt,
              punchTicket: entry.ticket,
              captureNonce: entry.nonce,
              deferred: true,
            });
          }
          await removeOfflinePunch(entry.id);
          toast.success(
            entry.kind === "check-in"
              ? t("pages.dashboard.toastQueuedSyncedIn")
              : t("pages.dashboard.toastQueuedSyncedOut"),
          );
          onAttendanceChanged();
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (
            entry.kind === "check-in" &&
            /expired|already submitted|face verification/i.test(message)
          ) {
            await removeOfflinePunch(entry.id);
            toast.error(t("pages.dashboard.toastFaceFailed"));
            continue;
          }
          // Keep in queue for the next online attempt.
          break;
        }
      }
    }
    void flushQueue();
    const onOnline = () => void flushQueue();
    const onVisible = () => {
      if (document.visibilityState === "visible") void flushQueue();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => {
      if (navigator.onLine) void flushQueue();
    }, 30_000);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [onAttendanceChanged, user.employeeId]);

  async function submitCheckIn(capture: AttendanceCapture, confirmLeaveCancellation = false) {
    if (!user.employeeId) return;
    try {
      await attendanceApi.checkIn({
        employeeId: user.employeeId,
        ...capture,
        confirmLeaveCancellation,
      });
      setOptimisticSession({ state: "CHECKED_IN", startedAt: Date.now() });
      setLeaveCheckIn(null);
      toast.success(t("pages.dashboard.toastCheckedIn"));
      onAttendanceChanged();
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes("Confirm check-in to cancel leave")) {
        setLeaveCheckIn(capture);
        return;
      }
      const { enqueueOfflinePunch, isLikelyNetworkError } =
        await import("@/lib/offline-punch-queue");
      if (isLikelyNetworkError(err)) {
        if ("faceVerification" in capture && capture.faceVerification) {
          toast.error(t("pages.dashboard.toastFaceOffline"));
          return;
        }
        await enqueueOfflinePunch({
          kind: "check-in",
          employeeId: user.employeeId,
          payload: {
            employeeId: user.employeeId,
            ...capture,
            eventTime:
              "eventTime" in capture && capture.eventTime
                ? capture.eventTime
                : new Date().toISOString(),
            confirmLeaveCancellation,
            mobileDeviceId: navigator.userAgent.slice(0, 120),
          },
        });
        setOptimisticSession({ state: "CHECKED_IN", startedAt: Date.now() });
        toast.success(t("pages.dashboard.toastQueuedIn"));
        return;
      }
      throw err;
    }
  }

  function checkIn() {
    if (!user.employeeId) {
      toast.error(t("pages.dashboard.toastNeedProfile"));
      return;
    }
    setFaceAction("check-in");
  }

  async function confirmLeaveCheckIn() {
    if (!leaveCheckIn) return;
    setActionLoading(true);
    try {
      await submitCheckIn(leaveCheckIn, true);
    } catch (err) {
      setLeaveCheckIn(null);
      toast.error((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  }

  function checkOut() {
    setFaceAction("check-out");
  }

  async function handleVerifiedAttendance(capture: AttendanceCapture) {
    setActionLoading(true);
    try {
      if (faceAction === "check-in") {
        await submitCheckIn(capture);
      } else {
        try {
          await attendanceApi.checkOut(capture);
          setOptimisticSession({ state: "CHECKED_OUT" });
          toast.success(t("pages.dashboard.toastCheckedOut"));
          onAttendanceChanged();
        } catch (error) {
          const { enqueueOfflinePunch, isLikelyNetworkError } =
            await import("@/lib/offline-punch-queue");
          if (isLikelyNetworkError(error)) {
            await enqueueOfflinePunch({
              kind: "check-out",
              employeeId: user.employeeId ?? "",
              payload: {
                ...capture,
                eventTime:
                  "eventTime" in capture && capture.eventTime
                    ? capture.eventTime
                    : new Date().toISOString(),
                mobileDeviceId: navigator.userAgent.slice(0, 120),
              },
            });
            setOptimisticSession({ state: "CHECKED_OUT" });
            toast.success(t("pages.dashboard.toastQueuedOut"));
          } else {
            throw error;
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Attendance could not be saved.";
      if (message.startsWith("Another face detected")) {
        toast.error(t("pages.dashboard.toastAnotherFace"), {
          description: t("pages.dashboard.toastAnotherFaceDesc"),
        });
      } else {
        toast.error(message);
      }
      throw error;
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <Card className={cn("min-w-0 max-w-full overflow-hidden border-border shadow-sm", className)}>
      <CardHeader className="min-w-0 p-3 sm:p-5">
        <div className="min-w-0">
          <CardTitle className="text-base font-semibold text-foreground">
            {t("pages.dashboard.markAttendance")}
          </CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("pages.dashboard.liveSession")}</p>
        </div>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-3 p-3 pt-0 sm:gap-4 sm:p-5 sm:pt-0 md:grid-cols-[minmax(0,1fr)_minmax(0,0.72fr)]">
        <div className="min-w-0 overflow-hidden rounded-md border border-border/70 bg-muted/15">
          <div className="flex min-w-0 items-center gap-3 border-b border-border/60 p-3 sm:p-4">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${isCheckedIn ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}
            >
              <Clock3 className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="text-xs font-medium text-muted-foreground">
                {t("pages.dashboard.workedToday")}
              </p>
              <LiveWorkedTime
                baseMilliseconds={
                  runningSince === null
                    ? workSession.milliseconds
                    : workSession.completedMilliseconds
                }
                since={runningSince}
              />
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-2 divide-x divide-border/60">
            <div className="min-w-0 p-3 sm:p-4">
              <p className="text-xs text-muted-foreground">{t("pages.dashboard.firstCheckIn")}</p>
              <p className="mt-1 truncate text-sm font-medium text-foreground">
                {firstCheckInLabel}
              </p>
            </div>
            <div className="min-w-0 p-3 sm:p-4">
              <p className="text-xs text-muted-foreground">{t("pages.dashboard.homeBranch")}</p>
              <p className="mt-1 truncate text-sm font-medium text-foreground">{branchName}</p>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-center gap-3 overflow-hidden rounded-md border border-border/70 p-3 sm:p-4">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
              <Fingerprint className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate">{t("pages.dashboard.attendanceStatus")}</span>
            </div>
            <span
              className={`inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${isCheckedIn ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${isCheckedIn ? "animate-pulse bg-emerald-600 dark:bg-emerald-400" : "bg-muted-foreground/60"}`}
              />
              <span className="truncate">
                {isCheckedIn ? t("pages.dashboard.checkedIn") : t("pages.dashboard.checkedOut")}
              </span>
            </span>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Button
              onClick={checkIn}
              disabled={!attendanceReady || actionLoading || isCheckedIn}
              className="h-12 w-full min-w-0 max-w-full overflow-hidden"
            >
              <LogIn className="mr-2 h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">
                {!attendanceReady
                  ? t("pages.dashboard.checkingStatus")
                  : actionLoading
                    ? t("pages.dashboard.verifying")
                    : t("pages.dashboard.checkIn")}
              </span>
            </Button>
            <Button
              variant="outline"
              onClick={checkOut}
              disabled={!attendanceReady || actionLoading || !isCheckedIn}
              className="h-12 w-full min-w-0 max-w-full overflow-hidden bg-background"
            >
              <LogOut className="mr-2 h-4 w-4 shrink-0 text-destructive" />
              <span className="min-w-0 truncate">
                {!attendanceReady
                  ? t("pages.dashboard.checkingStatus")
                  : actionLoading
                    ? t("pages.dashboard.verifying")
                    : t("pages.dashboard.checkOut")}
              </span>
            </Button>
          </div>
        </div>
      </CardContent>
      <AlertDialog open={!!leaveCheckIn} onOpenChange={(open) => !open && setLeaveCheckIn(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("pages.dashboard.cancelLeaveTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("pages.dashboard.cancelLeaveHelp")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>
              {t("pages.dashboard.keepLeave")}
            </AlertDialogCancel>
            <AlertDialogAction disabled={actionLoading} onClick={confirmLeaveCheckIn}>
              {t("pages.dashboard.checkInCancelLeave")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <FaceAttendanceDialog
        action={faceAction}
        onClose={() => setFaceAction(null)}
        onVerified={handleVerifiedAttendance}
      />
    </Card>
  );
}

function ManagerDashboard({
  user,
  data,
  attendance,
  timeline,
  branches,
  birthdays,
  onAttendanceChanged,
  attendanceReady,
}: {
  user: User;
  data: {
    present: number;
    onLeave: number;
    pendingLeaves: number;
    missed: number;
  };
  attendance: AttendanceRecord[];
  timeline: AttendanceTimelineEvent[];
  branches: Branch[];
  birthdays: BirthdayItem[];
  onAttendanceChanged: () => void;
  attendanceReady: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="aw-enter-delayed grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        <StatCard
          label={t("pages.dashboard.teamPresent")}
          value={data.present}
          icon={UserCheck}
          tone="success"
        />
        <StatCard
          label={t("pages.dashboard.onLeave")}
          value={data.onLeave}
          icon={PlaneTakeoff}
          tone="info"
        />
        <StatCard
          label={t("pages.dashboard.pendingLeaveApprovals")}
          value={data.pendingLeaves}
          icon={CalendarClock}
          tone="warning"
        />
        <StatCard
          label={t("pages.dashboard.missedPunchAlerts")}
          value={data.missed}
          icon={AlertTriangle}
          tone="warning"
          hint={t("pages.dashboard.missedPunchHint")}
        />
      </div>
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        {user.attendanceRequired !== false && (
          <MarkAttendanceCard
            user={user}
            timeline={timeline}
            branches={branches}
            onAttendanceChanged={onAttendanceChanged}
            attendanceReady={attendanceReady}
            className="min-w-0 lg:col-span-2"
          />
        )}
        <div className="min-w-0 lg:col-span-2">
          <TeamAttendanceCard
            rows={attendance}
            branches={branches}
            title={t("pages.dashboard.teamAttendanceToday")}
          />
        </div>
        <div className="min-w-0 lg:col-span-2">
          <UpcomingBirthdaysCard birthdays={birthdays} />
        </div>
      </div>
    </div>
  );
}

function HRDashboard({
  user,
  data,
  pendingLeaveRows,
  branchPresentCounts,
  otherPresent,
  timeline,
  branches,
  birthdays,
  onAttendanceChanged,
  attendanceReady,
}: {
  user: User;
  data: {
    total: number;
    present: number;
    onLeave: number;
    missed: number;
    fieldPresent: number;
    pendingLeaves: number;
  };
  pendingLeaveRows: LeaveRequest[];
  branchPresentCounts: Array<{ branch: Branch; present: number }>;
  otherPresent: number;
  timeline: AttendanceTimelineEvent[];
  branches: Branch[];
  birthdays: BirthdayItem[];
  onAttendanceChanged: () => void;
  attendanceReady: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <div className="aw-enter-delayed grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 min-[480px]:grid-cols-3 lg:grid-cols-6">
        <StatCard label={t("pages.dashboard.totalEmployees")} value={data.total} icon={Users} />
        <StatCard
          label={t("pages.dashboard.presentToday")}
          value={data.present}
          icon={UserCheck}
          tone="success"
          hint={t("pages.dashboard.officeAndField")}
        />
        <StatCard
          label={t("pages.dashboard.onLeaveToday")}
          value={data.onLeave}
          icon={PlaneTakeoff}
          tone="info"
        />
        <StatCard
          label={t("pages.dashboard.pendingLeaveRequests")}
          value={data.pendingLeaves}
          icon={CalendarClock}
          tone="warning"
        />
        <StatCard
          label={t("pages.dashboard.missedPunch")}
          value={data.missed}
          icon={AlertTriangle}
          tone="warning"
        />
        <StatCard
          label={t("pages.dashboard.fieldPresent")}
          value={data.fieldPresent}
          icon={MapPin}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          variant="outline"
          className="justify-start"
          onClick={() => void navigate({ to: "/attendance/locations" })}
        >
          <MapPin className="mr-2 size-4" />
          {t("pages.dashboard.dayLogs")}
        </Button>
        <Button
          variant="outline"
          className="justify-start"
          onClick={() => void navigate({ to: "/leave/reports" })}
        >
          <CalendarClock className="mr-2 size-4" />
          {t("pages.dashboard.leaveRequests")}
        </Button>
      </div>

      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        {user.employeeId && user.attendanceRequired !== false && (
          <MarkAttendanceCard
            user={user}
            timeline={timeline}
            branches={branches}
            onAttendanceChanged={onAttendanceChanged}
            attendanceReady={attendanceReady}
            className="min-w-0 lg:col-span-2"
          />
        )}
        <BranchFieldAttendanceCard
          branchPresentCounts={branchPresentCounts}
          fieldPresent={data.fieldPresent}
          otherPresent={otherPresent}
        />
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-sm">{t("pages.dashboard.pendingLeaveRequests")}</CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void navigate({ to: "/leave/reports" })}
            >
              {t("pages.dashboard.viewAll")}
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingLeaveRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("pages.dashboard.noPendingLeave")}</p>
            ) : (
              pendingLeaveRows.map((leave) => (
                <div
                  key={leave.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{leave.employeeName}</p>
                    <p className="text-xs text-muted-foreground">
                      {leave.type} · {formatDisplayDateRange(leave.from, leave.to)} · {leave.days}{" "}
                      day
                      {leave.days === 1 ? "" : "s"}
                    </p>
                  </div>
                  <StatusBadge status={leave.status} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <div className="min-w-0 lg:col-span-2">
          <UpcomingBirthdaysCard birthdays={birthdays} />
        </div>
      </div>
    </div>
  );
}

function ExecutiveDashboard({
  user,
  variant,
  data,
  branches,
  birthdays,
  tasks,
  investments,
  pendingLeaveRows,
  timeline,
  onAttendanceChanged,
  attendanceReady,
}: {
  user: User;
  variant: "ceo" | "cos";
  data: {
    total: number;
    attendanceRequiredTotal: number;
    present: number;
    absent: number;
    missed: number;
    branchPresentCounts: Array<{ branch: Branch; present: number }>;
    fieldPresent: number;
    otherPresent: number;
    pendingLeaves: number;
    onLeave: number;
  };
  branches: Branch[];
  birthdays: BirthdayItem[];
  tasks: WorkTask[];
  investments: EmployeeAssetInvestment[];
  pendingLeaveRows: LeaveRequest[];
  timeline: AttendanceTimelineEvent[];
  onAttendanceChanged: () => void;
  attendanceReady: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const accountedFor = Math.min(
    data.attendanceRequiredTotal,
    data.present + data.onLeave + data.absent,
  );
  const awaitingAttendance = Math.max(0, data.attendanceRequiredTotal - accountedFor);
  const attendanceCoverage = data.attendanceRequiredTotal
    ? Math.round((accountedFor / data.attendanceRequiredTotal) * 100)
    : 100;
  const taskSummary = {
    active: tasks.filter((task) => !["COMPLETED", "CANCELLED"].includes(task.status)).length,
    overdue: tasks.filter(
      (task) =>
        task.dueDate &&
        !["COMPLETED", "CANCELLED"].includes(task.status) &&
        new Date(`${task.dueDate}T23:59:59`).getTime() < Date.now(),
    ).length,
    review: tasks.filter((task) => task.status === "REVIEW").length,
    completed: tasks.filter((task) => task.status === "COMPLETED").length,
  };
  const investmentSummary = investments.reduce(
    (summary, employee) => ({
      monthly: summary.monthly + employee.monthlyRecurring,
      firstYear: summary.firstYear + employee.firstYearInvestment,
    }),
    { monthly: 0, firstYear: 0 },
  );
  const showInvestment = variant === "ceo";
  const canPunch = Boolean(user.employeeId && user.attendanceRequired !== false);
  const executiveLinks = [
    {
      label: t("pages.dashboard.navWorkforce"),
      detail: t("pages.dashboard.navWorkforceHelp"),
      to: "/employees",
      icon: Users,
    },
    {
      label: t("pages.dashboard.navAttendance"),
      detail: t("pages.dashboard.navAttendanceHelp"),
      to: "/attendance/locations",
      icon: UserCheck,
    },
    {
      label: t("pages.dashboard.navWorkPlanner"),
      detail: t("pages.dashboard.navWorkPlannerHelp"),
      to: "/tasks",
      icon: ListTodo,
    },
    {
      label: t("pages.dashboard.navLeave"),
      detail: t("pages.dashboard.navLeaveHelp"),
      to: "/leave/reports",
      icon: CalendarClock,
    },
    ...(showInvestment
      ? [
          {
            label: t("pages.dashboard.navInvestment"),
            detail: t("pages.dashboard.navInvestmentHelp"),
            to: "/assets",
            icon: Package,
          },
        ]
      : []),
  ] as const;

  return (
    <div className="space-y-5">
      {canPunch && (
        <MarkAttendanceCard
          user={user}
          timeline={timeline}
          branches={branches}
          onAttendanceChanged={onAttendanceChanged}
          attendanceReady={attendanceReady}
          className="min-w-0"
        />
      )}
      <section aria-labelledby="executive-summary-title">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 id="executive-summary-title" className="text-base font-semibold tracking-tight">
              {t(
                variant === "ceo"
                  ? "pages.dashboard.executiveSummary"
                  : "pages.dashboard.operationsSummary",
              )}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t(
                variant === "ceo"
                  ? "pages.dashboard.executiveHelp"
                  : "pages.dashboard.operationsHelp",
              )}
            </p>
          </div>
          <p className="shrink-0 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            {t("pages.dashboard.attendanceAccounted", { pct: attendanceCoverage })}
          </p>
        </div>
        <div className="aw-enter-delayed grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 min-[480px]:grid-cols-3 xl:grid-cols-6">
          <StatCard label={t("pages.dashboard.totalWorkforce")} value={data.total} icon={Users} />
          <StatCard
            label={t("pages.dashboard.presentToday")}
            value={data.present}
            icon={UserCheck}
            tone="success"
          />
          <StatCard
            label={t("pages.dashboard.onLeaveToday")}
            value={data.onLeave}
            icon={PlaneTakeoff}
            tone="info"
          />
          <StatCard
            label={t("pages.dashboard.pendingLeaveDecisions")}
            value={data.pendingLeaves}
            icon={CalendarClock}
            tone="warning"
          />
          <StatCard
            label={t("pages.dashboard.attendanceExceptions")}
            value={data.missed}
            icon={AlertTriangle}
            tone="warning"
            hint={t("pages.dashboard.missedPunchCount", { count: data.missed })}
          />
          <StatCard
            label={t("pages.dashboard.awaitingAttendance")}
            value={awaitingAttendance}
            icon={Clock3}
            hint={t("pages.dashboard.awaitingAttendanceHint")}
          />
        </div>
      </section>

      <section aria-label="Executive navigation">
        <div
          className={cn(
            "grid gap-2 sm:grid-cols-2",
            showInvestment ? "lg:grid-cols-5" : "lg:grid-cols-4",
          )}
        >
          {executiveLinks.map(({ label, detail, to, icon: Icon }) => (
            <button
              key={to}
              type="button"
              onClick={() => navigate({ to })}
              className="group flex min-h-16 items-center gap-3 rounded-md border bg-card p-3 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block truncate text-xs text-muted-foreground">{detail}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          ))}
        </div>
      </section>

      <div className={cn("grid gap-4", showInvestment ? "xl:grid-cols-2" : "xl:grid-cols-1")}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <BriefcaseBusiness className="h-4 w-4 text-primary" />{" "}
              {t("pages.dashboard.workDelivery")}
            </CardTitle>
            <p className="text-xs text-muted-foreground">{t("pages.dashboard.workDeliveryHelp")}</p>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ExecutiveMetric label={t("pages.dashboard.active")} value={taskSummary.active} />
            <ExecutiveMetric
              label={t("pages.dashboard.overdue")}
              value={taskSummary.overdue}
              tone="danger"
            />
            <ExecutiveMetric
              label={t("pages.dashboard.inReview")}
              value={taskSummary.review}
              tone="warning"
            />
            <ExecutiveMetric
              label={t("pages.dashboard.completed")}
              value={taskSummary.completed}
              tone="success"
            />
          </CardContent>
        </Card>
        {showInvestment && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <IndianRupee className="h-4 w-4 text-primary" /> {t("pages.dashboard.investment")}
            </CardTitle>
            <p className="text-xs text-muted-foreground">{t("pages.dashboard.investmentHelp")}</p>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <ExecutiveMetric
              label={t("pages.dashboard.employeesEquipped")}
              value={investments.length}
            />
            <ExecutiveMetric
              label={t("pages.dashboard.monthlyRecurring")}
              value={formatCompactInr(investmentSummary.monthly)}
            />
            <ExecutiveMetric
              label={t("pages.dashboard.firstYearValue")}
              value={formatCompactInr(investmentSummary.firstYear)}
            />
          </CardContent>
        </Card>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-sm">{t("pages.dashboard.pendingLeaveDecisions")}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("pages.dashboard.pendingLeaveHelp")}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void navigate({ to: "/leave/approvals" })}
          >
            {t("pages.dashboard.viewAll")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {pendingLeaveRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("pages.dashboard.noPendingLeave")}</p>
          ) : (
            pendingLeaveRows.map((leave) => (
              <button
                key={leave.id}
                type="button"
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/40"
                onClick={() => void navigate({ to: "/leave/approvals" })}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{leave.employeeName}</p>
                  <p className="text-xs text-muted-foreground">
                    {leave.type} · {formatDisplayDateRange(leave.from, leave.to)} · {leave.days}{" "}
                    day
                    {leave.days === 1 ? "" : "s"}
                  </p>
                </div>
                <StatusBadge status={leave.status} />
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-sm">{t("pages.dashboard.companyOps")}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("pages.dashboard.companyOpsHelp")}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() =>
              downloadCsv(
                variant === "ceo" ? "ceo-attendance-summary.csv" : "cos-attendance-summary.csv",
                [
                {
                  totalEmployees: data.total,
                  attendanceRequired: data.attendanceRequiredTotal,
                  presentToday: data.present,
                  absentToday: data.absent,
                  fieldPresent: data.fieldPresent,
                  onLeaveToday: data.onLeave,
                  pendingApprovals: data.pendingLeaves,
                  missedPunch: data.missed,
                  branchPresence: [
                    ...data.branchPresentCounts.map(
                      ({ branch, present }) => `${formatBranchLocationLabel(branch)}: ${present}`,
                    ),
                    `Field: ${data.fieldPresent}`,
                    `Other: ${data.otherPresent}`,
                  ].join("; "),
                },
              ])
            }
          >
            {t("pages.dashboard.downloadReport")}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricBar
              label={t("pages.dashboard.present")}
              value={data.present}
              total={data.attendanceRequiredTotal}
            />
            <MetricBar
              label={t("pages.dashboard.onLeave")}
              value={data.onLeave}
              total={data.attendanceRequiredTotal}
              tone="bg-blue-600"
            />
            <MetricBar
              label={t("pages.dashboard.fieldPresent")}
              value={data.fieldPresent}
              total={data.attendanceRequiredTotal}
            />
            <MetricBar
              label={t("pages.dashboard.absent")}
              value={data.absent}
              total={data.attendanceRequiredTotal}
              tone="bg-red-500"
            />
          </div>
          <div className="mt-5 border-t border-border pt-4">
            <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">
              {t("pages.dashboard.locationPresence")}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.branchPresentCounts.map(({ branch, present }) => (
                <LocationPresenceTile
                  key={branch.id}
                  label={formatBranchLocationLabel(branch)}
                  count={present}
                />
              ))}
              <LocationPresenceTile
                label={t("pages.dashboard.field")}
                count={data.fieldPresent}
              />
              <LocationPresenceTile
                label={t("pages.dashboard.locationOther")}
                count={data.otherPresent}
              />
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="mt-4 min-w-0">
        <UpcomingBirthdaysCard birthdays={birthdays} />
      </div>
    </div>
  );
}

function LocationPresenceTile({ label, count }: { label: string; count: number }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
      <span className="min-w-0 truncate text-sm font-medium">{label}</span>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
        {t("pages.dashboard.nPresent", { count })}
      </span>
    </div>
  );
}

function ExecutiveMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const tones = {
    default: "text-foreground",
    success: "text-emerald-700 dark:text-emerald-400",
    warning: "text-amber-700 dark:text-amber-400",
    danger: "text-red-700 dark:text-red-400",
  };
  return (
    <div className="rounded-md bg-muted/55 p-3">
      <p className="text-xs leading-4 text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${tones[tone]}`}>{value}</p>
    </div>
  );
}

function formatCompactInr(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function AdminDashboard({
  user,
  data,
  attendance,
  timeline,
  branches,
  birthdays,
  onAttendanceChanged,
  attendanceReady,
}: {
  user: User;
  data: {
    total: number;
    present: number;
    absent: number;
    pendingLeaves: number;
    users: number;
    branches: number;
  };
  attendance: AttendanceRecord[];
  timeline: AttendanceTimelineEvent[];
  branches: Branch[];
  birthdays: BirthdayItem[];
  onAttendanceChanged: () => void;
  attendanceReady: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        <StatCard label={t("pages.dashboard.totalUsers")} value={data.users} icon={Users} />
        <StatCard label={t("pages.dashboard.totalEmployees")} value={data.total} icon={UserCheck} />
        <StatCard label={t("pages.dashboard.branches")} value={data.branches} icon={Building2} />
        <StatCard
          label={t("pages.dashboard.pendingApprovals")}
          value={data.pendingLeaves}
          icon={CalendarClock}
          tone="warning"
        />
      </div>
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        {user.employeeId && user.attendanceRequired !== false && (
          <MarkAttendanceCard
            user={user}
            timeline={timeline}
            branches={branches}
            onAttendanceChanged={onAttendanceChanged}
            attendanceReady={attendanceReady}
            className="min-w-0 lg:col-span-2"
          />
        )}
        <RecentAttendanceCard rows={attendance} />
        <AttendanceAnalyticsCard rows={attendance} />
        <div className="min-w-0 lg:col-span-2">
          <UpcomingBirthdaysCard birthdays={birthdays} />
        </div>
      </div>
    </div>
  );
}

function BranchFieldAttendanceCard({
  branchPresentCounts,
  fieldPresent,
  otherPresent,
}: {
  branchPresentCounts: Array<{ branch: Branch; present: number }>;
  fieldPresent: number;
  otherPresent: number;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t("pages.dashboard.locationFieldToday")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {branchPresentCounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("pages.dashboard.noLocationData")}</p>
        ) : (
          branchPresentCounts.map(({ branch, present }) => (
            <div key={branch.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium">
                {formatBranchLocationLabel(branch)}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {t("pages.dashboard.nPresent", { count: present })}
              </span>
            </div>
          ))
        )}
        <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
          <span className="font-medium">{t("pages.dashboard.field")}</span>
          <span className="text-muted-foreground">
            {t("pages.dashboard.nPresent", { count: fieldPresent })}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{t("pages.dashboard.locationOther")}</span>
          <span className="text-muted-foreground">
            {t("pages.dashboard.nPresent", { count: otherPresent })}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function RecentAttendanceCard({ rows }: { rows: AttendanceRecord[] }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t("pages.dashboard.recentActivity")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("pages.dashboard.noRecentActivity")}</p>
        ) : (
          rows.slice(0, 5).map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{a.employeeName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {formatDisplayDate(a.date)} · {a.source} · {a.deviceName ?? a.address ?? "-"}
                </p>
              </div>
              <StatusBadge status={a.status} className="shrink-0" />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function TeamAttendanceCard({
  rows,
  branches,
  title,
  viewAllHref,
}: {
  rows: AttendanceRecord[];
  branches: Branch[];
  title: string;
  viewAllHref?: string;
}) {
  const { t } = useTranslation();
  const todayParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    todayParts.find((value) => value.type === type)?.value ?? "";
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  const todayRows = rows.filter((row) => row.date === today);
  const branchName = (branchId?: string) => formatBranchLocationLabelById(branches, branchId);
  const time = (value?: string) =>
    value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-";

  return (
    <Card>
      <CardHeader className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-sm">{title}</CardTitle>
        {viewAllHref && (
          <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
            <a href={viewAllHref}>{t("pages.dashboard.viewAllEmployees")}</a>
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div className="space-y-2 p-3 md:hidden">
          {todayRows.slice(0, 12).map((row) => (
            <div key={row.id} className="rounded-lg border bg-background p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{row.employeeName}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {branchName(row.actualBranchId ?? row.homeBranchId)}
                  </p>
                </div>
                <StatusBadge status={row.status} className="shrink-0" />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div className="min-w-0">
                  <p className="text-muted-foreground">In</p>
                  <p className="mt-0.5 truncate font-medium">{time(row.punchIn)}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-muted-foreground">Out</p>
                  <p className="mt-0.5 truncate font-medium">{time(row.punchOut)}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-muted-foreground">Source</p>
                  <p className="mt-0.5 truncate font-medium">
                    {attendanceSourceLabel(row, branches)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead>{t("pages.dashboard.colEmployee")}</TableHead>
                <TableHead>{t("pages.dashboard.colIn")}</TableHead>
                <TableHead>{t("pages.dashboard.colOut")}</TableHead>
                <TableHead>{t("pages.dashboard.colBranch")}</TableHead>
                <TableHead>{t("pages.dashboard.colSource")}</TableHead>
                <TableHead>{t("pages.dashboard.colStatus")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {todayRows.slice(0, 12).map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">{row.employeeName}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDisplayDate(row.date)}
                    </div>
                  </TableCell>
                  <TableCell>{time(row.punchIn)}</TableCell>
                  <TableCell>{time(row.punchOut)}</TableCell>
                  <TableCell>{branchName(row.actualBranchId ?? row.homeBranchId)}</TableCell>
                  <TableCell className="text-sm">{attendanceSourceLabel(row, branches)}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {todayRows.length === 0 && (
          <p className="p-5 text-sm text-muted-foreground">
            {t("pages.dashboard.noAttendanceToday")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AttendanceAnalyticsCard({ rows }: { rows: AttendanceRecord[] }) {
  const { t } = useTranslation();
  const total = Math.max(rows.length, 1);
  const present = rows.filter(
    (row) =>
      row.status === "Full Day" || row.status === "Half Day" || row.status.startsWith("Present"),
  ).length;
  const leave = rows.filter((row) => row.status.includes("Leave")).length;
  const missed = rows.filter((row) => row.status.includes("Missed")).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t("pages.dashboard.attendanceAnalytics")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <MetricBar
          label={t("pages.dashboard.present")}
          value={present}
          total={total}
          tone="bg-emerald-600"
        />
        <MetricBar
          label={t("pages.dashboard.onLeave")}
          value={leave}
          total={total}
          tone="bg-blue-600"
        />
        <MetricBar
          label={t("pages.dashboard.missedPunch")}
          value={missed}
          total={total}
          tone="bg-amber-600"
        />
      </CardContent>
    </Card>
  );
}

function MetricBar({
  label,
  value,
  total,
  tone = "bg-primary",
}: {
  label: string;
  value: number;
  total: number;
  tone?: string;
}) {
  const pct = Math.round((value / Math.max(total, 1)) * 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {value} / {total}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function UpcomingBirthdaysCard({
  birthdays,
}: {
  birthdays: Array<{
    employeeId: string;
    name: string;
    designation?: string;
    department?: string;
    dateOfBirth?: string;
    isToday: boolean;
    daysUntil: number;
  }>;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const birthdaysToday = birthdays
    .filter((birthday) => birthday.isToday)
    .sort((a, b) => {
      if (a.employeeId === user?.employeeId) return -1;
      if (b.employeeId === user?.employeeId) return 1;
      return a.name.localeCompare(b.name);
    });
  const upcoming = futureBirthdays(birthdays);

  const formatDob = (dobStr?: string) => {
    if (!dobStr) return "—";
    const parts = dobStr.split("-");
    if (parts.length < 3) return dobStr;
    const monthIndex = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    if (Number.isNaN(monthIndex) || Number.isNaN(day) || !months[monthIndex]) return dobStr;
    return `${String(day).padStart(2, "0")} ${months[monthIndex]}`;
  };

  return (
    <Card className="min-w-0 max-w-full overflow-hidden">
      <CardHeader className="flex min-w-0 flex-col items-start gap-1 pb-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <Cake className="h-4 w-4 shrink-0 text-primary" />{" "}
          <span className="min-w-0 truncate">{t("pages.dashboard.upcomingBirthdays")}</span>
        </CardTitle>
        <span className="shrink-0 text-xs text-muted-foreground">
          {t("pages.dashboard.nextNDays", { count: BIRTHDAY_LOOKAHEAD_DAYS })}
        </span>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4 overflow-hidden">
        {birthdaysToday.length > 0 && (
          <div className="min-w-0 space-y-2">
            {birthdaysToday.map((birthday) => {
              const isSelf = birthday.employeeId === user?.employeeId;
              return (
                <div
                  key={birthday.employeeId}
                  className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary/[0.05] p-3 text-sm sm:gap-3"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                    <div className="shrink-0 rounded-xl bg-primary/10 p-2 text-primary">
                      <Cake className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 overflow-hidden">
                      <p className="truncate font-semibold text-foreground">
                        {isSelf ? t("pages.dashboard.yourBirthday") : birthday.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {isSelf
                          ? t("pages.dashboard.birthdayWish")
                          : [birthday.designation, birthday.department]
                              .filter(Boolean)
                              .join(" · ") || t("pages.dashboard.teamMember")}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold text-foreground">
                      {formatDob(birthday.dateOfBirth)}
                    </p>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                      {t("pages.dashboard.today")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {birthdaysToday.length > 0
              ? t("pages.dashboard.noOtherBirthdays", { count: BIRTHDAY_LOOKAHEAD_DAYS })
              : t("pages.dashboard.noBirthdays")}
          </p>
        ) : (
          <div className="max-h-[300px] min-w-0 space-y-2.5 overflow-x-hidden overflow-y-auto">
            {upcoming.map((b) => {
              const isSelf = b.employeeId === user?.employeeId;

              return (
                <div
                  key={b.employeeId}
                  className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-border/80 bg-card p-3 text-sm transition-colors hover:bg-muted/40 sm:gap-3"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                    <div className="shrink-0 rounded-xl bg-muted p-2 text-muted-foreground">
                      <Cake className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 overflow-hidden">
                      <p className="flex min-w-0 items-center gap-1.5 font-medium">
                        <span className="min-w-0 truncate">
                          {isSelf ? t("pages.dashboard.yourBirthday") : b.name}
                        </span>
                        {isSelf && (
                          <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">
                            {t("pages.dashboard.you")}
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {isSelf
                          ? t("pages.dashboard.comingSoon")
                          : [b.designation, b.department].filter(Boolean).join(" · ") ||
                            t("pages.dashboard.teamMember")}
                      </p>
                    </div>
                  </div>
                  <div className="max-w-[40%] shrink-0 text-right">
                    <p className="truncate font-semibold text-foreground">{formatDob(b.dateOfBirth)}</p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {isSelf
                        ? t("pages.dashboard.inNDays", { count: b.daysUntil })
                        : t("pages.dashboard.daysLeft", { count: b.daysUntil })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
