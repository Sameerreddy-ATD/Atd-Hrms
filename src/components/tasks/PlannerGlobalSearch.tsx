import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { plannerSearchApi } from "@/services/api";
import type { TaskSearchResult } from "@/types/domain";
import { ISSUE_TYPE_LABELS, ISSUE_TYPE_STYLES } from "./task-utils";
import { cn } from "@/lib/utils";

type PlannerGlobalSearchProps = {
  boardId?: string;
  onSelect: (taskId: string) => void;
};

const DEBOUNCE_MS = 250;

export function PlannerGlobalSearch({ boardId, onSelect }: PlannerGlobalSearchProps) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TaskSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(
    async (value: string) => {
      abortRef.current?.abort();
      const trimmed = value.trim();
      if (!trimmed) {
        setResults([]);
        setError("");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const payload = await plannerSearchApi.search(trimmed, {
          boardId,
          limit: 25,
          offset: 0,
        });
        setResults(payload.results);
      } catch (cause) {
        setResults([]);
        setError((cause as Error).message || "Search is temporarily unavailable");
      } finally {
        setLoading(false);
      }
    },
    [boardId],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(query);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "/" && !open) {
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function handleSelect(result: TaskSearchResult) {
    setOpen(false);
    setQuery("");
    setResults([]);
    onSelect(result.workItemId);
  }

  const resultList = (
    <>
      {loading && query.trim() ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">Searching…</p>
      ) : error ? (
        <p className="px-4 py-6 text-center text-sm text-destructive">{error}</p>
      ) : results.length === 0 && query.trim() ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">No work items found</p>
      ) : (
        results.map((result) => (
          <button
            key={result.workItemId}
            type="button"
            className="flex w-full flex-col gap-1 border-b px-4 py-3 text-left hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
            onClick={() => handleSelect(result)}
            data-testid="planner-search-result"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-primary">{result.issueKey ?? "—"}</span>
              <Badge variant="outline" className={cn("text-[10px]", ISSUE_TYPE_STYLES[result.workType])}>
                {ISSUE_TYPE_LABELS[result.workType]}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                {result.status}
              </Badge>
              {result.project ? (
                <span className="text-xs text-muted-foreground">{result.project.name}</span>
              ) : null}
            </div>
            <span className="truncate text-sm font-medium">{result.title}</span>
          </button>
        ))
      )}
    </>
  );

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-2 text-muted-foreground"
        onClick={() => setOpen(true)}
        data-testid="planner-global-search-trigger"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Search work items</span>
        <span className="hidden rounded border px-1.5 py-0.5 text-[10px] md:inline">⌘K</span>
      </Button>

      {isMobile ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="h-[85vh] p-0">
            <SheetHeader className="border-b px-4 py-3">
              <SheetTitle>Search work items</SheetTitle>
            </SheetHeader>
            <div className="border-b px-3 py-2">
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Issue key, title, label…"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none"
                data-testid="planner-search-input"
              />
            </div>
            <div className="overflow-y-auto">{resultList}</div>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="overflow-hidden p-0">
            <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
              <CommandInput
                placeholder="Search by issue key, title, assignee…"
                value={query}
                onValueChange={setQuery}
                data-testid="planner-search-input"
              />
              <CommandList>
                {!loading && !error && !query.trim() ? (
                  <CommandEmpty>Type to search permitted work items</CommandEmpty>
                ) : null}
                {!loading && !error && query.trim() && results.length === 0 ? (
                  <CommandEmpty>No work items found</CommandEmpty>
                ) : null}
                {error ? <CommandEmpty>{error}</CommandEmpty> : null}
                {loading && query.trim() ? (
                  <CommandEmpty>Searching…</CommandEmpty>
                ) : null}
                <CommandGroup heading="Results">
                  {results.map((result) => (
                    <CommandItem
                      key={result.workItemId}
                      value={result.workItemId}
                      onSelect={() => handleSelect(result)}
                      data-testid="planner-search-result"
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-primary">{result.issueKey ?? "—"}</span>
                          <Badge variant="outline" className={cn("text-[10px]", ISSUE_TYPE_STYLES[result.workType])}>
                            {ISSUE_TYPE_LABELS[result.workType]}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{result.status}</span>
                          {result.project ? (
                            <span className="text-xs text-muted-foreground">{result.project.name}</span>
                          ) : null}
                        </div>
                        <span className="truncate text-sm">{result.title}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
