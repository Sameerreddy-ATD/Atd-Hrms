import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/reports")({
  component: () => <Navigate to="/dashboard" replace />,
});
