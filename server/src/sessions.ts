import type { Request } from "express";
import { prisma } from "./prisma.js";

/** Matches the refresh cookie lifetime, so a device stays signed in for a week. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** lastSeenAt only needs to be roughly right; writing per request would add a write to every call. */
const LAST_SEEN_WRITE_INTERVAL_MS = 5 * 60 * 1000;

export type SessionRevokeReason = "LOGOUT" | "PASSWORD_CHANGE" | "ADMIN_REVOKED" | "ACCOUNT_STATUS";

/** Coarse device label for the admin device list. Never used for authorization. */
export function describePlatform(userAgent: string | undefined): string {
  const ua = (userAgent ?? "").toLowerCase();
  if (!ua) return "Unknown";
  // The Capacitor shells identify themselves before the generic mobile checks.
  if (ua.includes("anytimeworkforce") || ua.includes("capacitor")) {
    return ua.includes("iphone") || ua.includes("ipad") ? "iOS app" : "Android app";
  }
  if (ua.includes("android")) return "Android browser";
  if (ua.includes("iphone")) return "iPhone";
  if (ua.includes("ipad")) return "iPad";
  if (ua.includes("macintosh")) return "Mac";
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("linux")) return "Linux";
  return "Web";
}

export async function createSession(userId: string, sessionVersion: number, req: Request) {
  const userAgent = req.get("user-agent") ?? undefined;
  return prisma.userSession.create({
    data: {
      userId,
      sessionVersion,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      ipAddress: req.ip?.slice(0, 64) ?? null,
      userAgent: userAgent?.slice(0, 400) ?? null,
      platform: describePlatform(userAgent),
    },
  });
}

/**
 * Returns the session when it is still usable. A missing id means the token was
 * issued before per-device sessions existed, which must not be treated as valid.
 */
export async function findActiveSession(sessionId: string | undefined, userId: string) {
  if (!sessionId) return null;
  const session = await prisma.userSession.findUnique({ where: { sessionId } });
  if (!session) return null;
  if (session.userId !== userId) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  return session;
}

export async function touchSession(sessionId: string, lastSeenAt: Date) {
  if (Date.now() - lastSeenAt.getTime() < LAST_SEEN_WRITE_INTERVAL_MS) return;
  await prisma.userSession
    .update({ where: { sessionId }, data: { lastSeenAt: new Date() } })
    .catch(() => {
      // A session revoked concurrently should not fail the request it rode in on.
    });
}

/** Slides the expiry forward when a device refreshes its access token. */
export async function extendSession(sessionId: string) {
  await prisma.userSession.update({
    where: { sessionId },
    data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
}

export async function revokeSession(sessionId: string, reason: SessionRevokeReason) {
  await prisma.userSession
    .updateMany({
      where: { sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    })
    .catch(() => {});
}

/** Used by password change, deactivation, suspension, and role change. */
export async function revokeAllSessions(
  userId: string,
  reason: SessionRevokeReason,
  options: { exceptSessionId?: string } = {},
) {
  await prisma.userSession.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(options.exceptSessionId ? { sessionId: { not: options.exceptSessionId } } : {}),
    },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

export async function listActiveSessions(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sessionVersion: true },
  });
  if (!user) return [];
  return prisma.userSession.findMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      sessionVersion: user.sessionVersion,
    },
    orderBy: { lastSeenAt: "desc" },
  });
}

/** Active device counts for a set of users, in one query, for the admin list. */
export async function activeSessionCounts(users: { id: string; sessionVersion: number }[]) {
  if (users.length === 0) return new Map<string, number>();
  const rows = await prisma.userSession.groupBy({
    by: ["userId", "sessionVersion"],
    where: {
      userId: { in: users.map((user) => user.id) },
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    _count: { sessionId: true },
  });
  const currentVersion = new Map(users.map((user) => [user.id, user.sessionVersion]));
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (currentVersion.get(row.userId) !== row.sessionVersion) continue;
    counts.set(row.userId, row._count.sessionId);
  }
  return counts;
}

/** Housekeeping so the table does not grow without bound. */
export async function purgeExpiredSessions(retainDays = 30) {
  const cutoff = new Date(Date.now() - retainDays * 24 * 60 * 60 * 1000);
  const { count } = await prisma.userSession.deleteMany({
    where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] },
  });
  return count;
}
