import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/attendance/mismatch")({
  component: () => <Navigate to="/attendance/branch" replace />,
});
