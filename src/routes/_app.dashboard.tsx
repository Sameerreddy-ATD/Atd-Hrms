import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { BIRTHDAY_LOOKAHEAD_DAYS, futureBirthdays, upcomingBirthdays } from "@/lib/birthdays";
import { PageHeader } from "@/components/common/PageHeader";
import { BirthdayMarquee } from "@/components/layout/BirthdayMarquee";
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
  type LeaveRequest,
  type User,
} from "@/mock/types";
import { attendanceApi, branchesApi, employeesApi, leaveApi, usersApi } from "@/services/api";
import { downloadCsv } from "@/lib/csv";
import { formatWorkedTime, workedTime } from "@/lib/worked-time";
import { subscribeToAttendanceChanges } from "@/lib/attendance-live";
import { getDeviceLocation } from "@/lib/geolocation";
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

async function getGeolocation(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return reject(
        new Error("Geolocation is not supported by your browser. Please use a modern browser."),
      );
    }
    getDeviceLocation()
      .then(resolve)
      .catch((err: GeolocationPositionError) => {
        let message = "Failed to retrieve location. Please check your system settings.";
        if (err.code === err.PERMISSION_DENIED) {
          message =
            "Location permission was denied. Please enable location permissions for this app in your browser settings.";
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          message = "Location information is unavailable.";
        } else if (err.code === err.TIMEOUT) {
          message = "Location request timed out. Please try again.";
        }
        reject(new Error(message));
      });
  });
}

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

