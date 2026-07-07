import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Bell } from "lucide-react";
export const Route = createFileRoute("/_app/notifications")({
  component: NotificationsPage,
});
const items = [
  {
    title: "Leave request approved",
    desc: "Your sick leave for Jul 6 was approved.",
    time: "2 hours ago",
  },
  { title: "Missed checkout", desc: "You forgot to check out yesterday.", time: "Yesterday" },
  {
    title: "Holiday added",
    desc: "Founders' Day (Sep 12) added to your calendar.",
    time: "3 days ago",
  },
];
function NotificationsPage() {
  return (
    <div>
      <PageHeader title="Notifications" description="Recent system alerts and messages." />
      <div className="space-y-3">
        {items.map((n) => (
          <Card key={n.title}>
            <CardContent className="flex items-start gap-3 p-4">
              <div className="rounded-md bg-muted p-2 text-muted-foreground">
                <Bell className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-sm text-muted-foreground">{n.desc}</p>
                <p className="mt-1 text-xs text-muted-foreground">{n.time}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
