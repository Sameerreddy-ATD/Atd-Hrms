import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS } from "@/mock/types";
import { branches } from "@/mock/data";

export const Route = createFileRoute("/_app/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useAuth();
  if (!user) return null;
  const branchName = branches.find((b) => b.id === user.homeBranchId)?.name ?? "—";
  const initials = user.name.split(" ").map((s) => s[0]).slice(0, 2).join("");

  return (
    <div>
      <PageHeader
        title="My Profile"
        description="Your account and employment information. Submit an edit request to HR to update locked fields."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <Avatar className="h-20 w-20">
              <AvatarFallback className="bg-primary text-primary-foreground text-lg">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-lg font-semibold">{user.name}</p>
              <p className="text-sm text-muted-foreground">{ROLE_LABELS[user.role]}</p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{user.employeeId ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                toast.success("Profile edit request submitted to HR");
              }}
              className="grid gap-4 sm:grid-cols-2"
            >
              <Field label="Full name" value={user.name} />
              <Field label="Email" value={user.email} />
              <Field label="Phone" value={user.phone ?? ""} editable />
              <Field label="Department" value={user.department ?? "—"} />
              <Field label="Designation" value={user.designation ?? "—"} />
              <Field label="Home Branch" value={branchName} />
              <div className="sm:col-span-2 flex justify-end gap-2 border-t border-border pt-4">
                <Button type="button" variant="outline">Reset</Button>
                <Button type="submit">Submit edit request</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value, editable = false }: { label: string; value: string; editable?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input defaultValue={value} readOnly={!editable} className={editable ? "" : "bg-muted/50"} />
    </div>
  );
}