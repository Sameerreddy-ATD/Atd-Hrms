import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { InfoButton } from "@/components/common/InfoButton";
import { LoadingState } from "@/components/common/LoadingState";
import {
  MissedPunchRequestPanel,
  type MissedPunchCorrectionRequest,
} from "@/components/attendance/MissedPunchRequestPanel";
import { useAuth } from "@/lib/auth";
import { attendanceApi } from "@/services/api";
import type { AttendanceRecord } from "@/types/domain";

export const Route = createFileRoute("/_app/attendance/missed-punch")({
  component: MissedPunchPage,
});

function MissedPunchPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [requests, setRequests] = useState<MissedPunchCorrectionRequest[]>([]);

  const load = useCallback(
    async (showLoading = true) => {
      if (!user?.employeeId) {
        setRecords([]);
        setRequests([]);
        setLoading(false);
        return;
      }
      if (showLoading) setLoading(true);
      setError("");
      try {
        const [attendanceRows, requestsList] = await Promise.all([
          attendanceApi.listMine(user.employeeId),
          attendanceApi.listCorrectionRequests(),
        ]);
        setRecords(attendanceRows);
        setRequests(
          (requestsList || []).filter((request) => request.employeeId === user.employeeId),
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
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Missed Punch"
        description="Open a detected missing In or Out, enter the time and reason, then submit for review."
        actions={
          <InfoButton title="How missed punch requests work">
            Only punches the system already marked as missing appear here. Date and In/Out type are
            locked when you select a miss. Enter the actual time and a short reason. Your
            organization head reviews the request; approved punches update attendance
            automatically. Future times cannot be submitted.
          </InfoButton>
        }
      />

      {loading && <LoadingState label="Loading missing punches" />}
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {!loading && !error && (
        <MissedPunchRequestPanel
          records={records}
          requests={requests}
          onSubmitted={() => load(false)}
        />
      )}
    </div>
  );
}
