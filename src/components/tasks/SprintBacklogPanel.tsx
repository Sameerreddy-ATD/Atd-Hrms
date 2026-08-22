import { ChevronDown, ChevronRight, Flag, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { sprintsApi, tasksApi } from "@/services/api";
import type { BacklogPlanResponse, TaskBoard, TaskSprint, WorkTask } from "@/types/domain";
import { issueKey, ISSUE_TYPE_STYLES } from "./task-utils";

type SprintBacklogPanelProps = {
  board: TaskBoard;
  canManageSprint: boolean;
  onOpenTask: (task: WorkTask) => void;
  onPlanChanged: () => void;
};

function SprintSection({
  title,
  sprint,
  items,
  collapsed,
  onToggle,
  dropTargetSprintId,
  onDropTask,
  onOpenTask,
  board,
  actions,
}: {
  title: string;
  sprint?: TaskSprint;
  items: WorkTask[];
  collapsed: boolean;
  onToggle: () => void;
  dropTargetSprintId: string | null;
  onDropTask: (taskId: string, sprintId: string | null) => void;
  onOpenTask: (task: WorkTask) => void;
  board: TaskBoard;
  actions?: React.ReactNode;
}) {
  return (
    <section
      className="overflow-hidden rounded-md border bg-background"
      data-testid={sprint ? `sprint-section-${sprint.id}` : "sprint-section-backlog"}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();
        const taskId = event.dataTransfer.getData("text/task-id");
        if (taskId) onDropTask(taskId, dropTargetSprintId);
      }}
    >
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          {collapsed ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
          <Flag className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-xs font-semibold uppercase tracking-wide">{title}</span>
          {sprint && (
            <Badge variant="outline" className="rounded-md font-normal">
              {sprint.status}
            </Badge>
          )}
          <Badge variant="secondary" className="rounded-md font-normal tabular-nums">
            {items.length}
          </Badge>
        </button>
        {actions}
      </div>
      {!collapsed && (
        <ul className="divide-y">
          {items.length === 0 ? (
            <li className="px-3 py-4 text-sm text-muted-foreground">Drop work items here</li>
          ) : (
            items.map((task) => (
              <li
                key={task.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/task-id", task.id);
                  event.dataTransfer.effectAllowed = "move";
                }}
                className="flex cursor-grab items-center gap-2 px-3 py-2 hover:bg-muted/40 active:cursor-grabbing"
              >
                <button
                  type="button"
                  onClick={() => onOpenTask(task)}
                  className="min-w-0 flex-1 truncate text-left text-sm"
                >
                  <span className="font-mono text-xs text-primary">{issueKey(task, board)} </span>
                  {task.issueType && (
                    <span
                      className={cn(
                        "mr-1 rounded px-1 text-[10px] font-medium uppercase",
                        ISSUE_TYPE_STYLES[task.issueType],
                      )}
                    >
                      {task.issueType}
                    </span>
                  )}
                  {task.title}
                </button>
                {task.workflowStatus?.name && (
                  <span className="shrink-0 text-xs text-muted-foreground">{task.workflowStatus.name}</span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </section>
  );
}

export function SprintBacklogPanel({
  board,
  canManageSprint,
  onOpenTask,
  onPlanChanged,
}: SprintBacklogPanelProps) {
  const [plan, setPlan] = useState<BacklogPlanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [completeTargets, setCompleteTargets] = useState<Record<string, "backlog" | string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await sprintsApi.backlogPlan(board.id);
      setPlan(data);
    } catch (cause) {
      toast.error((cause as Error).message || "Failed to load backlog plan");
    } finally {
      setLoading(false);
    }
  }, [board.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createSprint() {
    try {
      await sprintsApi.create(board.id, {
        name,
        goal: goal || undefined,
        startDate: startDate || null,
        endDate: endDate || null,
      });
      setCreateOpen(false);
      setName("");
      setGoal("");
      setStartDate("");
      setEndDate("");
      await load();
      onPlanChanged();
      toast.success("Sprint created");
    } catch (cause) {
      toast.error((cause as Error).message || "Failed to create sprint");
    }
  }

  async function startActive(sprintId: string) {
    try {
      await sprintsApi.start(sprintId);
      await load();
      onPlanChanged();
      toast.success("Sprint started");
    } catch (cause) {
      toast.error((cause as Error).message || "Failed to start sprint");
    }
  }

  async function dropTask(taskId: string, sprintId: string | null) {
    if (!canManageSprint) {
      toast.error("You do not have permission to plan sprints");
      return;
    }
    try {
      await tasksApi.setSprintMembership(taskId, { sprintId });
      await load();
      onPlanChanged();
    } catch (cause) {
      toast.error((cause as Error).message || "Failed to move work item");
    }
  }

  async function confirmComplete() {
    const sprint = plan?.activeSprint?.sprint;
    if (!sprint) return;
    const incomplete =
      plan?.activeSprint?.items.filter((task) => {
        const cat = task.workflowStatus?.category ?? task.stage?.statusCategory;
        return cat !== "DONE";
      }) ?? [];
    const incompleteItems = incomplete.map((task) => {
      const target = completeTargets[task.id] ?? "backlog";
      return {
        taskId: task.id,
        target: target === "backlog" ? ("backlog" as const) : { sprintId: target },
      };
    });
    try {
      await sprintsApi.complete(sprint.id, { incompleteItems });
      setCompleteOpen(false);
      await load();
      onPlanChanged();
      toast.success("Sprint completed");
    } catch (cause) {
      toast.error((cause as Error).message || "Failed to complete sprint");
    }
  }

  if (loading && !plan) {
    return <p className="text-sm text-muted-foreground">Loading backlog plan…</p>;
  }

  const planned = plan?.plannedSprints ?? [];
  const active = plan?.activeSprint ?? null;
  const backlogItems = plan?.backlogItems ?? [];

  return (
    <div className="space-y-3" data-testid="sprint-backlog-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Backlog planning</h2>
          <p className="text-xs text-muted-foreground">
            Sprint membership is separate from workflow status.
          </p>
        </div>
        {canManageSprint && (
          <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="create-sprint-button">
            <Plus className="mr-1.5 h-4 w-4" />
            Create Sprint
          </Button>
        )}
      </div>

      {active && (
        <SprintSection
          title={`${active.sprint.name} (Active)`}
          sprint={active.sprint}
          items={active.items}
          collapsed={!!collapsed[active.sprint.id]}
          onToggle={() =>
            setCollapsed((c) => ({ ...c, [active.sprint.id]: !c[active.sprint.id] }))
          }
          dropTargetSprintId={active.sprint.id}
          onDropTask={dropTask}
          onOpenTask={onOpenTask}
          board={board}
          actions={
            canManageSprint ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                data-testid="complete-sprint-button"
                onClick={() => setCompleteOpen(true)}
              >
                Complete Sprint
              </Button>
            ) : null
          }
        />
      )}

      {planned.map(({ sprint, items }) => (
        <SprintSection
          key={sprint.id}
          title={sprint.name}
          sprint={sprint}
          items={items}
          collapsed={!!collapsed[sprint.id]}
          onToggle={() => setCollapsed((c) => ({ ...c, [sprint.id]: !c[sprint.id] }))}
          dropTargetSprintId={sprint.id}
          onDropTask={dropTask}
          onOpenTask={onOpenTask}
          board={board}
          actions={
            canManageSprint && sprint.status === "PLANNED" ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                data-testid={`start-sprint-${sprint.id}`}
                onClick={() => void startActive(sprint.id)}
              >
                Start Sprint
              </Button>
            ) : null
          }
        />
      ))}

      <SprintSection
        title="Backlog"
        items={backlogItems}
        collapsed={!!collapsed.backlog}
        onToggle={() => setCollapsed((c) => ({ ...c, backlog: !c.backlog }))}
        dropTargetSprintId={null}
        onDropTask={dropTask}
        onOpenTask={onOpenTask}
        board={board}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Sprint</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sprint-name">Name</Label>
              <Input id="sprint-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sprint-goal">Goal</Label>
              <Textarea id="sprint-goal" value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sprint-start">Start</Label>
                <Input
                  id="sprint-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sprint-end">End</Label>
                <Input
                  id="sprint-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void createSprint()} disabled={name.trim().length < 2}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Complete Sprint</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Choose where each incomplete item should go. Done items stay in sprint history.
          </p>
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {(active?.items ?? [])
              .filter((task) => (task.workflowStatus?.category ?? task.stage?.statusCategory) !== "DONE")
              .map((task) => (
                <li key={task.id} className="flex flex-col gap-1 rounded border p-2 text-sm sm:flex-row sm:items-center">
                  <span className="min-w-0 flex-1 truncate">{task.title}</span>
                  <select
                    className="rounded border bg-background px-2 py-1 text-xs"
                    value={completeTargets[task.id] ?? "backlog"}
                    onChange={(e) =>
                      setCompleteTargets((c) => ({ ...c, [task.id]: e.target.value }))
                    }
                  >
                    <option value="backlog">Backlog</option>
                    {planned.map(({ sprint }) => (
                      <option key={sprint.id} value={sprint.id}>
                        {sprint.name}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void confirmComplete()}>Complete Sprint</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
