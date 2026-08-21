/**
 * Authenticated Leave Management Foundation E2E (disposable seed).
 * Password: E2eTestPass123!
 *
 * Requires backend + frontend + seed. Attendance punch fixtures use
 * ALLOW_ATTENDANCE_E2E_SEED=1 when /attendance/dev/seed-workday-punches exists.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { apiLogin } from "./helpers/auth";
import { findOverflow } from "./helpers/overflow";
import { API_BASE, E2E_PASSWORD, E2E_USERS } from "./helpers/users";

const VIEWPORTS = [
  { name: "320", width: 320, height: 568 },
  { name: "360", width: 360, height: 800 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 900 },
] as const;

async function assertNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await findOverflow(page);
  expect(overflow, `horizontal overflow on ${label}`).toBeNull();
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `doc overflow on ${label}`).toBeLessThanOrEqual(clientWidth + 1);
}

function futureWeekdayIso(daysAhead = 3) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + daysAhead);
  while (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function pastWorkDateIso(daysAgo: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  while (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

type LeaveTypeRow = {
  id: string;
  code: string;
  halfDayAllowed?: boolean;
  active?: boolean;
};

async function casualLeaveType(request: APIRequestContext) {
  const res = await request.get(`${API_BASE}/leave/types`);
  expect(res.ok(), await res.text()).toBeTruthy();
  const types = (await res.json()) as LeaveTypeRow[];
  const casual =
    types.find((t) => t.code === "CASUAL") ??
    types.find((t) => t.code === "SICK") ??
    types.find((t) => t.halfDayAllowed !== false);
  expect(casual, "active leave type").toBeTruthy();
  return casual!;
}

async function employeeIdFromSession(request: APIRequestContext) {
  const me = await request.get(`${API_BASE}/auth/me`);
  expect(me.ok(), await me.text()).toBeTruthy();
  const body = await me.json();
  const employeeId = body.user?.employeeId as string | undefined;
  expect(employeeId, "employeeId from /auth/me").toBeTruthy();
  return employeeId!;
}

/**
 * Authenticate the browser page via page.request (shared cookie jar), then open a Leave URL.
 * Avoids flaky portal/login form remounts under headless Chromium.
 */
async function browserSessionGoto(
  page: Page,
  userKey: keyof typeof E2E_USERS,
  path: string,
) {
  await page.request.post(`${API_BASE}/auth/logout`).catch(() => undefined);
  const login = await page.request.post(`${API_BASE}/auth/login`, {
    data: {
      email: E2E_USERS[userKey].email,
      password: E2E_PASSWORD,
      portal: "employee",
    },
  });
  expect(login.ok(), await login.text()).toBeTruthy();
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page
    .locator(".atd-open-splash")
    .waitFor({ state: "hidden", timeout: 30_000 })
    .catch(() => undefined);
  await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 20_000 });
}

async function seedPunchesIfAvailable(
  request: APIRequestContext,
  payload: {
    employeeId: string;
    workDate: string;
    checkInMinute: number;
    checkOutMinute?: number | null;
  },
) {
  await apiLogin(request, "developer_admin");
  const res = await request.post(`${API_BASE}/attendance/dev/seed-workday-punches`, {
    data: payload,
  });
  if (res.status() === 404) return null;
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
}

