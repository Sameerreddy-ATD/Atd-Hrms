import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/company-setup")({
  component: () => <Navigate to="/branches" replace />,
});
