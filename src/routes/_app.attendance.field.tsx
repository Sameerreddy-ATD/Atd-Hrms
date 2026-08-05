import { createFileRoute, Navigate } from "@tanstack/react-router";

/** Retired sidebar page: field punches are covered by Day Logs. */
export const Route = createFileRoute("/_app/attendance/field")({
  component: () => <Navigate to="/attendance/locations" replace />,
});
