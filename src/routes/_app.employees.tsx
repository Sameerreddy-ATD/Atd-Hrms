import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { TableToolbar } from "@/components/common/TableToolbar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { branches, departments, users } from "@/mock/data";
import { Search, Download, Plus } from "lucide-react";
import { ROLE_LABELS } from "@/mock/types";

export const Route = createFileRoute("/_app/employees")({
  component: EmployeesPage,
});

function EmployeesPage() {
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState("all");
  const [dept, setDept] = useState("all");

  const rows = useMemo(
    () =>
      users
        .filter((u) => u.employeeId)
        .filter((u) => {
          if (q && !`${u.name} ${u.email} ${u.employeeId}`.toLowerCase().includes(q.toLowerCase()))
            return false;
          if (branch !== "all" && u.homeBranchId !== branch) return false;
          if (dept !== "all" && u.department !== dept) return false;
          return true;
        }),
    [q, branch, dept],
  );

  return (
    <div>
      <PageHeader
        title="Employees"
        description="Directory of all employees across branches and departments."
        actions={
          <>
            <Button variant="outline" size="sm"><Download className="mr-2 h-4 w-4" /> Export</Button>
            <Button size="sm"><Plus className="mr-2 h-4 w-4" /> Add employee</Button>
          </>
        }
      />
      <TableToolbar>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, ID" className="pl-8" />
        </div>
        <Select value={branch} onValueChange={setBranch}>
          <SelectTrigger className="sm:w-44"><SelectValue placeholder="Branch" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All branches</SelectItem>
            {branches.map((b) => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={dept} onValueChange={setDept}>
          <SelectTrigger className="sm:w-44"><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departments.map((d) => (<SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>))}
          </SelectContent>
        </Select>
      </TableToolbar>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Employee ID</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Home Branch</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{u.employeeId}</TableCell>
                  <TableCell>{ROLE_LABELS[u.role]}</TableCell>
                  <TableCell>{u.department ?? "—"}</TableCell>
                  <TableCell>{branches.find((b) => b.id === u.homeBranchId)?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm">{u.phone ?? "—"}</TableCell>
                  <TableCell>
                    {u.active ? (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-600">Inactive</Badge>
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