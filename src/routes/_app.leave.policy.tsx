import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LeaveTypeOption } from "@/mock/types";
import { leaveApi } from "@/services/api";
import { Pencil, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_app/leave/policy")({
  component: PolicyPage,
});

function PolicyPage() {
  const [types, setTypes] = useState<LeaveTypeOption[]>([]);
  const [editing, setEditing] = useState<LeaveTypeOption | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTypes();
  }, []);

  function loadTypes() {
    setLoading(true);
    leaveApi
      .types()
      .then(setTypes)
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setLoading(false));
  }

  function resetForm() {
    setEditing(null);
    setName("");
  }

  async function saveType(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Leave type name is required");
      return;
    }
    setSaving(true);
    try {
      const saved = editing
        ? await leaveApi.updateType(editing.id, { name: name.trim(), paid: editing.paid })
        : await leaveApi.createType({ name: name.trim(), paid: true });
      setTypes((current) =>
        (editing
          ? current.map((row) => (row.id === saved.id ? saved : row))
          : [...current, saved]
        ).sort((a, b) => a.name.localeCompare(b.name)),
      );
      toast.success(editing ? "Leave type updated" : "Leave type added");
      resetForm();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteType(type: LeaveTypeOption) {
    if (!window.confirm(`Delete ${type.name}?`)) return;
    try {
      await leaveApi.deleteType(type.id);
      setTypes((current) => current.filter((row) => row.id !== type.id));
      toast.success("Leave type deleted");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Leave Policy"
        description="HR, Developer Admin, and Main Admin can manage leave types used in applications."
      />

      <Card className="mb-4 max-w-2xl">
        <CardContent className="p-4">
          <form onSubmit={saveType} className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1.5">
              <Label>Leave type name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex items-end gap-2">
              {editing && (
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              )}
              <Button type="submit" disabled={saving}>
                <Plus className="mr-2 h-4 w-4" />
                {editing ? "Save" : "Add"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {loading && <p className="text-sm text-muted-foreground">Loading leave policy...</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {types.map((type) => (
          <Card key={type.id}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{type.name}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => {
                      setEditing(type);
                      setName(type.name);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="outline" onClick={() => deleteType(type)}>
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {!loading && types.length === 0 && (
        <p className="text-sm text-muted-foreground">No leave types found.</p>
      )}
    </div>
  );
}
