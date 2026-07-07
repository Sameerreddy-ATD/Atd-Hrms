import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/common/PlaceholderPage";
export const Route = createFileRoute("/_app/leave/reports")({
  component: () => (
    <PlaceholderPage
      title="Leave Reports"
      description="Aggregated leave usage across the organization."
    />
  ),
});
