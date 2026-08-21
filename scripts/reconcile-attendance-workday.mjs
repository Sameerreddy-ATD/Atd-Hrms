/**
 * Manual Attendance Workday reconcile (sessions rebuilt from punch evidence).
 *
 * NOT auto-run on server boot. Operators / migration rehearsal only.
 *
 * Usage:
 *   npx tsx scripts/reconcile-attendance-workday.mjs <employeeId> <YYYY-MM-DD>
 *
 * Example:
 *   npx tsx scripts/reconcile-attendance-workday.mjs emp_abc123 2026-08-21
 */
import { reconcileAttendanceWorkday } from "../server/src/attendanceWorkday.ts";
import { prisma } from "../server/src/prisma.ts";

const [, , employeeId, workDate] = process.argv;

if (!employeeId || !workDate || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
  console.error(
    "Usage: npx tsx scripts/reconcile-attendance-workday.mjs <employeeId> <YYYY-MM-DD>",
  );
  process.exit(1);
}

try {
  const result = await reconcileAttendanceWorkday(employeeId, workDate);
  console.log(
    JSON.stringify(
      {
        employeeId,
        workDate,
        workdayId: result.workday.workdayId,
        status: result.workday.status,
        sessionCount: result.sessions.length,
        eventCount: result.eventCount,
        actualWorkedMinutes: result.workday.actualWorkedMinutes,
        sessions: result.sessions.map((s) => ({
          sessionId: s.sessionId,
          sequence: s.sequence,
          status: s.status,
          checkInAt: s.checkInAt,
          checkOutAt: s.checkOutAt,
          workedMinutes: s.workedMinutes,
        })),
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
