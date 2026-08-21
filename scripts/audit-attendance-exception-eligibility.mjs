#!/usr/bin/env node
/**
 * Read-only eligibility audit for Attendance Missing Check-In / Checkout.
 * Does NOT create exceptions, close sessions, or send notifications.
 *
 * Usage (local or production snapshot; never mutates):
 *   DATABASE_URL=... node scripts/audit-attendance-exception-eligibility.mjs
 */
import { PrismaClient } from "@prisma/client";

const THRESHOLD_MIN = 30;
const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const windowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const workdays = await prisma.attendanceWorkday.findMany({
    where: {
      OR: [
        { status: { in: ["OPEN", "AWAITING_CORRECTION"] } },
        { openSessionId: { not: null } },
        {
          workDate: { gte: windowStart },
          attendanceResult: { in: ["PENDING", "CORRECTION_REQUIRED"] },
        },
      ],
    },
    include: {
      sessions: { orderBy: { sequence: "asc" } },
      exceptions: {
        where: { type: { in: ["MISSING_CHECK_IN", "MISSING_CHECK_OUT"] } },
        select: { type: true, status: true, dedupeKey: true },
      },
    },
    take: 500,
  });

  let eligibleMissingCheckout = 0;
  let eligibleMissingCheckin = 0;
  const checkoutSamples = [];
  const checkinSamples = [];

  for (const wd of workdays) {
    const open = wd.sessions.find((s) => s.status === "OPEN") ?? null;
    const snap = wd.scheduleSnapshot && typeof wd.scheduleSnapshot === "object"
      ? /** @type {{ segments?: Array<{ endAt?: string; startAt?: string }>; explicitNoShift?: boolean; source?: string }} */ (
          wd.scheduleSnapshot
        )
      : {};
    const segments = Array.isArray(snap.segments) ? snap.segments : [];
    const lastSeg = segments.length ? segments[segments.length - 1] : null;
    const firstSeg = segments[0] ?? null;

    if (open && wd.scheduledEndAt) {
      const finalEnd = lastSeg?.endAt ? new Date(lastSeg.endAt) : wd.scheduledEndAt;
      const eligibleAt = new Date(finalEnd.getTime() + THRESHOLD_MIN * 60_000);
      if (now.getTime() >= eligibleAt.getTime()) {
        const already = wd.exceptions.some(
          (e) => e.type === "MISSING_CHECK_OUT" && e.status !== "RESOLVED",
        );
        if (!already) {
          eligibleMissingCheckout += 1;
          if (checkoutSamples.length < 8) {
            checkoutSamples.push({
              workdayId: wd.workdayId,
              employeeId: wd.employeeId,
              workDate: wd.workDate.toISOString().slice(0, 10),
              scheduledEndAt: finalEnd.toISOString(),
              eligibleAt: eligibleAt.toISOString(),
              sessionId: open.sessionId,
            });
          }
        }
      }
    }

    if (
      wd.sessions.length === 0 &&
      firstSeg?.startAt &&
      !snap.explicitNoShift &&
      snap.source !== "NONE" &&
      wd.scheduledEndAt
    ) {
      const missedInAt = new Date(new Date(firstSeg.startAt).getTime() + THRESHOLD_MIN * 60_000);
      const scheduleDone = now.getTime() >= wd.scheduledEndAt.getTime();
      if (now.getTime() >= missedInAt.getTime() && scheduleDone) {
        const already = wd.exceptions.some(
          (e) => e.type === "MISSING_CHECK_IN" && e.status !== "RESOLVED",
        );
        if (!already) {
          eligibleMissingCheckin += 1;
          if (checkinSamples.length < 8) {
            checkinSamples.push({
              workdayId: wd.workdayId,
              employeeId: wd.employeeId,
              workDate: wd.workDate.toISOString().slice(0, 10),
              scheduledEndAt: wd.scheduledEndAt.toISOString(),
            });
          }
        }
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        auditedAt: now.toISOString(),
        scannedWorkdays: workdays.length,
        ELIGIBLE_MISSING_CHECKOUT: eligibleMissingCheckout,
        ELIGIBLE_MISSING_CHECKIN: eligibleMissingCheckin,
        checkoutSamples,
        checkinSamples,
        note: "Read-only estimate. Detector creates/dedupes on next scheduled run after deploy.",
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
