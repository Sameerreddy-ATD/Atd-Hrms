import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Camera,
  Check,
  CircleAlert,
  LoaderCircle,
  LocateFixed,
  LockKeyhole,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { enableDesktopAlerts, getNotificationPermission } from "@/lib/browser-notifications";
import { getDeviceLocation } from "@/lib/geolocation";
import { detectPwaPlatform } from "@/lib/pwa-install";
import { cn } from "@/lib/utils";

type PermissionState = PermissionStatus["state"] | NotificationPermission | "unsupported";
type PermissionKey = "location" | "notifications" | "camera";

/** Bump when the setup checklist changes so existing devices see the new flow once. */
const DISMISSED_KEY = "adh_permission_setup_dismissed_v3";

async function readLocationPermission(): Promise<PermissionState> {
  if (!("geolocation" in navigator)) return "unsupported";
  if (!("permissions" in navigator)) return "prompt";
  try {
    return (await navigator.permissions.query({ name: "geolocation" })).state;
  } catch {
    return "prompt";
  }
}

async function readCameraPermission(): Promise<PermissionState> {
  if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
  if (!("permissions" in navigator)) return "prompt";
  try {
    return (await navigator.permissions.query({ name: "camera" as PermissionName })).state;
  } catch {
    return "prompt";
  }
}

async function requestCameraAccess() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera is not supported on this device.");
  }
  if (!window.isSecureContext) {
    throw new Error("Camera needs HTTPS. Open the app with your secure domain.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: "user" },
  });
  stream.getTracks().forEach((track) => track.stop());
}

