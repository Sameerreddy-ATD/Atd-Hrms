import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import {
  Bell,
  Home,
  LogOut,
  User as UserIcon,
  Search,
  Settings,
  HelpCircle,
  Menu,
  Sun,
  Moon,
  Monitor,
  Check,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { ROLE_LABELS } from "@/mock/types";
import { getTheme, setTheme, type Theme } from "@/lib/system-theme";
import { notificationsApi } from "@/services/api";
import {
  filterVisibleNotifications,
  NOTIFICATION_COUNT_CHANGED_EVENT,
} from "@/lib/browser-notifications";

function toTitle(pathname: string) {
  const seg = pathname.split("/").filter(Boolean).slice(-1)[0] ?? "dashboard";
  return seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AppHeader() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { toggleSidebar } = useSidebar();
  const [activeTheme, setActiveTheme] = useState<Theme>("system");
  const [notificationCount, setNotificationCount] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    setActiveTheme(getTheme());
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const refreshCount = async () => {
      try {
        const items = filterVisibleNotifications(await notificationsApi.list());
        if (!cancelled) setNotificationCount(items.length);
      } catch {
        if (!cancelled) setNotificationCount(0);
      }
    };
    void refreshCount();
    const interval = window.setInterval(refreshCount, 60000);
    window.addEventListener(NOTIFICATION_COUNT_CHANGED_EVENT, refreshCount);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener(NOTIFICATION_COUNT_CHANGED_EVENT, refreshCount);
    };
  }, [user]);

  const handleThemeChange = (t: Theme) => {
    setTheme(t);
    setActiveTheme(t);
  };

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((s) => s[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "??";

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-1 border-b border-slate-200/70 bg-[#F6F8FC]/85 px-2 backdrop-blur-md dark:border-border dark:bg-card/95 dark:shadow-sm sm:h-16 sm:gap-3 sm:px-4 md:px-6">
      {/* Left: Collapsible Toggle, Logo & Page Title */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-md transition-colors hover:bg-slate-200/60 dark:hover:bg-muted md:hidden"
          onClick={toggleSidebar}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5 text-slate-700 dark:text-foreground" />
        </Button>
        <div className="flex min-w-0 items-center gap-2 pl-0.5 sm:pl-1">
          <img src="/atd-favicon.png" alt="ATD" className="h-6 w-6 rounded-sm object-contain" />
          <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100 sm:text-base">
            <span className="sm:hidden">{toTitle(pathname)}</span>
            <span className="hidden sm:inline">Anytime Diesel Employee Management</span>
          </span>
          <span className="hidden sm:inline text-slate-300 dark:text-zinc-700">|</span>
          <span className="hidden sm:inline text-xs sm:text-sm font-medium text-slate-500 dark:text-zinc-400 capitalize whitespace-nowrap">
            {toTitle(pathname)}
          </span>
        </div>
      </div>

      {/* Right: Quick Settings & User Menu */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-md text-slate-600 hover:bg-slate-200/50 dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground"
          aria-label="Search pages (Ctrl+K)"
          title="Search pages (Ctrl+K)"
          onClick={() => setPaletteOpen(true)}
        >
          <Search className="h-[20px] w-[20px]" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="hidden h-10 w-10 rounded-md text-slate-600 hover:bg-slate-200/50 dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground sm:inline-flex"
          aria-label="Go to dashboard"
          onClick={() => navigate({ to: "/dashboard" })}
        >
          <Home className="h-[20px] w-[20px]" />
        </Button>

        {user && (user.role === "developer_admin" || user.role === "main_admin") && (
          <Button
            variant="ghost"
            size="icon"
            className="hidden h-10 w-10 rounded-md text-slate-600 hover:bg-slate-200/50 dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground sm:inline-flex"
            aria-label="System Settings"
            onClick={() => navigate({ to: "/settings" })}
          >
            <Settings className="h-[20px] w-[20px]" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="relative h-10 w-10 rounded-md text-slate-600 hover:bg-slate-200/50 dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground"
          aria-label={`Notifications${notificationCount ? ` (${notificationCount})` : ""}`}
          onClick={() => navigate({ to: "/notifications" })}
        >
          <Bell className="h-[20px] w-[20px]" />
          {notificationCount > 0 && (
            <span className="absolute right-0.5 top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
              {notificationCount > 99 ? "99+" : notificationCount}
            </span>
          )}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-10 w-10 rounded-md border-0 p-0 hover:bg-slate-200/50 dark:hover:bg-muted"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-[13px] font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="mt-1 w-56 rounded-lg border border-border bg-popover/95 shadow-lg backdrop-blur-md"
          >
            <DropdownMenuLabel className="font-semibold text-sm px-3 py-2">
              <div className="font-medium text-slate-800 dark:text-slate-200">{user?.name}</div>
              <div className="text-xs text-muted-foreground font-normal">
                {user ? ROLE_LABELS[user.role] : ""}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => navigate({ to: "/profile" })}
              className="cursor-pointer"
            >
              <UserIcon className="mr-2 h-4 w-4" /> Profile
            </DropdownMenuItem>

            {/* Theme Toggle Submenu */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="cursor-pointer">
                <Sun className="mr-2 h-4 w-4 dark:hidden text-slate-600" />
                <Moon className="mr-2 h-4 w-4 hidden dark:block text-zinc-300" />
                <span>Theme</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="w-36 rounded-lg border border-border bg-popover/95 p-1 shadow-lg backdrop-blur-md">
                  <DropdownMenuItem
                    onClick={() => handleThemeChange("light")}
                    className="cursor-pointer flex items-center justify-between"
                  >
                    <span className="flex items-center">
                      <Sun className="mr-2 h-4 w-4 text-amber-500" /> Light
                    </span>
                    {activeTheme === "light" && (
                      <Check className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleThemeChange("dark")}
                    className="cursor-pointer flex items-center justify-between"
                  >
                    <span className="flex items-center">
                      <Moon className="mr-2 h-4 w-4 text-blue-400" /> Dark
                    </span>
                    {activeTheme === "dark" && (
                      <Check className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleThemeChange("system")}
                    className="cursor-pointer flex items-center justify-between"
                  >
                    <span className="flex items-center">
                      <Monitor className="mr-2 h-4 w-4 text-slate-500 dark:text-zinc-400" /> System
                    </span>
                    {activeTheme === "system" && (
                      <Check className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    )}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>

            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                logout();
                navigate({ to: "/login" });
              }}
              className="text-destructive focus:text-destructive cursor-pointer font-medium"
            >
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </header>
  );
}
