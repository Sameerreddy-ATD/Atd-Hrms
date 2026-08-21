import { describe, expect, it } from "vitest";
import {
  attendanceResultFromWorkedMinutes,
  employeeCorrectionWindowEndsAt,
  exceptionDedupeKey,
  CORRECTION_WINDOW_DAYS,
  MISSING_CHECKOUT_THRESHOLD_MINUTES,
} from "../server/src/attendanceExceptionPolicy";
import { classifyAttendanceWorkdayInput } from "../server/src/attendanceClassification";

describe("attendance exception policy units", () => {
  it("minute bands", () => {
    expect(attendanceResultFromWorkedMinutes(0)).toBe("ABSENT");
    expect(attendanceResultFromWorkedMinutes(239)).toBe("ABSENT");
    expect(attendanceResultFromWorkedMinutes(240)).toBe("HALF_DAY");
    expect(attendanceResultFromWorkedMinutes(539)).toBe("HALF_DAY");
    expect(attendanceResultFromWorkedMinutes(540)).toBe("FULL_DAY");
  });

  it("correction window + dedupe", () => {
    expect(CORRECTION_WINDOW_DAYS).toBe(2);
    expect(MISSING_CHECKOUT_THRESHOLD_MINUTES).toBe(30);
    const start = new Date("2026-08-21T10:00:00.000Z");
    const end = employeeCorrectionWindowEndsAt(start);
    expect(end.getUTCDate()).toBe(start.getUTCDate() + 2);
    expect(exceptionDedupeKey("w1", "MISSING_CHECK_OUT")).toBe("w1|MISSING_CHECK_OUT|*");
  });

  it("open session stays pending", () => {
    const workDate = new Date("2026-08-21T00:00:00.000Z");
    const result = classifyAttendanceWorkdayInput({
      workday: {
        workdayId: "w",
        employeeId: "e",
        workDate,
        timezone: "Asia/Kolkata",
        scheduleSource: "DEFAULT",
        explicitNoShift: false,
        shiftTemplateId: null,
        shiftCodeSnapshot: null,
        shiftNameSnapshot: null,
        expectedWorkMinutes: 540,
        scheduledStartAt: new Date("2026-08-21T03:30:00.000Z"),
        scheduledEndAt: new Date("2026-08-21T12:30:00.000Z"),
        scheduleSnapshot: {
          workDate: "2026-08-21",
          timezone: "Asia/Kolkata",
          source: "DEFAULT",
          explicitNoShift: false,
          shiftTemplateId: null,
          shiftCode: null,
          shiftName: "General",
          expectedWorkMinutes: 540,
          graceInMinutes: 30,
          graceOutMinutes: 0,
          segments: [
            {
              sequence: 1,
              startAt: "2026-08-21T03:30:00.000Z",
              endAt: "2026-08-21T12:30:00.000Z",
              startMinute: 540,
              endMinute: 1080,
              endDayOffset: 0,
            },
          ],
          ownership: {
            leadMinutes: 120,
            trailMinutes: 180,
            windowStartAt: null,
            windowEndAt: null,
          },
        },
        status: "OPEN",
        actualWorkedMinutes: 0,
        firstPunchAt: new Date("2026-08-21T03:40:00.000Z"),
        lastPunchAt: null,
        openSessionId: "s1",
        attendanceResult: "PENDING",
        classificationReason: null,
        classificationVersion: 1,
        classifiedAt: null,
        correctionLockState: "OPEN",
        employeeCorrectionEndsAt: null,
        version: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      sessions: [
        {
          sessionId: "s1",
          workdayId: "w",
          employeeId: "e",
          sequence: 1,
          checkInEventId: "in1",
          checkOutEventId: null,
          checkInAt: new Date("2026-08-21T03:40:00.000Z"),
          checkOutAt: null,
          checkInLocationId: null,
          checkOutLocationId: null,
          checkInLocationMode: "MOBILE_FIELD",
          checkOutLocationMode: null,
          workedMinutes: null,
          status: "OPEN",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      exceptions: [],
      now: new Date("2026-08-21T08:00:00.000Z"),
    });
    expect(result.attendanceResult).toBe("PENDING");
    expect(result.hasOpenSession).toBe(true);
  });
});
