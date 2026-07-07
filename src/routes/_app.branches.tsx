import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { branches } from "@/mock/data";
import { Building2, MapPin } from "lucide-react";

export const Route = createFileRoute("/_app/branches")({
  component: BranchesPage,
});

function BranchesPage() {
  return (
    <div>
      <PageHeader title="Branches" description="Company branches configured in the HRMS." />
      <div className="grid gap-4 sm:grid-cols-2">
        {branches.map((b) => (
          <Card key={b.id}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{b.code}</p>
                  <p className="mt-1 truncate text-lg font-semibold">{b.name}</p>
                  <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" /> {b.address}
                  </p>
                </div>
                <div className="rounded-md bg-muted p-2 text-muted-foreground">
                  <Building2 className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
