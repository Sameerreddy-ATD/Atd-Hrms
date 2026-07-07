import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { myLeaveBalance } from "@/mock/data";

export const Route = createFileRoute("/_app/leave/balance")({
  component: LeaveBalancePage,
});

function LeaveBalancePage() {
  return (
    <div>
      <PageHeader title="Leave Balance" description="Your current entitlement, usage and available balance." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {myLeaveBalance.map((l) => {
          const pct = Math.round((l.used / Math.max(l.entitled, 1)) * 100);
          return (
            <Card key={l.type}>
              <CardContent className="p-5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{l.type}</p>
                <p className="mt-2 text-2xl font-semibold">{l.balance}</p>
                <p className="text-xs text-muted-foreground">
                  {l.used} used of {l.entitled} entitled
                </p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}