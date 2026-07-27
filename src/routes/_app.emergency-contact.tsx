import { createFileRoute, Navigate } from "@tanstack/react-router";

/** Legacy bookmark: emergency contact lives on Profile. */
export const Route = createFileRoute("/_app/emergency-contact")({
  component: () => <Navigate to="/profile" hash="emergency-contact" replace />,
});
