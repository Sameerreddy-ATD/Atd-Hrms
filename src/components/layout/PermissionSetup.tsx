import { useCallback, useEffect, useState } from "react";
import { Bell, Check, LoaderCircle, LocateFixed, LockKeyhole, ShieldCheck } from "lucide-react";
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

type PermissionState = PermissionStatus["state"] | "unsupported";

const DISMISSED_KEY = "adh_permission_setup_dismissed";

async function readLocationPermission(): Promise<PermissionState> {
  if (!("geolocation" in navigator)) return "unsupported";
  if (!("permissions" in navigator)) return "prompt";
  try {
    return (await navigator.permissions.query({ name: "geolocation" })).state;
  } catch {
    return "prompt";
  }
}

export function PermissionSetup() {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState<PermissionState>("prompt");
  const [notifications, setNotifications] = useState(getNotificationPermission);
  const [requesting, setRequesting] = useState<"location" | "notifications" | null>(null);

  const refresh = useCallback(async () => {
    setLocation(await readLocationPermission());
    setNotifications(getNotificationPermission());
  }, []);

  useEffect(() => {
    void refresh().then(() => {
      const dismissed = window.localStorage.getItem(DISMISSED_KEY) === "true";
      if (!dismissed) setOpen(true);
    });
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
  const blocked = location === "denied" || notifications === "denied";

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogContent className="w-[calc(100%-1.5rem)] max-w-lg overflow-hidden p-0">
        <div className="border-b border-border/80 bg-muted/35 px-5 py-5 sm:px-6">
          <span className="mb-3 grid h-10 w-10 place-items-center rounded-md bg-primary text-primary-foreground">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <DialogHeader className="text-left">
            <DialogTitle>Set up this device</DialogTitle>
            <DialogDescription>
              Allow the services you want to use on this phone. You can change them later in site
              settings.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-5 pb-5 sm:px-6 sm:pb-6">
          {insecure && (
            <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" />
              <p>
                Open the installed app using your HTTPS domain. Mobile browsers block reliable
                location and notifications on an HTTP address.
              </p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex min-h-28 items-start gap-3 rounded-md border border-border/80 p-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                <LocateFixed className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">Location</p>
                <p className="text-sm text-muted-foreground">
                  {location === "granted"
                    ? "Allowed"
                    : location === "denied"
                      ? "Blocked in device settings"
                      : "Required for mobile attendance"}
                </p>
              </div>
              {location === "granted" ? (
                <Check className="h-5 w-5 text-primary" />
              ) : (
                <Button
                  size="sm"
                  disabled={insecure || requesting !== null}
                  onClick={async () => {
                    setRequesting("location");
                    try {
                      await getDeviceLocation({ allowRecent: false });
                      toast.success("Location permission enabled");
                    } catch {
                      toast.error(
                        "Location was not allowed. Enable it in this app's site settings.",
                      );
                    } finally {
                      await refresh();
                      setRequesting(null);
                    }
                  }}
                >
                  {requesting === "location" ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    "Allow"
                  )}
                </Button>
              )}
            </div>

            <div className="flex min-h-28 items-start gap-3 rounded-md border border-border/80 p-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                <Bell className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">Notifications</p>
                <p className="text-sm text-muted-foreground">
                  {notifications === "granted"
                    ? "Allowed"
                    : notifications === "denied"
                      ? "Blocked in device settings"
                      : "Receive important alerts"}
                </p>
              </div>
              {notifications === "granted" ? (
                <Check className="h-5 w-5 text-primary" />
              ) : (
                <Button
                  size="sm"
                  disabled={insecure || requesting !== null}
                  onClick={async () => {
                    setRequesting("notifications");
                    try {
                      await enableDesktopAlerts();
                      toast.success("Notifications enabled");
                    } catch (error) {
                      toast.error((error as Error).message);
                    } finally {
                      await refresh();
                      setRequesting(null);
                    }
                  }}
                >
                  {requesting === "notifications" ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    "Allow"
                  )}
                </Button>
              )}
            </div>
          </div>

          {blocked && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              A blocked permission cannot show the Allow/Block popup again. Open this app's site
              settings on your phone, enable the permission, then return here.
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Not now
            </Button>
            {location === "granted" && notifications === "granted" && (
              <Button onClick={close}>Done</Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
