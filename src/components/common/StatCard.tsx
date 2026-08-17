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
    danger: "text-rose-600 dark:text-rose-400",
    info: "text-sky-600 dark:text-sky-400",
  };

  const iconBgMap: Record<string, string> = {
    default: "bg-primary/10 text-primary ring-1 ring-primary/20",
    success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20",
    danger: "bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-1 ring-rose-500/20",
    info: "bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-1 ring-sky-500/20",
  };

  return (
    <Card
      className={cn(
        "card-hover group relative min-w-0 overflow-hidden border-border/70 bg-card/95 shadow-xs backdrop-blur-sm",
        className,
      )}
    >
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      <CardContent className="h-full px-3 py-3.5 sm:px-5 sm:py-4.5">
        <div className="flex items-start justify-between gap-2 sm:gap-3">
          <div className="min-w-0 flex-1">
            <p className="break-words text-[11px] font-semibold uppercase leading-snug tracking-wider text-muted-foreground">
              {label}
            </p>
            <p
              className={cn(
                "mt-2 text-xl font-bold tracking-tight tabular-nums sm:text-3xl",
                toneMap[tone],
              )}
            >
              {value}
            </p>
            {hint && (
              <p className="mt-1.5 break-words text-xs text-muted-foreground/90">{hint}</p>
            )}
          </div>
          {Icon && (
            <div
              className={cn(
                "shrink-0 rounded-xl p-2 transition-transform duration-200 group-hover:scale-110 sm:p-2.5",
                iconBgMap[tone],
              )}
            >
              <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
