/**
 * File-backed maintenance mode (deployment-controlled).
 * Does not depend on MySQL — safe during migrations / restarts.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

export const MAINTENANCE_CODE = "APP_UPDATE_IN_PROGRESS" as const;

export type MaintenanceState = {
  enabled: boolean;
  reason: string;
  message: string;
  retryAfterSeconds: number;
  startedAt: string | null;
  startedBy: string | null;
};

export const DEFAULT_MAINTENANCE_MESSAGE =
  "The application is being updated by the developer. Please try again after 5–10 minutes.";

const DEFAULT_STATE: MaintenanceState = {
  enabled: false,
  reason: "DEPLOYMENT",
  message: DEFAULT_MAINTENANCE_MESSAGE,
  retryAfterSeconds: 600,
  startedAt: null,
  startedBy: null,
};

/** Prefer shared path outside release tree; fall back to repo-local shared/. */
export function resolveMaintenancePaths(cwd = process.cwd()) {
  const fromEnv = process.env.MAINTENANCE_FILE?.trim();
  if (fromEnv) {
    return { jsonPath: fromEnv, flagPath: fromEnv.replace(/\.json$/i, ".on"), sharedDir: dirname(fromEnv) };
  }

  const prodShared = "/opt/anytime-crew-hub/shared";
  const prodJson = join(prodShared, "maintenance.json");
  if (existsSync(prodShared) || existsSync(prodJson)) {
    return { jsonPath: prodJson, flagPath: join(prodShared, "maintenance.on"), sharedDir: prodShared };
  }

  const localShared = join(cwd, "shared");
  const localJson = join(localShared, "maintenance.json");
  return { jsonPath: localJson, flagPath: join(localShared, "maintenance.on"), sharedDir: localShared };
}

function parseState(raw: unknown): MaintenanceState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_STATE };
  const row = raw as Record<string, unknown>;
  return {
    enabled: Boolean(row.enabled),
    reason: typeof row.reason === "string" && row.reason ? row.reason : DEFAULT_STATE.reason,
    message:
      typeof row.message === "string" && row.message.trim()
        ? row.message.trim()
        : DEFAULT_MAINTENANCE_MESSAGE,
    retryAfterSeconds:
      typeof row.retryAfterSeconds === "number" && row.retryAfterSeconds > 0
        ? Math.floor(row.retryAfterSeconds)
        : 600,
    startedAt: typeof row.startedAt === "string" ? row.startedAt : null,
    startedBy: typeof row.startedBy === "string" ? row.startedBy : null,
  };
}

let cache: { at: number; state: MaintenanceState; path: string } | null = null;
const CACHE_MS = 1_000;

export function readMaintenanceState(cwd = process.cwd()): MaintenanceState {
  const { jsonPath, flagPath } = resolveMaintenancePaths(cwd);
  const now = Date.now();
  if (cache && cache.path === jsonPath && now - cache.at < CACHE_MS) {
    return cache.state;
  }

  let state = { ...DEFAULT_STATE };
  try {
    if (existsSync(jsonPath)) {
      state = parseState(JSON.parse(readFileSync(jsonPath, "utf8")));
    }
  } catch {
    state = { ...DEFAULT_STATE };
  }

  // Flag file alone can enable maintenance (Caddy-friendly).
  if (!state.enabled && existsSync(flagPath)) {
    state = {
      ...state,
      enabled: true,
      startedAt: state.startedAt ?? new Date().toISOString(),
      startedBy: state.startedBy ?? "flag-file",
    };
  }

  cache = { at: now, state, path: jsonPath };
  return state;
}

export function clearMaintenanceCache() {
  cache = null;
}

function atomicWrite(path: string, body: string) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body, { encoding: "utf8", mode: 0o644 });
  renameSync(tmp, path);
}

export function writeMaintenanceState(
  next: Partial<MaintenanceState> & { enabled: boolean },
  cwd = process.cwd(),
): MaintenanceState {
  const { jsonPath, flagPath, sharedDir } = resolveMaintenancePaths(cwd);
  mkdirSync(sharedDir, { recursive: true });
  const current = readMaintenanceState(cwd);
  const state: MaintenanceState = {
    ...current,
    ...next,
    message: (next.message ?? current.message ?? DEFAULT_MAINTENANCE_MESSAGE).trim(),
    retryAfterSeconds: next.retryAfterSeconds ?? current.retryAfterSeconds ?? 600,
    reason: next.reason ?? current.reason ?? "DEPLOYMENT",
    startedAt: next.enabled
      ? (next.startedAt ?? current.startedAt ?? new Date().toISOString())
      : null,
    startedBy: next.enabled ? (next.startedBy ?? current.startedBy ?? "deployment") : null,
  };

  atomicWrite(jsonPath, `${JSON.stringify(state, null, 2)}\n`);

  if (state.enabled) {
    writeFileSync(flagPath, "1\n", { encoding: "utf8", mode: 0o644 });
  } else if (existsSync(flagPath)) {
    try {
      unlinkSync(flagPath);
    } catch {
      /* ignore */
    }
  }

  clearMaintenanceCache();
  return state;
}

export function maintenanceApiPayload(state: MaintenanceState = readMaintenanceState()) {
  if (!state.enabled) {
    return { maintenance: false as const };
  }
  return {
    maintenance: true as const,
    code: MAINTENANCE_CODE,
    message: state.message,
    retryAfterSeconds: state.retryAfterSeconds,
  };
}

/** Paths that remain reachable during maintenance (after /api strip if any). */
export function isMaintenanceExemptPath(path: string) {
  const p = path.split("?")[0] || "/";
  return (
    p === "/health" ||
    p === "/health/db" ||
    p === "/maintenance/status" ||
    p === "/api/maintenance/status" ||
    p === "/api/health" ||
    p === "/api/health/db" ||
    p.startsWith("/health/") ||
    p.startsWith("/api/health/")
  );
}
