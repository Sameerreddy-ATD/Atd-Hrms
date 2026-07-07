import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/common/PlaceholderPage";
export const Route = createFileRoute("/_app/settings/devices")({
  component: () => <PlaceholderPage title="Device Settings" description="Manage biometric device connectivity and sync intervals." />,
});