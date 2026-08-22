import { CalendarRange, Map } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { roadmapApi, tasksApi } from "@/services/api";
import type { RoadmapEpic, RoadmapResponse, TaskBoard, WorkTask } from "@/types/domain";
import { issueKey } from "./task-utils";

type RoadmapPanelProps = {
  board: TaskBoard;
  canEditEpicDates: boolean;
  onOpenTask: (task: WorkTask) => void;
};

function epicBarStyle(epic: RoadmapEpic, rangeStart: number, rangeEnd: number) {
  const start = epic.startDate ? new Date(epic.startDate).getTime() : rangeStart;
  const end = epic.targetDate ? new Date(epic.targetDate).getTime() : start + 7 * 86400000;
  const span = Math.max(rangeEnd - rangeStart, 1);
  const left = ((Math.max(start, rangeStart) - rangeStart) / span) * 100;
  const width = ((Math.min(end, rangeEnd) - Math.max(start, rangeStart)) / span) * 100;
  return { left: `${Math.max(0, left)}%`, width: `${Math.max(4, width)}%` };
}

export function RoadmapPanel({ board, canEditEpicDates, onOpenTask }: RoadmapPanelProps) {
  const [roadmap, setRoadmap] = useState<RoadmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingEpicId, setEditingEpicId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editTarget, setEditTarget] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await roadmapApi.get(board.id);
      setRoadmap(data);
    } finally {
      setLoading(false);
    }
  }, [board.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const { rangeStart, rangeEnd } = useMemo(() => {
    const scheduled = roadmap?.scheduled ?? [];
    const dates = scheduled.flatMap((epic) => [
      epic.startDate ? new Date(epic.startDate).getTime() : null,
      epic.targetDate ? new Date(epic.targetDate).getTime() : null,
    ]).filter((v): v is number => v != null);
    if (dates.length === 0) {
      const now = Date.now();
      return { rangeStart: now, rangeEnd: now + 90 * 86400000 };
    }
    const min = Math.min(...dates);
    const max = Math.max(...dates);
    const pad = 7 * 86400000;
    return { rangeStart: min - pad, rangeEnd: max + pad };
  }, [roadmap]);

  async function openEpic(epic: RoadmapEpic) {
    const task = await tasksApi.get(epic.id);
    onOpenTask(task);
  }

  async function saveEpicDates(epic: RoadmapEpic) {
    setSaving(true);
    try {
      const task = await tasksApi.get(epic.id);
      await tasksApi.update(epic.id, {
        version: task.version,
        startDate: editStart || null,
        dueDate: editTarget || null,
      });
      setEditingEpicId(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-md border bg-background p-6 text-sm text-muted-foreground">
        Loading roadmap…
      </div>
    );
  }

  const scheduled = roadmap?.scheduled ?? [];
  const unscheduled = roadmap?.unscheduled ?? [];

  return (
    <div className="space-y-4" data-testid="roadmap-panel">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Map className="size-4" />
        <span>Epic roadmap for {board.name}</span>
      </div>

      <div className="space-y-3 rounded-md border bg-background p-3 sm:p-4">
        <h3 className="text-sm font-medium">Scheduled epics</h3>
        {scheduled.length === 0 ? (
          <p className="text-sm text-muted-foreground">No epics with dates yet.</p>
        ) : (
          <div className="space-y-3">
            <div className="relative hidden min-h-[8rem] rounded-md border bg-muted/20 p-2 sm:block">
              {scheduled.map((epic) => (
                <button
                  key={epic.id}
                  type="button"
                  data-testid={`roadmap-bar-${epic.issueKey ?? epic.id}`}
                  className="absolute top-2 h-10 rounded-md border bg-primary/15 px-2 text-left text-xs hover:bg-primary/25"
                  style={epicBarStyle(epic, rangeStart, rangeEnd)}
                  onClick={() => void openEpic(epic)}
                >
                  <span className="font-mono text-[10px] text-primary">{epic.issueKey}</span>
                  <span className="block truncate font-medium">{epic.title}</span>
                </button>
              ))}
            </div>
            <div className="space-y-2 sm:hidden">
              {scheduled.map((epic) => (
                <EpicCard
                  key={epic.id}
                  epic={epic}
                  canEdit={canEditEpicDates}
                  editing={editingEpicId === epic.id}
                  editStart={editStart}
                  editTarget={editTarget}
                  saving={saving}
                  onOpen={() => void openEpic(epic)}
                  onEdit={() => {
                    setEditingEpicId(epic.id);
                    setEditStart(epic.startDate ?? "");
                    setEditTarget(epic.targetDate ?? "");
                  }}
                  onCancelEdit={() => setEditingEpicId(null)}
                  onSave={() => void saveEpicDates(epic)}
                  onEditStart={setEditStart}
                  onEditTarget={setEditTarget}
                />
              ))}
            </div>
            <div className="hidden space-y-2 sm:block">
              {scheduled.map((epic) => (
                <EpicRow
                  key={epic.id}
                  epic={epic}
                  canEdit={canEditEpicDates}
                  editing={editingEpicId === epic.id}
                  editStart={editStart}
                  editTarget={editTarget}
                  saving={saving}
                  onOpen={() => void openEpic(epic)}
                  onEdit={() => {
                    setEditingEpicId(epic.id);
                    setEditStart(epic.startDate ?? "");
                    setEditTarget(epic.targetDate ?? "");
                  }}
                  onCancelEdit={() => setEditingEpicId(null)}
                  onSave={() => void saveEpicDates(epic)}
                  onEditStart={setEditStart}
                  onEditTarget={setEditTarget}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div
        className="space-y-3 rounded-md border bg-background p-3 sm:p-4"
        data-testid="roadmap-unscheduled"
      >
        <h3 className="text-sm font-medium">Unscheduled epics</h3>
        {unscheduled.length === 0 ? (
          <p className="text-sm text-muted-foreground">All active epics have dates.</p>
        ) : (
          <div className="space-y-2">
            {unscheduled.map((epic) => (
              <EpicCard
                key={epic.id}
                epic={epic}
                canEdit={canEditEpicDates}
                editing={editingEpicId === epic.id}
                editStart={editStart}
                editTarget={editTarget}
                saving={saving}
                onOpen={() => void openEpic(epic)}
                onEdit={() => {
                  setEditingEpicId(epic.id);
                  setEditStart("");
                  setEditTarget("");
                }}
                onCancelEdit={() => setEditingEpicId(null)}
                onSave={() => void saveEpicDates(epic)}
                onEditStart={setEditStart}
                onEditTarget={setEditTarget}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type EpicUiProps = {
  epic: RoadmapEpic;
  canEdit: boolean;
  editing: boolean;
  editStart: string;
  editTarget: string;
  saving: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onEditStart: (v: string) => void;
  onEditTarget: (v: string) => void;
};

function EpicProgressBlock({ epic }: { epic: RoadmapEpic }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span data-testid={`roadmap-progress-${epic.issueKey ?? epic.id}`}>
          {epic.progress.progressPercent}%
        </span>
        <span>
          {epic.progress.doneCount} of {epic.progress.totalCount} completed
        </span>
      </div>
      <Progress value={epic.progress.progressPercent} className="h-1.5" />
    </div>
  );
}

function EpicCard({
  epic,
  canEdit,
  editing,
  editStart,
  editTarget,
  saving,
  onOpen,
  onEdit,
  onCancelEdit,
  onSave,
  onEditStart,
  onEditTarget,
}: EpicUiProps) {
  return (
    <div className="rounded-md border p-3" data-testid={`roadmap-epic-${epic.issueKey ?? epic.id}`}>
      <button type="button" className="w-full text-left" onClick={onOpen}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-primary">{epic.issueKey ?? issueKey(epic as unknown as WorkTask)}</span>
          <Badge variant="outline" className="text-[10px]">
            {epic.workflowStatus?.name ?? "Epic"}
          </Badge>
        </div>
        <p className="mt-1 font-medium">{epic.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {epic.startDate || epic.targetDate
            ? `${epic.startDate ?? "—"} → ${epic.targetDate ?? "—"}`
            : "No dates"}
        </p>
      </button>
      <div className="mt-2">
        <EpicProgressBlock epic={epic} />
      </div>
      {editing ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Start date</Label>
            <DateField value={editStart} onChange={onEditStart} />
          </div>
          <div>
            <Label className="text-xs">Target date</Label>
            <DateField value={editTarget} onChange={onEditTarget} />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button size="sm" disabled={saving} onClick={onSave}>
              Save dates
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancelEdit}>
              Cancel
            </Button>
          </div>
        </div>
      ) : canEdit ? (
        <Button size="sm" variant="outline" className="mt-2" onClick={onEdit}>
          <CalendarRange className="mr-1 size-3.5" />
          Edit dates
        </Button>
      ) : null}
    </div>
  );
}

function EpicRow(props: EpicUiProps) {
  const { epic, onOpen } = props;
  return (
    <div
      className={cn(
        "grid gap-2 rounded-md border p-3",
        "grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_auto]",
      )}
      data-testid={`roadmap-epic-row-${epic.issueKey ?? epic.id}`}
    >
      <button type="button" className="text-left" onClick={onOpen}>
        <span className="font-mono text-xs text-primary">{epic.issueKey}</span>
        <p className="font-medium">{epic.title}</p>
      </button>
      <p className="text-xs text-muted-foreground self-center">
        {epic.startDate ?? "—"} → {epic.targetDate ?? "—"}
      </p>
      <EpicProgressBlock epic={epic} />
      {props.canEdit && !props.editing ? (
        <Button size="sm" variant="outline" onClick={props.onEdit}>
          Edit dates
        </Button>
      ) : null}
    </div>
  );
}
