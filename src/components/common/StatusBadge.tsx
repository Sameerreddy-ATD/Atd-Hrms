import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const map: Record<string, string> = {
  present:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50",
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
  unpaid:
    "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-900/50",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50",
  missed:
    "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-900/50",
  holiday: "bg-muted text-muted-foreground border-border",
  neutral: "bg-muted text-muted-foreground border-border",
};

function classify(status: string): keyof typeof map {
  const s = status.toLowerCase();
  if (s.includes("mismatch")) return "mismatch";
  if (s.includes("field") || s.includes("location")) return "field";
  if (s.includes("missed checkout") || s.includes("missed") || s.includes("manual"))
    return "missed";
  if (s.includes("absent") || s.includes("rejected")) return "rejected";
  if (s.includes("pending")) return "pending";
  if (s === "paid") return "paid";
  if (s.includes("approved") || s.includes("collected") || s.includes("ready")) return "approved";
  if (s.includes("unpaid")) return "unpaid";
  if (s.includes("holiday") || s.includes("week off") || s.includes("sunday")) return "holiday";
  if (s.includes("leave") || s.includes("lop")) return "leave";
  if (s.includes("present") || s === "full day" || s === "half day") return "present";
  return "neutral";
}

const dotMap: Record<string, string> = {
  present: "bg-emerald-500",
  absent: "bg-rose-500",
  leave: "bg-sky-500",
  mismatch: "bg-amber-500",
  field: "bg-indigo-500",
  pending: "bg-amber-500",
  rejected: "bg-rose-500",
  approved: "bg-emerald-500",
  unpaid: "bg-amber-500",
  paid: "bg-emerald-500",
  missed: "bg-amber-500",
  holiday: "bg-muted-foreground",
  neutral: "bg-muted-foreground",
};

export function StatusBadge({
  status,
  showDot = true,
  className,
}: {
  status: string;
  showDot?: boolean;
  className?: string;
}) {
  const category = classify(status);
  return (
    <Badge
      variant="outline"
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 whitespace-normal px-2 py-0.5 text-left text-[11px] font-semibold leading-snug shadow-2xs backdrop-blur-xs sm:px-2.5 sm:text-xs",
        map[category],
        className,
      )}
    >
      {showDot && (
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            dotMap[category],
            (category === "present" || category === "approved") && "pulse-dot",
          )}
        />
      )}
      <span className="min-w-0 break-words">{status}</span>
    </Badge>
  );
}
