import type { NextFunction, Request, Response } from "express";
import {
  isMaintenanceExemptPath,
  maintenanceApiPayload,
  MAINTENANCE_CODE,
  readMaintenanceState,
} from "./maintenance.js";

/**
 * Early middleware: block app traffic with structured 503 while preserving sessions.
 * Mutations are rejected before handlers run (no partial processing).
 */
export function maintenanceMiddleware(req: Request, res: Response, next: NextFunction) {
  if (isMaintenanceExemptPath(req.path)) return next();

  const state = readMaintenanceState();
  if (!state.enabled) return next();

  const payload = {
    ...maintenanceApiPayload(state),
    maintenance: true as const,
    code: MAINTENANCE_CODE,
    message: state.message,
    retryAfterSeconds: state.retryAfterSeconds,
    // Distinct from auth failures — clients must not treat this as logout.
    error: state.message,
  };

  res.setHeader("Retry-After", String(state.retryAfterSeconds));
  res.setHeader("Cache-Control", "no-store");
  return res.status(503).json(payload);
}
