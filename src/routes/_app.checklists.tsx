import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { EmployeePicker } from "@/components/common/EmployeePicker";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import {
  DesktopTable,
  MobileList,
  MobileListHeader,
  MobileListItem,
  ResponsiveListShell,
} from "@/components/common/ResponsiveList";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { checklistsApi, employeesApi } from "@/services/api";
import { useAuth } from "@/lib/auth";
import type { User } from "@/types/domain";

export const Route = createFileRoute("/_app/checklists")({ component: ChecklistsPage });

function ChecklistsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof checklistsApi.list>>>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const canManage = ["developer_admin", "main_admin", "hr"].includes(user?.role ?? "");

  async function reload() {
    setLoading(true);
    try {
      const [checklistRows, people] = await Promise.all([
        checklistsApi.list(),
        canManage ? employeesApi.list().catch(() => []) : Promise.resolve([]),
      ]);
      setRows(checklistRows);
      setEmployees((people as User[]).filter((person) => person.active && person.employeeId));
    } catch (error) {
      toast.error((error as Error).message || "Unable to load checklists");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [canManage]);

  const openItems = useMemo(
    () =>
      rows.flatMap((row) =>
        row.items
          .filter((item) => !item.completed)
          .map((item) => ({
            ...item,
            employeeName: row.employeeName,
            kind: row.kind,
            instanceId: row.id,
          })),
      ),
    [rows],
  );

  if (loading) return <LoadingState label="Loading checklists" />;

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 pb-16 sm:px-6">
      <PageHeader
        title="Onboarding & offboarding"
        description="Start from an employee, track open items, and jump to the linked screens."
      />
      {canManage && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
          <EmployeePicker
            className="min-w-[220px] space-y-1.5"
            employees={employees}
            value={employeeId}
            onChange={setEmployeeId}
          />
          <Button
            disabled={!employeeId}
            onClick={() =>
              void checklistsApi
                .start(employeeId, "ONBOARDING")
                .then(() => {
                  toast.success("Onboarding started");
                  return reload();
                })
                .catch((error) => toast.error((error as Error).message))
            }
          >
            Start onboarding
          </Button>
          <Button
            variant="outline"
            disabled={!employeeId}
            onClick={() =>
              void checklistsApi
                .start(employeeId, "OFFBOARDING")
                .then(() => {
                  toast.success("Offboarding started");
                  return reload();
                })
                .catch((error) => toast.error((error as Error).message))
            }
          >
            Start offboarding
          </Button>
        </div>
      )}

      {openItems.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Open items
          </h2>
          <ResponsiveListShell>
            <MobileList>
              {openItems.map((item) => (
                <MobileListItem key={item.id}>
                  <MobileListHeader
                    title={item.title}
                    meta={`${item.employeeName} · ${item.kind}`}
                    trailing={
                      item.linkPath ? (
                        <a href={item.linkPath} className="text-xs text-primary underline">
                          Open
                        </a>
                      ) : undefined
                    }
                  />
                </MobileListItem>
              ))}
            </MobileList>
            <DesktopTable>
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">Employee</th>
                    <th className="px-3 py-2">Kind</th>
                    <th className="px-3 py-2">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {openItems.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="px-3 py-2">{item.title}</td>
                      <td className="px-3 py-2">{item.employeeName}</td>
                      <td className="px-3 py-2">{item.kind}</td>
                      <td className="px-3 py-2">
                        {item.linkPath ? (
                          <a href={item.linkPath} className="text-primary underline">
                            Open
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DesktopTable>
          </ResponsiveListShell>
        </section>
      )}

      <div className="space-y-4">
        {rows.map((row) => (
          <section key={row.id} className="rounded-xl border p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">
                  {row.employeeName} · {row.kind}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {row.templateName} · {row.status}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {row.items.map((item) => (
                <label key={item.id} className="flex items-center gap-3 text-sm">
                  <Checkbox
                    checked={item.completed}
                    onCheckedChange={(checked) =>
                      void checklistsApi
                        .toggleItem(item.id, checked === true)
                        .then(() => reload())
                        .catch((error) => toast.error((error as Error).message))
                    }
                  />
                  <span className={item.completed ? "text-muted-foreground line-through" : ""}>
                    {item.title}
                  </span>
                  {item.linkPath && (
                    <a href={item.linkPath} className="text-xs text-primary underline">
                      Open
                    </a>
                  )}
                </label>
              ))}
            </div>
          </section>
        ))}
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">No checklist instances yet.</p>
        )}
      </div>
    </div>
  );
}
