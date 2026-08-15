import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth";
import { menuForRole } from "@/lib/menu";
import { ROLE_LABELS, type ModuleKey } from "@/types/domain";
import { employeesApi, moduleAccessApi } from "@/services/api";
import { cn } from "@/lib/utils";
import { BrandLockup, Logo } from "@/components/common/Logo";

export function AppSidebar() {
  const { user } = useAuth();
  const { state, setOpenMobile, isMobile } = useSidebar();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const collapsed = state === "collapsed";
  const [isReportingManager, setIsReportingManager] = useState(false);
  const [allowedModules, setAllowedModules] = useState<ModuleKey[] | undefined>();

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

  if (!user) return null;

  const groups = menuForRole(user.role, {
    isReportingManager,
    allowedModules,
    hasEmployeeId: Boolean(user.employeeId),
  });

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-border/70 bg-sidebar/90 backdrop-blur-md dark:border-sidebar-border dark:bg-sidebar dark:shadow-[8px_0_24px_rgba(0,0,0,0.12)]"
    >
      <SidebarHeader
        className={cn(
          "flex w-full items-center justify-start border-b border-sidebar-border/70 bg-transparent px-3 py-3",
          isMobile ? "hidden" : "min-h-16",
        )}
      >
        {collapsed ? (
          <Logo variant="mark" className="mx-auto h-8 w-8" />
        ) : (
          <BrandLockup className="px-1" markClassName="h-8 w-8" />
        )}
      </SidebarHeader>

      <SidebarContent className="bg-transparent px-1 py-3">
        {groups.map((group) => (
          <SidebarGroup key={group.label} className="px-1 py-1.5">
            {!collapsed && (
              <SidebarGroupLabel className="h-7 px-3 text-xs font-semibold text-muted-foreground">
                {group.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map((item) => {
                  const allMenuItems = groups.flatMap((g) => g.items);
                  const siblingActive = allMenuItems.some(
                    (other) =>
                      other.to !== item.to &&
                      other.to.startsWith(item.to) &&
                      (pathname === other.to || pathname.startsWith(other.to + "/")),
                  );
                  const active =
                    (pathname === item.to || pathname.startsWith(item.to + "/")) && !siblingActive;
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        size="default"
                        tooltip={item.label}
        className={cn(
                          "aw-nav-item h-10 w-full justify-start rounded-md border border-transparent px-3 text-sidebar-foreground/90",
                          active
                            ? "border-primary/20 bg-primary/10 font-semibold text-primary hover:bg-primary/12 dark:border-primary/35 dark:bg-primary/15 dark:text-primary dark:hover:bg-primary/20"
                            : "bg-transparent hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        )}
                        data-active={active ? "true" : undefined}
                      >
                        <Link
                          to={item.to}
                          onClick={() => {
                            if (isMobile) setOpenMobile(false);
                          }}
                          className="flex w-full items-center gap-3"
                        >
                          <item.icon
                            className={cn(
                              "h-[18px] w-[18px] shrink-0 transition-colors duration-[var(--motion-fast)]",
                              active
                                ? "text-primary dark:text-primary"
                                : "text-muted-foreground",
                            )}
                          />
                          <span className="truncate text-sm">{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="flex flex-col gap-2 border-t border-sidebar-border/70 bg-transparent px-2 pb-3 pt-3">
        {!collapsed ? (
          <>
            <div className="flex items-center gap-3 rounded-md border border-border/70 bg-background/70 p-2.5 dark:border-sidebar-border dark:bg-sidebar-accent/65">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
                {user.name
                  .split(" ")
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-foreground">
                  {user.name}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {ROLE_LABELS[user.role]}
                </p>
              </div>
            </div>
            <div className="text-center text-[10px] font-medium text-muted-foreground/60">
              AnyTime Diesel
            </div>
          </>
        ) : (
          <div className="px-2 py-2 text-center text-[10px] text-muted-foreground/60">AW</div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
