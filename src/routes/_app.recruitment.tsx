import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EmployeePicker } from "@/components/common/EmployeePicker";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import {
  DesktopTable,
  MobileList,
  MobileListHeader,
  MobileListItem,
  ResponsiveListShell,
} from "@/components/common/ResponsiveList";
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
import { employeesApi, recruitmentApi } from "@/services/api";
import type { User } from "@/types/domain";

export const Route = createFileRoute("/_app/recruitment")({ component: RecruitmentPage });

function RecruitmentPage() {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<Awaited<ReturnType<typeof recruitmentApi.jobs>>>([]);
  const [candidates, setCandidates] = useState<
    Awaited<ReturnType<typeof recruitmentApi.candidates>>
  >([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [title, setTitle] = useState("");
  const [jobId, setJobId] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [hireByCandidate, setHireByCandidate] = useState<Record<string, string>>({});

  async function reload() {
    setLoading(true);
    try {
      const [jobRows, candidateRows, people] = await Promise.all([
        recruitmentApi.jobs(),
        recruitmentApi.candidates(),
        employeesApi.list().catch(() => []),
      ]);
      setJobs(jobRows);
      setCandidates(candidateRows);
      setEmployees((people as User[]).filter((person) => person.active && person.employeeId));
      if (!jobId && jobRows[0]) setJobId(jobRows[0].id);
    } catch (error) {
      toast.error((error as Error).message || "Unable to load recruitment");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  if (loading) return <LoadingState label="Loading recruitment" />;

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 pb-16 sm:px-6">
      <PageHeader
        title="Recruitment"
        description="Lightweight ATS. Hiring a candidate can start their onboarding checklist."
      />
      <div className="flex flex-wrap gap-2 rounded-lg border p-3">
        <Input
          placeholder="Job title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="max-w-sm"
        />
        <Button
          onClick={() =>
            void recruitmentApi
              .createJob({ title })
              .then(() => {
                toast.success("Job opened");
                setTitle("");
                return reload();
              })
              .catch((error) => toast.error((error as Error).message))
          }
        >
          Create job
        </Button>
      </div>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Jobs</h2>
        <ResponsiveListShell>
          <MobileList>
            {jobs.map((job) => (
              <MobileListItem key={job.id}>
                <MobileListHeader
                  title={job.title}
                  meta={`${job.candidateCount} candidates · ${job.status}`}
                />
              </MobileListItem>
            ))}
          </MobileList>
          <DesktopTable>
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Candidates</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{job.title}</td>
                    <td className="px-3 py-2">{job.candidateCount}</td>
                    <td className="px-3 py-2">{job.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DesktopTable>
        </ResponsiveListShell>
      </section>
      <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Job</Label>
          <Select value={jobId || undefined} onValueChange={setJobId}>
            <SelectTrigger>
              <SelectValue placeholder="Select job" />
            </SelectTrigger>
            <SelectContent>
              {jobs.map((job) => (
                <SelectItem key={job.id} value={job.id}>
                  {job.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-1">
          <Label>Candidate name</Label>
          <Input
            placeholder="Candidate name"
            value={candidateName}
            onChange={(e) => setCandidateName(e.target.value)}
          />
        </div>
        <Button
          className="self-end"
          disabled={!jobId || !candidateName.trim()}
          onClick={() =>
            void recruitmentApi
              .createCandidate({ jobId, name: candidateName })
              .then(() => {
                toast.success("Candidate added");
                setCandidateName("");
                return reload();
              })
              .catch((error) => toast.error((error as Error).message))
          }
        >
          Add candidate
        </Button>
      </div>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Candidates
        </h2>
        <ResponsiveListShell>
          <MobileList>
            {candidates.map((candidate) => (
              <MobileListItem key={candidate.id} intrinsicSize="220px">
                <MobileListHeader
                  title={candidate.name}
                  meta={`${candidate.jobTitle} · ${candidate.stage}`}
                />
                <div className="mt-3 space-y-2">
                  <Select
                    onValueChange={(stage) =>
                      void recruitmentApi
                        .updateCandidate(candidate.id, { stage })
                        .then(() => reload())
                        .catch((error) => toast.error((error as Error).message))
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Stage" />
                    </SelectTrigger>
                    <SelectContent>
                      {["APPLIED", "SCREEN", "INTERVIEW", "OFFER", "HIRED", "REJECTED"].map(
                        (stage) => (
                          <SelectItem key={stage} value={stage}>
                            {stage}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                  <EmployeePicker
                    label="Link hired employee"
                    employees={employees}
                    value={hireByCandidate[candidate.id] || ""}
                    onChange={(value) =>
                      setHireByCandidate((current) => ({ ...current, [candidate.id]: value }))
                    }
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!hireByCandidate[candidate.id]}
                    onClick={() =>
                      void recruitmentApi
                        .updateCandidate(candidate.id, {
                          stage: "HIRED",
                          hireEmployeeId: hireByCandidate[candidate.id],
                        })
                        .then(() => {
                          toast.success("Marked hired; onboarding checklist started if possible");
                          return reload();
                        })
                        .catch((error) => toast.error((error as Error).message))
                    }
                  >
                    Hire
                  </Button>
                </div>
              </MobileListItem>
            ))}
          </MobileList>
          <DesktopTable>
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2">Candidate</th>
                  <th className="px-3 py-2">Job</th>
                  <th className="px-3 py-2">Stage</th>
                  <th className="px-3 py-2">Hire as</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((candidate) => (
                  <tr key={candidate.id} className="border-t align-top">
                    <td className="px-3 py-2 font-medium">{candidate.name}</td>
                    <td className="px-3 py-2">{candidate.jobTitle}</td>
                    <td className="px-3 py-2">
                      <Select
                        onValueChange={(stage) =>
                          void recruitmentApi
                            .updateCandidate(candidate.id, { stage })
                            .then(() => reload())
                            .catch((error) => toast.error((error as Error).message))
                        }
                      >
                        <SelectTrigger className="h-9 w-36">
                          <SelectValue placeholder={candidate.stage} />
                        </SelectTrigger>
                        <SelectContent>
                          {["APPLIED", "SCREEN", "INTERVIEW", "OFFER", "HIRED", "REJECTED"].map(
                            (stage) => (
                              <SelectItem key={stage} value={stage}>
                                {stage}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <EmployeePicker
                        label=""
                        employees={employees}
                        value={hireByCandidate[candidate.id] || ""}
                        onChange={(value) =>
                          setHireByCandidate((current) => ({ ...current, [candidate.id]: value }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!hireByCandidate[candidate.id]}
                        onClick={() =>
                          void recruitmentApi
                            .updateCandidate(candidate.id, {
                              stage: "HIRED",
                              hireEmployeeId: hireByCandidate[candidate.id],
                            })
                            .then(() => {
                              toast.success(
                                "Marked hired; onboarding checklist started if possible",
                              );
                              return reload();
                            })
                            .catch((error) => toast.error((error as Error).message))
                        }
                      >
                        Hire
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DesktopTable>
        </ResponsiveListShell>
      </section>
    </div>
  );
}
