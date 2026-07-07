import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Logo } from "@/components/common/Logo";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS } from "@/mock/types";
import { branches } from "@/mock/data";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_app/id-card")({
  component: IdCardPage,
});

function IdCardPage() {
  const { user } = useAuth();
  if (!user) return null;
  const initials = user.name.split(" ").map((s) => s[0]).slice(0, 2).join("");
  const branch = branches.find((b) => b.id === user.homeBranchId)?.name ?? "—";
  return (
    <div>
      <PageHeader
        title="Employee ID Card"
        description="Digital ID card. Print or download for physical use."
        actions={
          <Button size="sm" variant="outline"><Download className="mr-2 h-4 w-4" /> Download PDF</Button>
        }
      />
      <div className="max-w-md">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-muted/50 px-5 py-3">
            <Logo className="h-7 w-auto" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Employee ID</span>
          </div>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="bg-primary text-primary-foreground text-lg">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{user.name}</p>
                <p className="text-sm text-muted-foreground">{user.designation ?? ROLE_LABELS[user.role]}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{user.employeeId ?? "—"}</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <Row label="Department" value={user.department ?? "—"} />
              <Row label="Branch" value={branch} />
              <Row label="Phone" value={user.phone ?? "—"} />
              <Row label="Email" value={user.email} />
            </div>
          </CardContent>
          <div className="border-t border-border bg-muted/40 px-5 py-2 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
            If found, please return to AnytimeDiesel HR
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate">{value}</p>
    </div>
  );
}