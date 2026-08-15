import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  DesktopTable,
  MobileList,
  MobileListHeader,
  MobileListItem,
  ResponsiveListShell,
} from "@/components/common/ResponsiveList";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateField } from "@/components/ui/date-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmployeePicker } from "@/components/common/EmployeePicker";
import { useAuth } from "@/lib/auth";
import { CANDIDATE_PIPELINE_STAGES, isPeopleLeaderRole, isPeopleOpsRole, labelize } from "@/lib/lifecycle";
import { employeesApi, lifecycleApi } from "@/services/api";
import type { User } from "@/types/domain";

export const Route = createFileRoute("/_app/talent")({ component: TalentPage });

function TalentPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canEdit = isPeopleOpsRole(user?.role);
  const canRecruit = isPeopleLeaderRole(user?.role);
  const [jobs, setJobs] = useState<Array<Record<string, unknown>>>([]);
  const [candidates, setCandidates] = useState<Array<Record<string, unknown>>>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [jobId, setJobId] = useState("");
  const [loading, setLoading] = useState(true);
  const [jobOpen, setJobOpen] = useState(false);
  const [candidateOpen, setCandidateOpen] = useState(false);
  const [interviewFor, setInterviewFor] = useState<string | null>(null);
  const [offerFor, setOfferFor] = useState<string | null>(null);
  const [hireFor, setHireFor] = useState<string | null>(null);
  const [jobForm, setJobForm] = useState({ title: "", departmentName: "", openings: "1", description: "" });
  const [candidateForm, setCandidateForm] = useState({
    name: "",
    email: "",
    phone: "",
    source: "",
    expectedCtc: "",
  });
  const [interviewForm, setInterviewForm] = useState({ roundName: "HR round", interviewerName: "", feedback: "" });
  const [offerForm, setOfferForm] = useState({ ctcAnnual: "", designation: "", joiningDate: "", employeeId: "" });
  const [hireForm, setHireForm] = useState({ employeeId: "", designation: "", startOnboarding: true });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [jobRows, people] = await Promise.all([lifecycleApi.jobs(), employeesApi.list().catch(() => [])]);
      setJobs(jobRows);
      setEmployees(people);
      const nextJob = jobId && jobRows.some((job) => job.id === jobId) ? jobId : String(jobRows[0]?.id ?? "");
      setJobId(nextJob);
      if (nextJob) setCandidates(await lifecycleApi.candidates({ jobId: nextJob }));
      else setCandidates([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load talent");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedJob = useMemo(() => jobs.find((job) => job.id === jobId), [jobs, jobId]);

  async function createJob() {
    try {
      await lifecycleApi.createJob({
        title: jobForm.title,
        departmentName: jobForm.departmentName || undefined,
        openings: Number(jobForm.openings || 1),
        description: jobForm.description || undefined,
      });
      toast.success("Job opening saved");
      setJobOpen(false);
      setJobForm({ title: "", departmentName: "", openings: "1", description: "" });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save opening");
    }
  }

  async function createCandidate() {
    try {
      await lifecycleApi.createCandidate({
        jobId,
        name: candidateForm.name,
        email: candidateForm.email || undefined,
        phone: candidateForm.phone || undefined,
        source: candidateForm.source || undefined,
        expectedCtc: candidateForm.expectedCtc ? Number(candidateForm.expectedCtc) : undefined,
      });
      toast.success("Candidate added");
      setCandidateOpen(false);
      setCandidateForm({ name: "", email: "", phone: "", source: "", expectedCtc: "" });
      setCandidates(await lifecycleApi.candidates({ jobId }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add candidate");
    }
  }

  if (loading) return <LoadingState label="Loading talent pipeline" />;

  return (
    <div>
      <PageHeader
        eyebrow="Hire"
        title="Talent acquisition"
        description="Openings → candidates → interview → offer → hire → onboarding."
        actions={
          canRecruit ? (
            <>
              {canEdit ? (
                <Button variant="outline" onClick={() => setJobOpen(true)}>
                  New opening
                </Button>
              ) : null}
              <Button onClick={() => setCandidateOpen(true)} disabled={!jobId}>
                <Plus className="h-4 w-4" />
                Add candidate
              </Button>
            </>
          ) : null
        }
      />

      {jobs.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="No openings yet"
          description={canEdit ? "Create a job opening to start hiring." : "HR has not published openings yet."}
        />
      ) : (
        <>
          <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <Label>Opening</Label>
              <Select
                value={jobId}
                onValueChange={async (value) => {
                  setJobId(value);
                  setCandidates(await lifecycleApi.candidates({ jobId: value }));
                }}
              >
                <SelectTrigger className="mt-1 h-11">
                  <SelectValue placeholder="Select a job" />
                </SelectTrigger>
                <SelectContent>
                  {jobs.map((job) => (
                    <SelectItem key={String(job.id)} value={String(job.id)}>
                      {String(job.title)} ({Number(job.candidateCount ?? 0)}) · {labelize(String(job.status))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedJob && canEdit ? (
              <Select
                value={String(selectedJob.status)}
                onValueChange={async (status) => {
                  try {
                    await lifecycleApi.updateJob(String(selectedJob.id), { status });
                    toast.success(`Opening marked ${labelize(status)}`);
                    await load();
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not update opening");
                  }
                }}
              >
                <SelectTrigger className="h-11 w-full sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPEN">Open</SelectItem>
                  <SelectItem value="ON_HOLD">On hold</SelectItem>
                  <SelectItem value="CLOSED">Closed</SelectItem>
                </SelectContent>
              </Select>
            ) : null}
          </div>
          {selectedJob ? (
            <p className="mb-4 text-sm text-muted-foreground">
              {String(selectedJob.departmentName || "Company")} · {Number(selectedJob.openings ?? 1)} opening
              {Number(selectedJob.openings ?? 1) === 1 ? "" : "s"} · {labelize(String(selectedJob.status))}
            </p>
          ) : null}

          {candidates.length === 0 ? (
            <EmptyState icon={UserPlus} title="No candidates yet" description="Add a candidate to start the TA process." />
          ) : (
            <ResponsiveListShell>
              <MobileList>
                {candidates.map((row) => (
                  <MobileListItem key={String(row.id)}>
                    <MobileListHeader
                      title={String(row.name)}
                      meta={String(row.email || row.phone || "")}
                      trailing={<StatusBadge status={labelize(String(row.stage))} />}
                    />
                    <div className="mt-3 flex flex-col gap-2">
                      <Button size="sm" variant="outline" onClick={() => setInterviewFor(String(row.id))}>
                        Log interview
                      </Button>
                      {canEdit ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setOfferFor(String(row.id))}>
                            Send offer
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              setHireForm({
                                employeeId: String(row.hiredEmployeeId || ""),
                                designation: "",
                                startOnboarding: true,
                              });
                              setHireFor(String(row.id));
                            }}
                          >
                            Convert to hire
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </MobileListItem>
                ))}
              </MobileList>
              <DesktopTable>
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Candidate</th>
                      <th className="px-4 py-3">Stage</th>
                      <th className="px-4 py-3">Interviews</th>
                      <th className="px-4 py-3">Offer</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((row) => (
                      <tr key={String(row.id)} className="border-t">
                        <td className="px-4 py-3">
                          <p className="font-medium">{String(row.name)}</p>
                          <p className="text-xs text-muted-foreground">{String(row.email || row.phone || "—")}</p>
                          {row.hiredEmployeeName ? (
                            <p className="text-xs text-muted-foreground">Linked: {String(row.hiredEmployeeName)}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <Select
                            value={String(row.stage)}
                            onValueChange={async (stage) => {
                              if (stage === "HIRED") {
                                toast.message("Use Hire to convert the candidate and open onboarding.");
                                return;
                              }
                              await lifecycleApi.updateCandidate(String(row.id), { stage });
                              setCandidates(await lifecycleApi.candidates({ jobId }));
                            }}
                          >
                            <SelectTrigger className="h-10 w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CANDIDATE_PIPELINE_STAGES.map((stage) => (
                                <SelectItem key={stage} value={stage}>
                                  {labelize(stage)}
                                </SelectItem>
                              ))}
                              {String(row.stage) === "HIRED" ? (
                                <SelectItem value="HIRED" disabled>
                                  Hired
                                </SelectItem>
                              ) : null}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-3">{Array.isArray(row.interviews) ? row.interviews.length : 0}</td>
                        <td className="px-4 py-3">
                          {Array.isArray(row.offers) && row.offers[0]
                            ? labelize(String((row.offers[0] as { status: string }).status))
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => setInterviewFor(String(row.id))}>
                              Interview
                            </Button>
                            {canEdit ? (
                              <>
                                <Button size="sm" variant="outline" onClick={() => setOfferFor(String(row.id))}>
                                  Offer
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setHireForm({
                                      employeeId: String(row.hiredEmployeeId || ""),
                                      designation: "",
                                      startOnboarding: true,
                                    });
                                    setHireFor(String(row.id));
                                  }}
                                >
                                  Hire
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DesktopTable>
            </ResponsiveListShell>
          )}
        </>
      )}

      <Dialog open={jobOpen} onOpenChange={setJobOpen}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New job opening</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Title</Label>
              <Input className="mt-1 h-11" value={jobForm.title} onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })} />
            </div>
            <div>
              <Label>Department</Label>
              <Input
                className="mt-1 h-11"
                value={jobForm.departmentName}
                onChange={(e) => setJobForm({ ...jobForm, departmentName: e.target.value })}
              />
            </div>
            <div>
              <Label>Openings</Label>
              <Input
                className="mt-1 h-11"
                type="number"
                value={jobForm.openings}
                onChange={(e) => setJobForm({ ...jobForm, openings: e.target.value })}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                className="mt-1"
                value={jobForm.description}
                onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button className="h-11 w-full sm:w-auto" onClick={() => void createJob()} disabled={!jobForm.title}>
              Save opening
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={candidateOpen} onOpenChange={setCandidateOpen}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add candidate</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input
                className="mt-1 h-11"
                value={candidateForm.name}
                onChange={(e) => setCandidateForm({ ...candidateForm, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                className="mt-1 h-11"
                value={candidateForm.email}
                onChange={(e) => setCandidateForm({ ...candidateForm, email: e.target.value })}
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                className="mt-1 h-11"
                value={candidateForm.phone}
                onChange={(e) => setCandidateForm({ ...candidateForm, phone: e.target.value })}
              />
            </div>
            <div>
              <Label>Source</Label>
              <Input
                className="mt-1 h-11"
                value={candidateForm.source}
                onChange={(e) => setCandidateForm({ ...candidateForm, source: e.target.value })}
              />
            </div>
            <div>
              <Label>Expected CTC</Label>
              <Input
                className="mt-1 h-11"
                value={candidateForm.expectedCtc}
                onChange={(e) => setCandidateForm({ ...candidateForm, expectedCtc: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="h-11 w-full sm:w-auto"
              onClick={() => void createCandidate()}
              disabled={!candidateForm.name}
            >
              Save candidate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(interviewFor)} onOpenChange={() => setInterviewFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Interview round</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Round</Label>
              <Input
                className="mt-1 h-11"
                value={interviewForm.roundName}
                onChange={(e) => setInterviewForm({ ...interviewForm, roundName: e.target.value })}
              />
            </div>
            <div>
              <Label>Interviewer</Label>
              <Input
                className="mt-1 h-11"
                value={interviewForm.interviewerName}
                onChange={(e) => setInterviewForm({ ...interviewForm, interviewerName: e.target.value })}
              />
            </div>
            <div>
              <Label>Feedback</Label>
              <Textarea
                className="mt-1"
                value={interviewForm.feedback}
                onChange={(e) => setInterviewForm({ ...interviewForm, feedback: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="h-11 w-full sm:w-auto"
              onClick={async () => {
                if (!interviewFor) return;
                try {
                  await lifecycleApi.addInterview(interviewFor, { ...interviewForm, outcome: "COMPLETED" });
                  toast.success("Interview saved");
                  setInterviewFor(null);
                  setCandidates(await lifecycleApi.candidates({ jobId }));
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not save interview");
                }
              }}
            >
              Save round
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(offerFor)} onOpenChange={() => setOfferFor(null)}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Send offer letter</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Annual CTC</Label>
              <Input
                className="mt-1 h-11"
                value={offerForm.ctcAnnual}
                onChange={(e) => setOfferForm({ ...offerForm, ctcAnnual: e.target.value })}
              />
            </div>
            <div>
              <Label>Designation</Label>
              <Input
                className="mt-1 h-11"
                value={offerForm.designation}
                onChange={(e) => setOfferForm({ ...offerForm, designation: e.target.value })}
              />
            </div>
            <div>
              <Label>Joining date</Label>
              <DateField
                className="mt-1"
                value={offerForm.joiningDate}
                onChange={(joiningDate) => setOfferForm({ ...offerForm, joiningDate })}
              />
            </div>
            <EmployeePicker
              employees={employees}
              value={offerForm.employeeId}
              onChange={(employeeId) => setOfferForm({ ...offerForm, employeeId })}
              label="Link employee login (optional)"
            />
          </div>
          <DialogFooter>
            <Button
              className="h-11 w-full sm:w-auto"
              onClick={async () => {
                if (!offerFor) return;
                try {
                  await lifecycleApi.createOffer(offerFor, {
                    ctcAnnual: Number(offerForm.ctcAnnual),
                    designation: offerForm.designation || undefined,
                    joiningDate: offerForm.joiningDate || undefined,
                    employeeId: offerForm.employeeId || undefined,
                    send: true,
                  });
                  toast.success("Offer sent");
                  setOfferFor(null);
                  setCandidates(await lifecycleApi.candidates({ jobId }));
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not send offer");
                }
              }}
              disabled={!offerForm.ctcAnnual}
            >
              Send offer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(hireFor)} onOpenChange={() => setHireFor(null)}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Convert to hire</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Link an existing User Login (employee profile), mark the candidate Hired, and open onboarding documents.
          </p>
          <EmployeePicker
            employees={employees}
            value={hireForm.employeeId}
            onChange={(employeeId) => setHireForm({ ...hireForm, employeeId })}
            label="Employee login"
          />
          <Input
            className="h-11"
            placeholder="Designation (optional)"
            value={hireForm.designation}
            onChange={(e) => setHireForm({ ...hireForm, designation: e.target.value })}
          />
          <DialogFooter>
            <Button
              className="h-11 w-full sm:w-auto"
              disabled={!hireForm.employeeId}
              onClick={async () => {
                if (!hireFor) return;
                try {
                  await lifecycleApi.hireCandidate(hireFor, {
                    employeeId: hireForm.employeeId,
                    designation: hireForm.designation || undefined,
                    startOnboarding: hireForm.startOnboarding,
                  });
                  toast.success("Candidate hired — onboarding is ready");
                  setHireFor(null);
                  setCandidates(await lifecycleApi.candidates({ jobId }));
                  void navigate({ to: "/onboarding" });
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not convert hire");
                }
              }}
            >
              Hire and open onboarding
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
