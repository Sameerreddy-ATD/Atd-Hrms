import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { shortcutsForRole } from "@/lib/role-shortcuts";
import { useAuth } from "@/lib/auth";
import { employeesApi } from "@/services/api";
import { ROLE_LABELS } from "@/types/domain";
import { cn } from "@/lib/utils";

export function RoleQuickAccess({ className }: { className?: string }) {
  const { user } = useAuth();
  const [isReportingManager, setIsReportingManager] = useState(false);

  useEffect(() => {
    if (!user?.employeeId) {
      setIsReportingManager(false);
      return;
    }
    employeesApi
      .isReportingManager()
      .then((result) => setIsReportingManager(result.isReportingManager))
      .catch(() => setIsReportingManager(false));
  }, [user?.employeeId]);

  if (!user) return null;

  const shortcuts = shortcutsForRole(user.role, { isReportingManager }).slice(0, 8);

  return (
    <section className={cn("mb-5", className)} aria-label="Quick access">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-foreground">Quick access</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Common actions for your {ROLE_LABELS[user.role]} workspace
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {shortcuts.map((item) => (
          <Link
            key={`${item.to}-${item.label}`}
            to={item.to}
            className="group flex min-h-[4.75rem] flex-col justify-between rounded-xl border border-border/80 bg-card p-3 shadow-sm transition-colors hover:border-primary/35 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <item.icon className="h-5 w-5 text-primary transition-transform group-hover:scale-105" />
            <div className="mt-2 min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{item.label}</p>
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                {item.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
