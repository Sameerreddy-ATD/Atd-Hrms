import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { users } from "@/mock/data";
import { ROLE_LABELS } from "@/mock/types";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_app/users")({
  component: UsersPage,
});

function UsersPage() {
  return (
    <div>
      <PageHeader
        title="User Logins"
        description="Login accounts across all roles. Public sign-up is disabled — logins are created by Developer Admin, Main Admin or HR."
        actions={
          <Button asChild size="sm">
            <Link to="/users/new">
              <Plus className="mr-2 h-4 w-4" /> Create login
            </Link>
          </Button>
        }
      />
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Employee ID</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{ROLE_LABELS[u.role]}</TableCell>
                  <TableCell className="font-mono text-xs">{u.employeeId ?? "—"}</TableCell>
                  <TableCell>
                    {u.active ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-200 bg-emerald-50 text-emerald-700"
                      >
                        Active
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-slate-200 bg-slate-100 text-slate-600"
                      >
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
