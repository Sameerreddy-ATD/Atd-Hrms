import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const map: Record<string, string> = {
  present: "bg-emerald-50 text-emerald-700 border-emerald-200",
  late: "bg-amber-50 text-amber-700 border-amber-200",
  absent: "bg-red-50 text-red-700 border-red-200",
  leave: "bg-blue-50 text-blue-700 border-blue-200",
  mismatch: "bg-orange-50 text-orange-700 border-orange-200",
  field: "bg-indigo-50 text-indigo-700 border-indigo-200",
  pending: "bg-yellow-50 text-yellow-800 border-yellow-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  missed: "bg-orange-50 text-orange-700 border-orange-200",
  holiday: "bg-slate-100 text-slate-700 border-slate-200",
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
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
