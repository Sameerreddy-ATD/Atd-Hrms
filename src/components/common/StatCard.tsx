import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  className?: string;
}) {
  const toneMap: Record<string, string> = {
    default: "text-foreground",
    success: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    danger: "text-red-600 dark:text-red-400",
    info: "text-blue-600 dark:text-blue-400",
  };
  return (
    <Card
      className={cn(
        "h-full border-border/80 shadow-none transition-[border-color,box-shadow] duration-[var(--motion-fast)] hover:border-border hover:shadow-sm",
        className,
      )}
    >
      <CardContent className="h-full px-3.5 py-3.5 sm:px-4 sm:py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="min-h-8 text-[11px] font-semibold uppercase tracking-[0.06em] leading-4 text-muted-foreground sm:min-h-0">
              {label}
            </p>
            <p
              className={`mt-1.5 text-xl font-semibold tracking-tight tabular-nums sm:mt-2 sm:text-2xl ${toneMap[tone]}`}
            >
              {value}
            </p>
            {hint && <p className="mt-1.5 text-xs leading-4 text-muted-foreground">{hint}</p>}
          </div>
          {Icon && (
            <div className="shrink-0 rounded-lg bg-primary/8 p-2 text-primary/80 dark:bg-primary/15">
              <Icon className="h-4 w-4" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
