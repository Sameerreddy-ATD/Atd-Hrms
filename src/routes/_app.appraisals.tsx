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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { appraisalsApi, employeesApi } from "@/services/api";
import { useAuth } from "@/lib/auth";
import type { User } from "@/types/domain";

export const Route = createFileRoute("/_app/appraisals")({ component: AppraisalsPage });

function AppraisalsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [cycles, setCycles] = useState<Awaited<ReturnType<typeof appraisalsApi.cycles>>>([]);
  const [reviews, setReviews] = useState<Awaited<ReturnType<typeof appraisalsApi.reviews>>>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [cycleId, setCycleId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [rating, setRating] = useState("3");
  const [comments, setComments] = useState("");
  const canHr = ["developer_admin", "main_admin", "hr"].includes(user?.role ?? "");
  const canReview = canHr || user?.role === "manager";

  async function reload() {
    setLoading(true);
    try {
      const [cycleRows, reviewRows, people] = await Promise.all([
        appraisalsApi.cycles(),
        appraisalsApi.reviews(),
        canReview ? employeesApi.list().catch(() => []) : Promise.resolve([]),
      ]);
      setCycles(cycleRows);
      setReviews(reviewRows);
      setEmployees((people as User[]).filter((person) => person.active && person.employeeId));
      if (!cycleId && cycleRows[0]) setCycleId(cycleRows[0].id);
    } catch (error) {
      toast.error((error as Error).message || "Unable to load appraisals");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  if (loading) return <LoadingState label="Loading appraisals" />;

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 pb-16 sm:px-6">
      <PageHeader
        title="Performance appraisals"
        description="Simple rating cycles for managers and HR overview."
      />
      {canHr && (
        <div className="grid gap-2 rounded-lg border p-4 sm:grid-cols-4">
          <Input placeholder="Cycle name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          <Button
            onClick={() =>
              void appraisalsApi
                .createCycle({ name, startsOn, endsOn })
                .then(() => {
                  toast.success("Cycle created");
                  return reload();
                })
                .catch((error) => toast.error((error as Error).message))
            }
          >
            Create cycle
          </Button>
        </div>
      )}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Cycles
        </h2>
        <ResponsiveListShell>
          <MobileList>
            {cycles.map((cycle) => (
              <MobileListItem key={cycle.id}>
                <MobileListHeader
                  title={cycle.name}
                  meta={`${cycle.startsOn} → ${cycle.endsOn} · ${cycle.reviewCount} reviews · ${cycle.status}`}
                />
              </MobileListItem>
            ))}
          </MobileList>
          <DesktopTable>
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2">Cycle</th>
                  <th className="px-3 py-2">Dates</th>
                  <th className="px-3 py-2">Reviews</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {cycles.map((cycle) => (
                  <tr key={cycle.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{cycle.name}</td>
                    <td className="px-3 py-2">
                      {cycle.startsOn} → {cycle.endsOn}
                    </td>
                    <td className="px-3 py-2">{cycle.reviewCount}</td>
                    <td className="px-3 py-2">{cycle.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DesktopTable>
        </ResponsiveListShell>
      </section>
      {canReview && (
        <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Cycle</Label>
            <Select value={cycleId || undefined} onValueChange={setCycleId}>
              <SelectTrigger>
                <SelectValue placeholder="Select cycle" />
              </SelectTrigger>
              <SelectContent>
                {cycles.map((cycle) => (
                  <SelectItem key={cycle.id} value={cycle.id}>
                    {cycle.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <EmployeePicker employees={employees} value={employeeId} onChange={setEmployeeId} />
          <Input
            placeholder="Rating 1-5"
            value={rating}
            onChange={(e) => setRating(e.target.value)}
          />
          <Textarea
            placeholder="Comments"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
          />
          <Button
            className="sm:col-span-2"
            disabled={!cycleId || !employeeId}
            onClick={() =>
              void appraisalsApi
                .saveReview({
                  cycleId,
                  employeeId,
                  rating: Number(rating),
                  comments,
                  status: "SUBMITTED",
                })
                .then(() => {
                  toast.success("Review saved");
                  return reload();
                })
                .catch((error) => toast.error((error as Error).message))
            }
          >
            Submit review
          </Button>
        </div>
      )}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Reviews
        </h2>
        <ResponsiveListShell>
          <MobileList>
            {reviews.map((review) => (
              <MobileListItem key={review.id}>
                <MobileListHeader
                  title={review.employeeName}
                  meta={`${review.cycleName} · ${review.rating ?? "—"}/5 · ${review.status}`}
                />
                {review.comments && (
                  <p className="mt-1 text-xs text-muted-foreground">{review.comments}</p>
                )}
              </MobileListItem>
            ))}
          </MobileList>
          <DesktopTable>
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Cycle</th>
                  <th className="px-3 py-2">Rating</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Comments</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((review) => (
                  <tr key={review.id} className="border-t">
                    <td className="px-3 py-2">{review.employeeName}</td>
                    <td className="px-3 py-2">{review.cycleName}</td>
                    <td className="px-3 py-2">{review.rating ?? "—"}/5</td>
                    <td className="px-3 py-2">{review.status}</td>
                    <td className="px-3 py-2 text-muted-foreground">{review.comments || "—"}</td>
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
