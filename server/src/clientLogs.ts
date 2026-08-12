import { createHash } from "node:crypto";
import type { Express, Request } from "express";
import rateLimit from "express-rate-limit";
import { Role } from "@prisma/client";
import { z } from "zod";
import { asyncHandler } from "./errors.js";
import { prisma } from "./prisma.js";
import { requireAuth, requireRoles } from "./rbac.js";
import { config } from "./config.js";
import { verifyAccessToken } from "./security.js";

// Field caps keep a malicious/buggy client from writing huge rows.
const MAX_MESSAGE = 2000;
const MAX_STACK = 8000;
const MAX_UA = 512;
const MAX_PATH = 512;

function clip(value: string | null | undefined, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/** Hash the client IP with a server secret so we can group/triage without storing PII. */
function hashIp(req: Request): string | null {
  if (!req.ip) return null;
  return createHash("sha256").update(`${config.accessSecret}:${req.ip}`).digest("hex");
}

const clientErrorSchema = z.object({
  kind: z.enum(["error", "unhandledrejection", "route-boundary", "manual"]).default("error"),
  message: z.string().min(1).max(MAX_MESSAGE),
  stack: z.string().max(50_000).optional().nullable(),
  path: z.string().max(2000).optional().nullable(),
  appBuildId: z.string().max(64).optional().nullable(),
  platform: z.enum(["ios", "android", "web"]).optional().nullable(),
  isNative: z.boolean().optional().default(false),
  userAgent: z.string().max(2000).optional().nullable(),
  viewport: z.string().max(24).optional().nullable(),
  occurredAt: z.coerce.date().optional().nullable(),
});

export function registerClientLogRoutes(app: Express) {
  // Tight IP-based limiter so an unauthenticated endpoint can't flood the DB.
  const ingestLimiter = rateLimit({
    windowMs: Number(process.env.CLIENT_LOG_RATE_LIMIT_WINDOW_MS ?? 5 * 60 * 1000),
    limit: Number(process.env.CLIENT_LOG_RATE_LIMIT_MAX ?? 40),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many error reports. Slow down." },
  });

  // Ingest is intentionally UNAUTHENTICATED so pre-login / crash-on-boot reports are
  // captured. The global CSRF guard still restricts POSTs to our own FRONTEND_ORIGIN.
  app.post(
    "/client-logs",
    ingestLimiter,
    asyncHandler(async (req, res) => {
      const body = clientErrorSchema.parse(req.body ?? {});

      // Best-effort attribution: attach userId/role only if a valid session cookie exists.
      let userId: string | null = null;
      let role: string | null = null;
      const token = req.cookies?.[config.sessionCookie];
      if (token) {
        try {
          const session = verifyAccessToken(token);
          userId = session.id ?? null;
          role = session.role ?? null;
        } catch {
          // Expired/invalid token — still store the report anonymously.
        }
      }

      await prisma.clientErrorLog.create({
        data: {
          kind: body.kind,
          message: clip(body.message, MAX_MESSAGE) ?? "(empty)",
          stack: clip(body.stack, MAX_STACK),
          path: clip(body.path, MAX_PATH),
          appBuildId: clip(body.appBuildId, 64),
          platform: body.platform ?? null,
          isNative: body.isNative ?? false,
          userAgent: clip(body.userAgent ?? req.get("user-agent"), MAX_UA),
          viewport: clip(body.viewport, 24),
          userId,
          role,
          ipHash: hashIp(req),
          occurredAt: body.occurredAt ?? null,
        },
      });

      res.status(204).end();
    }),
  );

  // View: developer/admin only, paginated + filterable.
  app.get(
    "/client-logs",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const take = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
      const skip = Math.max(Number(req.query.offset) || 0, 0);
      const where: Record<string, unknown> = {};
      if (typeof req.query.platform === "string") where.platform = req.query.platform;
      if (typeof req.query.appBuildId === "string") where.appBuildId = req.query.appBuildId;
      if (req.query.resolved === "true") where.resolved = true;
      if (req.query.resolved === "false") where.resolved = false;
      const [rows, total] = await Promise.all([
        prisma.clientErrorLog.findMany({ where, orderBy: { createdAt: "desc" }, take, skip }),
        prisma.clientErrorLog.count({ where }),
      ]);
      res.json({ total, rows });
    }),
  );

  // Triage: mark a report resolved/unresolved (developer/admin only).
  app.patch(
    "/client-logs/:id/resolve",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const resolved = z.object({ resolved: z.boolean() }).parse(req.body).resolved;
      const row = await prisma.clientErrorLog.update({
        where: { logId: String(req.params.id) },
        data: { resolved },
      });
      res.json(row);
    }),
  );
}

/** Delete client error logs older than the retention window. */
export async function purgeOldClientErrorLogs(
  retentionDays = Number(process.env.CLIENT_LOG_RETENTION_DAYS ?? 90),
) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  await prisma.clientErrorLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
}

export function startClientLogRetentionScheduler() {
  const run = () =>
    void purgeOldClientErrorLogs().catch((error) =>
      console.error("client-log purge failed", error),
    );
  run();
  setInterval(run, 24 * 60 * 60 * 1000).unref();
}
