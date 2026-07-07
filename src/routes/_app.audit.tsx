import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/PageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { auditLogs } from "@/mock/data";
import { ROLE_LABELS } from "@/mock/types";

export const Route = createFileRoute("/_app/audit")({
  component: AuditPage,
});

function AuditPage() {
  return (
    <div>
      <PageHeader title="Audit Logs" description="Sensitive actions performed in the system." />
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditLogs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap">{l.timestamp}</TableCell>
                  <TableCell className="font-medium">{l.actor}</TableCell>
                  <TableCell>{ROLE_LABELS[l.role]}</TableCell>
                  <TableCell>{l.action}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.target}</TableCell>
                  <TableCell className="font-mono text-xs">{l.ipAddress ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
