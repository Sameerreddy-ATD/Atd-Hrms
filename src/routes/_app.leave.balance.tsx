import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/leave/balance")({
  component: () => <Navigate to="/leave/history" replace />,
});
