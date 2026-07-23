import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/emergency-contact")({
  component: () => <Navigate to="/profile" replace />,
});
