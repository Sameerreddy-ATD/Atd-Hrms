import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { indiaDateKey } from "@/lib/india-date";
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
import {
  FaceAttendanceDialog,
  type AttendanceCapture,
} from "@/components/face/FaceAttendanceDialog";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  FileClock,
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
  dateOfBirth: string;
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

function countFieldPresent(rows: AttendanceRecord[]) {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!isPresentStatus(row.status)) continue;
    if (
      row.status.includes("Field") ||
      (row.fieldHours ?? 0) > 0 ||
      (row.fieldVisitCount ?? 0) > 0
    ) {
      ids.add(row.employeeId);
    }
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
    user?.employeeId && !["developer_admin"].includes(user.role),
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
      user.role === "ceo" ? tasksApi.list("team", { limit: 1000, offset: 0 }).catch(() => []) : [],
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
  }, [ownAttendanceRoles, reloadKey, selfPunchRoles, user]);

  if (!user) return null;

  if (summaryLoading) {
    return (
      <div>
        <PageHeader
          eyebrow="Anytime Workforce"
          title={`Welcome, ${user.name.split(" ")[0]}`}
          description={`${ROLE_LABELS[user.role]} · Loading today's workspace`}
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
      !["developer_admin"].includes(person.role),
  ).length;
  const presentToday = countUniquePresent(todayAttendance);
  const absent = countStatus(todayAttendance, "Absent");
  const late = countStatus(todayAttendance, "Late");
  const onLeave = countStatusIncludes(todayAttendance, "Leave");
  const fieldPresent = countFieldPresent(todayAttendance);
  const missed = countStatusIncludes(todayAttendance, "Missed");
  const pendingLeaves = leaves.filter((l) => l.status === "Pending").length;
  const branchPresentCounts = branches.map((branch) => ({
    branch,
    present: countBranchPresent(todayAttendance, branch.id),
  }));

  return (
    <div className="aw-enter space-y-1">
      <PageHeader
        eyebrow="Anytime Workforce"
        title={`Welcome, ${user.name.split(" ")[0]}`}
        description={`${ROLE_LABELS[user.role]} · ${new Date().toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}`}
      />

      <BirthdayMarquee />
      <DashboardAnnouncements />

      {secondaryLoading && (
        <div className="mb-3 text-xs font-medium text-muted-foreground">
          Updating operational details...
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
          attendance={todayAttendance}
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
      ) : user.role === "hr" ? (
        <HRDashboard
          user={user}
          data={{ total, present: presentToday, onLeave, missed, fieldPresent }}
          branchPresentCounts={branchPresentCounts}
          timeline={timeline}
          branches={branches}
          birthdays={birthdays}
          onAttendanceChanged={refreshDashboard}
          attendanceReady={!summaryLoading}
        />
      ) : user.role === "ceo" ? (
        <CEODashboard
          data={{
            total,
            attendanceRequiredTotal,
            present: presentToday,
            absent,
            missed,
            branchPresentCounts,
            fieldPresent,
            pendingLeaves,
            onLeave,
          }}
          attendance={todayAttendance}
          branches={branches}
          birthdays={birthdays}
          tasks={executiveTasks}
          investments={employeeInvestments}
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

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading dashboard data">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-md border bg-card p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-14" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
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
  attendance,
  timeline,
  branches,
  birthdays,
  onAttendanceChanged,
  attendanceReady,
}: {
  user: User;
  attendance: AttendanceRecord[];
  timeline: AttendanceTimelineEvent[];
  branches: Branch[];
  birthdays: BirthdayItem[];
  onAttendanceChanged: () => void;
  attendanceReady: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <MarkAttendanceCard
          user={user}
          timeline={timeline}
          branches={branches}
          onAttendanceChanged={onAttendanceChanged}
          attendanceReady={attendanceReady}
          className="lg:col-span-2"
        />
        <AttendanceAnalyticsCard rows={attendance} />
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
  const navigate = useNavigate();
  const [actionLoading, setActionLoading] = useState(false);
  const [faceAction, setFaceAction] = useState<"check-in" | "check-out" | null>(null);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [optimisticSession, setOptimisticSession] = useState<{
    state: "CHECKED_IN" | "CHECKED_OUT";
    startedAt?: number;
  } | null>(null);
  const [leaveCheckIn, setLeaveCheckIn] = useState<AttendanceCapture | null>(null);
  const workSession = useMemo(() => workedTime(timeline, clockNow), [clockNow, timeline]);
  const isCheckedIn = optimisticSession
    ? optimisticSession.state === "CHECKED_IN"
    : workSession.isCheckedIn;
  const workedMilliseconds =
    optimisticSession?.state === "CHECKED_IN" && optimisticSession.startedAt
      ? workSession.milliseconds + Math.max(0, clockNow - optimisticSession.startedAt)
      : workSession.milliseconds;
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
    : "Not checked in";
  const branchName = branches.find((branch) => branch.id === user.homeBranchId)?.name ?? "-";

  useEffect(() => {
    setClockNow(Date.now());
    if (!isCheckedIn) return;
    const tick = () => {
      if (document.visibilityState === "visible") setClockNow(Date.now());
    };
    const timer = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [isCheckedIn]);

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
      const { listOfflinePunches, removeOfflinePunch } = await import("@/lib/offline-punch-queue");
      const queue = await listOfflinePunches();
      for (const entry of queue) {
        if (cancelled) return;
        try {
          if (entry.kind === "check-in") {
            await attendanceApi.checkIn(entry.payload as Parameters<typeof attendanceApi.checkIn>[0]);
          } else {
            await attendanceApi.checkOut(
              entry.payload as Parameters<typeof attendanceApi.checkOut>[0],
            );
          }
          await removeOfflinePunch(entry.id);
          toast.success(
            entry.kind === "check-in" ? "Queued check-in synced" : "Queued check-out synced",
          );
          onAttendanceChanged();
        } catch {
          // Keep in queue for the next online attempt.
          break;
        }
      }
    }
    void flushQueue();
    const onOnline = () => void flushQueue();
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
    };
  }, [onAttendanceChanged]);

  async function submitCheckIn(capture: AttendanceCapture, confirmLeaveCancellation = false) {
    if (!user.employeeId) return;
    try {
      await attendanceApi.checkIn({
        employeeId: user.employeeId,
        ...capture,
        confirmLeaveCancellation,
      });
      setOptimisticSession({ state: "CHECKED_IN", startedAt: Date.now() });
      setClockNow(Date.now());
      setLeaveCheckIn(null);
      toast.success("You are checked in");
      onAttendanceChanged();
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes("Confirm check-in to cancel leave")) {
        setLeaveCheckIn(capture);
        return;
      }
      const { enqueueOfflinePunch, isLikelyNetworkError } = await import(
        "@/lib/offline-punch-queue"
      );
      if (isLikelyNetworkError(err)) {
        await enqueueOfflinePunch({
          id: crypto.randomUUID(),
          kind: "check-in",
          createdAt: new Date().toISOString(),
          payload: {
            employeeId: user.employeeId,
            ...capture,
            confirmLeaveCancellation,
            mobileDeviceId: navigator.userAgent.slice(0, 120),
          },
        });
        setOptimisticSession({ state: "CHECKED_IN", startedAt: Date.now() });
        toast.success("Check-in queued offline — will sync when you reconnect");
        return;
      }
      throw err;
    }
  }

  function checkIn() {
    if (!user.employeeId) {
      toast.error("You must have an employee profile to mark attendance.");
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
          toast.success("You are checked out");
          onAttendanceChanged();
        } catch (error) {
          const { enqueueOfflinePunch, isLikelyNetworkError } = await import(
            "@/lib/offline-punch-queue"
          );
          if (isLikelyNetworkError(error)) {
            await enqueueOfflinePunch({
              id: crypto.randomUUID(),
              kind: "check-out",
              createdAt: new Date().toISOString(),
              payload: {
                ...capture,
                mobileDeviceId: navigator.userAgent.slice(0, 120),
              },
            });
            setOptimisticSession({ state: "CHECKED_OUT" });
            toast.success("Check-out queued offline — will sync when you reconnect");
          } else {
            throw error;
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Attendance could not be saved.";
      if (message.startsWith("Another face detected")) {
        toast.error("Another face detected", {
          description: "Check-in was blocked and the security event is visible to Developer Admin.",
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
    <Card className={`border-border shadow-sm ${className ?? ""}`}>
      <CardHeader className="flex flex-col items-stretch justify-between gap-3 p-4 min-[420px]:flex-row min-[420px]:items-center sm:p-5">
        <div className="min-w-0">
          <CardTitle className="text-base font-semibold text-foreground">Mark Attendance</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">Today&apos;s live work session</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="w-full shrink-0 min-[420px]:w-auto"
          onClick={() => navigate({ to: "/attendance/missed-punch" })}
        >
          <FileClock className="mr-1.5 h-4 w-4" />
          Missed Punch
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4 p-4 pt-0 sm:p-5 sm:pt-0 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)]">
        <div className="overflow-hidden rounded-md border border-border/70 bg-muted/15">
          <div className="flex items-center gap-3 border-b border-border/60 p-4">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${isCheckedIn ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}
            >
              <Clock3 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Worked today</p>
              <p
                className="font-mono text-2xl font-semibold tabular-nums text-foreground min-[360px]:text-3xl sm:text-4xl"
                aria-live="polite"
                aria-label={`Worked today ${formatWorkedTime(workedMilliseconds)}`}
              >
                {formatWorkedTime(workedMilliseconds)}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-border/60">
            <div className="min-w-0 p-3 sm:p-4">
              <p className="text-xs text-muted-foreground">First check-in</p>
              <p className="mt-1 truncate text-sm font-medium text-foreground">
                {firstCheckInLabel}
              </p>
            </div>
            <div className="min-w-0 p-3 sm:p-4">
              <p className="text-xs text-muted-foreground">Home branch</p>
              <p className="mt-1 truncate text-sm font-medium text-foreground">{branchName}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center gap-3 rounded-md border border-border/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Fingerprint className="h-4 w-4 text-primary" />
              Attendance status
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${isCheckedIn ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${isCheckedIn ? "animate-pulse bg-emerald-600 dark:bg-emerald-400" : "bg-muted-foreground/60"}`}
              />
              {isCheckedIn ? "Checked in" : "Checked out"}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Button
              onClick={checkIn}
              disabled={!attendanceReady || actionLoading || isCheckedIn}
              className="h-12 w-full"
            >
              <LogIn className="mr-2 h-4 w-4" />
              {!attendanceReady
                ? "Checking status..."
                : actionLoading
                  ? "Verifying..."
                  : "Check In"}
            </Button>
            <Button
              variant="outline"
              onClick={checkOut}
              disabled={!attendanceReady || actionLoading || !isCheckedIn}
              className="h-12 w-full bg-background"
            >
              <LogOut className="mr-2 h-4 w-4 text-destructive" />
              {!attendanceReady
                ? "Checking status..."
                : actionLoading
                  ? "Verifying..."
                  : "Check Out"}
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Each mobile check-in requires a live face match and precise device location. Check-out
            uses precise location only.
          </p>
        </div>
      </CardContent>
      <AlertDialog open={!!leaveCheckIn} onOpenChange={(open) => !open && setLeaveCheckIn(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel leave for today?</AlertDialogTitle>
            <AlertDialogDescription>
              You have approved leave today. Continuing with mobile check-in will cancel leave only
              for today and record your attendance. Other leave dates will remain unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Keep leave</AlertDialogCancel>
            <AlertDialogAction disabled={actionLoading} onClick={confirmLeaveCheckIn}>
              Check in and cancel today&apos;s leave
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
  return (
    <div className="space-y-4">
      <div className="aw-enter-delayed grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Team present" value={data.present} icon={UserCheck} tone="success" />
        <StatCard label="On leave" value={data.onLeave} icon={PlaneTakeoff} tone="info" />
        <StatCard
          label="Pending leave approvals"
          value={data.pendingLeaves}
          icon={CalendarClock}
          tone="warning"
        />
        <StatCard
          label="Missed punch alerts"
          value={data.missed}
          icon={AlertTriangle}
          tone="warning"
          hint="Open sessions or missed punch corrections"
        />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <MarkAttendanceCard
          user={user}
          timeline={timeline}
          branches={branches}
          onAttendanceChanged={onAttendanceChanged}
          attendanceReady={attendanceReady}
          className="lg:col-span-2"
        />
        <div className="lg:col-span-2">
          <TeamAttendanceCard rows={attendance} branches={branches} title="Team attendance today" />
        </div>
        <div className="lg:col-span-2">
          <UpcomingBirthdaysCard birthdays={birthdays} />
        </div>
      </div>
    </div>
  );
}

function HRDashboard({
  user,
  data,
  branchPresentCounts,
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
  };
  branchPresentCounts: Array<{ branch: Branch; present: number }>;
  timeline: AttendanceTimelineEvent[];
  branches: Branch[];
  birthdays: BirthdayItem[];
  onAttendanceChanged: () => void;
  attendanceReady: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="aw-enter-delayed grid grid-cols-2 gap-3 min-[480px]:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total employees" value={data.total} icon={Users} />
        <StatCard
          label="Present today"
          value={data.present}
          icon={UserCheck}
          tone="success"
          hint="Office and field"
        />
        <StatCard label="On leave today" value={data.onLeave} icon={PlaneTakeoff} tone="info" />
        <StatCard label="Missed punch" value={data.missed} icon={AlertTriangle} tone="warning" />
        <StatCard label="Field present" value={data.fieldPresent} icon={MapPin} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <MarkAttendanceCard
          user={user}
          timeline={timeline}
          branches={branches}
          onAttendanceChanged={onAttendanceChanged}
          attendanceReady={attendanceReady}
          className="lg:col-span-2"
        />
        <BranchFieldAttendanceCard
          branchPresentCounts={branchPresentCounts}
          fieldPresent={data.fieldPresent}
        />
        <UpcomingBirthdaysCard birthdays={birthdays} />
      </div>
    </div>
  );
}

function CEODashboard({
  data,
  attendance,
  branches,
  birthdays,
  tasks,
  investments,
}: {
  data: {
    total: number;
    attendanceRequiredTotal: number;
    present: number;
    absent: number;
    missed: number;
    branchPresentCounts: Array<{ branch: Branch; present: number }>;
    fieldPresent: number;
    pendingLeaves: number;
    onLeave: number;
  };
  attendance: AttendanceRecord[];
  branches: Branch[];
  birthdays: BirthdayItem[];
  tasks: WorkTask[];
  investments: EmployeeAssetInvestment[];
}) {
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
  const executiveLinks = [
    { label: "Workforce", detail: "People and organization", to: "/employees", icon: Users },
    {
      label: "Attendance",
      detail: "Daily attendance detail",
      to: "/attendance/locations",
      icon: UserCheck,
    },
    { label: "Work Planner", detail: "Tasks, owners, and due dates", to: "/tasks", icon: ListTodo },
    {
      label: "Leave overview",
      detail: "Requests and status",
      to: "/leave/reports",
      icon: CalendarClock,
    },
    { label: "Investment", detail: "Assets by employee", to: "/assets", icon: Package },
  ] as const;

  return (
    <div className="space-y-5">
      <section aria-labelledby="executive-summary-title">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="executive-summary-title" className="text-base font-semibold tracking-tight">
              Executive summary
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Workforce health and decisions requiring attention today.
            </p>
          </div>
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            {attendanceCoverage}% attendance accounted for
          </p>
        </div>
        <div className="aw-enter-delayed grid grid-cols-2 gap-3 min-[480px]:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Total workforce" value={data.total} icon={Users} />
          <StatCard label="Present today" value={data.present} icon={UserCheck} tone="success" />
          <StatCard label="On leave today" value={data.onLeave} icon={PlaneTakeoff} tone="info" />
          <StatCard
            label="Pending leave decisions"
            value={data.pendingLeaves}
            icon={CalendarClock}
            tone="warning"
          />
          <StatCard
            label="Attendance exceptions"
            value={data.missed}
            icon={AlertTriangle}
            tone="warning"
            hint={`${data.missed} missed punch`}
          />
          <StatCard
            label="Awaiting attendance"
            value={awaitingAttendance}
            icon={Clock3}
            hint="Active employees without a settled attendance status"
          />
        </div>
      </section>

      <section aria-label="Executive navigation">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
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

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <BriefcaseBusiness className="h-4 w-4 text-primary" /> Work delivery
            </CardTitle>
            <p className="text-xs text-muted-foreground">Organization-wide task status.</p>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ExecutiveMetric label="Active" value={taskSummary.active} />
            <ExecutiveMetric label="Overdue" value={taskSummary.overdue} tone="danger" />
            <ExecutiveMetric label="In review" value={taskSummary.review} tone="warning" />
            <ExecutiveMetric label="Completed" value={taskSummary.completed} tone="success" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <IndianRupee className="h-4 w-4 text-primary" /> Investment in employees
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Current assigned physical and online assets.
            </p>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <ExecutiveMetric label="Employees equipped" value={investments.length} />
            <ExecutiveMetric
              label="Monthly recurring"
              value={formatCompactInr(investmentSummary.monthly)}
            />
            <ExecutiveMetric
              label="First-year value"
              value={formatCompactInr(investmentSummary.firstYear)}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-sm">Company operations today</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Attendance coverage across every active branch and field operation.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() =>
              downloadCsv("ceo-attendance-summary.csv", [
                {
                  totalEmployees: data.total,
                  attendanceRequired: data.attendanceRequiredTotal,
                  presentToday: data.present,
                  absentToday: data.absent,
                  fieldPresent: data.fieldPresent,
                  onLeaveToday: data.onLeave,
                  pendingApprovals: data.pendingLeaves,
                  missedPunch: data.missed,
                  branchPresence: data.branchPresentCounts
                    .map(({ branch, present }) => `${branch.name}: ${present}`)
                    .join("; "),
                },
              ])
            }
          >
            Download report
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricBar label="Present" value={data.present} total={data.attendanceRequiredTotal} />
            <MetricBar
              label="On leave"
              value={data.onLeave}
              total={data.attendanceRequiredTotal}
              tone="bg-blue-600"
            />
            <MetricBar
              label="Field present"
              value={data.fieldPresent}
              total={data.attendanceRequiredTotal}
            />
            <MetricBar
              label="Absent"
              value={data.absent}
              total={data.attendanceRequiredTotal}
              tone="bg-red-500"
            />
          </div>
          <div className="mt-5 border-t border-border pt-4">
            <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">
              Branch presence
            </p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.branchPresentCounts.map(({ branch, present }) => (
                <div
                  key={branch.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                >
                  <span className="min-w-0 truncate text-sm font-medium">{branch.name}</span>
                  <span className="shrink-0 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                    {present} present
                  </span>
                </div>
              ))}
              {!data.branchPresentCounts.length && (
                <p className="text-sm text-muted-foreground">No active branches are configured.</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      <TeamAttendanceCard
        rows={attendance}
        branches={branches}
        title="Company attendance detail"
        viewAllHref="/attendance/locations"
      />
      <div className="mt-4">
        <UpcomingBirthdaysCard birthdays={birthdays} />
      </div>
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
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total users" value={data.users} icon={Users} />
        <StatCard label="Total employees" value={data.total} icon={UserCheck} />
        <StatCard label="Branches" value={data.branches} icon={Building2} />
        <StatCard
          label="Pending approvals"
          value={data.pendingLeaves}
          icon={CalendarClock}
          tone="warning"
        />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {user.employeeId && (
          <MarkAttendanceCard
            user={user}
            timeline={timeline}
            branches={branches}
            onAttendanceChanged={onAttendanceChanged}
            attendanceReady={attendanceReady}
            className="lg:col-span-2"
          />
        )}
        <RecentAttendanceCard rows={attendance} />
        <AttendanceAnalyticsCard rows={attendance} />
        <div className="lg:col-span-2">
          <UpcomingBirthdaysCard birthdays={birthdays} />
        </div>
      </div>
    </div>
  );
}

function BranchFieldAttendanceCard({
  branchPresentCounts,
  fieldPresent,
}: {
  branchPresentCounts: Array<{ branch: Branch; present: number }>;
  fieldPresent: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Branch & field attendance (today)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {branchPresentCounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No branch attendance data for today.</p>
        ) : (
          branchPresentCounts.map(({ branch, present }) => (
            <div key={branch.id} className="flex items-center justify-between text-sm">
              <span className="font-medium">{branch.name}</span>
              <span className="text-muted-foreground">{present} present</span>
            </div>
          ))
        )}
        <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
          <span className="font-medium">Field</span>
          <span className="text-muted-foreground">{fieldPresent} present</span>
        </div>
      </CardContent>
    </Card>
  );
}

function RecentAttendanceCard({ rows }: { rows: AttendanceRecord[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Recent attendance activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent attendance activity.</p>
        ) : (
          rows.slice(0, 5).map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{a.employeeName}</p>
                <p className="text-xs text-muted-foreground">
                  {a.date} · {a.source} · {a.deviceName ?? a.address ?? "-"}
                </p>
              </div>
              <StatusBadge status={a.status} />
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
  const branchName = (branchId?: string) =>
    branches.find((branch) => branch.id === branchId)?.name ?? "-";
  const time = (value?: string) =>
    value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-";

  return (
    <Card>
      <CardHeader className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-sm">{title}</CardTitle>
        {viewAllHref && (
          <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
            <a href={viewAllHref}>View all employees</a>
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
                <StatusBadge status={row.status} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">In</p>
                  <p className="mt-0.5 font-medium">{time(row.punchIn)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Out</p>
                  <p className="mt-0.5 font-medium">{time(row.punchOut)}</p>
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
                <TableHead>Employee</TableHead>
                <TableHead>In</TableHead>
                <TableHead>Out</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {todayRows.slice(0, 12).map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">{row.employeeName}</div>
                    <div className="text-xs text-muted-foreground">{row.date}</div>
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
          <p className="p-5 text-sm text-muted-foreground">No attendance recorded today.</p>
        )}
      </CardContent>
    </Card>
  );
}

function AttendanceAnalyticsCard({ rows }: { rows: AttendanceRecord[] }) {
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
        <CardTitle className="text-sm">Attendance analytics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <MetricBar label="Present" value={present} total={total} tone="bg-emerald-600" />
        <MetricBar label="On leave" value={leave} total={total} tone="bg-blue-600" />
        <MetricBar label="Missed punch" value={missed} total={total} tone="bg-amber-600" />
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
    dateOfBirth: string;
    isToday: boolean;
    daysUntil: number;
  }>;
}) {
  const { user } = useAuth();
  const myBirthdayToday = birthdays.find(
    (birthday) => birthday.isToday && birthday.employeeId === user?.employeeId,
  );
  const upcoming = futureBirthdays(birthdays);

  const formatDob = (dobStr: string) => {
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
    return `${months[monthIndex]} ${day}`;
  };

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Cake className="h-4 w-4 text-primary" /> Upcoming Birthdays
        </CardTitle>
        <span className="text-xs text-muted-foreground">Next {BIRTHDAY_LOOKAHEAD_DAYS} days</span>
      </CardHeader>
      <CardContent className="space-y-4">
        {myBirthdayToday && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/[0.05] p-3 text-sm">
            <div className="flex min-w-0 items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <Cake className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-foreground">Your birthday</p>
                <p className="text-xs text-muted-foreground">
                  The Anytime Diesel team wishes you a very happy birthday.
                </p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-semibold text-foreground">
                {formatDob(myBirthdayToday.dateOfBirth)}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Today</p>
            </div>
          </div>
        )}

        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {myBirthdayToday
              ? `No other birthdays in the next ${BIRTHDAY_LOOKAHEAD_DAYS} days.`
              : `No upcoming birthdays in the next ${BIRTHDAY_LOOKAHEAD_DAYS} days.`}
          </p>
        ) : (
          <div className="max-h-[300px] space-y-2.5 overflow-y-auto pr-1">
            {upcoming.map((b) => {
              const isSelf = b.employeeId === user?.employeeId;

              return (
                <div
                  key={b.employeeId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-card p-3 text-sm transition-colors hover:bg-muted/40"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="rounded-xl bg-muted p-2 text-muted-foreground">
                      <Cake className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-1.5 font-medium">
                        <span className="truncate">{isSelf ? "Your birthday" : b.name}</span>
                        {isSelf && (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">
                            You
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {isSelf
                          ? "Coming up soon"
                          : [b.designation, b.department].filter(Boolean).join(" · ") ||
                            "Team member"}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold text-foreground">{formatDob(b.dateOfBirth)}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {isSelf ? `In ${b.daysUntil} days` : `${b.daysUntil} days left`}
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
