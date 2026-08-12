import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import {
  Bell,
  ChevronDown,
  Home,
  IdCard,
  LogOut,
  User as UserIcon,
  Search,
  Settings,
  Menu,
  Sun,
  Moon,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { ROLE_LABELS } from "@/types/domain";
import { getTheme, setTheme, type Theme } from "@/lib/system-theme";
import { Switch } from "@/components/ui/switch";
import { notificationsApi } from "@/services/api";
import {
  filterVisibleNotifications,
  NOTIFICATION_COUNT_CHANGED_EVENT,
} from "@/lib/browser-notifications";
import { hardRefreshApp } from "@/lib/pwa-install";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function toTitle(pathname: string) {
  const seg = pathname.split("/").filter(Boolean).slice(-1)[0] ?? "dashboard";
  return seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AppHeader() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { toggleSidebar } = useSidebar();
  const [activeTheme, setActiveTheme] = useState<Theme>("light");
  const [notificationCount, setNotificationCount] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function refreshApp() {
    if (refreshing) return;
    setRefreshing(true);
    toast.message("Refreshing app…", {
      description: "Clearing cache and loading the latest version.",
    });
    await hardRefreshApp();
  }

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
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshCount();
    };
    window.addEventListener(NOTIFICATION_COUNT_CHANGED_EVENT, refreshCount);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener(NOTIFICATION_COUNT_CHANGED_EVENT, refreshCount);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [user]);

  const darkMode = activeTheme === "dark";

  const handleDarkModeToggle = (enabled: boolean) => {
    const next: Theme = enabled ? "dark" : "light";
    setTheme(next);
    setActiveTheme(next);
  };

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((s) => s[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "??";

  const roleLabel = user ? ROLE_LABELS[user.role] : "";

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-1 border-b border-border/80 bg-background/85 px-2 backdrop-blur-xl transition-[background-color,border-color] duration-[var(--motion-ui)] dark:bg-card/90 dark:shadow-[0_1px_0_0_color-mix(in_oklab,white_6%,transparent)] sm:h-16 sm:gap-3 sm:px-4 md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-lg transition-colors hover:bg-muted md:hidden"
          onClick={toggleSidebar}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5 text-foreground/80" />
        </Button>
        <div className="flex min-w-0 items-center gap-2 pl-0.5 sm:pl-1">
          <img
            src="/atd-favicon.png"
            alt="Anytime Workforce"
            className="h-6 w-6 shrink-0 rounded-md object-contain ring-1 ring-border/60"
          />
          <span className="truncate text-sm font-semibold tracking-tight text-foreground sm:text-base">
            <span className="sm:hidden">{toTitle(pathname)}</span>
            <span className="hidden sm:inline">Anytime Workforce</span>
          </span>
          <span className="hidden shrink-0 text-border sm:inline">|</span>
          <span className="hidden max-w-[10rem] truncate capitalize text-xs font-medium text-muted-foreground sm:inline sm:text-sm lg:max-w-none lg:whitespace-nowrap">
            {toTitle(pathname)}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Search pages (Ctrl+K)"
          title="Search pages (Ctrl+K)"
          onClick={() => setPaletteOpen(true)}
        >
          <Search className="h-[18px] w-[18px]" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="hidden h-10 w-10 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground sm:inline-flex"
          aria-label="Go to dashboard"
          onClick={() => navigate({ to: "/dashboard" })}
        >
          <Home className="h-[18px] w-[18px]" />
        </Button>

        {user && (user.role === "developer_admin" || user.role === "main_admin") && (
          <Button
            variant="ghost"
            size="icon"
            className="hidden h-10 w-10 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground sm:inline-flex"
            aria-label="System Settings"
            onClick={() => navigate({ to: "/settings" })}
          >
            <Settings className="h-[18px] w-[18px]" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="relative h-10 w-10 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`Notifications${notificationCount ? ` (${notificationCount})` : ""}`}
          onClick={() => navigate({ to: "/notifications" })}
        >
          <Bell className="h-[18px] w-[18px]" />
          {notificationCount > 0 && (
            <span className="absolute right-1 top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground shadow-sm">
              {notificationCount > 99 ? "99+" : notificationCount}
            </span>
          )}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="group ml-0.5 h-10 gap-1.5 rounded-xl border border-transparent px-1.5 hover:border-border/70 hover:bg-muted data-[state=open]:border-border data-[state=open]:bg-muted sm:pl-1.5 sm:pr-2"
              aria-label="Open account menu"
            >
              <Avatar className="h-8 w-8 ring-2 ring-primary/15 transition group-hover:ring-primary/30">
                <AvatarFallback className="bg-gradient-to-br from-primary to-[color-mix(in_oklab,var(--primary)_72%,black)] text-[12px] font-bold text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="hidden max-w-[7.5rem] truncate text-left text-xs font-semibold leading-tight text-foreground md:inline">
                {user?.name?.split(" ")[0] ?? "Account"}
              </span>
              <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground transition group-data-[state=open]:rotate-180 sm:inline" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="w-[min(20rem,calc(100vw-1.25rem))] overflow-hidden rounded-2xl border border-border/80 bg-popover/95 p-0 shadow-xl shadow-black/10 backdrop-blur-xl dark:shadow-black/40"
          >
            <div className="relative overflow-hidden border-b border-border/70 bg-gradient-to-br from-primary/[0.12] via-transparent to-transparent px-4 pb-4 pt-4">
              <div className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
              <div className="relative flex items-start gap-3">
                <Avatar className="h-12 w-12 ring-2 ring-background shadow-md">
                  <AvatarFallback className="bg-gradient-to-br from-primary to-[color-mix(in_oklab,var(--primary)_72%,black)] text-sm font-bold text-primary-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="truncate text-sm font-semibold tracking-tight text-foreground">
                    {user?.name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{user?.email}</p>
                  <span className="mt-2 inline-flex max-w-full truncate rounded-md border border-primary/15 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                    {roleLabel}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-0.5 p-2">
              <DropdownMenuItem
                onClick={() => navigate({ to: "/profile" })}
                className="cursor-pointer rounded-lg px-2.5 py-2.5"
              >
                <UserIcon className="mr-2.5 h-4 w-4 text-muted-foreground" />
                <span className="font-medium">My profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => navigate({ to: "/id-card" })}
                className="cursor-pointer rounded-lg px-2.5 py-2.5"
              >
                <IdCard className="mr-2.5 h-4 w-4 text-muted-foreground" />
                <span className="font-medium">ID card</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => navigate({ to: "/notifications" })}
                className="cursor-pointer rounded-lg px-2.5 py-2.5"
              >
                <Bell className="mr-2.5 h-4 w-4 text-muted-foreground" />
                <span className="flex-1 font-medium">Notifications</span>
                {notificationCount > 0 && (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                    {notificationCount > 99 ? "99+" : notificationCount}
                  </span>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={refreshing}
                onSelect={(event) => {
                  event.preventDefault();
                  void refreshApp();
                }}
                className="cursor-pointer rounded-lg px-2.5 py-2.5"
              >
                <RefreshCw
                  className={cn("mr-2.5 h-4 w-4 text-muted-foreground", refreshing && "animate-spin")}
                />
                <span className="font-medium">
                  {refreshing ? "Refreshing…" : "Refresh app"}
                </span>
              </DropdownMenuItem>
            </div>

            <div className="px-3 pb-3 pt-1">
              <p className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Appearance
              </p>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/50 px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                      darkMode
                        ? "bg-sky-500/15 text-sky-400"
                        : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                    )}
                    aria-hidden
                  >
                    {darkMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {darkMode ? "Dark mode" : "Light mode"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {darkMode ? "Easier on the eyes at night" : "Bright and clear for daytime"}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={darkMode}
                  onCheckedChange={handleDarkModeToggle}
                  aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
                  className="data-[state=checked]:bg-sky-500 data-[state=unchecked]:bg-amber-500/80"
                />
              </div>
            </div>

            <DropdownMenuSeparator className="m-0" />
            <div className="p-2">
              <DropdownMenuItem
                onClick={() => {
                  logout();
                  navigate({ to: "/login" });
                }}
                className="cursor-pointer rounded-lg px-2.5 py-2.5 font-semibold text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                <LogOut className="mr-2.5 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </header>
  );
}
