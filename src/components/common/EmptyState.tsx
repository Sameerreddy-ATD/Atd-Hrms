import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("border-dashed shadow-none", className)}>
      <CardContent className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        {Icon && (
          <span className="mb-1 grid size-11 place-items-center rounded-xl bg-muted text-muted-foreground">
            <Icon className="size-5" aria-hidden />
          </span>
        )}
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && (
          <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}
        {action && <div className="mt-3 w-full max-w-xs sm:w-auto">{action}</div>}
      </CardContent>
    </Card>
  );
}
