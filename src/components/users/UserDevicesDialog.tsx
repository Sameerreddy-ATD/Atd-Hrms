import { useCallback, useEffect, useState } from "react";
import { Laptop, Loader2, LogOut, Smartphone, Tablet, MonitorSmartphone } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usersApi } from "@/services/api";
import type { User, UserSessionEntry, UserSessionList } from "@/types/domain";

function PlatformIcon({ platform }: { platform: string | null }) {
  const label = (platform ?? "").toLowerCase();
  const className = "h-4 w-4 shrink-0 text-muted-foreground";
  if (label.includes("ipad")) return <Tablet className={className} aria-hidden />;
  if (label.includes("android") || label.includes("iphone") || label.includes("ios"))
    return <Smartphone className={className} aria-hidden />;
  if (label.includes("mac") || label.includes("windows") || label.includes("linux"))
    return <Laptop className={className} aria-hidden />;
  return <MonitorSmartphone className={className} aria-hidden />;
}

function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export function UserDevicesDialog({
  user,
  onOpenChange,
  onCountChange,
}: {
  user: User | null;
  onOpenChange: (open: boolean) => void;
  onCountChange?: (userId: string, count: number) => void;
}) {
  const [data, setData] = useState<UserSessionList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const userId = user?.id ?? null;

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await usersApi.sessions(userId);
      setData(result);
      onCountChange?.(userId, result.activeDeviceCount);
    } catch (err) {
      setError((err as Error).message || "Could not load the device list");
    } finally {
      setLoading(false);
    }
  }, [userId, onCountChange]);

  useEffect(() => {
    if (!userId) {
      setData(null);
      setError(null);
      return;
    }
    void load();
  }, [userId, load]);

  async function signOutDevice(session: UserSessionEntry) {
    if (!userId) return;
    setRevoking(session.sessionId);
    try {
      await usersApi.revokeSession(userId, session.sessionId);
      toast.success(`Signed out ${session.platform ?? "device"}`);
      await load();
    } catch (err) {
      toast.error((err as Error).message || "Could not sign out that device");
    } finally {
      setRevoking(null);
    }
  }

  async function signOutEverywhere() {
    if (!userId) return;
    setRevoking("all");
    try {
      await usersApi.revokeAllSessions(userId);
      toast.success("Signed out of all devices");
      await load();
    } catch (err) {
      toast.error((err as Error).message || "Could not sign out all devices");
    } finally {
      setRevoking(null);
    }
  }

  const sessions = data?.sessions ?? [];

  return (
    <Dialog open={Boolean(user)} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b px-4 py-4 sm:px-6">
          <DialogTitle>Signed-in devices</DialogTitle>
          <DialogDescription>
            {user?.name} can stay signed in on several devices at once. Signing a device out does
            not affect the others.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading devices…
            </div>
          )}

          {!loading && error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
              <p className="font-medium text-destructive">{error}</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => void load()}>
                Try again
              </Button>
            </div>
          )}

          {!loading && !error && sessions.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              This account is not signed in on any device right now.
            </p>
          )}

          {!loading && !error && sessions.length > 0 && (
            <ul className="space-y-2">
              {sessions.map((session) => (
                <li
                  key={session.sessionId}
                  className="rounded-lg border border-border bg-background p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2">
                      <PlatformIcon platform={session.platform} />
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                          <span className="truncate">{session.platform ?? "Unknown device"}</span>
                          {session.isCurrentDevice && (
                            <Badge variant="secondary" className="shrink-0">
                              This device
                            </Badge>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Active {relativeTime(session.lastSeenAt)}
                          {session.ipAddress ? ` · ${session.ipAddress}` : ""}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11 shrink-0 sm:min-h-9"
                      disabled={revoking !== null}
                      onClick={() => void signOutDevice(session)}
                    >
                      {revoking === session.sessionId ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <LogOut className="h-4 w-4" aria-hidden />
                      )}
                      <span className="sr-only sm:not-sr-only sm:ml-1">Sign out</span>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="gap-2 border-t px-4 py-3 sm:px-6">
          <Button
            variant="destructive"
            className="min-h-11 sm:min-h-9"
            disabled={revoking !== null || sessions.length === 0}
            onClick={() => void signOutEverywhere()}
          >
            {revoking === "all" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Sign out all devices
          </Button>
          <Button
            variant="outline"
            className="min-h-11 sm:min-h-9"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
