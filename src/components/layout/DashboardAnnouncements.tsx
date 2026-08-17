import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Megaphone } from "lucide-react";
import { announcementsApi } from "@/services/api";
import type { Announcement } from "@/types/domain";
import { sortAnnouncements } from "@/lib/announcements";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DashboardAnnouncements({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Announcement[]>([]);

  useEffect(() => {
    let active = true;
    announcementsApi
      .list(false)
      .then((rows) => {
        if (active) setItems(sortAnnouncements(rows).slice(0, 3));
      })
      .catch(() => {
        if (active) setItems([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const hasUrgent = useMemo(() => items.some((item) => item.priority === "URGENT"), [items]);

  if (items.length === 0) return null;

  return (
    <section
      className={cn(
        "mb-5 overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm",
        hasUrgent && "border-destructive/40",
        className,
      )}
      aria-label={t("announcements.title")}
    >
      <div className="flex flex-col gap-2 border-b border-border/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-lg bg-primary/10 p-1.5 text-primary">
            <Megaphone className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight">{t("announcements.dashboardTitle")}</h2>
            <p className="text-xs text-muted-foreground">{t("announcements.dashboardHelp")}</p>
          </div>
        </div>
        <Button asChild variant="ghost" size="sm" className="h-9 w-full shrink-0 sm:w-auto">
          <Link to="/announcements">
            {t("announcements.viewAll")} <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
      <ul className="divide-y divide-border/70">
        {items.map((item) => (
          <li key={item.id} className="px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 flex-1 text-sm font-semibold text-foreground">{item.title}</p>
              <Badge
                variant={item.priority === "URGENT" ? "destructive" : "outline"}
                className="shrink-0 capitalize"
              >
                {item.priority === "URGENT" ? t("common.urgent") : t("common.normal")}
              </Badge>
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
              {item.message}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
