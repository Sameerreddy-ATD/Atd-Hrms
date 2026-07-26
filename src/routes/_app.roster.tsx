import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, format, startOfWeek, subWeeks, addWeeks } from "date-fns";
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
import { Badge } from "@/components/ui/badge";
import { employeesApi, overtimeApi, rosterApi } from "@/services/api";
import { useAuth } from "@/lib/auth";
import type { User } from "@/types/domain";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_app/roster")({ component: RosterPage });

type ShiftPreset = "DAY" | "NIGHT" | "OFF" | "CUSTOM";

function RosterPage() {
  const { user } = useAuth();
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekStart = useMemo(() => startOfWeek(weekAnchor, { weekStartsOn: 1 }), [weekAnchor]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  );
  const from = format(weekStart, "yyyy-MM-dd");
  const to = format(addDays(weekStart, 6), "yyyy-MM-dd");

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof rosterApi.list>>>([]);
  const [otRows, setOtRows] = useState<Awaited<ReturnType<typeof overtimeApi.list>>>([]);
  const [team, setTeam] = useState<User[]>([]);
  const [minutes, setMinutes] = useState("60");
  const [reason, setReason] = useState("");
  const [otDate, setOtDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [suggestions, setSuggestions] = useState<
    Awaited<ReturnType<typeof overtimeApi.suggestions>>
  >([]);
  const [saving, setSaving] = useState(false);
  const canManage = ["developer_admin", "main_admin", "hr", "manager"].includes(user?.role ?? "");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [roster, ot, people, suggested] = await Promise.all([
        rosterApi.list(from, to),
        overtimeApi.list(),
        canManage ? employeesApi.list().catch(() => []) : Promise.resolve([]),
        overtimeApi.suggestions().catch(() => []),
      ]);
      setRows(roster);
      setOtRows(ot);
      setSuggestions(suggested);
      setTeam(
        (people as User[]).filter((person) => person.active && person.employeeId),
      );
    } catch (error) {
      toast.error((error as Error).message || "Unable to load roster");
    } finally {
      setLoading(false);
    }
  }, [canManage, from, to]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const gridPeople = useMemo(() => {
    if (canManage && team.length) {
      return team.map((person) => ({
        employeeId: person.employeeId!,
        name: person.name,
        code: person.employeeCode,
      }));
    }
    const fromRows = new Map<string, { employeeId: string; name: string; code?: string }>();
    for (const row of rows) {
      fromRows.set(row.employeeId, {
        employeeId: row.employeeId,
        name: row.employeeName,
        code: row.employeeCode,
      });
    }
    if (user?.employeeId && !fromRows.has(user.employeeId)) {
      fromRows.set(user.employeeId, {
        employeeId: user.employeeId,
        name: user.name,
        code: undefined,
      });
    }
    return [...fromRows.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [canManage, rows, team, user]);

  const cellMap = useMemo(() => {
    const map = new Map<string, (typeof rows)[number]>();
    for (const row of rows) map.set(`${row.employeeId}:${row.workDate}`, row);
    return map;
  }, [rows]);

  async function setShift(employeeId: string, workDate: string, shiftPreset: ShiftPreset) {
    if (!canManage) return;
    setSaving(true);
    try {
      await rosterApi.upsert({
        employeeId,
        workDate,
        shiftPreset,
        published: false,
      });
      await reload();
    } catch (error) {
      toast.error((error as Error).message || "Unable to save shift");
    } finally {
      setSaving(false);
    }
  }

  async function publishWeek() {
    if (!canManage || gridPeople.length === 0) return;
    setSaving(true);
    try {
      const jobs: Promise<unknown>[] = [];
      for (const person of gridPeople) {
        for (const day of days) {
          const workDate = format(day, "yyyy-MM-dd");
          const existing = cellMap.get(`${person.employeeId}:${workDate}`);
          jobs.push(
            rosterApi.upsert({
              employeeId: person.employeeId,
              workDate,
              shiftPreset: (existing?.shiftPreset as ShiftPreset) || "DAY",
              published: true,
            }),
          );
        }
      }
      await Promise.all(jobs);
      toast.success("Week published for the team");
      await reload();
    } catch (error) {
      toast.error((error as Error).message || "Unable to publish week");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Loading roster" />;

  return (
    <div className="mx-auto max-w-[1440px] space-y-8 px-4 pb-16 sm:px-6">
      <PageHeader
        title="Shift roster & overtime"
        description="Managers publish the week for their team. Staff see published shifts and can claim overtime."
        actions={
          canManage ? (
            <Button disabled={saving || gridPeople.length === 0} onClick={() => void publishWeek()}>
              Publish week
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setWeekAnchor(subWeeks(weekStart, 1))}
          aria-label="Previous week"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <p className="text-sm font-medium">
          Week of {format(weekStart, "d MMM yyyy")} – {format(addDays(weekStart, 6), "d MMM yyyy")}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setWeekAnchor(addWeeks(weekStart, 1))}
          aria-label="Next week"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setWeekAnchor(new Date())}>
          This week
        </Button>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Team week grid
        </h2>
        {gridPeople.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            {canManage
              ? "No team members available to roster."
              : "No published shifts for you this week yet."}
          </p>
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {gridPeople.map((person) => (
                <div key={person.employeeId} className="rounded-lg border p-3">
                  <p className="mb-2 text-sm font-semibold">
                    {person.name}
                    {person.code ? ` · ${person.code}` : ""}
                  </p>
                  <div className="space-y-2">
                    {days.map((day) => {
                      const workDate = format(day, "yyyy-MM-dd");
                      const cell = cellMap.get(`${person.employeeId}:${workDate}`);
                      return (
                        <div
                          key={workDate}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span className="text-muted-foreground">{format(day, "EEE d")}</span>
                          {canManage ? (
                            <Select
                              value={(cell?.shiftPreset as ShiftPreset) || "DAY"}
                              onValueChange={(value) =>
                                void setShift(person.employeeId, workDate, value as ShiftPreset)
                              }
                            >
                              <SelectTrigger className="h-9 w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="DAY">Day</SelectItem>
                                <SelectItem value="NIGHT">Night</SelectItem>
                                <SelectItem value="OFF">Off</SelectItem>
                                <SelectItem value="CUSTOM">Custom</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant="outline">
                              {cell?.published ? cell.shiftPreset : "—"}
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto rounded-xl border md:block">
              <table className="min-w-[900px] w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Employee</th>
                    {days.map((day) => (
                      <th key={day.toISOString()} className="px-2 py-2 text-center font-semibold">
                        {format(day, "EEE d")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gridPeople.map((person) => (
                    <tr key={person.employeeId} className="border-t">
                      <td className="px-3 py-2">
                        <div className="font-medium">{person.name}</div>
                        {person.code && (
                          <div className="text-xs text-muted-foreground">{person.code}</div>
                        )}
                      </td>
                      {days.map((day) => {
                        const workDate = format(day, "yyyy-MM-dd");
                        const cell = cellMap.get(`${person.employeeId}:${workDate}`);
                        return (
                          <td key={workDate} className="px-2 py-2 text-center">
                            {canManage ? (
                              <div className="space-y-1">
                                <Select
                                  value={(cell?.shiftPreset as ShiftPreset) || "DAY"}
                                  onValueChange={(value) =>
                                    void setShift(
                                      person.employeeId,
                                      workDate,
                                      value as ShiftPreset,
                                    )
                                  }
                                >
                                  <SelectTrigger className="h-9">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="DAY">Day</SelectItem>
                                    <SelectItem value="NIGHT">Night</SelectItem>
                                    <SelectItem value="OFF">Off</SelectItem>
                                    <SelectItem value="CUSTOM">Custom</SelectItem>
                                  </SelectContent>
                                </Select>
                                <div className="text-[10px] text-muted-foreground">
                                  {cell?.published ? "Published" : "Draft"}
                                </div>
                              </div>
                            ) : (
                              <Badge variant="outline">
                                {cell?.published ? cell.shiftPreset : "—"}
                              </Badge>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Overtime
        </h2>
        {suggestions.length > 0 && (
          <div className="space-y-2 rounded-lg border border-dashed p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Suggested from roster vs worked hours (still needs manual submit/approve)
            </p>
            {suggestions.map((item) => (
              <div
                key={item.workDate}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span>
                  {item.workDate} · {item.suggestedMinutes}m · {item.shiftPreset}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setOtDate(item.workDate);
                    setMinutes(String(item.suggestedMinutes));
                    setReason(item.reason);
                  }}
                >
                  Use suggestion
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-4">
          <div>
            <Label>Date</Label>
            <Input type="date" value={otDate} onChange={(event) => setOtDate(event.target.value)} />
          </div>
          <div>
            <Label>Minutes</Label>
            <Input value={minutes} onChange={(event) => setMinutes(event.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Reason</Label>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
          <Button
            className="sm:col-span-4"
            onClick={() =>
              void overtimeApi
                .create({
                  workDate: otDate,
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
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void overtimeApi
                        .review(row.id, "APPROVED")
                        .then(() => {
                          toast.success("Overtime approved");
                          return reload();
                        })
                        .catch((error) => toast.error((error as Error).message))
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void overtimeApi
                        .review(row.id, "REJECTED")
                        .then(() => {
                          toast.success("Overtime rejected");
                          return reload();
                        })
                        .catch((error) => toast.error((error as Error).message))
                    }
                  >
                    Reject
                  </Button>
                </div>
              )}
            </div>
          ))}
          {otRows.length === 0 && (
            <p className="text-sm text-muted-foreground">No overtime claims yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
