import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/common/PlaceholderPage";
export const Route = createFileRoute("/_app/roles")({
  component: () => (
    <PlaceholderPage
      title="Roles & Permissions"
      description="Configure role-based permissions across modules."
    />
  ),
});
