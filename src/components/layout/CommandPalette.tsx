import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useAuth } from "@/lib/auth";
import { menuForRole } from "@/lib/menu";
import { GROUP_I18N_BY_LABEL, NAV_I18N_BY_PATH } from "@/i18n/nav-keys";
import { useTranslation } from "react-i18next";
import { employeesApi, moduleAccessApi, searchApi } from "@/services/api";
import type { ModuleKey } from "@/types/domain";

/**
 * Global quick-navigation palette. Opens with Ctrl/Cmd+K or the header
 * search button, lists pages plus live employee/board/task/announcement hits.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isReportingManager, setIsReportingManager] = useState(false);
  const [allowedModules, setAllowedModules] = useState<ModuleKey[] | undefined>();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<
    Array<{ id: string; type: string; title: string; subtitle?: string; href: string }>
  >([]);

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

  useEffect(() => {
    if (!user) return;
    moduleAccessApi
      .mine()
      .then((result) => setAllowedModules(result.modules))
      .catch(() => setAllowedModules([]));
  }, [user]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHits([]);
      return;
    }
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchApi
        .query(query.trim())
        .then((result) =>
          setHits([
            ...result.employees,
            ...result.boards,
            ...result.tasks,
            ...result.announcements,
          ]),
        )
        .catch(() => setHits([]));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  if (!user) return null;

  const groups = menuForRole(user.role, {
    isReportingManager,
    allowedModules,
    hasEmployeeId: Boolean(user.employeeId),
  });

  function itemLabel(to: string, fallback: string) {
    const key = NAV_I18N_BY_PATH[to];
    return key ? t(key) : fallback;
  }

  function groupLabel(label: string) {
    const key = GROUP_I18N_BY_LABEL[label];
    return key ? t(key) : label;
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder={t("common.search")}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>{t("common.noResults")}</CommandEmpty>
        {hits.length > 0 && (
          <CommandGroup heading={t("common.search")}>
            {hits.map((hit) => (
              <CommandItem
                key={`${hit.type}-${hit.id}`}
                value={`${hit.type} ${hit.title} ${hit.subtitle ?? ""}`}
                className="cursor-pointer gap-3"
                onSelect={() => {
                  onOpenChange(false);
                  navigate({ to: hit.href });
                }}
              >
                <span className="text-xs uppercase text-muted-foreground">{hit.type}</span>
                <span>{hit.title}</span>
                {hit.subtitle && (
                  <span className="text-xs text-muted-foreground">{hit.subtitle}</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {groups.map((group) => (
          <CommandGroup key={group.label} heading={groupLabel(group.label)}>
            {group.items.map((item) => {
              const label = itemLabel(item.to, item.label);
              return (
                <CommandItem
                  key={item.to}
                  value={`${group.label} ${item.label} ${label}`}
                  className="cursor-pointer gap-3"
                  onSelect={() => {
                    onOpenChange(false);
                    navigate({ to: item.to });
                  }}
                >
                  <item.icon className="h-4 w-4 text-muted-foreground" />
                  <span>{label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