function StatusPill({ state }: { state: PermissionState }) {
  if (state === "granted") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
        <Check className="h-3 w-3" />
        Allowed
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
  if (state === "unsupported") {
    return (
      <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
        Unavailable
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
  const [location, setLocation] = useState<PermissionState>("prompt");
  const [notifications, setNotifications] = useState(getNotificationPermission);
  const [camera, setCamera] = useState<PermissionState>("prompt");
  const [requesting, setRequesting] = useState<PermissionKey | "all" | null>(null);
  const isAndroid = useMemo(() => detectPwaPlatform() === "android", []);

  const refresh = useCallback(async () => {
    const [nextLocation, nextCamera] = await Promise.all([
      readLocationPermission(),
      readCameraPermission(),
    ]);
    setLocation(nextLocation);
    setNotifications(getNotificationPermission());
    setCamera(nextCamera);
  }, []);

  useEffect(() => {
    const dismissed = window.localStorage.getItem(DISMISSED_KEY) === "true";
    if (!dismissed) setOpen(true);
    void refresh();
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const close = () => {
    window.localStorage.setItem(DISMISSED_KEY, "true");
    setOpen(false);
  };

  const insecure = typeof window !== "undefined" && !window.isSecureContext;
  const items = useMemo(
    () =>
      [
        {
          key: "location" as const,
          title: "Location",
          blurb: "Precise GPS for check-in and check-out",
          state: location,
          icon: LocateFixed,
        },
        {
          key: "camera" as const,
          title: "Camera",
          blurb: "Face verification when attendance security is on",
          state: camera,
          icon: Camera,
        },
        {
          key: "notifications" as const,
          title: "Notifications",
          blurb: "Leave, tasks, and important company alerts",
          state: notifications,
          icon: Bell,
        },
      ] as const,
    [location, camera, notifications],
  );

  const required = items.filter((item) => item.state !== "unsupported");
  const grantedCount = required.filter((item) => item.state === "granted").length;
  const allReady = required.length > 0 && grantedCount === required.length;
  const blocked = required.some((item) => item.state === "denied");
  const progress = required.length ? Math.round((grantedCount / required.length) * 100) : 100;

  const requestOne = async (key: PermissionKey) => {
    if (key === "location") {
      await getDeviceLocation({ allowRecent: false });
      toast.success("Location enabled");
      return;
    }
    if (key === "camera") {
      await requestCameraAccess();
      toast.success("Camera enabled");
      return;
    }
    await enableDesktopAlerts();
    toast.success("Notifications enabled");
  };

  const onAllow = async (key: PermissionKey) => {
    setRequesting(key);
    try {
      await requestOne(key);
    } catch (error) {
      toast.error(
        (error as Error).message ||
          "Permission was not allowed. Enable it in this site’s settings, then try again.",
      );
    } finally {
      await refresh();
      setRequesting(null);
    }
  };

  const onAllowAll = async () => {
    setRequesting("all");
    const pending = required.filter((item) => item.state === "prompt" || item.state === "granted");
    const requests = isAndroid
      ? pending.filter((item) => item.state !== "granted").slice(0, 1)
      : pending;
    for (const item of requests) {
      if (item.state === "granted") continue;
      try {
        await requestOne(item.key);
      } catch {
        /* continue others; refresh shows blocked state */
      }
      await refresh();
    }
    setRequesting(null);
    await refresh();
  };

  const pendingCount = required.filter((item) => item.state === "prompt").length;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogContent className="w-[calc(100%-1.25rem)] max-w-md overflow-hidden border-border/70 p-0 sm:max-w-lg">
        <div className="relative overflow-hidden border-b border-border/70 bg-[radial-gradient(ellipse_120%_90%_at_0%_0%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_55%),linear-gradient(180deg,color-mix(in_oklab,var(--primary)_6%,var(--background)),var(--background))] px-5 py-5 sm:px-6">
          <div className="mb-3 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/25">
              <Smartphone className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                Device readiness
              </p>
              <DialogHeader className="space-y-1 text-left">
                <DialogTitle className="text-xl tracking-tight">Set up this device</DialogTitle>
                <DialogDescription className="text-sm leading-relaxed">
                  Turn on location, camera, and notifications so attendance and alerts work on this
                  phone or laptop.
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>
                {grantedCount} of {required.length} ready
              </span>
              <span className="tabular-nums text-foreground">{progress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        <div className="space-y-3 px-5 py-4 sm:px-6 sm:py-5">
          {insecure && (
            <div className="flex gap-3 rounded-xl border border-amber-200/90 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
              <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" />
              <p>
                Open <strong>https://hrms.anytime-diesel.com</strong>. Browsers block location,
                camera, and notifications on insecure HTTP.
              </p>
            </div>
          )}

          <ul className="space-y-2.5">
            {items.map((item) => {
              const Icon = item.icon;
              const busy = requesting === item.key || requesting === "all";
              const done = item.state === "granted";
              const denied = item.state === "denied";
              const unsupported = item.state === "unsupported";
              return (
                <li
                  key={item.key}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors",
                    done
                      ? "border-emerald-500/25 bg-emerald-500/[0.06]"
                      : denied
                        ? "border-amber-500/30 bg-amber-500/[0.06]"
                        : "border-border/80 bg-card",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-10 w-10 shrink-0 place-items-center rounded-lg",
                      done
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : "bg-primary/10 text-primary",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold tracking-tight">{item.title}</p>
                      <StatusPill state={item.state} />
                    </div>
                    <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{item.blurb}</p>
                  </div>
                  {done || unsupported ? (
                    done ? (
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                        <Check className="h-4 w-4" />
                      </span>
                    ) : null
                  ) : (
                    <Button
                      size="sm"
                      className="shrink-0"
                      variant={denied ? "outline" : "default"}
                      disabled={insecure || busy || denied}
                      onClick={() => void onAllow(item.key)}
                    >
                      {busy && requesting === item.key ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : denied ? (
                        "Blocked"
                      ) : (
                        "Allow"
                      )}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>

          {blocked && (
            <p className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-100">
              A blocked permission can’t show the browser popup again. Open this site’s settings in
              your browser, enable the permission, then return here.
            </p>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            {isAndroid && pendingCount > 0 && (
              <p className="text-center text-xs leading-relaxed text-muted-foreground">
                Android opens one system permission at a time. Tap below for each instant prompt.
              </p>
            )}
            {!allReady && (
              <Button
                className="w-full"
                disabled={insecure || requesting !== null || required.every((i) => i.state !== "prompt")}
                onClick={() => void onAllowAll()}
              >
                {requesting === "all" ? (
                  <>
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                    Requesting…
                  </>
                ) : (
                  isAndroid
                    ? `Allow next permission${pendingCount > 1 ? ` (${pendingCount} left)` : ""}`
                    : "Allow all"
                )}
              </Button>
            )}
            <div className="flex w-full gap-2">
              <Button variant="outline" className="flex-1" onClick={close} disabled={requesting !== null}>
                {allReady ? "Close" : "Not now"}
              </Button>
              {allReady && (
                <Button className="flex-1" onClick={close}>
                  Continue to workspace
                </Button>
              )}
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
