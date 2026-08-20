import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Bell, Check, CircleAlert, LoaderCircle, LocateFixed } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { enableDesktopAlerts, getNotificationPermission } from "@/lib/browser-notifications";
import {
  blockedPermissionHint,
  readLocationPermission,
  type DevicePermissionState,
} from "@/lib/device-permissions";
import { getDeviceLocation } from "@/lib/geolocation";
import { isNativeApp } from "@/lib/native-app";
import { cn } from "@/lib/utils";

/** Attendance / location-dependent flows dispatch this to open the explanation sheet. */
export const LOCATION_PERMISSION_EVENT = "atd:open-location-permission";

/** Open the precise-location explanation sheet (attendance only — never auto on login). */
export function openLocationPermissionSetup() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LOCATION_PERMISSION_EVENT));
}

function isAttendanceRelatedPath(pathname: string) {
  return (
    pathname === "/dashboard" ||
    pathname.startsWith("/attendance") ||
    pathname.startsWith("/face")
  );
}

function StatusPill({ state }: { state: DevicePermissionState }) {
  const { t } = useTranslation();
  if (state === "granted") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
        <Check className="h-3 w-3" />
        {t("pages.shell.statusOn")}
      </span>
    );
  }
  if (state === "denied") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/12 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
        <CircleAlert className="h-3 w-3" />
        {t("pages.shell.statusBlocked")}
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
      {t("pages.shell.statusNeeded")}
    </span>
  );
}

export function PermissionSetup() {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState<DevicePermissionState>("prompt");
  const [notifications, setNotifications] = useState(getNotificationPermission);
  const [requesting, setRequesting] = useState<"location" | "notifications" | null>(null);
  const [nativeShell, setNativeShell] = useState(false);

  const refresh = useCallback(async () => {
    setLocation(await readLocationPermission());
    setNotifications(getNotificationPermission());
  }, []);

  useEffect(() => {
    setNativeShell(isNativeApp());
  }, []);

  // Contextual open only — never auto-prompt after login / on unrelated routes.
  useEffect(() => {
    if (nativeShell) return;
    const onRequest = () => {
      void (async () => {
        await refresh();
        setOpen(true);
      })();
    };
    window.addEventListener(LOCATION_PERMISSION_EVENT, onRequest);
    return () => window.removeEventListener(LOCATION_PERMISSION_EVENT, onRequest);
  }, [nativeShell, refresh]);

  // Drop the sheet when leaving attendance-related surfaces so it cannot
  // stack under Organization / Create Login / etc.
  useEffect(() => {
    if (!open) return;
    if (!isAttendanceRelatedPath(pathname)) {
      setOpen(false);
    }
  }, [pathname, open]);

  useEffect(() => {
    if (nativeShell || !open) return;
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [nativeShell, open, refresh]);

  const close = () => {
    setOpen(false);
  };

  const locationReady = location === "granted";
  const locationBlocked = location === "denied";

  const onAllowLocation = async () => {
    setRequesting("location");
    try {
      await getDeviceLocation({ allowRecent: false });
      toast.success(t("pages.shell.locationOnToast"));
      close();
    } catch (error) {
      toast.error((error as Error).message || blockedPermissionHint("location"));
    } finally {
      await refresh();
      setRequesting(null);
    }
  };

  const onAllowNotifications = async () => {
    setRequesting("notifications");
    try {
      await enableDesktopAlerts();
      toast.success(t("pages.shell.notificationsOnToast"));
    } catch (error) {
      toast.error((error as Error).message || t("pages.shell.notificationsNotAllowed"));
    } finally {
      await refresh();
      setRequesting(null);
    }
  };

  const rows = useMemo(
    () =>
      [
        {
          key: "location" as const,
          title: t("pages.shell.preciseLocation"),
          blurb: t("pages.shell.preciseLocationBlurb"),
          state: location,
          required: true,
        },
        {
          key: "notifications" as const,
          title: t("pages.shell.notificationsTitle"),
          blurb: t("pages.shell.notificationsBlurb"),
          state: notifications as DevicePermissionState,
          required: false,
        },
      ] as const,
    [location, notifications, t],
  );

  // Native shell: Capacitor requests location at the attendance action itself.
  if (nativeShell) return null;

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <SheetContent
        side="bottom"
        className="max-h-[min(34rem,calc(100dvh-env(safe-area-inset-top)-0.75rem))] gap-0 rounded-t-3xl border-border/70 p-0 pb-[var(--atd-sab)]"
      >
        <div className="px-5 pb-2 pt-5 sm:px-6">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" aria-hidden />
          <SheetHeader className="space-y-1.5 text-left">
            <SheetTitle className="text-xl tracking-tight">{t("pages.shell.permissionTitle")}</SheetTitle>
            <SheetDescription className="text-sm leading-relaxed">
              {t("pages.shell.permissionHelp")}
            </SheetDescription>
          </SheetHeader>
        </div>

        <ul className="space-y-2.5 px-5 py-3 sm:px-6">
          {rows.map((item) => {
            const done = item.state === "granted";
            const denied = item.state === "denied";
            return (
              <li
                key={item.key}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border px-3.5 py-3",
                  done
                    ? "border-emerald-500/25 bg-emerald-500/[0.06]"
                    : denied
                      ? "border-amber-500/30 bg-amber-500/[0.06]"
                      : "border-border/80 bg-card",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl",
                    done
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : "bg-primary/10 text-primary",
                  )}
                >
                  {item.key === "location" ? (
                    <LocateFixed className="h-5 w-5" />
                  ) : (
                    <Bell className="h-5 w-5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold tracking-tight">{item.title}</p>
                    <StatusPill state={item.state} />
                    {!item.required && (
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {t("common.optional")}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{item.blurb}</p>
                </div>
                {item.key === "notifications" && !done && !denied ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1 shrink-0"
                    disabled={requesting !== null}
                    onClick={() => void onAllowNotifications()}
                  >
                    {requesting === "notifications" ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      t("pages.shell.allow")
                    )}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>

        {locationBlocked && (
          <p className="mx-5 rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-100 sm:mx-6">
            {blockedPermissionHint("location")}
          </p>
        )}

        <SheetFooter className="flex-col gap-2 px-5 py-4 sm:flex-col sm:px-6">
          {!locationReady && !locationBlocked && (
            <Button
              className="h-12 w-full text-base"
              disabled={requesting !== null}
              onClick={() => void onAllowLocation()}
            >
              {requesting === "location" ? (
                <>
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  {t("pages.shell.waitingForPrompt")}
                </>
              ) : (
                t("pages.shell.allowLocation")
              )}
            </Button>
          )}
          <Button
            variant="outline"
            className="h-11 w-full"
            onClick={close}
            disabled={requesting !== null}
          >
            {locationReady ? t("pages.shell.continue") : t("pages.shell.notNow")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
