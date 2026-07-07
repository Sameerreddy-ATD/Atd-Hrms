import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/common/PlaceholderPage";
export const Route = createFileRoute("/_app/company-setup")({
  component: () => <PlaceholderPage title="Company Setup" description="Configure company information, working hours, and defaults." />,
});