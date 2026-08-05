import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { AttendanceDayList } from "@/components/attendance/AttendanceDayList";
import {
  MissedPunchRequestPanel,
  type MissedPunchCorrectionRequest,
} from "@/components/attendance/MissedPunchRequestPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { attendanceApi, branchesApi } from "@/services/api";
import type { AttendanceRecord, Branch } from "@/types/domain";
import { useAuth } from "@/lib/auth";
import { subscribeToAttendanceChanges } from "@/lib/attendance-live";
import {
  attendanceSourceLabel,
  attendanceStatusWithFlags,
  isMobileAttendanceSource,
  punchSourceLabel,
} from "@/lib/attendance-labels";
import { formatStoredWorkedTime } from "@/lib/worked-time";
import { formatDisplayDate, indiaMonthKey, indiaMonthRange } from "@/lib/india-date";

export const Route = createFileRoute("/_app/attendance/mine")({
  component: MyAttendancePage,
});

function MyAttendancePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [myRequests, setMyRequests] = useState<MissedPunchCorrectionRequest[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const load = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);
      setError("");
      try {
        const { from, to } = indiaMonthRange(indiaMonthKey());
        const [attendanceRows, requestsList, branchRows] = await Promise.all([
          attendanceApi.listMine(user?.employeeId ?? "", { from, to }),
          attendanceApi.listCorrectionRequests(),
          branchesApi.list(),
        ]);
        setRecords(attendanceRows);
        const employeeId = user?.employeeId ?? "";
        setMyRequests(
          (requestsList || []).filter((request) =>
            employeeId ? request.employeeId === employeeId : true,
          ),
        );
        setBranches(branchRows || []);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [user?.employeeId],
  );

  useEffect(() => {
    if (user) void load();
  }, [load, user]);

  useEffect(() => {
    if (!user) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void load(false);
    };
    const interval = window.setInterval(refresh, 45_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load, user]);

  useEffect(() => {
    if (!user?.employeeId) return;
    return subscribeToAttendanceChanges(() => void load(false));
  }, [load, user?.employeeId]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Attendance"
        description="Your own attendance history and missed-punch requests. Use the dashboard to check in and check out."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/leave/apply">Apply Leave</Link>
            </Button>
            <Button asChild>
              <Link to="/attendance/missed-punch">Missed Punch</Link>
            </Button>
          </>
        }
      />

      {loading && <LoadingState label="Loading your attendance data" />}

      {error && (
        <div className="rounded-lg border border-destructive/10 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && (
        <Tabs defaultValue="history" className="w-full space-y-6">
          <TabsList className="grid w-full max-w-[360px] grid-cols-2 rounded-lg bg-muted p-1">
            <TabsTrigger value="history" className="rounded-md py-1.5 text-xs font-semibold">
              Attendance Log
            </TabsTrigger>
            <TabsTrigger value="requests" className="rounded-md py-1.5 text-xs font-semibold">
              Missed Punch
            </TabsTrigger>
          </TabsList>

          <TabsContent value="history" className="space-y-4">
            <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-base font-bold text-foreground">
                    Attendance Log History
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    This month from the 1st through today. Expand a day for full punch detail.
                  </p>
                </div>
              </CardHeader>
              <CardContent className="p-3 sm:p-4">
                <AttendanceDayList
                  records={records}
                  mine
                  emptyText="No attendance history records logged yet."
                />
              </CardContent>
              <CardContent className="hidden">
                <div className="space-y-2 p-3 md:hidden">
                  {records.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No attendance history records logged yet.
                    </p>
                  ) : (
                    records.map((record) => (
                      <div key={record.id} className="rounded-lg border bg-background p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">{formatDisplayDate(record.date)}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {attendanceSourceLabel(record, branches)}
                            </p>
                          </div>
                          <StatusBadge status={record.status} />
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-md bg-muted/50 p-2">
                            <p className="text-muted-foreground">Check in</p>
                            <p className="mt-1 font-medium">{record.punchIn ?? "-"}</p>
                            <p className="mt-0.5 break-words text-[10px] text-muted-foreground">
                              {punchSourceLabel(
                                record.punchInSource,
                                record.punchInBranchId ?? record.actualBranchId,
                                branches,
                              )}
                            </p>
                          </div>
                          <div className="rounded-md bg-muted/50 p-2">
                            <p className="text-muted-foreground">Check out</p>
                            <p className="mt-1 font-medium">{record.punchOut ?? "-"}</p>
                            <p className="mt-0.5 break-words text-[10px] text-muted-foreground">
                              {punchSourceLabel(
                                record.punchOutSource,
                                record.punchOutBranchId ?? record.actualBranchId,
                                branches,
                              )}
                            </p>
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {attendanceStatusWithFlags(record)}
                          {typeof record.workedMinutes === "number"
                            ? ` · ${formatStoredWorkedTime(record.workedMinutes)}`
                            : ""}
                          {isMobileAttendanceSource(record.source) ? " · Mobile" : ""}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="requests" className="space-y-4">
            <MissedPunchRequestPanel
              records={records}
              requests={myRequests}
              onSubmitted={() => load(false)}
            />
            <div className="text-center">
              <Button asChild variant="outline" size="sm">
                <Link to="/attendance/missed-punch">Open full Missed Punch page</Link>
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
