import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  workforceTypeForPerson,
  workforceTypeLabel,
  type WorkforceType,
} from "@/lib/workforce-type";
import type { Role } from "@/types/domain";
import { Briefcase, Truck } from "lucide-react";

export function WorkforceTypeBadge({
  role,
  type,
  className,
}: {
  role?: Role;
  type?: WorkforceType;
  className?: string;
}) {
  const resolved = type ?? (role ? workforceTypeForPerson({ role }) : "team_member");
  const isPilot = resolved === "bowser_pilot";
  const Icon = isPilot ? Truck : Briefcase;

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 font-normal",
        isPilot
          ? "border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-100"
          : "border-primary/25 bg-primary/5 text-foreground",
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {workforceTypeLabel(resolved)}
    </Badge>
  );
}
