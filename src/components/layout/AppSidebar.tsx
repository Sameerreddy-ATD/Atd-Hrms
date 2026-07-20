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
import { ROLE_LABELS } from "@/mock/types";
import { employeesApi } from "@/services/api";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/common/Logo";

export function AppSidebar() {
  const { user } = useAuth();
  const { state, setOpenMobile, isMobile } = useSidebar();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const collapsed = state === "collapsed";
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

  const groups = menuForRole(user.role, { isReportingManager });

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-slate-200/20 bg-[#F6F8FC]/40 backdrop-blur-md dark:border-sidebar-border dark:bg-sidebar"
    >
      <SidebarHeader className="bg-transparent border-b-0 pt-4 pb-2 px-3 flex justify-start items-center w-full min-h-[48px]">
        {collapsed && !isMobile ? (
          <img src="/atd-favicon.png" alt="ATD" className="h-8 w-8 object-contain mx-auto" />
        ) : (
          <Logo className="h-9 w-auto px-1" />
        )}
      </SidebarHeader>

      <SidebarContent className="bg-transparent py-2">
        {groups.map((group) => (
          <SidebarGroup key={group.label} className="px-2 py-1">
            {!collapsed && (
              <SidebarGroupLabel className="h-7 px-3 text-[11px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
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
                          "h-9 px-3 rounded-full text-slate-700 dark:text-zinc-300 transition-colors w-full justify-start",
                          active
                            ? "bg-[#D3E3FD] font-semibold text-[#041E49] hover:bg-[#D3E3FD] dark:bg-primary/15 dark:text-primary dark:hover:bg-primary/20"
                            : "bg-transparent hover:bg-slate-200/50 dark:hover:bg-sidebar-accent",
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
                                : "text-slate-500 dark:text-muted-foreground",
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

      <SidebarFooter className="bg-transparent border-t-0 pb-4 flex flex-col gap-1.5">
        {!collapsed ? (
          <>
            <div className="px-4 py-2 bg-slate-200/30 dark:bg-zinc-900/30 rounded-xl mx-2 border border-slate-200/20">
              <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                {user.name}
              </p>
              <p className="truncate text-[10px] text-muted-foreground mt-0.5">
                {ROLE_LABELS[user.role]}
              </p>
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
