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
    <Sidebar collapsible="icon" className="border-r border-slate-200/20 dark:border-zinc-900/30 bg-[#F6F8FC]/40 dark:bg-zinc-950/40 backdrop-blur-md">
      {/* Header containing the Gmail-style Compose (Apply Leave) Button - Hidden on mobile screens */}
      {!isMobile && (
        <SidebarHeader className="bg-transparent border-b-0 pt-4 pb-2 px-3">
          <div className="flex justify-start w-full">
            {collapsed ? (
              <Link
                to="/leave/apply"
                onClick={() => { if (isMobile) setOpenMobile(false); }}
                className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border border-slate-200/30 dark:border-zinc-800/40 shadow-[0_1px_3px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.1)] hover:shadow-[0_2px_6px_rgba(0,0,0,0.15),0_8px_16px_rgba(0,0,0,0.15)] hover:scale-105 transition-all duration-150 mx-auto"
                title="Apply Leave"
              >
                <Plus className="h-6 w-6 text-slate-700 dark:text-zinc-300" />
              </Link>
            ) : (
              <Link
                to="/leave/apply"
                onClick={() => { if (isMobile) setOpenMobile(false); }}
                className="flex h-12 items-center justify-center gap-3 rounded-2xl bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border border-slate-200/30 dark:border-zinc-800/40 shadow-[0_1px_3px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.1)] hover:shadow-[0_2px_6px_rgba(0,0,0,0.15),0_8px_16px_rgba(0,0,0,0.15)] hover:scale-102 px-6 text-sm font-semibold text-slate-700 dark:text-zinc-300 transition-all duration-150 min-w-[140px] ml-1"
              >
                <Plus className="h-5 w-5 text-blue-600 dark:text-blue-400 stroke-[3]" />
                <span>Apply Leave</span>
              </Link>
            )}
          </div>
        </SidebarHeader>
      )}

      <SidebarContent className="bg-transparent py-2">
        {groups.map((group) => (
          <SidebarGroup key={group.label} className="px-2 py-1">
            {!collapsed && (
              <SidebarGroupLabel className="h-7 px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                {group.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.to || pathname.startsWith(item.to + "/");
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
                            ? "bg-[#D3E3FD] hover:bg-[#D3E3FD] text-[#041E49] dark:bg-blue-950/40 dark:hover:bg-blue-950/40 dark:text-blue-200 font-semibold"
                            : "hover:bg-slate-200/50 dark:hover:bg-zinc-800/50 bg-transparent"
                        )}
                      >
                        <Link
                          to={item.to}
                          onClick={() => { if (isMobile) setOpenMobile(false); }}
                          className="flex items-center gap-3 w-full"
                        >
                          <item.icon className={cn(
                            "h-[18px] w-[18px] shrink-0",
                            active ? "text-[#041E49] dark:text-blue-200" : "text-slate-500 dark:text-zinc-400"
                          )} />
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
              <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">{user.name}</p>
              <p className="truncate text-[10px] text-muted-foreground mt-0.5">{ROLE_LABELS[user.role]}</p>
            </div>
            <div className="text-[10px] text-muted-foreground/60 text-center font-medium">Version 1.0</div>
          </>
        ) : (
          <div className="px-2 py-2 text-[10px] text-muted-foreground/60 text-center">v1.0</div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
