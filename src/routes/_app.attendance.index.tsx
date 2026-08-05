import { createFileRoute, Navigate } from "@tanstack/react-router";

/** Retired: employee-wise directory is covered by Day Logs. */
export const Route = createFileRoute("/_app/attendance/")({
  component: () => <Navigate to="/attendance/locations" replace />,
});
