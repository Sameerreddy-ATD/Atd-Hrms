import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_LABELS, type Role } from "@/mock/types";
import { useAuth } from "@/lib/auth";
import { branches, departments } from "@/mock/data";
import { usersApi } from "@/services/api";

// Role creation matrix — mirrors the business rule.
const CAN_CREATE: Record<Role, Role[]> = {
  developer_admin: [
    "developer_admin",
    "main_admin",
    "ceo",
    "hr",
    "manager",
    "employee",
    "sales",
    "driver",
    "field_staff",
  ],
  main_admin: ["ceo", "hr", "manager", "employee"],
  hr: ["employee", "manager", "sales", "driver", "field_staff"],
  ceo: [],
  manager: [],
  employee: [],
  sales: [],
  driver: [],
  field_staff: [],
};

export const Route = createFileRoute("/_app/users/new")({
  component: CreateUserPage,
});

function CreateUserPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const allowed = user ? CAN_CREATE[user.role] : [];

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>(allowed[0] ?? "employee");
  const [branch, setBranch] = useState(branches[0].id);
  const [dept, setDept] = useState<string>(departments[0].name);
  const [loading, setLoading] = useState(false);

  if (!user || allowed.length === 0) {
    return (
      <div>
        <PageHeader title="Create Login" />
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          You don't have permission to create user logins.
        </div>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !email) {
      toast.error("Name and email are required");
      return;
    }
    setLoading(true);
    await usersApi.create({
      name,
      email,
      role,
      homeBranchId: branch,
      department: dept,
      active: true,
      mustChangePassword: true,
    });
    setLoading(false);
    toast.success("Login created. A temporary password has been generated.");
    navigate({ to: "/users" });
  }

  return (
    <div>
      <PageHeader
        title="Create Login"
        description="Provision a new user account. The user will be forced to reset their password on first login."
      />
      <Card className="max-w-2xl">
        <CardContent className="p-6">
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Full name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allowed.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Home Branch</Label>
              <Select value={branch} onValueChange={setBranch}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Department</Label>
              <Select value={dept} onValueChange={setDept}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.name}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => navigate({ to: "/users" })}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                Create login
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
