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
import { Logo } from "@/components/common/Logo";

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
      .catch(() => setAllowedModules(undefined));
  }, [user]);

  if (!user) return null;

  const groups = menuForRole(user.role, { isReportingManager, allowedModules });

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-slate-200/70 bg-[#F6F8FC]/85 backdrop-blur-md dark:border-sidebar-border dark:bg-sidebar dark:shadow-[8px_0_24px_rgba(0,0,0,0.12)]"
    >
      <SidebarHeader className="flex min-h-16 w-full items-center justify-start border-b border-sidebar-border/70 bg-transparent px-3 py-3">
        {collapsed && !isMobile ? (
          <img src="/atd-favicon.png" alt="ATD" className="h-8 w-8 object-contain mx-auto" />
        ) : (
          <Logo className="h-9 w-auto px-1" />
        )}
      </SidebarHeader>

      <SidebarContent className="bg-transparent px-1 py-3">
        {groups.map((group) => (
          <SidebarGroup key={group.label} className="px-1 py-1.5">
            {!collapsed && (
              <SidebarGroupLabel className="h-7 px-3 text-xs font-semibold text-slate-500 dark:text-sidebar-foreground/55">
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
                          "h-10 w-full justify-start rounded-md border border-transparent px-3 text-slate-700 transition-colors dark:text-sidebar-foreground/85",
                          active
                            ? "border-blue-200/80 bg-[#D3E3FD] font-semibold text-[#041E49] hover:bg-[#D3E3FD] dark:border-primary/35 dark:bg-primary/15 dark:text-red-100 dark:hover:bg-primary/20"
                            : "bg-transparent hover:bg-slate-200/60 dark:hover:border-sidebar-border dark:hover:bg-sidebar-accent dark:hover:text-sidebar-accent-foreground",
                        )}
                      >
                        <Link
                          to={item.to}
                          onClick={() => {
                            if (isMobile) setOpenMobile(false);
                          }}
                          className="flex items-center gap-3 w-full"
                        >
                          <item.icon
                            className={cn(
                              "h-[18px] w-[18px] shrink-0",
                              active
                                ? "text-[#041E49] dark:text-primary"
                                : "text-slate-500 dark:text-sidebar-foreground/60",
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
            <div className="flex items-center gap-3 rounded-md border border-slate-200/70 bg-white/60 p-2.5 dark:border-sidebar-border dark:bg-sidebar-accent/65">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
                {user.name
                  .split(" ")
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-800 dark:text-sidebar-foreground">
                  {user.name}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {ROLE_LABELS[user.role]}
                </p>
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground/60 text-center font-medium">
              Version 1.0
            </div>
          </>
        ) : (
          <div className="px-2 py-2 text-[10px] text-muted-foreground/60 text-center">v1.0</div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
