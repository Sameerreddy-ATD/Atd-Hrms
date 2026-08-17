import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
  Languages,
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
import { Logo } from "@/components/common/Logo";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function toTitle(pathname: string) {
  const seg = pathname.split("/").filter(Boolean).slice(-1)[0] ?? "dashboard";
  return seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AppHeader() {
  const { t } = useTranslation();
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
    <header className="sticky top-0 z-[60] flex min-h-[calc(var(--atd-header-row)+var(--atd-sat))] min-w-0 max-w-full shrink-0 items-center justify-between gap-1 overflow-x-hidden border-b border-border/80 bg-background pt-[var(--atd-sat)] pl-[max(0.75rem,var(--atd-sal))] pr-[max(0.75rem,var(--atd-sar))] pointer-events-auto transition-[background-color,border-color] duration-[var(--motion-ui)] dark:bg-card dark:shadow-[0_1px_0_0_color-mix(in_oklab,white_6%,transparent)] sm:gap-3 sm:pl-[max(1rem,var(--atd-sal))] sm:pr-[max(1rem,var(--atd-sar))] md:pl-[max(1.5rem,var(--atd-sal))] md:pr-[max(1.5rem,var(--atd-sar))]">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-lg transition-colors hover:bg-muted md:hidden"
          onClick={toggleSidebar}
          aria-label={t("common.openMenu")}
        >
          <Menu className="h-5 w-5 text-foreground/80" />
        </Button>
        <div className="flex min-w-0 items-center gap-2 pl-0.5 sm:pl-1">
          <button
            type="button"
            onClick={() => navigate({ to: "/dashboard" })}
            aria-label={t("common.goDashboard")}
            title={t("common.goDashboard")}
            className="flex h-10 shrink-0 items-center rounded-lg px-1.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Logo variant="mark" className="h-7 w-7 shrink-0 rounded-md ring-1 ring-border/60" />
          </button>
          <span className="min-w-0 truncate text-sm font-semibold tracking-tight text-foreground md:hidden">
            {toTitle(pathname)}
          </span>
          <span className="hidden shrink-0 text-border md:inline">|</span>
          <span className="hidden max-w-[10rem] truncate capitalize text-xs font-medium text-muted-foreground md:inline md:text-sm lg:max-w-none lg:whitespace-nowrap">
            {toTitle(pathname)}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={t("common.searchPages")}
          title={t("common.searchPages")}
          onClick={() => setPaletteOpen(true)}
        >
          <Search className="h-[18px] w-[18px]" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="hidden h-10 w-10 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground sm:inline-flex"
          aria-label={t("common.goDashboard")}
          onClick={() => navigate({ to: "/dashboard" })}
        >
          <Home className="h-[18px] w-[18px]" />
        </Button>

        {user && (user.role === "developer_admin" || user.role === "main_admin") && (
          <Button
            variant="ghost"
            size="icon"
            className="hidden h-10 w-10 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground sm:inline-flex"
            aria-label={t("nav.systemSettings")}
            onClick={() => navigate({ to: "/settings" })}
          >
            <Settings className="h-[18px] w-[18px]" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="relative h-10 w-10 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`${t("common.notifications")}${notificationCount ? ` (${notificationCount})` : ""}`}
          onClick={() => navigate({ to: "/notifications" })}
        >
          <Bell className="h-[18px] w-[18px]" />
          {notificationCount > 0 && (
            <span
              key={notificationCount}
              className="aw-badge-pop absolute right-1 top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground shadow-sm"
            >
              {notificationCount > 99 ? "99+" : notificationCount}
            </span>
          )}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="group ml-0.5 h-11 gap-2 rounded-xl border border-transparent px-1.5 hover:border-border/70 hover:bg-muted data-[state=open]:border-border data-[state=open]:bg-muted sm:pl-1.5 sm:pr-2.5"
              aria-label={t("pages.shell.openAccount")}
            >
              <Avatar className="h-9 w-9 ring-2 ring-primary/15 transition group-hover:ring-primary/30">
                <AvatarFallback className="bg-gradient-to-br from-primary to-[color-mix(in_oklab,var(--primary)_72%,black)] text-[13px] font-bold text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="hidden max-w-[8rem] truncate text-left text-sm font-semibold leading-tight text-foreground md:inline">
                {user?.name?.split(" ")[0] ?? t("pages.shell.account")}
              </span>
              <ChevronDown className="hidden h-4 w-4 text-muted-foreground transition group-data-[state=open]:rotate-180 sm:inline" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="w-[min(20rem,calc(100dvw-1.5rem))] max-w-[calc(100dvw-1.5rem)] overflow-hidden rounded-xl border border-border/80 bg-popover p-1.5 shadow-lg"
          >
            <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-3">
              <Avatar className="h-11 w-11 shrink-0">
                <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight text-foreground">
                  {user?.name}
                </p>
                {roleLabel && (
                  <p className="mt-1 truncate text-xs font-medium leading-tight text-primary">
                    {roleLabel}
                  </p>
                )}
                <p className="mt-1 truncate text-xs leading-tight text-muted-foreground">
                  {user?.email}
                </p>
              </div>
            </div>

            <DropdownMenuSeparator className="my-1.5" />

            <DropdownMenuItem
              onClick={() => navigate({ to: "/profile" })}
              className="h-11 cursor-pointer gap-3 rounded-lg px-3 text-sm md:h-10 [&>svg]:size-[18px]"
            >
              <UserIcon className="text-muted-foreground" />
              {t("nav.myProfile")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => navigate({ to: "/preferences" })}
              className="h-11 cursor-pointer gap-3 rounded-lg px-3 text-sm md:h-10 [&>svg]:size-[18px]"
            >
              <Languages className="text-muted-foreground" />
              {t("nav.preferences")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => navigate({ to: "/id-card" })}
              className="h-11 cursor-pointer gap-3 rounded-lg px-3 text-sm md:h-10 [&>svg]:size-[18px]"
            >
              <IdCard className="text-muted-foreground" />
              {t("nav.idCard")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => navigate({ to: "/notifications" })}
              className="h-11 cursor-pointer gap-3 rounded-lg px-3 text-sm md:h-10 [&>svg]:size-[18px]"
            >
              <Bell className="text-muted-foreground" />
              <span className="flex-1">{t("common.notifications")}</span>
              {notificationCount > 0 && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold leading-4 text-primary-foreground">
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
              className="h-11 cursor-pointer gap-3 rounded-lg px-3 text-sm md:h-10 [&>svg]:size-[18px]"
            >
              <RefreshCw className={cn("text-muted-foreground", refreshing && "animate-spin")} />
              {refreshing ? t("common.loading") : t("common.refresh")}
            </DropdownMenuItem>

            <div
              className="flex h-11 items-center gap-3 rounded-lg px-3 text-sm md:h-10"
              onPointerDown={(event) => event.preventDefault()}
            >
              {darkMode ? (
                <Moon className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
              ) : (
                <Sun className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1">{t("common.darkMode")}</span>
              <Switch
                checked={darkMode}
                onCheckedChange={handleDarkModeToggle}
                aria-label={darkMode ? t("common.lightMode") : t("common.darkMode")}
              />
            </div>

            <DropdownMenuSeparator className="my-1.5" />

            <DropdownMenuItem
              onClick={() => {
                logout();
                navigate({ to: "/login" });
              }}
              className="h-11 cursor-pointer gap-3 rounded-lg px-3 text-sm text-destructive focus:bg-destructive/10 focus:text-destructive md:h-10 [&>svg]:size-[18px]"
            >
              <LogOut />
              {t("common.signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </header>
  );
}
