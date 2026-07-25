import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  const toneMap: Record<string, string> = {
    default: "text-foreground",
    success: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    danger: "text-red-600 dark:text-red-400",
    info: "text-blue-600 dark:text-blue-400",
  };
  return (
    <Card className="h-full shadow-sm">
      <CardContent className="h-full px-3.5 py-3.5 sm:px-4 sm:py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="min-h-8 text-xs font-semibold leading-4 text-muted-foreground sm:min-h-0">
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
            <div className="shrink-0 rounded-lg bg-muted/80 p-2 text-muted-foreground">
              <Icon className="h-4 w-4" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
