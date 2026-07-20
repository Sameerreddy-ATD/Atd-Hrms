import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const map: Record<string, string> = {
  present:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50",
  late: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/50",
  absent:
    "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/50",
  leave:
    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900/50",
  mismatch:
    "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-900/50",
  field:
    "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-900/50",
  pending:
    "bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-900/50",
  rejected:
    "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/50",
  approved:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50",
  missed:
    "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-900/50",
  holiday: "bg-muted text-muted-foreground border-border",
  neutral: "bg-muted text-muted-foreground border-border",
};

function classify(status: string): keyof typeof map {
  const s = status.toLowerCase();
  if (s.includes("mismatch")) return "mismatch";
  if (s.includes("field") || s.includes("location")) return "field";
  if (s.includes("late")) return "late";
  if (s.includes("absent") || s.includes("rejected")) return "rejected";
  if (s.includes("pending")) return "pending";
  if (s.includes("approved")) return "approved";
  if (s.includes("missed") || s.includes("manual")) return "missed";
  if (s.includes("holiday") || s.includes("week off")) return "holiday";
  if (s.includes("holiday") || s.includes("week off") || s.includes("sunday")) return "holiday";
  if (s.includes("leave") || s.includes("lop")) return "leave";
  if (s.includes("present")) return "present";
  return "neutral";
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("font-medium", map[classify(status)])}>
      {status}
    </Badge>
  );
}
