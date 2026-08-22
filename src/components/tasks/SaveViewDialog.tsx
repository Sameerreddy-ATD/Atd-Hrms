import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { savedViewsApi } from "@/services/api";
import type {
  TaskColumnConfig,
  TaskFilterConfig,
  TaskSavedViewScope,
  TaskSortConfig,
} from "@/types/domain";

type SaveViewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId?: string;
  canManageProjectViews?: boolean;
  filterConfig: TaskFilterConfig;
  sortConfig: TaskSortConfig;
  columnConfig: TaskColumnConfig;
  onSaved?: () => void;
};

export function SaveViewDialog({
  open,
  onOpenChange,
  boardId,
  canManageProjectViews,
  filterConfig,
  sortConfig,
  columnConfig,
  onSaved,
}: SaveViewDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<TaskSavedViewScope>("PERSONAL");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      await savedViewsApi.create({
        name: name.trim(),
        description: description.trim() || null,
        scope,
        boardId: boardId ?? null,
        filterConfig,
        sortConfig,
        columnConfig,
      });
      toast.success("Saved view created");
      setName("");
      setDescription("");
      setScope("PERSONAL");
      onOpenChange(false);
      onSaved?.();
    } catch (cause) {
      toast.error((cause as Error).message || "Could not save view");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="save-view-dialog">
        <DialogHeader>
          <DialogTitle>Save view</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="save-view-name">Name</Label>
            <Input
              id="save-view-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="High priority mobile bugs"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="save-view-description">Description (optional)</Label>
            <Textarea
              id="save-view-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>Scope</Label>
            <Select value={scope} onValueChange={(value) => setScope(value as TaskSavedViewScope)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PERSONAL">Personal</SelectItem>
                {canManageProjectViews && boardId ? (
                  <SelectItem value="PROJECT">Project (shared)</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            Save view
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SaveViewButton(props: Omit<SaveViewDialogProps, "open" | "onOpenChange">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-8"
        onClick={() => setOpen(true)}
        data-testid="save-view-button"
      >
        Save view
      </Button>
      <SaveViewDialog {...props} open={open} onOpenChange={setOpen} />
    </>
  );
}
