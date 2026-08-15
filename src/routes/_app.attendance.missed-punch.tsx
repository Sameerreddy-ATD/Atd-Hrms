import { createFileRoute, redirect } from "@tanstack/react-router";

/** Deep links keep working; the form lives under My Attendance → Missed punch. */
export const Route = createFileRoute("/_app/attendance/missed-punch")({
  beforeLoad: () => {
    throw redirect({
      to: "/attendance/mine",
      search: { tab: "requests" },
      replace: true,
    });
  },
  component: () => null,
});
