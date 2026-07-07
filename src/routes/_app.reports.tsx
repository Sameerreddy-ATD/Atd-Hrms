import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText, Users, CalendarCheck } from "lucide-react";
export const Route = createFileRoute("/_app/reports")({
  component: ReportsPage,
});
function ReportsPage() {
  const items = [
    { name: "Daily Attendance Summary", desc: "All employees, today", icon: CalendarCheck },
    { name: "Monthly Attendance", desc: "Per employee, current month", icon: FileText },
    { name: "Leave Utilization", desc: "By department and branch", icon: FileText },
    { name: "Employee Headcount", desc: "Active employees per branch", icon: Users },
    { name: "Field Attendance", desc: "GPS check-ins summary", icon: FileText },
    { name: "Branch Mismatch", desc: "Cross-branch attendance anomalies", icon: FileText },
  ];
  return (
    <div>
      <PageHeader title="Reports" description="Download reports as CSV or PDF." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <Card key={it.name}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{it.name}</p>
                  <p className="text-xs text-muted-foreground">{it.desc}</p>
                </div>
                <div className="rounded-md bg-muted p-2 text-muted-foreground">
                  <it.icon className="h-4 w-4" />
                </div>
              </div>
              <Button className="mt-4 w-full" variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" /> Download
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
