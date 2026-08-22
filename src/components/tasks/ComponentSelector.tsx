import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { componentsApi } from "@/services/api";
import type { TaskComponent } from "@/types/domain";

type ComponentSelectorProps = {
  boardId: string;
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  className?: string;
};

export function ComponentSelector({
  boardId,
  value,
  onChange,
  disabled,
  className,
}: ComponentSelectorProps) {
  const [components, setComponents] = useState<TaskComponent[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void componentsApi.list(boardId, true).then((res) => setComponents(res.components));
  }, [boardId]);

  const selected = useMemo(
    () => components.filter((c) => value.includes(c.id)),
    [components, value],
  );

  const activeIds = new Set(components.filter((c) => c.active).map((c) => c.id));

  function toggle(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((entry) => entry !== id));
    } else if (activeIds.has(id)) {
      onChange([...value, id]);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn("h-auto min-h-9 justify-start gap-1 px-2 py-1.5", className)}
          data-testid="component-selector"
        >
          {selected.length === 0 ? (
            <span className="text-muted-foreground">Component / Module</span>
          ) : (
            selected.map((c) => (
              <Badge key={c.id} variant="secondary" className="text-[10px]">
                {c.name}
              </Badge>
            ))
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Components / Modules</p>
        <div className="max-h-56 space-y-2 overflow-y-auto">
          {components.length === 0 ? (
            <p className="text-xs text-muted-foreground">No components defined yet.</p>
          ) : (
            components.map((component) => {
              const checked = value.includes(component.id);
              const inactive = !component.active;
              return (
                <label
                  key={component.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50",
                    inactive && !checked && "opacity-50",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    disabled={inactive && !checked}
                    onCheckedChange={() => toggle(component.id)}
                  />
                  <span>
                    <span className="text-sm font-medium">{component.name}</span>
                    {inactive ? (
                      <span className="ml-1 text-[10px] text-muted-foreground">(inactive)</span>
                    ) : null}
                  </span>
                </label>
              );
            })
          )}
        </div>
        <Label className="mt-2 block text-[10px] text-muted-foreground">
          Inactive components stay on existing items but cannot be newly assigned.
        </Label>
      </PopoverContent>
    </Popover>
  );
}
