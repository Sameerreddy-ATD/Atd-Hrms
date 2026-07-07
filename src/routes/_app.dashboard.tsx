import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/mock/types";
import { attendanceRecords, branches, leaveRequests, myLeaveBalance, users } from "@/mock/data";
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  MapPin,
  Building2,
  CalendarClock,
  AlertTriangle,
  Fingerprint,
  PlaneTakeoff,
} from "lucide-react";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;

  const total = users.filter((u) => u.employeeId).length;
  const todaysRecords = attendanceRecords;
  const present = todaysRecords.filter((r) => r.status.startsWith("Present")).length;
  const absent = todaysRecords.filter((r) => r.status === "Absent").length;
  const late = todaysRecords.filter((r) => r.status === "Late").length;
  const onLeave = todaysRecords.filter((r) => r.status.includes("Leave")).length;
  const fieldActive = todaysRecords.filter((r) => r.source === "Mobile GPS").length;
  const missed = todaysRecords.filter(
    (r) => r.status === "Missed Punch" || r.status === "Missed Checkout",
  ).length;
  const mismatch = todaysRecords.filter((r) => r.branchMismatch).length;
  const pendingLeaves = leaveRequests.filter((l) => l.status === "Pending").length;
  const b1 = todaysRecords.filter((r) => r.actualBranchId === "b1").length;
  const b2 = todaysRecords.filter((r) => r.actualBranchId === "b2").length;

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        description={`${ROLE_LABELS[user.role]} · ${new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}
      />

      {user.role === "employee" ||
      user.role === "sales" ||
      user.role === "driver" ||
      user.role === "field_staff" ? (
        <EmployeeDashboard />
      ) : user.role === "manager" ? (
        <ManagerDashboard
          data={{ present, absent, late, onLeave, fieldActive, pendingLeaves, mismatch }}
        />
      ) : user.role === "hr" ? (
        <HRDashboard
          data={{ total, present, absent, onLeave, late, missed, fieldActive, b1, b2 }}
        />
      ) : user.role === "ceo" ? (
        <CEODashboard data={{ total, b1, b2, fieldActive, pendingLeaves, onLeave }} />
      ) : (
        <AdminDashboard data={{ total, present, absent, pendingLeaves }} />
      )}
    </div>
  );
}

function EmployeeDashboard() {
  const today = attendanceRecords[0];
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Today's status"
          value={today?.status ?? "Not marked"}
          icon={UserCheck}
          tone="success"
        />
        <StatCard label="Attendance source" value={today?.source ?? "—"} icon={Fingerprint} />
        <StatCard
          label="Leave balance (Paid)"
          value={myLeaveBalance[0].balance}
          hint={`of ${myLeaveBalance[0].entitled} days`}
          icon={PlaneTakeoff}
          tone="info"
        />
        <StatCard label="Pending requests" value={1} icon={CalendarClock} tone="warning" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Recent attendance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {attendanceRecords.slice(0, 4).map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-md border border-border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{a.date}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.source} · {a.deviceName ?? a.address ?? "—"}
                  </p>
                </div>
                <StatusBadge status={a.status} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Leave balance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {myLeaveBalance.map((l) => (
              <div
                key={l.type}
                className="flex items-center justify-between rounded-md border border-border p-3 text-sm"
              >
                <span>{l.type}</span>
                <span className="font-medium">
                  {l.balance} <span className="text-xs text-muted-foreground">/ {l.entitled}</span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ManagerDashboard({
  data,
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
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
      <RecentAttendanceCard />
    </div>
  );
}

function HRDashboard({
  data,
}: {
  data: {
    total: number;
    present: number;
    absent: number;
    onLeave: number;
    late: number;
    missed: number;
    fieldActive: number;
    b1: number;
    b2: number;
  };
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total employees" value={data.total} icon={Users} />
        <StatCard label="Present today" value={data.present} icon={UserCheck} tone="success" />
        <StatCard label="Absent today" value={data.absent} icon={UserX} tone="danger" />
        <StatCard label="On leave today" value={data.onLeave} icon={PlaneTakeoff} tone="info" />
        <StatCard label="Late today" value={data.late} icon={Clock} tone="warning" />
        <StatCard label="Missed punch" value={data.missed} icon={AlertTriangle} tone="warning" />
        <StatCard label="Field attendance" value={data.fieldActive} icon={MapPin} />
        <StatCard label="Payroll report" value="Draft" icon={CalendarClock} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <BranchSplitCard b1={data.b1} b2={data.b2} />
        <RecentAttendanceCard />
      </div>
    </div>
  );
}

function CEODashboard({
  data,
}: {
  data: {
    total: number;
    b1: number;
    b2: number;
    fieldActive: number;
    pendingLeaves: number;
    onLeave: number;
  };
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total employees" value={data.total} icon={Users} />
        <StatCard label="Branch 1 present" value={data.b1} icon={Building2} tone="success" />
        <StatCard label="Branch 2 present" value={data.b2} icon={Building2} tone="success" />
        <StatCard label="Field staff active" value={data.fieldActive} icon={MapPin} tone="info" />
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
          <CardTitle className="text-sm">Monthly attendance trend</CardTitle>
          <Button size="sm" variant="outline">
            Download report
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 28 }).map((_, i) => {
              const h = 40 + ((i * 13) % 60);
              return (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div className="w-full rounded-sm bg-primary/70" style={{ height: `${h}px` }} />
                  <span className="text-[10px] text-muted-foreground">{i + 1}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AdminDashboard({
  data,
}: {
  data: { total: number; present: number; absent: number; pendingLeaves: number };
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total users" value={users.length} icon={Users} />
        <StatCard label="Total employees" value={data.total} icon={UserCheck} />
        <StatCard label="Branches" value={branches.length} icon={Building2} />
        <StatCard
          label="Pending approvals"
          value={data.pendingLeaves}
          icon={CalendarClock}
          tone="warning"
        />
      </div>
      <RecentAttendanceCard />
    </div>
  );
}

function BranchSplitCard({ b1, b2 }: { b1: number; b2: number }) {
  const total = Math.max(b1 + b2, 1);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Branch-wise attendance (today)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {branches.map((b, i) => {
          const v = i === 0 ? b1 : b2;
          const pct = Math.round((v / total) * 100);
          return (
            <div key={b.id}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium">{b.name}</span>
                <span className="text-muted-foreground">{v} present</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function RecentAttendanceCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Recent attendance activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {attendanceRecords.slice(0, 5).map((a) => (
          <div
            key={a.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{a.employeeName}</p>
              <p className="text-xs text-muted-foreground">
                {a.date} · {a.source} · {a.deviceName ?? a.address ?? "—"}
              </p>
            </div>
            <StatusBadge status={a.status} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
