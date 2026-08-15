import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Target } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmployeePicker } from "@/components/common/EmployeePicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateField } from "@/components/ui/date-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { isPeopleOpsRole, labelize } from "@/lib/lifecycle";
import { employeesApi, lifecycleApi } from "@/services/api";
import type { User } from "@/types/domain";

export const Route = createFileRoute("/_app/performance")({ component: PerformancePage });

function PerformancePage() {
  const { user } = useAuth();
  const isHr = isPeopleOpsRole(user?.role);
  const [cycles, setCycles] = useState<Array<Record<string, unknown>>>([]);
  const [reviews, setReviews] = useState<Array<Record<string, unknown>>>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [cycleId, setCycleId] = useState("");
  const [loading, setLoading] = useState(true);
  const [cycleOpen, setCycleOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [cycleForm, setCycleForm] = useState({ name: "", startsOn: "", endsOn: "" });
  const [assignForm, setAssignForm] = useState({
    employeeId: "",
    goals: [{ kra: "", kpi: "", targetPercent: "100" }],
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cycleRows, people] = await Promise.all([lifecycleApi.cycles(), employeesApi.list().catch(() => [])]);
      setCycles(cycleRows);
      setEmployees(people);
      const next = cycleId || String(cycleRows[0]?.id ?? "");
      setCycleId(next);
      setReviews(await lifecycleApi.reviews(next || undefined));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load performance");
    } finally {
      setLoading(false);
    }
  }, [cycleId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState label="Loading performance" />;

  return (
    <div>
      <PageHeader
        eyebrow="Career"
        title="Performance"
        description="KRA, KPI, target vs achieved, employee and manager comments, skip-level approval, and sign-off."
        actions={
          isHr ? (
            <>
              <Button variant="outline" onClick={() => setCycleOpen(true)}>
                New cycle
              </Button>
              <Button onClick={() => setAssignOpen(true)} disabled={!cycleId}>
                Assign review
              </Button>
            </>
          ) : null
        }
      />
      <div className="mb-4">
        <Label>Cycle</Label>
        <Select
          value={cycleId}
          onValueChange={async (value) => {
            setCycleId(value);
            setReviews(await lifecycleApi.reviews(value));
          }}
        >
          <SelectTrigger className="mt-1 h-11 max-w-md">
            <SelectValue placeholder="Select a cycle" />
          </SelectTrigger>
          <SelectContent>
            {cycles.map((cycle) => (
              <SelectItem key={String(cycle.id)} value={String(cycle.id)}>
                {String(cycle.name)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {reviews.length === 0 ? (
        <EmptyState icon={Target} title="No reviews in this cycle" description="HR assigns KRA/KPI packs to employees and their managers." />
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => {
            const goals = (review.goals as Array<Record<string, unknown>>) ?? [];
            return (
              <article key={String(review.id)} className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{String(review.employeeName)}</p>
                    <p className="text-xs text-muted-foreground">
                      {String(review.designation || review.employeeCode)} · Manager {String(review.managerName)}
                    </p>
                  </div>
                  <StatusBadge status={labelize(String(review.status))} />
                </div>
                <ul className="mt-3 space-y-2">
                  {goals.map((goal) => (
                    <li key={String(goal.id)} className="rounded-lg border p-3">
                      <p className="text-sm font-medium">{String(goal.kra)}</p>
                      <p className="text-xs text-muted-foreground">{String(goal.kpi)}</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <Input
                          className="h-11"
                          defaultValue={String(goal.achievedPercent ?? "")}
                          placeholder={`Achieved % (target ${goal.targetPercent ?? 100})`}
                          onBlur={async (event) => {
                            const achievedPercent = Number(event.target.value);
                            if (!Number.isFinite(achievedPercent)) return;
                            try {
                              await lifecycleApi.updateReview(String(review.id), {
                                goals: [{ id: goal.id, achievedPercent }],
                              });
                            } catch (error) {
                              toast.error(error instanceof Error ? error.message : "Could not save score");
                            }
                          }}
                        />
                        <Input
                          className="h-11"
                          defaultValue={String(goal.employeeComment ?? "")}
                          placeholder="Employee comment"
                          onBlur={async (event) => {
                            try {
                              await lifecycleApi.updateReview(String(review.id), {
                                goals: [{ id: goal.id, employeeComment: event.target.value }],
                              });
                            } catch (error) {
                              toast.error(error instanceof Error ? error.message : "Could not save comment");
                            }
                          }}
                        />
                        <Input
                          className="h-11 sm:col-span-2"
                          defaultValue={String(goal.managerComment ?? "")}
                          placeholder="Manager comment"
                          onBlur={async (event) => {
                            try {
                              await lifecycleApi.updateReview(String(review.id), {
                                goals: [{ id: goal.id, managerComment: event.target.value }],
                              });
                            } catch (error) {
                              toast.error(error instanceof Error ? error.message : "Could not save comment");
                            }
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
                <Textarea
                  className="mt-3"
                  defaultValue={String(review.employeeComment ?? "")}
                  placeholder="Employee overall comment"
                  onBlur={async (event) => {
                    try {
                      await lifecycleApi.updateReview(String(review.id), { employeeComment: event.target.value });
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Could not save comment");
                    }
                  }}
                />
                <Textarea
                  className="mt-2"
                  defaultValue={String(review.managerComment ?? "")}
                  placeholder="Manager comment"
                  onBlur={async (event) => {
                    try {
                      await lifecycleApi.updateReview(String(review.id), { managerComment: event.target.value });
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Could not save comment");
                    }
                  }}
                />
                <Textarea
                  className="mt-2"
                  defaultValue={String(review.skipLevelComment ?? "")}
                  placeholder="Skip-level comment"
                  onBlur={async (event) => {
                    try {
                      await lifecycleApi.updateReview(String(review.id), { skipLevelComment: event.target.value });
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Could not save comment");
                    }
                  }}
                />
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  {(review.employeeId === user?.employeeId || isHr) && String(review.status) === "DRAFT" ? (
                    <Button
                      variant="outline"
                      className="h-11 flex-1"
                      onClick={async () => {
                        try {
                          await lifecycleApi.updateReview(String(review.id), { action: "EMPLOYEE_SUBMIT" });
                          toast.success("Submitted to manager");
                          setReviews(await lifecycleApi.reviews(cycleId));
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "Could not submit");
                        }
                      }}
                    >
                      Employee submit
                    </Button>
                  ) : null}
                  {(review.managerUserId === user?.id || isHr) &&
                  ["DRAFT", "EMPLOYEE_SUBMITTED"].includes(String(review.status)) ? (
                    <Button
                      variant="outline"
                      className="h-11 flex-1"
                      onClick={async () => {
                        try {
                          await lifecycleApi.updateReview(String(review.id), { action: "MANAGER_SUBMIT" });
                          toast.success("Sent for skip-level / sign-off");
                          setReviews(await lifecycleApi.reviews(cycleId));
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "Could not submit");
                        }
                      }}
                    >
                      Manager review
                    </Button>
                  ) : null}
                  {(review.skipLevelUserId === user?.id || isHr) && String(review.status) === "SKIP_LEVEL_PENDING" ? (
                    <Button
                      variant="outline"
                      className="h-11 flex-1"
                      onClick={async () => {
                        try {
                          await lifecycleApi.updateReview(String(review.id), { action: "SKIP_APPROVE" });
                          toast.success("Skip-level approved");
                          setReviews(await lifecycleApi.reviews(cycleId));
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "Could not approve");
                        }
                      }}
                    >
                      Skip-level
                    </Button>
                  ) : null}
                  {(isHr || review.managerUserId === user?.id || review.skipLevelUserId === user?.id) &&
                  ["MANAGER_REVIEWED", "SKIP_LEVEL_PENDING"].includes(String(review.status)) ? (
                    <Button
                      className="h-11 flex-1"
                      onClick={async () => {
                        try {
                          await lifecycleApi.updateReview(String(review.id), { action: "SIGN_OFF" });
                          toast.success("Review signed off");
                          setReviews(await lifecycleApi.reviews(cycleId));
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "Could not sign off");
                        }
                      }}
                    >
                      Sign off
                    </Button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={cycleOpen} onOpenChange={setCycleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New appraisal cycle</DialogTitle>
          </DialogHeader>
          <Input className="h-11" placeholder="Name" value={cycleForm.name} onChange={(e) => setCycleForm({ ...cycleForm, name: e.target.value })} />
          <div>
            <Label>Starts</Label>
            <DateField className="mt-1" value={cycleForm.startsOn} onChange={(startsOn) => setCycleForm({ ...cycleForm, startsOn })} />
          </div>
          <div>
            <Label>Ends</Label>
            <DateField className="mt-1" value={cycleForm.endsOn} onChange={(endsOn) => setCycleForm({ ...cycleForm, endsOn })} />
          </div>
          <DialogFooter>
            <Button
              className="h-11 w-full sm:w-auto"
              onClick={async () => {
                try {
                  await lifecycleApi.createCycle(cycleForm);
                  toast.success("Cycle created");
                  setCycleOpen(false);
                  await load();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not create cycle");
                }
              }}
            >
              Save cycle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assign KRA pack</DialogTitle>
          </DialogHeader>
          <EmployeePicker
            employees={employees}
            value={assignForm.employeeId}
            onChange={(employeeId) => setAssignForm({ ...assignForm, employeeId })}
          />
          <div className="space-y-3">
            {assignForm.goals.map((goal, index) => (
              <div key={index} className="space-y-2 rounded-lg border p-3">
                <Input
                  className="h-11"
                  placeholder="KRA"
                  value={goal.kra}
                  onChange={(e) => {
                    const goals = [...assignForm.goals];
                    goals[index] = { ...goal, kra: e.target.value };
                    setAssignForm({ ...assignForm, goals });
                  }}
                />
                <Textarea
                  placeholder="KPI"
                  value={goal.kpi}
                  onChange={(e) => {
                    const goals = [...assignForm.goals];
                    goals[index] = { ...goal, kpi: e.target.value };
                    setAssignForm({ ...assignForm, goals });
                  }}
                />
                <Input
                  className="h-11"
                  placeholder="Target %"
                  value={goal.targetPercent}
                  onChange={(e) => {
                    const goals = [...assignForm.goals];
                    goals[index] = { ...goal, targetPercent: e.target.value };
                    setAssignForm({ ...assignForm, goals });
                  }}
                />
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              onClick={() =>
                setAssignForm({
                  ...assignForm,
                  goals: [...assignForm.goals, { kra: "", kpi: "", targetPercent: "100" }],
                })
              }
            >
              Add another KRA
            </Button>
          </div>
          <DialogFooter>
            <Button
              className="h-11 w-full sm:w-auto"
              disabled={!assignForm.employeeId || !assignForm.goals.some((goal) => goal.kra && goal.kpi)}
              onClick={async () => {
                const person = employees.find((item) => item.employeeId === assignForm.employeeId);
                try {
                  await lifecycleApi.assignReview(cycleId, {
                    employeeId: assignForm.employeeId,
                    goals: assignForm.goals
                      .filter((goal) => goal.kra && goal.kpi)
                      .map((goal) => ({
                        kra: goal.kra,
                        kpi: goal.kpi,
                        targetPercent: Number(goal.targetPercent || 100),
                      })),
                  });
                  toast.success(`Assigned to ${person?.name ?? "employee"}`);
                  setAssignOpen(false);
                  setAssignForm({ employeeId: "", goals: [{ kra: "", kpi: "", targetPercent: "100" }] });
                  setReviews(await lifecycleApi.reviews(cycleId));
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not assign review");
                }
              }}
            >
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
