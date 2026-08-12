import { useCallback, useEffect, useMemo, useState } from "react";
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
  isMobileDeviceShell,
  readLocationPermission,
  type DevicePermissionState,
} from "@/lib/device-permissions";
import { getDeviceLocation } from "@/lib/geolocation";
import { isNativeApp } from "@/lib/native-app";
import { cn } from "@/lib/utils";

const DISMISSED_KEY = "adh_permission_setup_dismissed_v5";

function StatusPill({ state }: { state: DevicePermissionState }) {
  if (state === "granted") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
        <Check className="h-3 w-3" />
        On
      </span>
    );
  }
  if (state === "denied") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/12 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
        <CircleAlert className="h-3 w-3" />
        Blocked
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
      Needed
    </span>
  );
}

export function PermissionSetup() {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState<DevicePermissionState>("prompt");
  const [notifications, setNotifications] = useState(getNotificationPermission);
  const [requesting, setRequesting] = useState<"location" | "notifications" | null>(null);

  const refresh = useCallback(async () => {
    setLocation(await readLocationPermission());
    setNotifications(getNotificationPermission());
  }, []);

  useEffect(() => {
    if (!isMobileDeviceShell()) return;
    const dismissed = window.localStorage.getItem(DISMISSED_KEY) === "true";
    let cancelled = false;
    // On native, wait until after login keyboard / route settle so the permission
    // sheet + Geolocation.checkPermissions cannot race Samsung WebView resize.
    const delayMs = isNativeApp() ? 2_500 : 0;
    const timer = window.setTimeout(() => {
      void (async () => {
        const nextLocation = await readLocationPermission();
        if (cancelled) return;
        setLocation(nextLocation);
        setNotifications(getNotificationPermission());
        if (!dismissed && nextLocation !== "granted" && nextLocation !== "unsupported") {
          setOpen(true);
        }
      })();
    }, delayMs);
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const close = () => {
    window.localStorage.setItem(DISMISSED_KEY, "true");
    setOpen(false);
  };

  const locationReady = location === "granted";
  const locationBlocked = location === "denied";

  const onAllowLocation = async () => {
    setRequesting("location");
    try {
      await getDeviceLocation({ allowRecent: false });
      toast.success("Location is on for check-in");
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
      toast.success("Notifications are on");
    } catch (error) {
      toast.error((error as Error).message || "Notifications were not allowed.");
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
          title: "Location",
          blurb: "Used only while you check in or out, to match your branch. Not used in the background.",
          state: location,
          required: true,
        },
        {
          key: "notifications" as const,
          title: "Notifications",
          blurb: "Optional alerts for leave, tasks, and company updates. You can skip this.",
          state: notifications as DevicePermissionState,
          required: false,
        },
      ] as const,
    [location, notifications],
  );

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <SheetContent
        side="bottom"
        className="max-h-[min(34rem,calc(100dvh-env(safe-area-inset-top)-0.75rem))] gap-0 rounded-t-3xl border-border/70 p-0"
      >
        <div className="px-5 pb-2 pt-5 sm:px-6">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" aria-hidden />
          <SheetHeader className="space-y-1.5 text-left">
            <SheetTitle className="text-xl tracking-tight">Allow location for check-in</SheetTitle>
            <SheetDescription className="text-sm leading-relaxed">
              Anytime Workforce asks for GPS only when you mark attendance. Camera is requested later,
              and only if Face Security is enabled for your account.
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
                      <span className="text-[11px] font-medium text-muted-foreground">Optional</span>
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
                      "Allow"
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
                  Waiting for system prompt…
                </>
              ) : (
                "Allow location"
              )}
            </Button>
          )}
          <Button variant="outline" className="h-11 w-full" onClick={close} disabled={requesting !== null}>
            {locationReady ? "Continue" : "Not now"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
