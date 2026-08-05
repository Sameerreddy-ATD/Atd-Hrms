import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { AttendanceDayList } from "@/components/attendance/AttendanceDayList";
import {
  MissedPunchRequestPanel,
  type MissedPunchCorrectionRequest,
} from "@/components/attendance/MissedPunchRequestPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { attendanceApi } from "@/services/api";
import type { AttendanceRecord } from "@/types/domain";
import { useAuth } from "@/lib/auth";
import { subscribeToAttendanceChanges } from "@/lib/attendance-live";
import { indiaMonthKey, indiaMonthRange } from "@/lib/india-date";

export const Route = createFileRoute("/_app/attendance/mine")({
  component: MyAttendancePage,
});

function MyAttendancePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [myRequests, setMyRequests] = useState<MissedPunchCorrectionRequest[]>([]);

  const load = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);
      setError("");
      try {
        const { from, to } = indiaMonthRange(indiaMonthKey());
        const [attendanceRows, requestsList] = await Promise.all([
          attendanceApi.listMine(user?.employeeId ?? "", { from, to }),
          attendanceApi.listCorrectionRequests(),
        ]);
        setRecords(attendanceRows);
        const employeeId = user?.employeeId ?? "";
        setMyRequests(
          (requestsList || []).filter((request) =>
            employeeId ? request.employeeId === employeeId : true,
          ),
        );
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
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="My Attendance"
        description="Your own attendance history and missed-punch requests. Check in and out from the dashboard."
        actions={
          <>
            <Button asChild variant="outline" className="min-h-11">
              <Link to="/leave/apply">Apply Leave</Link>
            </Button>
            <Button asChild className="min-h-11">
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
        <Tabs defaultValue="history" className="w-full space-y-4 sm:space-y-6">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:max-w-sm">
            <TabsTrigger
              value="history"
              className="min-h-11 rounded-md py-2.5 text-xs font-semibold sm:text-sm"
            >
              Attendance Log
            </TabsTrigger>
            <TabsTrigger
              value="requests"
              className="min-h-11 rounded-md py-2.5 text-xs font-semibold sm:text-sm"
            >
              Missed Punch
            </TabsTrigger>
          </TabsList>

          <TabsContent value="history" className="mt-0 space-y-4">
            <Card className="border-border shadow-sm">
              <CardHeader className="space-y-1 px-4 pb-3 pt-4 sm:px-6">
                <CardTitle className="text-base font-semibold text-foreground">
                  This month’s log
                </CardTitle>
                <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
                  From the 1st through today. Tap a day to see full punch detail.
                </p>
              </CardHeader>
              <CardContent className="px-3 pb-4 pt-0 sm:px-4 sm:pb-5">
                <AttendanceDayList
                  records={records}
                  mine
                  emptyText="No attendance history records logged yet."
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="requests" className="mt-0 space-y-4">
            <MissedPunchRequestPanel
              records={records}
              requests={myRequests}
              onSubmitted={() => load(false)}
            />
            <Button asChild variant="outline" className="min-h-11 w-full sm:w-auto">
              <Link to="/attendance/missed-punch">Open full Missed Punch page</Link>
            </Button>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
