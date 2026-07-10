import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ROLE_LABELS, type AuditLog } from "@/mock/types";
import { auditApi } from "@/services/api";

export const Route = createFileRoute("/_app/audit")({
  component: AuditPage,
});

function AuditPage() {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    auditApi
      .list()
      .then(setAuditLogs)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title="Audit Logs" description="Sensitive actions performed in the system." />
      {loading && <p className="text-sm text-muted-foreground">Loading audit logs...</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
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
                  <TableCell>{ROLE_LABELS[l.role] ?? l.role}</TableCell>
                  <TableCell>{l.action}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.target}</TableCell>
                  <TableCell className="font-mono text-xs">{l.ipAddress ?? "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!loading && auditLogs.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">No audit logs found.</div>
        )}
      </div>
    </div>
  );
}
