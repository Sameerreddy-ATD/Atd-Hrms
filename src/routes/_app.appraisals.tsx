import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { appraisalsApi } from "@/services/api";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/appraisals")({ component: AppraisalsPage });

function AppraisalsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [cycles, setCycles] = useState<Awaited<ReturnType<typeof appraisalsApi.cycles>>>([]);
  const [reviews, setReviews] = useState<Awaited<ReturnType<typeof appraisalsApi.reviews>>>([]);
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
      const [cycleRows, reviewRows] = await Promise.all([
        appraisalsApi.cycles(),
        appraisalsApi.reviews(),
      ]);
      setCycles(cycleRows);
      setReviews(reviewRows);
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
        {cycles.map((cycle) => (
          <div key={cycle.id} className="rounded-lg border px-4 py-3 text-sm">
            <strong>{cycle.name}</strong> · {cycle.startsOn} → {cycle.endsOn} · {cycle.reviewCount}{" "}
            reviews · {cycle.status}
          </div>
        ))}
      </section>
      {canReview && (
        <div className="grid gap-2 rounded-lg border p-4 sm:grid-cols-2">
          <Input
            placeholder="Cycle ID"
            value={cycleId}
            onChange={(e) => setCycleId(e.target.value)}
          />
          <Input
            placeholder="Employee ID"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          />
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
        {reviews.map((review) => (
          <div key={review.id} className="rounded-lg border px-4 py-3 text-sm">
            {review.employeeName} · {review.cycleName} · {review.rating ?? "—"}/5 · {review.status}
            {review.comments && (
              <p className="mt-1 text-muted-foreground">{review.comments}</p>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
