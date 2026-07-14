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
import { ROLE_LABELS } from "@/mock/types";
import { getTheme, setTheme, type Theme } from "@/lib/system-theme";

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

  useEffect(() => {
    setActiveTheme(getTheme());
  }, []);

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
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-1 border-b border-slate-200/20 bg-[#F6F8FC]/40 px-2 backdrop-blur-md dark:border-zinc-900/30 dark:bg-zinc-950/45 sm:h-16 sm:gap-3 sm:px-4 md:px-6">
      {/* Left: Collapsible Toggle, Logo & Page Title */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden h-10 w-10 rounded-full hover:bg-slate-200/60 dark:hover:bg-zinc-800/60 transition-colors shrink-0"
          onClick={toggleSidebar}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5 text-slate-700 dark:text-zinc-300" />
        </Button>
        <div className="flex min-w-0 items-center gap-2 pl-0.5 sm:pl-1">
          <img src="/atd-favicon.png" alt="ATD" className="h-6 w-6 rounded-sm object-contain" />
          <span className="truncate text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-100 sm:text-base">
            <span className="hidden min-[390px]:inline">Anytime Diesel </span>HRMS
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
          className="hidden sm:inline-flex h-10 w-10 rounded-full text-slate-600 dark:text-zinc-300 hover:bg-slate-200/50 dark:hover:bg-zinc-800/50"
          aria-label="Go to dashboard"
          onClick={() => navigate({ to: "/dashboard" })}
        >
          <Home className="h-[20px] w-[20px]" />
        </Button>

        {user && (user.role === "developer_admin" || user.role === "main_admin") && (
          <Button
            variant="ghost"
            size="icon"
            className="hidden sm:inline-flex h-10 w-10 rounded-full text-slate-600 dark:text-zinc-300 hover:bg-slate-200/50 dark:hover:bg-zinc-800/50"
            aria-label="System Settings"
            onClick={() => navigate({ to: "/settings" })}
          >
            <Settings className="h-[20px] w-[20px]" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-full text-slate-600 dark:text-zinc-300 hover:bg-slate-200/50 dark:hover:bg-zinc-800/50"
          aria-label="Notifications"
          onClick={() => navigate({ to: "/notifications" })}
        >
          <Bell className="h-[20px] w-[20px]" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-10 w-10 rounded-full p-0 border-0 hover:bg-slate-200/50 dark:hover:bg-zinc-800/50"
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
            className="w-56 mt-1 rounded-xl shadow-md border border-border/40 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md"
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
                <DropdownMenuSubContent className="w-36 rounded-xl shadow-md border border-border/40 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md p-1">
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
    </header>
  );
}
