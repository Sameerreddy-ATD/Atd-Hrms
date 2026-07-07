import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { departments } from "@/mock/data";
export const Route = createFileRoute("/_app/departments")({
  component: DeptPage,
});
function DeptPage() {
  return (
    <div>
      <PageHeader title="Departments" description="Departments configured in the organization." />
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Head</TableHead></TableRow></TableHeader>
          <TableBody>{departments.map((d) => (
            <TableRow key={d.id}><TableCell className="font-medium">{d.name}</TableCell><TableCell>{d.head ?? "—"}</TableCell></TableRow>
          ))}</TableBody>
        </Table>
      </div>
    </div>
  );
}