function isPresentStatus(status: string) {
  return status.startsWith("Present");
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

function indiaDateKey() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
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

  const ownAttendanceRoles = useMemo(
    () => ["employee", "sales", "driver", "field_staff"].includes(user?.role ?? ""),
    [user?.role],
  );
  const selfPunchRoles = Boolean(
    user?.employeeId && !["ceo", "developer_admin"].includes(user.role),
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
        ? attendanceApi.listMine(user.employeeId ?? "", {
            from: indiaDateKey(),
            to: indiaDateKey(),
          })
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

    leaveApi
      .list()
      .catch(() => [])
      .then((leaveRows) => {
        if (!active) return;
        setLeaves(leaveRows);
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
          title={`Welcome, ${user.name.split(" ")[0]}`}
          description={`${ROLE_LABELS[user.role]} · Loading today's workspace`}
        />
        <DashboardSkeleton />
      </div>
    );
  }

  const todayAttendance = attendance.filter((row) => row.date === indiaDateKey());
  const total = people.filter((person) => person.employeeId && person.active !== false).length;
  const attendanceRequiredTotal = people.filter(
    (person) =>
      person.employeeId &&
      person.active !== false &&
      !["ceo", "developer_admin"].includes(person.role),
  ).length;
  const presentToday = countUniquePresent(todayAttendance);
  const absent = countStatus(todayAttendance, "Absent");
  const late = countStatus(todayAttendance, "Late");
  const onLeave = countStatusIncludes(todayAttendance, "Leave");
  const fieldPresent = countFieldPresent(todayAttendance);
  const missed = countStatusIncludes(todayAttendance, "Missed");
  const mismatch = todayAttendance.filter((r) => r.branchMismatch).length;
  const pendingLeaves = leaves.filter((l) => l.status === "Pending").length;
  const branchPresentCounts = branches.map((branch) => ({
    branch,
    present: countBranchPresent(todayAttendance, branch.id),
  }));

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        description={`${ROLE_LABELS[user.role]} · ${new Date().toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}`}
      />

      <BirthdayMarquee />

      {secondaryLoading && (
        <div className="mb-3 text-xs font-medium text-muted-foreground">
          Updating leave details...
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
            mismatch,
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
            mismatch,
            branchPresentCounts,
            fieldPresent,
            pendingLeaves,
            onLeave,
          }}
          attendance={todayAttendance}
          branches={branches}
          birthdays={birthdays}
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
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [optimisticSession, setOptimisticSession] = useState<{
    state: "CHECKED_IN" | "CHECKED_OUT";
    startedAt?: number;
  } | null>(null);
  const [leaveCheckIn, setLeaveCheckIn] = useState<{ latitude: number; longitude: number } | null>(
    null,
  );
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
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
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

  async function submitCheckIn(
    coordinates: { latitude: number; longitude: number },
    confirmLeaveCancellation = false,
  ) {
    if (!user.employeeId) return;
    try {
      await attendanceApi.checkIn({
        employeeId: user.employeeId,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
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
        setLeaveCheckIn(coordinates);
        return;
      }
      toast.error(message);
    }
  }

  async function checkIn() {
    if (!user.employeeId) {
      toast.error("You must have an employee profile to mark attendance.");
      return;
    }
    setActionLoading(true);
    try {
      const position = await getGeolocation();
      await submitCheckIn({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    } finally {
      setActionLoading(false);
    }
  }

  async function confirmLeaveCheckIn() {
    if (!leaveCheckIn) return;
    setActionLoading(true);
    try {
      await submitCheckIn(leaveCheckIn, true);
    } finally {
      setActionLoading(false);
    }
  }

  async function checkOut() {
    setActionLoading(true);
    try {
      const position = await getGeolocation();
      await attendanceApi.checkOut({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      setOptimisticSession({ state: "CHECKED_OUT" });
      toast.success("You are checked out");
      onAttendanceChanged();
    } catch (err) {
      toast.error((err as Error).message);
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
                  ? "Getting location..."
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
                  ? "Getting location..."
                  : "Check Out"}
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Mobile and biometric punches synchronize automatically across your signed-in devices.
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
    mismatch: number;
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
        <StatCard label="Team present" value={data.present} icon={UserCheck} tone="success" />
        <StatCard label="On leave" value={data.onLeave} icon={PlaneTakeoff} tone="info" />
        <StatCard
          label="Pending leave approvals"
          value={data.pendingLeaves}
          icon={CalendarClock}
          tone="warning"
        />
        <StatCard
          label="Branch mismatch alerts"
          value={data.mismatch}
          icon={AlertTriangle}
          tone="warning"
          hint="Punch recorded at a branch other than the scheduled branch"
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
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Total employees" value={data.total} icon={Users} />
        <StatCard
          label="Present today"
          value={data.present}
          icon={UserCheck}
          tone="success"
          hint="Office and field"
        />
        <StatCard label="On leave today" value={data.onLeave} icon={PlaneTakeoff} tone="info" />
        <StatCard
          label="Missed punch"
          value={data.missed}
          icon={AlertTriangle}
          tone="warning"
          hint="Checked in without a matching check-out"
        />
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
}: {
  data: {
    total: number;
    attendanceRequiredTotal: number;
    present: number;
    absent: number;
    missed: number;
    mismatch: number;
    branchPresentCounts: Array<{ branch: Branch; present: number }>;
    fieldPresent: number;
    pendingLeaves: number;
    onLeave: number;
  };
  attendance: AttendanceRecord[];
  branches: Branch[];
  birthdays: BirthdayItem[];
}) {
  const accountedFor = Math.min(
    data.attendanceRequiredTotal,
    data.present + data.onLeave + data.absent,
  );
  const awaitingAttendance = Math.max(0, data.attendanceRequiredTotal - accountedFor);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Total employees" value={data.total} icon={Users} />
        <StatCard label="Present today" value={data.present} icon={UserCheck} tone="success" />
        <StatCard label="On leave today" value={data.onLeave} icon={PlaneTakeoff} />
        <StatCard
          label="Leave approvals pending"
          value={data.pendingLeaves}
          icon={CalendarClock}
          tone="warning"
        />
        <StatCard
          label="Attendance exceptions"
          value={data.missed + data.mismatch}
          icon={AlertTriangle}
          tone="warning"
          hint={`${data.missed} missed punch, ${data.mismatch} branch mismatch`}
        />
        <StatCard
          label="Awaiting attendance"
          value={awaitingAttendance}
          icon={Clock3}
          hint="Active employees without a settled attendance status"
        />
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
                  branchMismatch: data.mismatch,
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
        viewAllHref="/attendance"
      />
      <div className="mt-4">
        <UpcomingBirthdaysCard birthdays={birthdays} />
      </div>
    </div>
  );
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
                  <p className="mt-0.5 truncate font-medium">{row.source}</p>
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
                  <TableCell className="text-sm">{row.source}</TableCell>
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
  const present = rows.filter((row) => row.status.startsWith("Present")).length;
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
          <Cake className="h-4 w-4 text-pink-500" /> Upcoming Birthdays
        </CardTitle>
        <span className="text-xs text-muted-foreground">Next {BIRTHDAY_LOOKAHEAD_DAYS} days</span>
      </CardHeader>
      <CardContent className="space-y-4">
        {myBirthdayToday && (
          <div className="flex items-center justify-between rounded-md border border-pink-200 bg-pink-50/50 p-3 text-sm shadow-sm dark:border-pink-900/40 dark:bg-pink-950/10">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-pink-100 p-2 text-pink-600 animate-bounce dark:bg-pink-950/40 dark:text-pink-400">
                🎂
              </div>
              <div>
                <p className="font-semibold text-foreground">Your birthday</p>
                <p className="text-xs text-muted-foreground">
                  The Anytime Diesel Team wishes you a very happy birthday!
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-semibold text-foreground">
                {formatDob(myBirthdayToday.dateOfBirth)}
              </p>
              <p className="text-[10px] font-medium text-pink-700 dark:text-pink-400">Today</p>
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
          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
            {upcoming.map((b) => {
              const isSelf = b.employeeId === user?.employeeId;

              return (
                <div
                  key={b.employeeId}
                  className="flex items-center justify-between rounded-md border border-border bg-card p-3 text-sm transition-all duration-300 hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-muted p-2 text-muted-foreground">🎁</div>
                    <div>
                      <p className="font-medium flex items-center gap-1.5">
                        {isSelf ? "Your birthday" : b.name}
                        {isSelf && (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">
                            You
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {isSelf
                          ? "Coming up soon"
                          : [b.designation, b.department].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
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
