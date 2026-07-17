import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { LeaveTypeOption } from "@/mock/types";
import { leaveApi } from "@/services/api";
import { CalendarCheck, Pencil } from "lucide-react";

export const Route = createFileRoute("/_app/leave/policy")({ component: PolicyPage });

type BalanceRow = Awaited<ReturnType<typeof leaveApi.listAllBalances>>[number];

function PolicyPage() {
  const [types, setTypes] = useState<LeaveTypeOption[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<BalanceRow | null>(null);
  const [adjustment, setAdjustment] = useState("0");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([leaveApi.types(), leaveApi.listAllBalances()])
      .then(([policyRows, balanceRows]) => {
        setTypes(policyRows);
        setBalances(balanceRows);
      })
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function saveAdjustment() {
    if (!editing || reason.trim().length < 3) return toast.error("Enter an adjustment reason");
    setSaving(true);
    try {
      await leaveApi.adjustBalance(
        editing.employeeId,
        editing.leaveTypeId,
        Number(adjustment),
        reason.trim(),
      );
      toast.success("Leave balance adjustment saved and audited");
      setEditing(null);
      setReason("");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const filtered = balances.filter((row) =>
    `${row.employeeName} ${row.employeeCode} ${row.leaveType} ${row.department}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  return (
    <div>
      <PageHeader
        title="Leave Policies & Credits"
        description="Company leave rules are protected. HR can make audited employee credit adjustments below."
      />
      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Company leave policies"
      >
        {types.map((type) => (
          <Card key={type.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{type.name}</p>
                  <p className="text-xs font-medium text-primary">
                    {type.paid ? "Paid credit" : "Salary review by HR"}
                  </p>
                </div>
                <CalendarCheck className="h-5 w-5 text-primary" />
              </div>
              <p className="mt-3 text-sm leading-5 text-muted-foreground">{type.description}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="mt-5">
        <CardContent className="p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">Employee leave credits</h2>
              <p className="text-sm text-muted-foreground">
                Adjustments change credits, not payroll. Every change is written to Audit Logs.
              </p>
            </div>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search employee or leave type"
              className="sm:max-w-xs"
            />
          </div>
          {loading ? (
            <LoadingState label="Calculating leave credits" />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((row) => (
                <div key={row.id} className="rounded-md border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{row.employeeName}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.employeeCode} · {row.department}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="outline"
                      title="Adjust leave credit"
                      onClick={() => {
                        setEditing(row);
                        setAdjustment(String(row.manualAdjustment));
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="mt-3 text-sm font-medium">{row.leaveType}</p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Credited</p>
                      <p className="font-semibold">{row.entitled}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Used</p>
                      <p className="font-semibold">{row.used}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Available</p>
                      <p className="font-semibold">{row.balance}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust employee leave credit</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {editing.employeeName} · {editing.leaveType}
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="manual-adjustment">Manual adjustment</Label>
                <Input
                  id="manual-adjustment"
                  type="number"
                  step="0.5"
                  value={adjustment}
                  onChange={(event) => setAdjustment(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Use a positive number to add credit or a negative number to reduce it.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adjustment-reason">Reason</Label>
                <Textarea
                  id="adjustment-reason"
                  rows={3}
                  maxLength={500}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={saveAdjustment} disabled={saving}>
              {saving ? "Saving..." : "Save adjustment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
