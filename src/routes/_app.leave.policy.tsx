import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { myLeaveBalance } from "@/mock/data";
export const Route = createFileRoute("/_app/leave/policy")({
  component: PolicyPage,
});
function PolicyPage() {
  return (
    <div>
      <PageHeader title="Leave Policy" description="Annual entitlements per leave type." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {myLeaveBalance.map((l) => (
          <Card key={l.type}>
            <CardContent className="p-5">
              <p className="text-sm font-medium">{l.type}</p>
              <p className="mt-2 text-xs text-muted-foreground">Entitled per year</p>
              <p className="text-2xl font-semibold">{l.entitled} days</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}