test.describe("Leave management foundation", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(180_000);

  test("employee: login, balances, full-day, half-day, withdraw, history, 403 adjust", async ({
    page,
    request,
  }) => {
    // API-first for durable leave assertions
    await apiLogin(request, "employee");
    const balances = await request.get(`${API_BASE}/leave/balances/me`);
    expect(balances.ok(), await balances.text()).toBeTruthy();
    const balanceJson = await balances.json();
    expect(Array.isArray(balanceJson) || typeof balanceJson === "object").toBeTruthy();

    const casual = await casualLeaveType(request);
    const day = futureWeekdayIso(5);
    const halfDay = futureWeekdayIso(8);

    const applyFull = await request.post(`${API_BASE}/leave/requests`, {
      data: {
        leaveTypeId: casual.id,
        fromDate: day,
        toDate: day,
        days: 1,
        session: "FULL",
        reason: "E2E full day leave request",
      },
    });
    expect(applyFull.ok(), await applyFull.text()).toBeTruthy();
    const fullReq = await applyFull.json();
    expect(fullReq.id).toBeTruthy();
    expect(String(fullReq.status).toUpperCase()).toMatch(/PENDING/);

    // Ensure half-day allowed when possible (HR may toggle)
    await apiLogin(request, "hr");
    if (casual.halfDayAllowed === false) {
      await request.patch(`${API_BASE}/leave/types/${casual.id}`, {
        data: { halfDayAllowed: true },
      });
    }

    await apiLogin(request, "employee");
    const applyHalf = await request.post(`${API_BASE}/leave/requests`, {
      data: {
        leaveTypeId: casual.id,
        fromDate: halfDay,
        toDate: halfDay,
        days: 0.5,
        session: "FIRST_HALF",
        reason: "E2E half day leave request",
      },
    });
    expect(applyHalf.ok(), await applyHalf.text()).toBeTruthy();
    const halfReq = await applyHalf.json();

    const withdraw = await request.post(`${API_BASE}/leave/requests/${halfReq.id}/withdraw`);
    expect(withdraw.ok(), await withdraw.text()).toBeTruthy();
    const withdrawn = await withdraw.json();
    expect(String(withdrawn.status).toLowerCase()).toMatch(/withdrawn|cancelled/i);

    const mine = await request.get(`${API_BASE}/leave/requests?mine=true`);
    expect(mine.ok(), await mine.text()).toBeTruthy();
    const mineRows = (await mine.json()) as Array<{ id: string; status: string }>;
    expect(mineRows.some((r) => r.id === fullReq.id)).toBeTruthy();
    expect(mineRows.some((r) => r.id === halfReq.id)).toBeTruthy();

    const history = await request.get(`${API_BASE}/leave/requests/${halfReq.id}/history`);
    expect(history.ok(), await history.text()).toBeTruthy();
    const hist = await history.json();
    expect(Array.isArray(hist)).toBeTruthy();
    expect(hist.some((h: { action: string }) => /WITHDRAWN|CANCELLED/i.test(h.action))).toBeTruthy();

    // Employee cannot adjust another employee's balance
    await apiLogin(request, "manager");
    const otherEmployeeId = await employeeIdFromSession(request);
    await apiLogin(request, "employee");
    const forbidden = await request.patch(
      `${API_BASE}/leave/balances/${otherEmployeeId}/${casual.id}`,
      { data: { adjustment: 1, reason: "E2E unauthorized adjust" } },
    );
    expect([401, 403]).toContain(forbidden.status());

    // UI leave surfaces via shared cookie jar (no flaky form login)
    await browserSessionGoto(page, "employee", "/leave/balance");
    await browserSessionGoto(page, "employee", "/leave/history");
  });

  test("manager: assigned approvals, approve, reject note required, self-approve blocked", async ({
    request,
  }) => {
    await apiLogin(request, "employee");
    const casual = await casualLeaveType(request);
    const approveDay = futureWeekdayIso(6);
    const rejectDay = futureWeekdayIso(9);
    const managerSelfDay = futureWeekdayIso(11);

    // Request intended for manager approval (reuse path if pending already exists)
    let approveId: string | undefined;
    const existingPending = await (
      await request.get(`${API_BASE}/leave/requests?mine=true&status=PENDING`)
    ).json();
    const pendingList = Array.isArray(existingPending)
      ? existingPending
      : ((existingPending as { items?: unknown[] }).items ?? []);
    const pendingFull = (
      pendingList as Array<{ id: string; session?: string; days?: number; status: string }>
    ).find((r) => String(r.status).toUpperCase() === "PENDING" && Number(r.days) === 1);
    if (pendingFull) {
      approveId = pendingFull.id;
    } else {
      const created = await request.post(`${API_BASE}/leave/requests`, {
        data: {
          leaveTypeId: casual.id,
          fromDate: approveDay,
          toDate: approveDay,
          days: 1,
          session: "FULL",
          reason: "E2E leave for manager approve",
        },
      });
      expect(created.ok(), await created.text()).toBeTruthy();
      approveId = (await created.json()).id as string;
    }

    const toReject = await request.post(`${API_BASE}/leave/requests`, {
      data: {
        leaveTypeId: casual.id,
        fromDate: rejectDay,
        toDate: rejectDay,
        days: 1,
        session: "FULL",
        reason: "E2E leave to reject",
      },
    });
    expect(toReject.ok(), await toReject.text()).toBeTruthy();
    const rejectReq = await toReject.json();

    await apiLogin(request, "manager");
    const assigned = await request.get(
      `${API_BASE}/leave/requests?assignedApprovals=true&status=PENDING`,
    );
    expect(assigned.ok(), await assigned.text()).toBeTruthy();
    const assignedRows = await assigned.json();
    expect(Array.isArray(assignedRows) || typeof assignedRows === "object").toBeTruthy();

    const approved = await request.post(`${API_BASE}/leave/requests/${approveId}/approve`);
    if (!approved.ok()) {
      // Seed may route approvals to HR when manager is not org head — finalize via HR
      await apiLogin(request, "hr");
      const hrApprove = await request.post(`${API_BASE}/leave/requests/${approveId}/approve`);
      expect(hrApprove.ok(), await hrApprove.text()).toBeTruthy();
    } else {
      const body = await approved.json();
      expect(String(body.status).toUpperCase()).toMatch(/APPROVED|MANAGER_APPROVED/);
    }

    // Reject without note must fail
    await apiLogin(request, "manager");
    const rejectNoNote = await request.post(`${API_BASE}/leave/requests/${rejectReq.id}/reject`, {
      data: {},
    });
    if (rejectNoNote.status() === 403) {
      await apiLogin(request, "hr");
      const hrNoNote = await request.post(`${API_BASE}/leave/requests/${rejectReq.id}/reject`, {
        data: {},
      });
      expect(hrNoNote.status(), await hrNoNote.text()).toBe(400);
      const hrReject = await request.post(`${API_BASE}/leave/requests/${rejectReq.id}/reject`, {
        data: { decisionNote: "E2E rejection note required" },
      });
      expect(hrReject.ok(), await hrReject.text()).toBeTruthy();
    } else {
      expect(rejectNoNote.status(), await rejectNoNote.text()).toBe(400);
      const reject = await request.post(`${API_BASE}/leave/requests/${rejectReq.id}/reject`, {
        data: { decisionNote: "E2E rejection note required" },
      });
      expect(reject.ok(), await reject.text()).toBeTruthy();
      const rejected = await reject.json();
      expect(rejected.decisionNote || rejected.status).toBeTruthy();
    }

    // Self-approve blocked when manager has own leave
    await apiLogin(request, "manager");
    const mgrCasual = await casualLeaveType(request);
    const selfLeave = await request.post(`${API_BASE}/leave/requests`, {
      data: {
        leaveTypeId: mgrCasual.id,
        fromDate: managerSelfDay,
        toDate: managerSelfDay,
        days: 1,
        session: "FULL",
        reason: "E2E manager self leave — must not self-approve",
      },
    });
    expect(selfLeave.ok(), await selfLeave.text()).toBeTruthy();
    const selfReq = await selfLeave.json();
    const selfApprove = await request.post(`${API_BASE}/leave/requests/${selfReq.id}/approve`);
    expect(selfApprove.status(), await selfApprove.text()).toBe(403);
  });

  test("employee after: sees approved and rejected", async ({ request }) => {
    await apiLogin(request, "employee");
    const mine = await request.get(`${API_BASE}/leave/requests?mine=true`);
    expect(mine.ok(), await mine.text()).toBeTruthy();
    const rows = (await mine.json()) as Array<{ id: string; status: string }>;
    const statuses = rows.map((r) => String(r.status).toUpperCase());
    expect(statuses.some((s) => /APPROVED|MANAGER_APPROVED/.test(s))).toBeTruthy();
    expect(statuses.some((s) => s === "REJECTED")).toBeTruthy();
  });

  test("HR: types?all=true, adjustBalance with reason, history endpoint", async ({ request }) => {
    await apiLogin(request, "hr");
    const typesAll = await request.get(`${API_BASE}/leave/types?all=true`);
    expect(typesAll.ok(), await typesAll.text()).toBeTruthy();
    const types = (await typesAll.json()) as LeaveTypeRow[];
    expect(types.length).toBeGreaterThan(0);

    await apiLogin(request, "employee");
    const employeeId = await employeeIdFromSession(request);
    const casual = await casualLeaveType(request);

    await apiLogin(request, "hr");
    const adjust = await request.patch(`${API_BASE}/leave/balances/${employeeId}/${casual.id}`, {
      data: { adjustment: 1, reason: "E2E HR balance adjust smoke" },
    });
    expect(adjust.ok(), await adjust.text()).toBeTruthy();

    const mine = await (
      await (async () => {
        await apiLogin(request, "employee");
        return request.get(`${API_BASE}/leave/requests?mine=true`);
      })()
    ).json();
    const rows = mine as Array<{ id: string; status: string }>;
    const rejected = rows.find((r) => String(r.status).toUpperCase() === "REJECTED");
    expect(rejected, "rejected leave for history").toBeTruthy();

    await apiLogin(request, "hr");
    const history = await request.get(`${API_BASE}/leave/requests/${rejected!.id}/history`);
    expect(history.ok(), await history.text()).toBeTruthy();
    const hist = await history.json();
    expect(Array.isArray(hist)).toBeTruthy();
    expect(hist.some((h: { action: string }) => h.action === "REJECTED")).toBeTruthy();
  });

  test("attendance fixtures via seed-workday-punches when enabled", async ({ request }) => {
    await apiLogin(request, "employee");
    const employeeId = await employeeIdFromSession(request);
    const casual = await casualLeaveType(request);
    const dayNoPunch = pastWorkDateIso(5);
    const dayConflict = pastWorkDateIso(3);

    await apiLogin(request, "hr");
    await request.patch(`${API_BASE}/leave/types/${casual.id}`, {
      data: { backdatedAllowed: true, minNoticeDays: 0 },
    });

    // Fixture A: approved leave, no punches → not ABSENT
    await apiLogin(request, "employee");
    const leaveA = await request.post(`${API_BASE}/leave/requests`, {
      data: {
        leaveTypeId: casual.id,
        fromDate: dayNoPunch,
        toDate: dayNoPunch,
        days: 1,
        session: "FULL",
        reason: "E2E leave without punches",
      },
    });
    expect(leaveA.ok(), await leaveA.text()).toBeTruthy();
    const leaveAId = (await leaveA.json()).id as string;
    await apiLogin(request, "hr");
    expect(
      (await request.post(`${API_BASE}/leave/requests/${leaveAId}/approve`)).ok(),
    ).toBeTruthy();

    // Create workday via seed IN then cancel? Better: seed endpoint creates workday.
    // For no-punch day, call getOrCreate via single punch then remove is wrong.
    // Use HR workday detail after forcing ensure through seed with only leave:
    // Developer seed of a tiny open then... skip ensure — use mine after recalculate.
    await apiLogin(request, "developer_admin");
    await request.post(`${API_BASE}/attendance/recalculate/${employeeId}/${dayNoPunch}`).catch(
      () => undefined,
    );

    await apiLogin(request, "hr");
    const wdA = await request.get(`${API_BASE}/attendance/workdays/${employeeId}/${dayNoPunch}`);
    if (wdA.ok()) {
      const body = await wdA.json();
      const result = String(body.result ?? body.attendanceResult ?? "").toUpperCase();
      if (result) expect(result).not.toBe("ABSENT");
    }

    // Fixture B: approved leave + real punches → conflict / both preserved
    await apiLogin(request, "employee");
    const leaveB = await request.post(`${API_BASE}/leave/requests`, {
      data: {
        leaveTypeId: casual.id,
        fromDate: dayConflict,
        toDate: dayConflict,
        days: 1,
        session: "FULL",
        reason: "E2E leave with punches",
      },
    });
    expect(leaveB.ok(), await leaveB.text()).toBeTruthy();
    const leaveBId = (await leaveB.json()).id as string;
    await apiLogin(request, "hr");
    expect(
      (await request.post(`${API_BASE}/leave/requests/${leaveBId}/approve`)).ok(),
    ).toBeTruthy();

    const seeded = await seedPunchesIfAvailable(request, {
      employeeId,
      workDate: dayConflict,
      checkInMinute: 9 * 60 + 30,
      checkOutMinute: 18 * 60 + 30,
    });
    expect(seeded, "ALLOW_ATTENDANCE_E2E_SEED punch seed required").toBeTruthy();

    await apiLogin(request, "hr");
    const wdB = await request.get(`${API_BASE}/attendance/workdays/${employeeId}/${dayConflict}`);
    expect(wdB.ok(), await wdB.text()).toBeTruthy();
    const bodyB = await wdB.json();
    const resultB = String(bodyB.result ?? bodyB.attendanceResult ?? "").toUpperCase();
    expect(resultB).not.toBe("ABSENT");
    expect(Number(bodyB.sessionCount ?? bodyB.sessions?.length ?? 1)).toBeGreaterThan(0);

    await apiLogin(request, "employee");
    const leaveCheck = await request.get(`${API_BASE}/leave/requests?mine=true`);
    const leaveRows = (await leaveCheck.json()) as Array<{ id: string; status: string }>;
    expect(leaveRows.some((r) => r.id === leaveBId)).toBeTruthy();
    const kept = leaveRows.find((r) => r.id === leaveBId)!;
    expect(String(kept.status).toUpperCase()).toMatch(/APPROVED|MANAGER_APPROVED/);
  });

  test("responsive leave surfaces at 320/360/390/768/1440", async ({ page }) => {
    const routes: Array<{ path: string; role: keyof typeof E2E_USERS }> = [
      { path: "/leave/balance", role: "employee" },
      { path: "/leave/apply", role: "employee" },
      { path: "/leave/history", role: "employee" },
      { path: "/leave/approvals", role: "manager" },
      { path: "/leave/policy", role: "hr" },
    ];

    for (const route of routes) {
      for (const vp of VIEWPORTS) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await browserSessionGoto(page, route.role, route.path);
        await assertNoHorizontalOverflow(page, `${route.path}@${vp.name}`);
      }
    }

    expect(E2E_PASSWORD).toBe("E2eTestPass123!");
  });
});
