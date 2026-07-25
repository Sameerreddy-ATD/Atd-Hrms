import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/common/StatCard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ResponsiveListShell,
  MobileList,
  MobileListItem,
  MobileListHeader,
  MobileListFields,
  MobileListField,
  DesktopTable,
} from "@/components/common/ResponsiveList";
import { ROLE_LABELS, type AuditLog } from "@/types/domain";
import { auditApi } from "@/services/api";
import { Database, Search } from "lucide-react";

export const Route = createFileRoute("/_app/audit")({
  component: AuditPage,
});

function AuditPage() {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [summary, setSummary] = useState<{
    count: number;
    oldest?: string;
    latest?: string;
  } | null>(null);

  useEffect(() => {
    Promise.all([auditApi.list(), auditApi.summary()])
      .then(([logs, storage]) => {
        setAuditLogs(logs);
        setSummary(storage);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return auditLogs;
    return auditLogs.filter((log) =>
      `${log.actor} ${log.role} ${log.action} ${log.target}`.toLowerCase().includes(needle),
    );
  }, [auditLogs, query]);

  const formatDate = (value?: string) =>
    value ? new Date(value).toLocaleString() : "No records yet";

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        description="A protected history of saved system activity and changes."
      />
      {loading && <LoadingState label="Loading audit logs" />}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!loading && summary && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <StatCard label="Saved audit records" value={summary.count} icon={Database} />
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">Oldest saved</p>
              <p className="mt-1 text-sm font-medium">{formatDate(summary.oldest)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">Latest saved</p>
              <p className="mt-1 text-sm font-medium">{formatDate(summary.latest)}</p>
            </CardContent>
          </Card>
        </div>
      )}
      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search actor, action, role or target"
          className="pl-9"
        />
      </div>
      <ResponsiveListShell>
        <MobileList>
          {rows.map((l) => (
            <MobileListItem key={l.id} intrinsicSize="180px">
              <MobileListHeader
                title={l.actor}
                meta={l.timestamp}
                trailing={
                  <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium">
                    {ROLE_LABELS[l.role] ?? l.role}
                  </span>
                }
              />
              <MobileListFields>
                <MobileListField label="Action" value={l.action} />
                <MobileListField label="Target" value={l.target} />
                <MobileListField
                  className="col-span-2"
                  label="Saved change"
                  value={
                    l.oldValue || l.newValue ? (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-primary">View saved details</summary>
                        {l.oldValue && (
                          <pre className="mt-2 max-w-full overflow-auto rounded bg-muted p-2 text-[11px]">
                            Before: {JSON.stringify(l.oldValue, null, 2)}
                          </pre>
                        )}
                        {l.newValue && (
                          <pre className="mt-2 max-w-full overflow-auto rounded bg-muted p-2 text-[11px]">
                            After: {JSON.stringify(l.newValue, null, 2)}
                          </pre>
                        )}
                      </details>
                    ) : (
                      "Activity recorded"
                    )
                  }
                />
                <MobileListField label="IP" value={l.ipAddress ?? "-"} mono />
              </MobileListFields>
            </MobileListItem>
          ))}
        </MobileList>
        <DesktopTable>
          <Table className="min-w-[920px]">
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Saved change</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap">{l.timestamp}</TableCell>
                  <TableCell className="font-medium">{l.actor}</TableCell>
                  <TableCell>{ROLE_LABELS[l.role] ?? l.role}</TableCell>
                  <TableCell>{l.action}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.target}</TableCell>
                  <TableCell className="min-w-56">
                    {l.oldValue || l.newValue ? (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-primary">
                          View saved details
                        </summary>
                        {l.oldValue && (
                          <pre className="mt-2 max-w-80 overflow-auto rounded bg-muted p-2 text-[11px]">
                            Before: {JSON.stringify(l.oldValue, null, 2)}
                          </pre>
                        )}
                        {l.newValue && (
                          <pre className="mt-2 max-w-80 overflow-auto rounded bg-muted p-2 text-[11px]">
                            After: {JSON.stringify(l.newValue, null, 2)}
                          </pre>
                        )}
                      </details>
                    ) : (
                      <span className="text-xs text-muted-foreground">Activity recorded</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{l.ipAddress ?? "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DesktopTable>
        {!loading && rows.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">No audit logs found.</div>
        )}
      </ResponsiveListShell>
    </div>
  );
}
