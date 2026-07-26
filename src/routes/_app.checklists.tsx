import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { checklistsApi } from "@/services/api";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/checklists")({ component: ChecklistsPage });

function ChecklistsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof checklistsApi.list>>>([]);
  const [employeeId, setEmployeeId] = useState("");
  const canManage = ["developer_admin", "main_admin", "hr"].includes(user?.role ?? "");

  async function reload() {
    setLoading(true);
    try {
      setRows(await checklistsApi.list());
    } catch (error) {
      toast.error((error as Error).message || "Unable to load checklists");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  if (loading) return <LoadingState label="Loading checklists" />;

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 pb-16 sm:px-6">
      <PageHeader
        title="Onboarding & offboarding"
        description="Track setup and exit checklist progress for each employee."
      />
      {canManage && (
        <div className="flex flex-wrap gap-2 rounded-lg border p-3">
          <Input
            placeholder="Employee ID"
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            className="max-w-xs"
          />
          <Button
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
