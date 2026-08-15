import { Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { initials } from "./task-utils";

export type PeopleMultiSelectPerson = {
  id: string;
  name: string;
  employeeCode?: string | null;
  designation?: string | null;
  department?: string | null;
};

type PeopleMultiSelectProps = {
  people: PeopleMultiSelectPerson[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  query?: string;
  onQueryChange?: (query: string) => void;
  className?: string;
  listClassName?: string;
  showCount?: boolean;
};

export function PeopleMultiSelect({
  people,
  selectedIds,
  onChange,
  label,
  searchPlaceholder = "Search people",
  emptyLabel = "No people found.",
  query,
  onQueryChange,
  className,
  listClassName,
  showCount = true,
}: PeopleMultiSelectProps) {
  const selected = new Set(selectedIds);
  const searchable = typeof onQueryChange === "function";

  function toggle(id: string, nextChecked: boolean) {
    if (nextChecked) {
      if (selected.has(id)) return;
      onChange([...selectedIds, id]);
      return;
    }
    onChange(selectedIds.filter((entry) => entry !== id));
  }

  return (
    <div className={cn("space-y-3", className)}>
      {(label || showCount) && (
        <div className="flex items-center justify-between gap-3">
          {label ? <Label>{label}</Label> : <span />}
          {showCount && (
            <span className="text-xs text-muted-foreground">{selectedIds.length} selected</span>
          )}
        </div>
      )}

      {searchable && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query ?? ""}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9"
          />
        </div>
      )}

      <div className={cn("max-h-56 space-y-1 overflow-y-auto rounded-xl border p-2", listClassName)}>
        {people.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          people.map((person) => {
            const isSelected = selected.has(person.id);
            const secondary =
              [person.employeeCode, person.designation, person.department]
                .filter(Boolean)
                .join(" · ") || undefined;
            return (
              <label
                key={person.id}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-sm",
                  isSelected ? "bg-primary/10 text-foreground" : "hover:bg-muted",
                )}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(value) => toggle(person.id, value === true)}
                  aria-label={`Select ${person.name}`}
                />
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">
                  {initials(person.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{person.name}</span>
                  {secondary && (
                    <span className="block truncate text-xs text-muted-foreground">{secondary}</span>
                  )}
                </span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
