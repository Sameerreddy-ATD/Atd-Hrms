import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { AttendanceDayList } from "@/components/attendance/AttendanceDayList";
import {
  AttendanceWorkdayCard,
  AttendanceWorkdayHistoryList,
} from "@/components/attendance/AttendanceWorkdayCard";
import {
  MissedPunchRequestPanel,
  type MissedPunchCorrectionRequest,
} from "@/components/attendance/MissedPunchRequestPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { attendanceApi } from "@/services/api";
import type { AttendanceRecord } from "@/types/domain";
import { useAuth } from "@/lib/auth";
import { subscribeToAttendanceChanges } from "@/lib/attendance-live";
import { indiaDateKey } from "@/lib/india-date";
import { currentAttendanceCycle } from "@/lib/attendance-cycle";

type MineSearch = { tab?: "history" | "requests" };

export const Route = createFileRoute("/_app/attendance/mine")({
  validateSearch: (search: Record<string, unknown>): MineSearch => ({
    tab: search.tab === "requests" ? "requests" : search.tab === "history" ? "history" : undefined,
  }),
  component: MyAttendancePage,
});

function MyAttendancePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { tab: tabSearch } = useSearch({ from: "/_app/attendance/mine" });
  const activeTab = tabSearch === "requests" ? "requests" : "history";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [myRequests, setMyRequests] = useState<MissedPunchCorrectionRequest[]>([]);

  const load = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);
      setError("");
      try {
        const { from, to } = currentAttendanceCycle(indiaDateKey());
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

  const pendingCount = myRequests.filter((row) => row.status === "PENDING").length;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={t("pages.attendanceMine.title")}
        description={t("pages.attendanceMine.subtitle")}
      />

      {loading && <LoadingState label={t("pages.loading.attendanceMine")} />}

      {error && (
        <div className="rounded-lg border border-destructive/10 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && (
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            void navigate({
              to: "/attendance/mine",
              search: { tab: value === "requests" ? "requests" : "history" },
              replace: true,
            });
          }}
          className="w-full space-y-4"
        >
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl bg-muted p-1 sm:max-w-md">
            <TabsTrigger
              value="history"
              className="min-h-11 rounded-lg py-2.5 text-xs font-semibold sm:text-sm"
            >
              {t("pages.attendanceMine.tabLog")}
            </TabsTrigger>
            <TabsTrigger
              value="requests"
              className="min-h-11 rounded-lg py-2.5 text-xs font-semibold sm:text-sm"
            >
              {t("pages.attendanceMine.tabMissed")}
              {pendingCount > 0 ? (
                <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {pendingCount}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="history" className="mt-0 space-y-3">
            <AttendanceWorkdayCard />
            <Card className="border-border shadow-sm">
              <CardHeader className="space-y-1 px-4 pb-3 pt-4 sm:px-6">
                <CardTitle className="text-base font-semibold text-foreground">
                  Workday history
                </CardTitle>
                <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
                  Grouped by logical work date (night shifts stay on the start date).
                </p>
              </CardHeader>
              <CardContent className="px-3 pb-4 pt-0 sm:px-4 sm:pb-5">
                <AttendanceWorkdayHistoryList />
              </CardContent>
            </Card>
            <Card className="border-border shadow-sm">
              <CardHeader className="space-y-1 px-4 pb-3 pt-4 sm:px-6">
                <CardTitle className="text-base font-semibold text-foreground">
                  {t("pages.attendanceMine.thisMonth")}
                </CardTitle>
                <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
                  {t("pages.attendanceMine.tapDayHint")}
                </p>
              </CardHeader>
              <CardContent className="px-3 pb-4 pt-0 sm:px-4 sm:pb-5">
                <AttendanceDayList
                  records={records}
                  mine
                  emptyText={t("pages.attendanceMine.noHistory")}
                />
              </CardContent>
            </Card>
            <p className="px-1 text-center text-xs text-muted-foreground sm:text-left">
              {t("pages.attendanceMine.needTimeOff")}{" "}
              <Link
                to="/leave/apply"
                className="font-semibold text-primary underline-offset-2 hover:underline"
              >
                {t("pages.attendanceMine.applyLeave")}
              </Link>
            </p>
          </TabsContent>

          <TabsContent value="requests" className="mt-0">
            <MissedPunchRequestPanel
              records={records}
              requests={myRequests}
              onSubmitted={() => load(false)}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
