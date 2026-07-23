import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/roles")({
  component: () => <Navigate to="/dashboard" replace />,
});
