import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { attendanceRecords } from "@/mock/data";
import { MapPin } from "lucide-react";
export const Route = createFileRoute("/_app/attendance/locations")({
  component: LocationsPage,
});
function LocationsPage() {
  const rows = attendanceRecords.filter((a) => a.source === "Mobile GPS");
  return (
    <div>
      <PageHeader
        title="Field Staff Location"
        description="Latest GPS check-in from each field team member."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <Card key={r.id}>
            <CardContent className="p-5">
              <p className="font-medium">{r.employeeName}</p>
              <p className="text-xs text-muted-foreground">
                {r.date} · {r.punchIn}
              </p>
              <p className="mt-3 flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />{" "}
                {r.address ?? `${r.latitude?.toFixed(4)}, ${r.longitude?.toFixed(4)}`}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
