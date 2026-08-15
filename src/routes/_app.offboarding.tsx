import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { DoorOpen } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmployeePicker } from "@/components/common/EmployeePicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateField } from "@/components/ui/date-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fileToPayload, isPeopleOpsRole, labelize } from "@/lib/lifecycle";
import { useAuth } from "@/lib/auth";
import { employeesApi, lifecycleApi } from "@/services/api";
import type { User } from "@/types/domain";

export const Route = createFileRoute("/_app/offboarding")({ component: OffboardingPage });

const STEPS = ["ACCESS_REMOVED", "ASSETS_CLEARED", "NO_DUES", "LETTERS_ISSUED", "CLOSED"] as const;

function OffboardingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const allowed = isPeopleOpsRole(user?.role);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: "", reason: "RESIGNATION", endDate: "", notes: "" });

  useEffect(() => {
    if (user && !allowed) navigate({ to: "/dashboard", replace: true });
  }, [user, allowed, navigate]);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    try {
      const [caseRows, people] = await Promise.all([lifecycleApi.offboarding(), employeesApi.list()]);
      setRows(caseRows);
      setEmployees(people);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load offboarding");
    } finally {
      setLoading(false);
    }
  }, [allowed]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!allowed) return <LoadingState label="Redirecting" />;
  if (loading) return <LoadingState label="Loading offboarding" />;

  return (
    <div>
      <PageHeader
        eyebrow="Career"
        title="Offboarding"
        description="End date, access removal, asset clearance, no-dues, resignation letter, experience letter, and intern completion certificate."
        actions={
          <Button className="h-11" onClick={() => setOpen(true)}>
            Start exit
          </Button>
        }
      />
      {rows.length === 0 ? (
        <EmptyState icon={DoorOpen} title="No exit cases" description="Start offboarding when a resignation or intern completion is confirmed." />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <article key={String(row.id)} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{String(row.employeeName)}</p>
                  <p className="text-xs text-muted-foreground">
                    {String(row.employeeCode)} · {labelize(String(row.reason))} · last day {String(row.endDate)}
                  </p>
                </div>
                <StatusBadge status={labelize(String(row.status))} />
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {STEPS.map((step) => {
                  const done =
                    (step === "ACCESS_REMOVED" && row.accessRemovedAt) ||
                    (step === "ASSETS_CLEARED" && row.assetsClearedAt) ||
                    (step === "NO_DUES" && row.noDuesAt) ||
                    (step === "LETTERS_ISSUED" && (row.hasResignationLetter || row.hasExperienceLetter || row.hasInternCertificate)) ||
                    (step === "CLOSED" && row.status === "CLOSED");
                  return (
                    <Button
                      key={step}
                      variant={done ? "secondary" : "outline"}
                      className="h-11 justify-start"
                      onClick={async () => {
                        try {
                          await lifecycleApi.advanceOffboarding(String(row.id), { step });
                          toast.success(labelize(step));
                          await load();
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "Could not update case");
                        }
                      }}
                    >
                      {done ? "Done · " : ""}
                      {labelize(step)}
                    </Button>
                  );
                })}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {(
                  [
                    ["RESIGNATION", row.hasResignationLetter, row.resignationLetterKey, row.resignationLetterName],
                    ["EXPERIENCE", row.hasExperienceLetter, row.experienceLetterKey, row.experienceLetterName],
                    ["INTERN", row.hasInternCertificate, row.internCertificateKey, row.internCertificateName],
                  ] as const
                ).map(([kind, attached, key, name]) => (
                  <div key={kind} className="flex flex-col gap-2">
                    <label className="inline-flex h-11 items-center justify-center rounded-md border text-sm">
                      {attached ? "Replace" : "Upload"} {labelize(kind)}
                      <input
                        type="file"
                        accept="application/pdf,image/*"
                        className="sr-only"
                        onChange={async (event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          try {
                            await lifecycleApi.advanceOffboarding(String(row.id), {
                              step: "LETTERS_ISSUED",
                              letter: { kind, file: await fileToPayload(file) },
                            });
                            toast.success(`${labelize(kind)} letter attached`);
                            await load();
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : "Upload failed");
                          }
                        }}
                      />
                    </label>
                    {key ? (
                      <Button
                        variant="ghost"
                        className="h-10"
                        onClick={() =>
                          void lifecycleApi
                            .downloadFile(String(key), String(name || kind))
                            .catch((error) => toast.error(error instanceof Error ? error.message : "Download failed"))
                        }
                      >
                        Download {labelize(kind)}
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start offboarding</DialogTitle>
          </DialogHeader>
          <EmployeePicker employees={employees} value={form.employeeId} onChange={(employeeId) => setForm({ ...form, employeeId })} />
          <Select value={form.reason} onValueChange={(reason) => setForm({ ...form, reason })}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="RESIGNATION">Resignation</SelectItem>
              <SelectItem value="TERMINATION">Termination</SelectItem>
              <SelectItem value="INTERN_COMPLETE">Intern completion</SelectItem>
              <SelectItem value="ABSCONDING">Absconding</SelectItem>
            </SelectContent>
          </Select>
          <div>
            <Label>Last working day</Label>
            <DateField className="mt-1" value={form.endDate} onChange={(endDate) => setForm({ ...form, endDate })} />
          </div>
          <Textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <DialogFooter>
            <Button
              className="h-11 w-full sm:w-auto"
              disabled={!form.employeeId || !form.endDate}
              onClick={async () => {
                try {
                  await lifecycleApi.startOffboarding(form);
                  toast.success("Offboarding started");
                  setOpen(false);
                  await load();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not start offboarding");
                }
              }}
            >
              Start case
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
