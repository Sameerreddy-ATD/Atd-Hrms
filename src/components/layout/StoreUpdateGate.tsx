import { useCallback, useEffect, useState } from "react";
import { App as CapApp } from "@capacitor/app";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isNativeApp } from "@/lib/native-app";
import { checkNativeStoreUpdate, openPlayStoreListing, type StoreUpdateStatus } from "@/lib/store-update";

/**
 * Play Store shell only. When a newer AAB is live, block the outdated native
 * build and send the user to Play so attendance / notifications keep working.
 */
export function StoreUpdateGate() {
  const [update, setUpdate] = useState<StoreUpdateStatus | null>(null);

  const refresh = useCallback(async () => {
    if (!isNativeApp()) {
      setUpdate(null);
      return;
    }
    const next = await checkNativeStoreUpdate().catch(() => null);
    setUpdate(next);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    if (!isNativeApp()) return;
    let handle: { remove: () => Promise<void> } | undefined;
    void CapApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) void refresh();
    }).then((listener) => {
      handle = listener;
    });
    return () => {
      void handle?.remove();
    };
  }, [refresh]);

  useEffect(() => {
    if (!update?.needed) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [update?.needed]);

  if (!update?.needed) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-foreground/65 p-3 pt-[max(0.75rem,var(--atd-sat))] pb-[max(0.75rem,var(--atd-sab))] sm:items-center"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="store-update-title"
      aria-describedby="store-update-copy"
    >
      <div className="w-full max-w-md rounded-3xl border border-border/80 bg-background p-5 shadow-2xl sm:p-6">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10">
          <img src="/atd-mark.png" alt="" className="h-8 w-8 object-contain" />
        </div>
        <h2 id="store-update-title" className="text-center text-xl font-semibold tracking-tight">
          Update Anytime Workforce
        </h2>
        <p id="store-update-copy" className="mt-2 text-center text-sm leading-relaxed text-muted-foreground">
          A newer app is on Google Play. Update now so attendance, notifications, and the latest
          fixes work on this phone.
        </p>
        <p className="mt-3 text-center text-xs font-medium text-muted-foreground">
          Installed {update.installedVersion || update.installedBuild} → {update.latestVersion}
        </p>
        <Button
          className="mt-5 h-12 w-full text-base"
          onClick={() => openPlayStoreListing(update.playStoreUrl)}
        >
          <Download className="h-4 w-4" />
          Update on Play Store
        </Button>
        {!update.required ? (
          <Button variant="ghost" className="mt-2 h-11 w-full" onClick={() => setUpdate(null)}>
            Not now
          </Button>
        ) : null}
      </div>
    </div>
  );
}
