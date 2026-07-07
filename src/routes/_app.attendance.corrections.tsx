import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/common/PlaceholderPage";
export const Route = createFileRoute("/_app/attendance/corrections")({
  component: () => <PlaceholderPage title="Attendance Corrections" description="Review and approve manual attendance corrections requested by employees." />,
});