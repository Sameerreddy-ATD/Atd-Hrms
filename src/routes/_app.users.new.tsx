import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/users/new")({
  component: () => <Navigate to="/users" search={{ create: true }} replace />,
});
