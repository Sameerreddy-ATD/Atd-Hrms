import { createFileRoute, Navigate } from "@tanstack/react-router";

/** Retired sidebar page: branch punches are covered by Day Logs. */
export const Route = createFileRoute("/_app/attendance/branch")({
  component: () => <Navigate to="/attendance/locations" replace />,
});
