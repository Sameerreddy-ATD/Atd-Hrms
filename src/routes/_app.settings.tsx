import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/common/PlaceholderPage";
export const Route = createFileRoute("/_app/settings")({
  component: () => <PlaceholderPage title="System Settings" description="Global HRMS configuration." />,
});