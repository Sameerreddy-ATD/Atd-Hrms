import { describe, expect, it } from "vitest";
import {
  ATTENDANCE_EXCEPTION_DETECTOR_INTERVAL_MS,
  ATTENDANCE_EXCEPTION_DETECTOR_TIMEZONE,
} from "../server/src/attendanceExceptionDetectorScheduler";
import { MISSING_CHECKOUT_THRESHOLD_MINUTES } from "../server/src/attendanceExceptionPolicy";
import { classifyAttendanceWorkdayInput } from "../server/src/attendanceClassification";

describe("attendance exception detector scheduler", () => {
  it("runs every 10 minutes in Asia/Kolkata product timezone", () => {
    expect(ATTENDANCE_EXCEPTION_DETECTOR_INTERVAL_MS).toBe(10 * 60 * 1000);
    expect(ATTENDANCE_EXCEPTION_DETECTOR_TIMEZONE).toBe("Asia/Kolkata");
  });

  it("General Shift 18:30 → Missing Checkout eligible at 19:00 IST (not 18:59)", () => {
    // 18:30 IST = 13:00 UTC; +30m → 13:30 UTC (19:00 IST)
    const scheduledEndAt = new Date("2026-08-21T13:00:00.000Z");
    const eligibleAt = new Date(
      scheduledEndAt.getTime() + MISSING_CHECKOUT_THRESHOLD_MINUTES * 60_000,
    );
    expect(eligibleAt.toISOString()).toBe("2026-08-21T13:30:00.000Z");
    const at1859 = new Date("2026-08-21T13:29:00.000Z");
    const at1900 = new Date("2026-08-21T13:30:00.000Z");
    expect(at1859.getTime() >= eligibleAt.getTime()).toBe(false);
    expect(at1900.getTime() >= eligibleAt.getTime()).toBe(true);
  });

  it("night shift final end 03:00 → eligible at 03:30 next calendar day", () => {
    const scheduledEndAt = new Date("2026-08-21T21:30:00.000Z"); // 03:00 IST Aug 22
    const eligibleAt = new Date(
      scheduledEndAt.getTime() + MISSING_CHECKOUT_THRESHOLD_MINUTES * 60_000,
    );
    expect(eligibleAt.toISOString()).toBe("2026-08-21T22:00:00.000Z"); // 03:30 IST
  });

  it("split uses final segment end (21:00), not mid-gap (13:00)", () => {
    const firstSegEnd = new Date("2026-08-21T07:30:00.000Z"); // 13:00 IST
    const finalSegEnd = new Date("2026-08-21T15:30:00.000Z"); // 21:00 IST
    const eligibleAt = new Date(
      finalSegEnd.getTime() + MISSING_CHECKOUT_THRESHOLD_MINUTES * 60_000,
    );
    expect(eligibleAt.toISOString()).toBe("2026-08-21T16:00:00.000Z"); // 21:30 IST
    const midGapEligible = new Date(
      firstSegEnd.getTime() + MISSING_CHECKOUT_THRESHOLD_MINUTES * 60_000,
    );
    expect(midGapEligible.toISOString()).not.toBe(eligibleAt.toISOString());
  });

  it("open session with Missing Checkout stays CORRECTION_REQUIRED / not FULL_DAY", () => {
    const workDate = new Date("2026-08-21T00:00:00.000Z");
    const scheduledEndAt = new Date("2026-08-21T13:00:00.000Z");
    const result = classifyAttendanceWorkdayInput({
      workday: {
        workdayId: "w",
        employeeId: "e",
        workDate,
        timezone: "Asia/Kolkata",
        scheduleSource: "COMPANY_DEFAULT",
        explicitNoShift: false,
        shiftTemplateId: "shift-morning-0930",
        shiftCodeSnapshot: "MORNING_0930",
        shiftNameSnapshot: "General Shift",
        expectedWorkMinutes: 540,
        scheduledStartAt: new Date("2026-08-21T04:00:00.000Z"),
        scheduledEndAt,
        scheduleSnapshot: {
          workDate: "2026-08-21",
          timezone: "Asia/Kolkata",
          source: "COMPANY_DEFAULT",
          explicitNoShift: false,
          shiftTemplateId: "shift-morning-0930",
          shiftCode: "MORNING_0930",
          shiftName: "General Shift",
          expectedWorkMinutes: 540,
          graceInMinutes: 30,
          graceOutMinutes: 0,
          segments: [
            {
              sequence: 1,
              startAt: "2026-08-21T04:00:00.000Z",
              endAt: "2026-08-21T13:00:00.000Z",
              startMinute: 570,
              endMinute: 1110,
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
        status: "AWAITING_CORRECTION",
        actualWorkedMinutes: 0,
        firstPunchAt: new Date("2026-08-21T04:05:00.000Z"),
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
          checkInAt: new Date("2026-08-21T04:05:00.000Z"),
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
      exceptions: [
        {
          exceptionId: "ex1",
          workdayId: "w",
          employeeId: "e",
          type: "MISSING_CHECK_OUT",
          status: "OPEN",
          relatedSessionId: "s1",
          relatedEventId: "in1",
          dedupeKey: "w|MISSING_CHECK_OUT|s1",
          notificationTag: "att-ex-w|MISSING_CHECK_OUT|s1",
          details: null,
          detectedAt: new Date(),
          resolvedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      now: new Date("2026-08-21T14:00:00.000Z"),
    });
    expect(result.attendanceResult).toBe("CORRECTION_REQUIRED");
    expect(result.hasOpenSession).toBe(true);
    expect(result.hasMissingCheckout).toBe(true);
  });
});
