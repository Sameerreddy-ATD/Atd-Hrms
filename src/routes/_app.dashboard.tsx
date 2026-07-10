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
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  Clock,
  FileClock,
  Fingerprint,
  LogIn,
  LogOut,
  MapPin,
  PlaneTakeoff,
  UserCheck,
  UserX,
  Users,
  Cake,
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
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      (err) => {
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
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      },
    );
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
  const selfPunchRoles = useMemo(
    () => ["employee", "sales", "driver", "field_staff", "hr"].includes(user?.role ?? ""),
    [user?.role],
  );

  const refreshDashboard = useCallback(() => {
    setReloadKey((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const adminPeopleRoles = ["developer_admin", "main_admin", "hr"];

    setSummaryLoading(true);
    setSecondaryLoading(true);
    setError("");

    Promise.all([
      ownAttendanceRoles
        ? attendanceApi.listMine(user.employeeId ?? "")
        : attendanceApi.list(),
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

  const total = people.filter((u) => u.employeeId).length;
  const presentToday = countUniquePresent(attendance);
  const absent = countStatus(attendance, "Absent");
  const late = countStatus(attendance, "Late");
  const onLeave = countStatusIncludes(attendance, "Leave");
  const fieldPresent = countFieldPresent(attendance);
  const missed = countStatusIncludes(attendance, "Missed");
  const mismatch = attendance.filter((r) => r.branchMismatch).length;
  const pendingLeaves = leaves.filter((l) => l.status === "Pending").length;
  const branchPresentCounts = branches.map((branch) => ({
    branch,
    present: countBranchPresent(attendance, branch.id),
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

      {(summaryLoading || secondaryLoading) && (
        <div className="mb-3 text-xs font-medium text-muted-foreground">
          {summaryLoading ? "Loading dashboard summary..." : "Updating leave details..."}
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
          attendance={attendance}
          timeline={timeline}
          branches={branches}
          birthdays={birthdays}
          onAttendanceChanged={refreshDashboard}
        />
      ) : user.role === "manager" ? (
        <ManagerDashboard
          data={{ present: presentToday, absent, late, onLeave, fieldActive: fieldPresent, pendingLeaves, mismatch }}
          attendance={attendance}
          birthdays={birthdays}
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
        />
      ) : user.role === "ceo" ? (
        <CEODashboard
          data={{
            total,
            branchPresentCounts,
            fieldPresent,
            pendingLeaves,
            onLeave,
          }}
          birthdays={birthdays}
        />
      ) : (
        <AdminDashboard
          data={{
            total,
            present: presentToday,
            absent,
            pendingLeaves,
            users: people.length,
            branches: branches.length,
          }}
          attendance={attendance}
          birthdays={birthdays}
        />
      )}
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
}: {
  user: User;
  attendance: AttendanceRecord[];
  timeline: AttendanceTimelineEvent[];
  branches: Branch[];
  birthdays: BirthdayItem[];
  onAttendanceChanged: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <MarkAttendanceCard
          user={user}
          timeline={timeline}
          branches={branches}
          onAttendanceChanged={onAttendanceChanged}
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
}: {
  user: User;
  timeline: AttendanceTimelineEvent[];
  branches: Branch[];
  onAttendanceChanged: () => void;
  className?: string;
}) {
  const navigate = useNavigate();
  const [actionLoading, setActionLoading] = useState(false);
  const isCheckedIn = useMemo(() => {
    const last = timeline.at(-1)?.type;
    return ["OFFICE_IN", "BRANCH_IN", "FIELD_CHECK_IN", "CLIENT_CHECK_IN", "BREAK_IN"].includes(
      last ?? "",
    );
  }, [timeline]);
  const branchName = branches.find((branch) => branch.id === user.homeBranchId)?.name ?? "-";

  async function checkIn() {
    if (!user.employeeId) {
      toast.error("You must have an employee profile to mark attendance.");
      return;
    }
    setActionLoading(true);
    try {
      const position = await getGeolocation();
      await attendanceApi.checkIn({
        employeeId: user.employeeId,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      toast.success("You are checked in");
      onAttendanceChanged();
    } catch (err) {
      toast.error((err as Error).message);
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
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-sm font-bold text-foreground">Mark Attendance</CardTitle>
        <Button size="sm" variant="outline" onClick={() => navigate({ to: "/attendance/missed-punch" })}>
          <FileClock className="mr-1.5 h-4 w-4" />
          Missed Punch
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-border/60 bg-card p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Fingerprint className="h-4 w-4 text-primary" />
            Live GPS Attendance
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Use this dashboard card for mobile attendance. Biometric punches will still sync automatically.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md bg-muted/40 px-3 py-2">
                <div className="text-muted-foreground">Home Branch</div>
                <div className="font-medium text-foreground">{branchName}</div>
              </div>
              <div className="rounded-md bg-muted/40 px-3 py-2">
                <div className="text-muted-foreground">Punch Status</div>
                <div className="font-medium text-foreground">{isCheckedIn ? "In" : "Out"}</div>
              </div>
            </div>
        </div>

        <div className="flex flex-col justify-center gap-3 rounded-lg border border-border/60 bg-muted/20 p-4">
          <p className="text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {isCheckedIn ? "Currently In" : "Currently Out"}
          </p>
          <Button onClick={checkIn} disabled={actionLoading || isCheckedIn} className="h-12 w-full">
            <LogIn className="mr-2 h-4 w-4" />
            {actionLoading ? "Getting location..." : "In"}
          </Button>
          <Button
            variant="outline"
            onClick={checkOut}
            disabled={actionLoading || !isCheckedIn}
            className="h-12 w-full bg-background"
          >
            <LogOut className="mr-2 h-4 w-4 text-red-500" />
            {actionLoading ? "Getting location..." : "Out"}
          </Button>
          <p className="text-center text-[11px] leading-normal text-muted-foreground">
            GPS is captured securely from your browser location.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ManagerDashboard({
  data,
  attendance,
  birthdays,
}: {
  data: {
    present: number;
    absent: number;
    late: number;
    onLeave: number;
    fieldActive: number;
    pendingLeaves: number;
    mismatch: number;
  };
  attendance: AttendanceRecord[];
  birthdays: BirthdayItem[];
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Team present" value={data.present} icon={UserCheck} tone="success" />
        <StatCard label="Team absent" value={data.absent} icon={UserX} tone="danger" />
        <StatCard label="Team late" value={data.late} icon={Clock} tone="warning" />
        <StatCard label="On leave" value={data.onLeave} icon={PlaneTakeoff} tone="info" />
        <StatCard label="Field staff checked in" value={data.fieldActive} icon={MapPin} />
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
        />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <RecentAttendanceCard rows={attendance} />
        <AttendanceAnalyticsCard rows={attendance} />
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
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
          className="lg:col-span-2"
        />
        <BranchFieldAttendanceCard branchPresentCounts={branchPresentCounts} fieldPresent={data.fieldPresent} />
        <UpcomingBirthdaysCard birthdays={birthdays} />
      </div>
    </div>
  );
}

function CEODashboard({
  data,
  birthdays,
}: {
  data: {
    total: number;
    branchPresentCounts: Array<{ branch: Branch; present: number }>;
    fieldPresent: number;
    pendingLeaves: number;
    onLeave: number;
  };
  birthdays: BirthdayItem[];
}) {
  const b1 = data.branchPresentCounts[0]?.present ?? 0;
  const b2 = data.branchPresentCounts[1]?.present ?? 0;
  const branch1Name = data.branchPresentCounts[0]?.branch.name ?? "Branch 1";
  const branch2Name = data.branchPresentCounts[1]?.branch.name ?? "Branch 2";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total employees" value={data.total} icon={Users} />
        <StatCard label={`${branch1Name} present`} value={b1} icon={Building2} tone="success" />
        <StatCard label={`${branch2Name} present`} value={b2} icon={Building2} tone="success" />
        <StatCard label="Field present" value={data.fieldPresent} icon={MapPin} tone="info" />
        <StatCard label="On leave today" value={data.onLeave} icon={PlaneTakeoff} />
        <StatCard
          label="Pending approvals"
          value={data.pendingLeaves}
          icon={CalendarClock}
          tone="warning"
        />
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Operations snapshot</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              downloadCsv("ceo-attendance-summary.csv", [
                {
                  totalEmployees: data.total,
                  branch1Present: b1,
                  branch2Present: b2,
                  fieldPresent: data.fieldPresent,
                  onLeaveToday: data.onLeave,
                  pendingApprovals: data.pendingLeaves,
                },
              ])
            }
          >
            Download report
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricBar label={`${branch1Name} present`} value={b1} total={Math.max(data.total, 1)} />
            <MetricBar label={`${branch2Name} present`} value={b2} total={Math.max(data.total, 1)} />
            <MetricBar
              label="Field present"
              value={data.fieldPresent}
              total={Math.max(data.total, 1)}
            />
            <MetricBar
              label="On leave today"
              value={data.onLeave}
              total={Math.max(data.total, 1)}
            />
          </div>
        </CardContent>
      </Card>
      <div className="mt-4">
        <UpcomingBirthdaysCard birthdays={birthdays} />
      </div>
    </div>
  );
}

function AdminDashboard({
  data,
  attendance,
  birthdays,
}: {
  data: {
    total: number;
    present: number;
    absent: number;
    pendingLeaves: number;
    users: number;
    branches: number;
  };
  attendance: AttendanceRecord[];
  birthdays: BirthdayItem[];
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

function AttendanceAnalyticsCard({ rows }: { rows: AttendanceRecord[] }) {
  const total = Math.max(rows.length, 1);
  const present = rows.filter((row) => row.status.startsWith("Present")).length;
  const leave = rows.filter((row) => row.status.includes("Leave")).length;
  const missed = rows.filter((row) => row.status.includes("Missed")).length;
  const field = rows.filter((row) => row.source === "Mobile GPS").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Attendance analytics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <MetricBar label="Present" value={present} total={total} tone="bg-emerald-600" />
        <MetricBar label="On leave" value={leave} total={total} tone="bg-blue-600" />
        <MetricBar label="Missed punch" value={missed} total={total} tone="bg-amber-600" />
        <MetricBar label="Field/GPS" value={field} total={total} tone="bg-primary" />
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
          <div className="flex items-center justify-between rounded-md border border-pink-200 bg-pink-50/50 p-3 text-sm shadow-sm dark:bg-pink-950/10">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-pink-100 p-2 text-pink-600 animate-bounce">🎂</div>
              <div>
                <p className="font-semibold text-foreground">Your birthday</p>
                <p className="text-xs text-muted-foreground">
                  The Anytime Diesel Team wishes you a very happy birthday!
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-semibold text-foreground">{formatDob(myBirthdayToday.dateOfBirth)}</p>
              <p className="text-[10px] font-medium text-pink-700">Today</p>
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
