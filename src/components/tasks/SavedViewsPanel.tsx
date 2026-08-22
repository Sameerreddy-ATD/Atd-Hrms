import { Bookmark, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
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
import { savedViewsApi } from "@/services/api";
import type { TaskBoard, TaskSavedView } from "@/types/domain";
import { formatDisplayDate } from "@/lib/india-date";

type SavedViewsPanelProps = {
  boards: TaskBoard[];
  onBack: () => void;
  onOpenView: (view: TaskSavedView) => void;
};

export function SavedViewsPanel({ boards, onBack, onOpenView }: SavedViewsPanelProps) {
  const [views, setViews] = useState<TaskSavedView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<TaskSavedView | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await savedViewsApi.list();
      setViews(payload.views);
    } catch (cause) {
      setError((cause as Error).message || "Could not load saved views");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const personal = useMemo(
    () => views.filter((view) => view.scope === "PERSONAL"),
    [views],
  );
  const project = useMemo(
    () => views.filter((view) => view.scope === "PROJECT"),
    [views],
  );

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await savedViewsApi.delete(pendingDelete.id);
      toast.success("Saved view deleted");
      setPendingDelete(null);
      await load();
    } catch (cause) {
      toast.error((cause as Error).message || "Could not delete saved view");
    }
  }

  function boardLabel(view: TaskSavedView) {
    if (view.boardName) return view.boardName;
    if (view.boardId) {
      return boards.find((board) => board.id === view.boardId)?.name ?? view.boardId;
    }
    return "All projects";
  }

  function renderSection(title: string, rows: TaskSavedView[]) {
    if (!rows.length) {
      return (
        <p className="text-sm text-muted-foreground">No {title.toLowerCase()} yet.</p>
      );
    }
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((view) => (
          <Card key={view.id} className="shadow-none" data-testid="saved-view-card">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-semibold">{view.name}</h3>
                    {view.isDefault ? (
                      <Badge variant="secondary" className="text-[10px]">
                        Default
                      </Badge>
                    ) : null}
                  </div>
                  {view.description ? (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {view.description}
                    </p>
                  ) : null}
                </div>
                <Bookmark className="h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{view.scope === "PERSONAL" ? "Personal" : "Project"}</Badge>
                <span>{boardLabel(view)}</span>
                <span>Updated {formatDisplayDate(view.updatedAt.slice(0, 10))}</span>
              </div>
              {view.scope === "PROJECT" && view.ownerName ? (
                <p className="text-xs text-muted-foreground">Owner: {view.ownerName}</p>
              ) : null}
              <div className="flex gap-2">
                <Button size="sm" className="flex-1" onClick={() => onOpenView(view)}>
                  Open
                </Button>
                {view.scope === "PERSONAL" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Delete ${view.name}`}
                    onClick={() => setPendingDelete(view)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-8 px-4 pb-20 sm:px-6">
      <PageHeader
        title="Saved Views"
        description="Reusable filter, sort, and column layouts for Work Planner."
        actions={
          <Button variant="outline" onClick={onBack}>
            Back to planner
          </Button>
        }
      />

      {loading ? <LoadingState label="Loading saved views…" /> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!loading && !error ? (
        <div className="space-y-8">
          <section className="space-y-3" data-testid="saved-views-personal">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Personal
            </h2>
            {renderSection("personal views", personal)}
          </section>
          <section className="space-y-3" data-testid="saved-views-project">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Project views
            </h2>
            {renderSection("project views", project)}
          </section>
        </div>
      ) : null}

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete saved view?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the saved configuration only. Work items are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
