import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format, startOfWeek, addDays } from "date-fns";
import { toast } from "sonner";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { overtimeApi, rosterApi } from "@/services/api";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/roster")({ component: RosterPage });

function RosterPage() {
  const { user } = useAuth();
  const weekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);
  const from = format(weekStart, "yyyy-MM-dd");
  const to = format(addDays(weekStart, 6), "yyyy-MM-dd");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof rosterApi.list>>>([]);
  const [otRows, setOtRows] = useState<Awaited<ReturnType<typeof overtimeApi.list>>>([]);
  const [minutes, setMinutes] = useState("60");
  const [reason, setReason] = useState("");
  const canManage = ["developer_admin", "main_admin", "hr", "manager"].includes(user?.role ?? "");

  async function reload() {
    setLoading(true);
    try {
      const [roster, ot] = await Promise.all([rosterApi.list(from, to), overtimeApi.list()]);
      setRows(roster);
      setOtRows(ot);
    } catch (error) {
      toast.error((error as Error).message || "Unable to load roster");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [from, to]);

  if (loading) return <LoadingState label="Loading roster" />;

  return (
    <div className="mx-auto max-w-[1440px] space-y-8 px-4 pb-16 sm:px-6">
      <PageHeader
        title="Shift roster & overtime"
        description={`Week of ${from}. Publish team shifts and review overtime claims.`}
      />
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Assignments
        </h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No roster rows for this week yet.</p>
        ) : (
          <div className="space-y-1.5">
            {rows.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm"
              >
                <span className="font-medium">
                  {row.employeeName} · {row.workDate}
                </span>
                <span className="text-muted-foreground">
                  {row.shiftPreset}
                  {row.published ? "" : " · draft"}
                </span>
                {canManage && !row.published && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void rosterApi
                        .upsert({
                          employeeId: row.employeeId,
                          workDate: row.workDate,
                          shiftPreset: row.shiftPreset,
                          published: true,
                        })
                        .then(() => reload())
                        .catch((error) => toast.error((error as Error).message))
                    }
                  >
                    Publish
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
        {canManage && user?.employeeId && (
          <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-4">
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                id="roster-date"
                defaultValue={from}
                onBlur={(event) => {
                  const workDate = event.target.value;
                  if (!workDate || !user.employeeId) return;
                  void rosterApi
                    .upsert({
                      employeeId: user.employeeId,
                      workDate,
                      shiftPreset: "DAY",
                      published: false,
                    })
                    .then(() => {
                      toast.success("Draft shift saved for yourself as a sample");
                      return reload();
                    })
                    .catch((error) => toast.error((error as Error).message));
                }}
              />
            </div>
            <p className="sm:col-span-3 self-end text-xs text-muted-foreground">
              Tip: managers can upsert any team member via API; blur date to add a draft day shift
              for yourself.
            </p>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Overtime
        </h2>
        <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-3">
          <div>
            <Label>Minutes</Label>
            <Input value={minutes} onChange={(event) => setMinutes(event.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Reason</Label>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
          <Button
            className="sm:col-span-3"
            onClick={() =>
              void overtimeApi
                .create({
                  workDate: format(new Date(), "yyyy-MM-dd"),
                  minutes: Number(minutes) || 60,
                  reason,
                })
                .then(() => {
                  toast.success("Overtime submitted");
                  setReason("");
                  return reload();
                })
                .catch((error) => toast.error((error as Error).message))
            }
          >
            Submit overtime claim
          </Button>
        </div>
        <div className="space-y-1.5">
          {otRows.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm"
            >
              <span>
                {row.employeeName} · {row.workDate} · {row.minutes}m · {row.status}
              </span>
              {canManage && row.status === "PENDING" && (
                <div className="flex gap-2">
                  <Select
                    onValueChange={(status) =>
                      void overtimeApi
                        .review(row.id, status as "APPROVED" | "REJECTED")
                        .then(() => reload())
                        .catch((error) => toast.error((error as Error).message))
                    }
                  >
                    <SelectTrigger className="h-9 w-32">
                      <SelectValue placeholder="Decide" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="APPROVED">Approve</SelectItem>
                      <SelectItem value="REJECTED">Reject</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
