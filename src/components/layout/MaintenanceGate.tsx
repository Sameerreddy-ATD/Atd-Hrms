import { useEffect, useState } from "react";
import {
  clearMaintenance,
  DEFAULT_MAINTENANCE_MESSAGE,
  getMaintenanceInfo,
  MUTATION_MAINTENANCE_MESSAGE,
  probeMaintenanceCleared,
  subscribeMaintenance,
  type MaintenanceInfo,
} from "@/lib/maintenance";
import { API_BASE } from "@/services/api";

/**
 * Full-screen maintenance overlay. Preserves auth/session; does not navigate to login.
 */
export function MaintenanceGate() {
  const [info, setInfo] = useState<MaintenanceInfo>(() => getMaintenanceInfo());
  const [checking, setChecking] = useState(false);

  useEffect(() => subscribeMaintenance(setInfo), []);

  if (!info.active) return null;

  const body = info.fromMutation
    ? MUTATION_MAINTENANCE_MESSAGE
    : info.message || DEFAULT_MAINTENANCE_MESSAGE;

  async function onTryAgain() {
    setChecking(true);
    try {
      const cleared = await probeMaintenanceCleared(API_BASE);
      if (cleared) {
        clearMaintenance();
        // Soft refresh data without forcing logout.
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("atd:maintenance-cleared"));
        }
      }
    } finally {
      setChecking(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[13000] flex items-center justify-center bg-background/95 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="atd-maintenance-title"
      aria-describedby="atd-maintenance-desc"
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-lg">
        <img
          src="/atd-app-icon.png"
          alt=""
          width={52}
          height={52}
          className="mx-auto mb-4 h-[52px] w-[52px] object-contain"
        />
        <h1
          id="atd-maintenance-title"
          className="text-xl font-semibold tracking-tight text-foreground"
        >
          Application Update in Progress
        </h1>
        <p id="atd-maintenance-desc" className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {body}
        </p>
        {!info.fromMutation ? (
          <p className="mt-2 text-sm text-muted-foreground">Thank you for your patience.</p>
        ) : null}
        <button
          type="button"
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
          onClick={() => void onTryAgain()}
          disabled={checking}
          autoFocus
        >
          {checking ? "Checking…" : "Try Again"}
        </button>
        <p className="mt-4 text-[0.7rem] uppercase tracking-wider text-muted-foreground">
          AnyTime Diesel Workforce
        </p>
      </div>
    </div>
  );
}
