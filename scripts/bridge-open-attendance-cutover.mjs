/**
 * Production cutover ONLY: bridge current open legacy punches into OPEN Workday Sessions.
 * Does not alter raw event timestamps/sources/branchIds. Does not create synthetic OUT.
 * Does not backfill historical closed days.
 *
 * Usage (on production, after migrate deploy, maintenance ON):
 *   npx tsx scripts/bridge-open-attendance-cutover.mjs
 */
import { EventType } from "@prisma/client";
import { prisma } from "../server/src/prisma.ts";
import { reconcileAttendanceWorkday, workDateIso } from "../server/src/attendanceWorkday.ts";
import { isCheckInEvent, punchEventTypes } from "../server/src/attendanceEventTypes.ts";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    select: { employeeId: true },
  });

  const open = [];

  for (const emp of employees) {
    const latest = await prisma.attendanceEvent.findFirst({
      where: {
        employeeId: emp.employeeId,
        eventType: { in: punchEventTypes },
      },
      orderBy: { eventTime: "desc" },
      select: {
        eventId: true,
        eventType: true,
        eventDate: true,
        eventTime: true,
        employeeId: true,
      },
    });
    if (latest && isCheckInEvent(latest.eventType)) {
      open.push({
        employeeId: latest.employeeId,
        eventId: latest.eventId,
        eventDate: latest.eventDate,
        eventTime: latest.eventTime,
      });
    }
  }

  console.log(JSON.stringify({ dryRun, openCount: open.length }, null, 2));

  let reconciled = 0;
  let failed = 0;
  const failures = [];

  for (const row of open) {
    try {
      if (dryRun) {
        reconciled += 1;
        continue;
      }
      const result = await reconcileAttendanceWorkday(row.employeeId, row.eventDate);
      const openSession = result.sessions.find((s) => s.status === "OPEN");
      if (!openSession) {
        throw new Error(
          `No OPEN session after reconcile for workDate ${workDateIso(row.eventDate)}`,
        );
      }
      if (openSession.checkInEventId !== row.eventId) {
        const linked = await prisma.attendanceEvent.findUnique({
          where: { eventId: openSession.checkInEventId ?? "" },
        });
        if (!linked || linked.employeeId !== row.employeeId || !isCheckInEvent(linked.eventType)) {
          throw new Error("OPEN session checkInEventId mismatch");
        }
      }
      if (openSession.checkOutAt != null || openSession.checkOutEventId != null) {
        throw new Error("OPEN session unexpectedly has checkout");
      }
      reconciled += 1;
    } catch (error) {
      failed += 1;
      failures.push({
        employeeId: row.employeeId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        OPEN_ATTENDANCE_AT_CUTOVER: open.length,
        OPEN_SESSIONS_RECONCILED: reconciled,
        OPEN_SESSIONS_FAILED: failed,
        failures: failures.slice(0, 20),
      },
      null,
      2,
    ),
  );

  if (failed > 0) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
