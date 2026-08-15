import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { formatDisplayDateTime } from "@/lib/india-date";
import { cn } from "@/lib/utils";
import {
  Clock3,
  Database,
  LoaderCircle,
  RefreshCw,
  ScrollText,
  Search,
  Trash2,
} from "lucide-react";

export const Route = createFileRoute("/_app/audit")({
  component: AuditPage,
});

type AuditCategory = "all" | "auth" | "people" | "leave" | "attendance" | "security" | "system";

const CATEGORY_FILTERS: { id: AuditCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "auth", label: "Sign-in" },
  { id: "people", label: "People" },
  { id: "leave", label: "Leave" },
  { id: "attendance", label: "Attendance" },
  { id: "security", label: "Security" },
  { id: "system", label: "System" },
];

function humanizeAction(action: string) {
  const trimmed = action.trim();
  if (!trimmed) return "Unknown action";
  if (trimmed.includes(" ")) {
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  }
  return trimmed
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function categorizeAction(action: string): Exclude<AuditCategory, "all"> {
  const a = action.toLowerCase();
  if (/login|password|session|auth|sign.?in/.test(a)) return "auth";
  if (/face|biometric|enrollment|mfa|2fa/.test(a)) return "security";
  if (/leave|comp.?off|weekly.?off|holiday/.test(a)) return "leave";
  if (/attendance|punch|checkout|check.?in|field attendance|missed/.test(a)) return "attendance";
  if (
    /user|employee|hire|offboard|lifecycle|department|branch|role|module|profile|candidate|offer/.test(
      a,
    )
  ) {
    return "people";
  }
  return "system";
}

function actionBadgeClass(action: string) {
  const a = action.toLowerCase();
  if (/fail|reject|suspend|offboard|delete|clear|reset/.test(a)) {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400";
  }
  if (/approv|succeed|hire|create|apply|enroll/.test(a)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400";
  }
  if (/pending|request|submit/.test(a)) {
    return "border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-900/50 dark:bg-yellow-950/40 dark:text-yellow-400";
  }
  if (/login|password|auth/.test(a)) {
    return "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-400";
  }
  return "border-border bg-muted text-muted-foreground";
}

function summarizeValue(value?: Record<string, unknown> | null) {
  if (!value) return [] as { key: string; value: string }[];
  return Object.entries(value)
    .slice(0, 8)
    .map(([key, nested]) => ({
      key,
      value:
        nested === null || nested === undefined
          ? "—"
          : typeof nested === "object"
            ? JSON.stringify(nested)
            : String(nested),
    }));
}

function ChangeDetails({
  oldValue,
  newValue,
}: {
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
}) {
  const before = summarizeValue(oldValue);
  const after = summarizeValue(newValue);
  if (before.length === 0 && after.length === 0) {
    return <span className="text-xs text-muted-foreground">Activity recorded</span>;
  }

  return (
    <details className="group text-xs">
      <summary className="cursor-pointer list-none text-primary outline-none transition-colors hover:text-primary/80 [&::-webkit-details-marker]:hidden">
        <span className="underline-offset-2 group-open:underline">View change details</span>
      </summary>
      <div className="mt-2 space-y-2">
        {before.length > 0 && (
          <div className="rounded-md border border-border/70 bg-muted/40 p-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Before
            </p>
            <dl className="space-y-1">
              {before.map((row) => (
                <div key={`before-${row.key}`} className="grid grid-cols-[7rem_1fr] gap-2">
                  <dt className="truncate text-muted-foreground">{row.key}</dt>
                  <dd className="break-all font-medium text-foreground">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        {after.length > 0 && (
          <div className="rounded-md border border-border/70 bg-muted/40 p-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              After
            </p>
            <dl className="space-y-1">
              {after.map((row) => (
                <div key={`after-${row.key}`} className="grid grid-cols-[7rem_1fr] gap-2">
                  <dt className="truncate text-muted-foreground">{row.key}</dt>
                  <dd className="break-all font-medium text-foreground">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </details>
  );
}

function AuditPage() {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<AuditCategory>("all");
  const [clearOpen, setClearOpen] = useState(false);
  const [clearConfirmation, setClearConfirmation] = useState("");
  const [clearing, setClearing] = useState(false);
  const [summary, setSummary] = useState<{
    count: number;
    oldest?: string;
    latest?: string;
  } | null>(null);

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    if (opts?.soft) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [logs, storage] = await Promise.all([auditApi.list(), auditApi.summary()]);
      setAuditLogs(logs);
      setSummary(storage);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return auditLogs.filter((log) => {
      if (category !== "all" && categorizeAction(log.action) !== category) return false;
      if (!needle) return true;
      const haystack =
        `${log.actor} ${log.role} ${log.action} ${humanizeAction(log.action)} ${log.target} ${log.ipAddress ?? ""}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [auditLogs, category, query]);

  const formatDate = (value?: string) => (value ? formatDisplayDateTime(value) : "No records yet");

  async function clearAuditLogs() {
    if (clearConfirmation !== "CLEAR") return;
    setClearing(true);
    try {
      const result = await auditApi.clear("CLEAR");
      toast.success(
        result.deleted === 0
          ? "Audit logs were already empty"
          : `Cleared ${result.deleted} audit log${result.deleted === 1 ? "" : "s"}`,
      );
      setClearOpen(false);
      setClearConfirmation("");
      await load({ soft: true });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setClearing(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        description="Protected history of sign-ins, people changes, and admin actions across Anytime Workforce."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={loading || refreshing}
              onClick={() => void load({ soft: true })}
            >
              {refreshing ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={loading || (summary?.count ?? 0) === 0}
              onClick={() => {
                setClearConfirmation("");
                setClearOpen(true);
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Clear audit logs
            </Button>
          </>
        }
      />

      {loading && <LoadingState label="Loading audit logs" />}
      {error && !loading && (
        <p className="mb-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {!loading && summary && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <StatCard label="Saved records" value={summary.count} icon={Database} />
          <Card>
            <CardContent className="flex items-start gap-3 p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                <Clock3 className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Oldest saved
                </p>
                <p className="mt-1 text-sm font-medium leading-snug">
                  {formatDate(summary.oldest)}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-start gap-3 p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                <ScrollText className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Latest saved
                </p>
                <p className="mt-1 text-sm font-medium leading-snug">
                  {formatDate(summary.latest)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {!loading && (
        <div className="mb-4 flex flex-col gap-3">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search actor, action, role, target, or IP"
              className="pl-9"
              aria-label="Search audit logs"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_FILTERS.map((item) => (
              <Button
                key={item.id}
                type="button"
                size="sm"
                variant={category === item.id ? "default" : "outline"}
                className={cn("h-8 rounded-md px-3 text-xs", category === item.id && "shadow-sm")}
                onClick={() => setCategory(item.id)}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Showing {rows.length} of {auditLogs.length} loaded
            {auditLogs.length >= 250 ? " (latest 250)" : ""}
          </p>
        </div>
      )}

      {!loading && rows.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={auditLogs.length === 0 ? "No audit logs yet" : "No matching audit logs"}
          description={
            auditLogs.length === 0
              ? "Activity such as sign-ins, people changes, and admin updates will appear here."
              : "Try another search or category filter."
          }
        />
      ) : (
        !loading && (
          <ResponsiveListShell>
            <MobileList>
              {rows.map((l) => (
                <MobileListItem key={l.id} intrinsicSize="200px">
                  <MobileListHeader
                    title={humanizeAction(l.action)}
                    meta={formatDisplayDateTime(l.timestamp)}
                    trailing={
                      <Badge variant="outline" className="shrink-0 text-[11px] font-medium">
                        {ROLE_LABELS[l.role] ?? l.role}
                      </Badge>
                    }
                  />
                  <MobileListFields>
                    <MobileListField label="Actor" value={l.actor} />
                    <MobileListField label="Target" value={l.target || "—"} />
                    <MobileListField
                      className="col-span-2"
                      label="Change"
                      value={<ChangeDetails oldValue={l.oldValue} newValue={l.newValue} />}
                    />
                    <MobileListField label="IP" value={l.ipAddress ?? "—"} mono />
                  </MobileListFields>
                </MobileListItem>
              ))}
            </MobileList>
            <DesktopTable>
              <Table className="min-w-[980px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Change</TableHead>
                    <TableHead>IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDisplayDateTime(l.timestamp)}
                      </TableCell>
                      <TableCell className="max-w-56">
                        <Badge
                          variant="outline"
                          className={cn(
                            "max-w-full whitespace-normal text-left text-[11px] font-semibold leading-snug",
                            actionBadgeClass(l.action),
                          )}
                        >
                          {humanizeAction(l.action)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{l.actor}</TableCell>
                      <TableCell className="text-sm">{ROLE_LABELS[l.role] ?? l.role}</TableCell>
                      <TableCell className="max-w-40 text-sm text-muted-foreground">
                        {l.target || "—"}
                      </TableCell>
                      <TableCell className="min-w-56">
                        <ChangeDetails oldValue={l.oldValue} newValue={l.newValue} />
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {l.ipAddress ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DesktopTable>
          </ResponsiveListShell>
        )
      )}

      <AlertDialog
        open={clearOpen}
        onOpenChange={(open) => {
          if (!open && !clearing) {
            setClearOpen(false);
            setClearConfirmation("");
          }
        }}
      >
        <AlertDialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all audit logs?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes all {summary?.count ?? 0} saved audit records. A single
              &quot;Audit logs cleared&quot; entry will be written afterward. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="audit-clear-confirmation">
              Type <span className="font-mono font-semibold">CLEAR</span> to confirm
            </Label>
            <Input
              id="audit-clear-confirmation"
              autoComplete="off"
              value={clearConfirmation}
              onChange={(event) => setClearConfirmation(event.target.value)}
              placeholder="CLEAR"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={clearConfirmation !== "CLEAR" || clearing}
              onClick={(event) => {
                event.preventDefault();
                void clearAuditLogs();
              }}
            >
              {clearing && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
              Clear audit logs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
