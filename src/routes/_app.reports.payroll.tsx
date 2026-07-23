import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/reports/payroll")({
  component: () => <Navigate to="/attendance" replace />,
});
