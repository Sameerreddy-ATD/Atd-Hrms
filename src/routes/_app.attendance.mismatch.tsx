import { createFileRoute, Navigate } from "@tanstack/react-router";

/** Branch mismatch review is retired — punches may check out at the same branch used for login. */
export const Route = createFileRoute("/_app/attendance/mismatch")({
  component: () => <Navigate to="/attendance/locations" replace />,
});
