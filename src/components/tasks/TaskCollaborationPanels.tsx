import { Eye, EyeOff, Link2, Loader2, Plus, Tag, Timer, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { formatDisplayDateTime } from "@/lib/india-date";
import { cn } from "@/lib/utils";
import { collaborationApi } from "@/services/api";
import type {
  TaskActivityEntry,
  TaskLabel,
  TaskRelationItem,
  TaskRelationType,
  TaskRelationsView,
  WorkLogEntry,
  WorkLogTotals,
  WorkTask,
} from "@/types/domain";

const ACTIVITY_LABELS: Record<string, string> = {
  CREATED: "Created",
  COMMENT: "Comment",
  STATUS_CHANGED: "Status changed",
  PROGRESS_UPDATED: "Progress updated",
  ASSIGNEES_CHANGED: "Assignees updated",
  DETAILS_UPDATED: "Details updated",
  SPRINT_MEMBERSHIP_CHANGED: "Sprint updated",
  RELATION_ADDED: "Relation added",
  RELATION_REMOVED: "Relation removed",
  LABEL_ADDED: "Label added",
  LABEL_REMOVED: "Label removed",
  WORK_LOG_ADDED: "Time logged",
  WORK_LOG_UPDATED: "Time log updated",
  WORK_LOG_DELETED: "Time log removed",
  PRIORITY_CHANGED: "Priority changed",
  REPORTER_CHANGED: "Reporter changed",
  TITLE_CHANGED: "Title changed",
  DATES_CHANGED: "Dates changed",
};

type Props = {
  task: WorkTask;
  boardId: string;
  canEdit: boolean;
  onOpenTask?: (taskId: string) => void;
};

function RelationList({
  title,
  items,
  onOpen,
}: {
  title: string;
  items: TaskRelationItem[];
  onOpen?: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="text-sm text-primary hover:underline"
              onClick={() => onOpen?.(item.id)}
            >
              {item.issueKey ? `${item.issueKey} ` : ""}
              {item.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TaskCollaborationPanels({ task, boardId, canEdit, onOpenTask }: Props) {
  const [relations, setRelations] = useState<TaskRelationsView | null>(null);
  const [labels, setLabels] = useState<TaskLabel[]>(task.labels ?? []);
  const [projectLabels, setProjectLabels] = useState<TaskLabel[]>([]);
  const [watching, setWatching] = useState(false);
  const [watcherCount, setWatcherCount] = useState(0);
  const [logs, setLogs] = useState<WorkLogEntry[]>([]);
  const [totals, setTotals] = useState<WorkLogTotals | null>(null);
  const [activity, setActivity] = useState<TaskActivityEntry[]>([]);
  const [activityFilter, setActivityFilter] = useState<"all" | "comments" | "history">("all");
  const [activityCursor, setActivityCursor] = useState<string | undefined>();
  const [activityHasMore, setActivityHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [relationType, setRelationType] = useState<TaskRelationType>("BLOCKS");
  const [relationQuery, setRelationQuery] = useState("");
  const [relationHits, setRelationHits] = useState<TaskRelationItem[]>([]);
  const [logDuration, setLogDuration] = useState("");
  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10));
  const [logDescription, setLogDescription] = useState("");
  const [newLabelName, setNewLabelName] = useState("");

  const reloadRelations = useCallback(async () => {
    setRelations(await collaborationApi.relations.get(task.id));
  }, [task.id]);

  const reloadWatchers = useCallback(async () => {
    const data = await collaborationApi.watchers.state(task.id);
    setWatching(data.watching);
    setWatcherCount(data.watcherCount);
  }, [task.id]);

  const reloadWorkLogs = useCallback(async () => {
    const data = await collaborationApi.workLogs.list(task.id);
    setLogs(data.logs);
    setTotals(data.totals);
  }, [task.id]);

  const reloadActivity = useCallback(
    async (append = false, cursor?: string) => {
      const data = await collaborationApi.activity.list(task.id, {
        filter: activityFilter,
        cursor: append ? cursor : undefined,
        limit: 25,
      });
      setActivity((prev) => (append ? [...prev, ...data.items] : data.items));
      setActivityCursor(data.nextCursor);
      setActivityHasMore(data.hasMore);
    },
    [task.id, activityFilter],
  );

  useEffect(() => {
    void reloadRelations();
    void reloadWatchers();
    void reloadWorkLogs();
    void reloadActivity(false);
    void collaborationApi.labels.list(boardId).then(({ labels: rows }) => setProjectLabels(rows));
    setLabels(task.labels ?? []);
  }, [task.id, task.labels, boardId, reloadRelations, reloadWatchers, reloadWorkLogs, reloadActivity]);

  useEffect(() => {
    void reloadActivity(false);
  }, [activityFilter, reloadActivity]);

  useEffect(() => {
    if (relationQuery.trim().length < 1) {
      setRelationHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void collaborationApi.relations
        .search(boardId, relationQuery.trim(), task.id)
        .then(({ items }) => setRelationHits(items));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [relationQuery, boardId, task.id]);

  const applyLabels = async (nextIds: string[]) => {
    setBusy(true);
    try {
      const { labels: next } = await collaborationApi.labels.setTaskLabels(task.id, {
        version: task.version,
        labelIds: nextIds,
      });
      setLabels(next);
    } finally {
      setBusy(false);
    }
  };

  const toggleLabel = (labelId: string) => {
    const has = labels.some((l) => l.id === labelId);
    const next = has
      ? labels.filter((l) => l.id !== labelId).map((l) => l.id)
      : [...labels.map((l) => l.id), labelId];
    void applyLabels(next);
  };

  const createInlineLabel = async () => {
    const name = newLabelName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const created = await collaborationApi.labels.create(boardId, { name });
      setProjectLabels((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      await applyLabels([...labels.map((l) => l.id), created.id]);
      setNewLabelName("");
    } finally {
      setBusy(false);
    }
  };

  const addRelation = async (targetTaskId: string) => {
    setBusy(true);
    try {
      await collaborationApi.relations.create(task.id, { targetTaskId, relationType });
      setRelationQuery("");
      setRelationHits([]);
      await reloadRelations();
      await reloadActivity(false);
    } finally {
      setBusy(false);
    }
  };

  const removeRelation = async (relationId: string) => {
    setBusy(true);
    try {
      await collaborationApi.relations.remove(relationId);
      await reloadRelations();
      await reloadActivity(false);
    } finally {
      setBusy(false);
    }
  };

  const submitWorkLog = async () => {
    setBusy(true);
    try {
      await collaborationApi.workLogs.create(task.id, {
        duration: logDuration,
        workDate: logDate,
        description: logDescription || null,
      });
      setLogDuration("");
      setLogDescription("");
      await reloadWorkLogs();
      await reloadActivity(false);
    } finally {
      setBusy(false);
    }
  };

  const activeProjectLabels = projectLabels.filter((l) => l.active);

  return (
    <div className="space-y-6" data-testid="task-collaboration-panels">
      <div className="flex flex-wrap items-center gap-2">
        {relations?.isBlocked ? (
          <Badge variant="destructive" data-testid="blocked-indicator">
            Blocked
          </Badge>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant={watching ? "secondary" : "outline"}
          data-testid="watch-toggle"
          onClick={() =>
            void (watching
              ? collaborationApi.watchers.unwatch(task.id).then(reloadWatchers)
              : collaborationApi.watchers.watch(task.id).then(reloadWatchers))
          }
        >
          {watching ? <EyeOff className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
          {watching ? "Watching" : "Watch"}
          {watcherCount > 0 ? ` (${watcherCount})` : ""}
        </Button>
      </div>

      <section className="space-y-3" data-testid="relations-panel">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Link2 className="h-4 w-4" />
          Relations
        </div>
        {relations ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <RelationList title="Blocks" items={relations.blocks} onOpen={onOpenTask} />
            <RelationList title="Blocked by" items={relations.blockedBy} onOpen={onOpenTask} />
            <RelationList title="Related to" items={relations.relatedTo} onOpen={onOpenTask} />
            <RelationList title="Duplicates" items={relations.duplicates} onOpen={onOpenTask} />
            <RelationList title="Duplicate of" items={relations.duplicateOf} onOpen={onOpenTask} />
          </div>
        ) : null}
        {canEdit ? (
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={relationType} onValueChange={(v) => setRelationType(v as TaskRelationType)}>
                <SelectTrigger className="sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BLOCKS">Blocks</SelectItem>
                  <SelectItem value="RELATES_TO">Relates to</SelectItem>
                  <SelectItem value="DUPLICATES">Duplicates</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Search by key or title…"
                value={relationQuery}
                onChange={(e) => setRelationQuery(e.target.value)}
                data-testid="relation-search"
              />
            </div>
            {relationHits.length > 0 ? (
              <ul className="max-h-40 overflow-y-auto rounded border">
                {relationHits.map((hit) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      className="flex w-full px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => void addRelation(hit.id)}
                    >
                      {hit.issueKey ? `${hit.issueKey} — ` : ""}
                      {hit.title}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="space-y-3" data-testid="labels-panel">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Tag className="h-4 w-4" />
          Labels
        </div>
        <div className="flex flex-wrap gap-2">
          {labels.map((label) => (
            <Badge key={label.id} variant={label.active ? "secondary" : "outline"} className="gap-1">
              {label.name}
              {canEdit ? (
                <button type="button" className="ml-1" onClick={() => toggleLabel(label.id)}>
                  ×
                </button>
              ) : null}
            </Badge>
          ))}
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            {activeProjectLabels
              .filter((l) => !labels.some((assigned) => assigned.id === l.id))
              .map((label) => (
                <Button key={label.id} type="button" size="sm" variant="outline" onClick={() => toggleLabel(label.id)}>
                  + {label.name}
                </Button>
              ))}
            <div className="flex w-full flex-col gap-2 sm:flex-row">
              <Input
                placeholder="New label"
                value={newLabelName}
                onChange={(e) => setNewLabelName(e.target.value)}
                data-testid="inline-label-input"
              />
              <Button type="button" size="sm" disabled={!newLabelName.trim() || busy} onClick={() => void createInlineLabel()}>
                Add label
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-3" data-testid="work-logs-panel">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Timer className="h-4 w-4" />
            Time logged
          </div>
          {totals ? (
            <p className="text-sm text-muted-foreground">
              Your time: {totals.yourLabel} · Total: {totals.totalLabel}
            </p>
          ) : null}
        </div>
        <ul className="space-y-2">
          {logs.map((log) => (
            <li key={log.id} className="rounded-lg border px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{log.durationLabel}</span>
                <span className="text-muted-foreground">{log.workDate}</span>
              </div>
              <p className="text-muted-foreground">{log.userName}</p>
              {log.description ? <p>{log.description}</p> : null}
            </li>
          ))}
        </ul>
        {canEdit ? (
          <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
            <div>
              <Label>Duration</Label>
              <Input
                placeholder="1h 30m"
                value={logDuration}
                onChange={(e) => setLogDuration(e.target.value)}
                data-testid="work-log-duration"
              />
            </div>
            <div>
              <Label>Work date</Label>
              <Input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>Description (optional)</Label>
              <Textarea value={logDescription} onChange={(e) => setLogDescription(e.target.value)} rows={2} />
            </div>
            <Button type="button" disabled={busy || !logDuration.trim()} onClick={() => void submitWorkLog()} data-testid="work-log-submit">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Log time
            </Button>
          </div>
        ) : null}
      </section>

      <section className="space-y-3" data-testid="activity-panel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">Activity</p>
          <Select value={activityFilter} onValueChange={(v) => setActivityFilter(v as typeof activityFilter)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="comments">Comments</SelectItem>
              <SelectItem value="history">History</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <ul className="space-y-3">
          {activity.map((entry) => (
            <li key={entry.id} className={cn("rounded-lg border px-3 py-2", entry.activityType === "COMMENT" && "bg-muted/30")}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {entry.authorName} · {ACTIVITY_LABELS[entry.activityType] ?? entry.activityType}
                </span>
                <span>{formatDisplayDateTime(entry.createdAt)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{entry.message}</p>
            </li>
          ))}
        </ul>
        {activityHasMore ? (
          <Button type="button" variant="outline" size="sm" onClick={() => void reloadActivity(true, activityCursor)}>
            Load more
          </Button>
        ) : null}
      </section>
    </div>
  );
}
