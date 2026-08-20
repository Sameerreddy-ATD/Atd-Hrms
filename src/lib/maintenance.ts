/** Client-side maintenance mode coordination (503 APP_UPDATE_IN_PROGRESS). */

export const MAINTENANCE_CODE = "APP_UPDATE_IN_PROGRESS" as const;

export const DEFAULT_MAINTENANCE_MESSAGE =
  "The application is being updated by the developer. Please try again after 5–10 minutes.";

export const MUTATION_MAINTENANCE_MESSAGE =
  "Application update is in progress. Your change was not submitted. Please try again after the update.";

export type MaintenanceInfo = {
  active: boolean;
  message: string;
  retryAfterSeconds: number;
  fromMutation?: boolean;
};

type Listener = (info: MaintenanceInfo) => void;

const DEFAULT_INFO: MaintenanceInfo = {
  active: false,
  message: DEFAULT_MAINTENANCE_MESSAGE,
  retryAfterSeconds: 600,
};

let current: MaintenanceInfo = { ...DEFAULT_INFO };
const listeners = new Set<Listener>();

export function getMaintenanceInfo(): MaintenanceInfo {
  return current;
}

export function isMaintenanceActive(): boolean {
  return current.active;
}

export function subscribeMaintenance(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => listeners.delete(listener);
}

function emit() {
  for (const listener of listeners) listener(current);
}

export function enterMaintenance(partial?: Partial<MaintenanceInfo>) {
  const next: MaintenanceInfo = {
    active: true,
    message: partial?.message?.trim() || current.message || DEFAULT_MAINTENANCE_MESSAGE,
    retryAfterSeconds: partial?.retryAfterSeconds ?? current.retryAfterSeconds ?? 600,
    fromMutation: Boolean(partial?.fromMutation),
  };
  // Deduplicate: same active state + same mutation flag → skip re-emit storms.
  if (
    current.active &&
    current.message === next.message &&
    current.fromMutation === next.fromMutation
  ) {
    return;
  }
  current = next;
  emit();
}

export function clearMaintenance() {
  if (!current.active) return;
  current = { ...DEFAULT_INFO };
  emit();
}

export function isMaintenancePayload(body: unknown): body is {
  maintenance: true;
  code?: string;
  message?: string;
  retryAfterSeconds?: number;
  error?: string;
} {
  if (!body || typeof body !== "object") return false;
  const row = body as Record<string, unknown>;
  if (row.maintenance === true) return true;
  if (row.code === MAINTENANCE_CODE) return true;
  return false;
}

export async function probeMaintenanceCleared(apiBase: string): Promise<boolean> {
  const urls = [
    `${apiBase}/maintenance/status`,
    `${apiBase}/health`,
    "/api/maintenance/status",
    "/api/health",
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { credentials: "include", cache: "no-store" });
      if (!res.ok) continue;
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body) continue;
      if (body.maintenance === true) return false;
      if (body.maintenance === false) return true;
      if (body.ok === true) return true;
    } catch {
      /* try next */
    }
  }
  return false;
}
