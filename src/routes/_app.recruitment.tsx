import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { recruitmentApi } from "@/services/api";

export const Route = createFileRoute("/_app/recruitment")({ component: RecruitmentPage });

function RecruitmentPage() {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<Awaited<ReturnType<typeof recruitmentApi.jobs>>>([]);
  const [candidates, setCandidates] = useState<
    Awaited<ReturnType<typeof recruitmentApi.candidates>>
  >([]);
  const [title, setTitle] = useState("");
  const [jobId, setJobId] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [hireEmployeeId, setHireEmployeeId] = useState("");

  async function reload() {
    setLoading(true);
    try {
      const [jobRows, candidateRows] = await Promise.all([
        recruitmentApi.jobs(),
        recruitmentApi.candidates(),
      ]);
      setJobs(jobRows);
      setCandidates(candidateRows);
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
        {jobs.map((job) => (
          <div key={job.id} className="rounded-lg border px-4 py-3 text-sm">
            <strong>{job.title}</strong> · {job.candidateCount} candidates · {job.status}
            <div className="mt-1 text-xs text-muted-foreground">{job.id}</div>
          </div>
        ))}
      </section>
      <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-3">
        <Input placeholder="Job ID" value={jobId} onChange={(e) => setJobId(e.target.value)} />
        <Input
          placeholder="Candidate name"
          value={candidateName}
          onChange={(e) => setCandidateName(e.target.value)}
        />
        <Button
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
        {candidates.map((candidate) => (
          <div
            key={candidate.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 text-sm"
          >
            <div>
              <strong>{candidate.name}</strong> · {candidate.jobTitle} · {candidate.stage}
            </div>
            <div className="flex flex-wrap gap-2">
              <Select
                onValueChange={(stage) =>
                  void recruitmentApi
                    .updateCandidate(candidate.id, { stage })
                    .then(() => reload())
                    .catch((error) => toast.error((error as Error).message))
                }
              >
                <SelectTrigger className="h-9 w-36">
                  <SelectValue placeholder="Stage" />
                </SelectTrigger>
                <SelectContent>
                  {["APPLIED", "SCREEN", "INTERVIEW", "OFFER", "HIRED", "REJECTED"].map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {stage}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Hire emp ID"
                className="h-9 w-36"
                value={hireEmployeeId}
                onChange={(e) => setHireEmployeeId(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void recruitmentApi
                    .updateCandidate(candidate.id, {
                      stage: "HIRED",
                      hireEmployeeId,
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
          </div>
        ))}
      </section>
    </div>
  );
}
