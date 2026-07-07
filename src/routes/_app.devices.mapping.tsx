import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/common/PlaceholderPage";
export const Route = createFileRoute("/_app/devices/mapping")({
  component: () => (
    <PlaceholderPage
      title="Biometric Mapping"
      description="Map employee thumb IDs to their user accounts."
    />
  ),
});
