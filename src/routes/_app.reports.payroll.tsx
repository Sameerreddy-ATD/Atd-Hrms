import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/common/PlaceholderPage";
export const Route = createFileRoute("/_app/reports/payroll")({
  component: () => (
    <PlaceholderPage
      title="Payroll Attendance Export"
      description="Export monthly attendance data for payroll processing."
    />
  ),
});
