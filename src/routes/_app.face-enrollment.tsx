import { createFileRoute, Link } from "@tanstack/react-router";
import { FaceEnrollmentGate } from "@/components/face/FaceEnrollmentGate";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/face-enrollment")({
  component: FaceEnrollmentPage,
});

function FaceEnrollmentPage() {
  const { user } = useAuth();
  const needsEnrollment =
    !user?.faceEnrollmentStatus ||
    user.faceEnrollmentStatus === "NOT_REGISTERED" ||
    user.faceEnrollmentStatus === "REJECTED" ||
    user.faceEnrollmentStatus === "PENDING" ||
    user.faceEnrollmentStatus === "DISABLED";

  if (needsEnrollment) {
    return <FaceEnrollmentGate />;
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-16 text-center sm:px-6">
      <PageHeader
        title="Face verification"
        description="Your face enrollment is already approved. Attendance check-in will ask for a live match."
      />
      <Button asChild>
        <Link to="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
