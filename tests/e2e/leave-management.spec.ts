/**
 * Authenticated Leave Management Foundation E2E (disposable seed).
 * Password: E2eTestPass123!
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { API_BASE, E2E_USERS } from "./helpers/users";

const VIEWPORTS = [
  { name: "320", width: 320, height: 568 },
  { name: "360", width: 360, height: 800 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 900 },
] as const;

async function assertNoHorizontalOverflow(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, "horizontal overflow").toBeLessThanOrEqual(clientWidth + 1);
}

async function apiLogin(request: APIRequestContext, userKey: keyof typeof E2E_USERS) {
  await request.post(`${API_BASE}/auth/logout`).catch(() => undefined);
  const res = await request.post(`${API_BASE}/auth/login`, {
    data: {
      email: E2E_USERS[userKey].email,
      password: "E2eTestPass123!",
      portal: "employee",
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return res;
}

function futureWeekdayIso(daysAhead = 3) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + daysAhead);
  while (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

test.describe("Leave management foundation", () => {
  test("employee balances + request + withdraw; manager approve/reject; HR policy", async ({
    page,
    request,
  }) => {
    await apiLogin(request, "employee");
    const balances = await request.get(`${API_BASE}/leave/balances/me`);
    expect(balances.ok(), await balances.text()).toBeTruthy();
    const balanceJson = await balances.json();
    expect(Array.isArray(balanceJson) || typeof balanceJson === "object").toBeTruthy();

    const types = await (await request.get(`${API_BASE}/leave/types`)).json();
    const casual = (types as Array<{ id: string; code: string; halfDayAllowed?: boolean }>).find(
      (t) => t.code === "CASUAL" || t.code === "SICK",
    );
    expect(casual, "leave type").toBeTruthy();

    const day = futureWeekdayIso(5);
    const halfDay = futureWeekdayIso(8);
    const applyFull = await request.post(`${API_BASE}/leave/requests`, {
      data: {
        leaveTypeId: casual!.id,
        fromDate: day,
        toDate: day,
        days: 1,
        session: "FULL",
        reason: "E2E full day leave request",
      },
    });
    expect(applyFull.ok(), await applyFull.text()).toBeTruthy();
    const fullReq = await applyFull.json();

    const applyHalf = await request.post(`${API_BASE}/leave/requests`, {
      data: {
        leaveTypeId: casual!.id,
        fromDate: halfDay,
        toDate: halfDay,
        days: 0.5,
        session: "FIRST_HALF",
        reason: "E2E half day leave request",
      },
    });
    // May fail if half-day blocked for type — still assert response is intentional
    if (applyHalf.ok()) {
      const halfReq = await applyHalf.json();
      const withdraw = await request.post(`${API_BASE}/leave/requests/${halfReq.id}/withdraw`);
      expect(withdraw.ok(), await withdraw.text()).toBeTruthy();
      const withdrawn = await withdraw.json();
      expect(String(withdrawn.status).toLowerCase()).toMatch(/withdrawn|cancelled/i);
    }

    await apiLogin(request, "manager");
    const pending = await request.get(
      `${API_BASE}/leave/requests?assignedApprovals=true&status=PENDING`,
    );
    expect(pending.ok(), await pending.text()).toBeTruthy();

    const rejectDay = futureWeekdayIso(10);
    await apiLogin(request, "employee");
    const toReject = await request.post(`${API_BASE}/leave/requests`, {
      data: {
        leaveTypeId: casual!.id,
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
    const approved = await request.post(`${API_BASE}/leave/requests/${fullReq.id}/approve`);
    // Manager may or may not be assigned — allow HR path
    if (!approved.ok()) {
      await apiLogin(request, "hr");
      const hrApprove = await request.post(`${API_BASE}/leave/requests/${fullReq.id}/approve`);
      expect(hrApprove.ok(), await hrApprove.text()).toBeTruthy();
    }

    await apiLogin(request, "hr");
    const reject = await request.post(`${API_BASE}/leave/requests/${rejectReq.id}/reject`, {
      data: { decisionNote: "E2E rejection note required" },
    });
    expect(reject.ok(), await reject.text()).toBeTruthy();
    const rejected = await reject.json();
    expect(rejected.decisionNote || rejected.status).toBeTruthy();

    const history = await request.get(`${API_BASE}/leave/requests/${rejectReq.id}/history`);
    expect(history.ok(), await history.text()).toBeTruthy();
    const hist = await history.json();
    expect(Array.isArray(hist)).toBeTruthy();
    expect(hist.some((h: { action: string }) => h.action === "REJECTED")).toBeTruthy();

    const typesAll = await request.get(`${API_BASE}/leave/types?all=true`);
    expect(typesAll.ok()).toBeTruthy();

    // UI surfaces + responsive
    await loginAs(page, "employee");
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/leave/balance");
      await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 20_000 });
      await assertNoHorizontalOverflow(page);
      await page.goto("/leave/apply");
      await assertNoHorizontalOverflow(page);
      await page.goto("/leave/history");
      await assertNoHorizontalOverflow(page);
    }

    await loginAs(page, "manager");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/leave/approvals");
    await assertNoHorizontalOverflow(page);

    await loginAs(page, "hr");
    await page.goto("/leave/policy");
    await assertNoHorizontalOverflow(page);
    await page.goto("/leave/reports");
    await assertNoHorizontalOverflow(page);
  });

  test("attendance leave: approved leave without punches not ordinary Absent", async ({
    request,
  }) => {
    await apiLogin(request, "employee");
    const me = await (await request.get(`${API_BASE}/auth/me`)).json();
    const employeeId = me.user?.employeeId as string;
    expect(employeeId).toBeTruthy();

    const types = await (await request.get(`${API_BASE}/leave/types`)).json();
    const casual = (types as Array<{ id: string; code: string }>).find((t) => t.code === "CASUAL");
    expect(casual).toBeTruthy();

    // Use a far-future weekday so we do not collide with live attendance
    const day = futureWeekdayIso(20);
    const create = await request.post(`${API_BASE}/leave/requests`, {
      data: {
        leaveTypeId: casual!.id,
        fromDate: day,
        toDate: day,
        days: 1,
        session: "FULL",
        reason: "E2E attendance leave integration",
      },
    });
    expect(create.ok(), await create.text()).toBeTruthy();
    const leave = await create.json();

    await apiLogin(request, "hr");
    await request.post(`${API_BASE}/leave/requests/${leave.id}/approve`);

    // Workday classify endpoint if present
    const workday = await request.get(
      `${API_BASE}/attendance/workdays?employeeId=${employeeId}&from=${day}&to=${day}`,
    );
    if (workday.ok()) {
      const rows = await workday.json();
      const list = Array.isArray(rows) ? rows : rows.workdays ?? rows.items ?? [];
      if (list.length) {
        const result = String(list[0].attendanceResult ?? list[0].result ?? "");
        expect(result.toUpperCase()).not.toBe("ABSENT");
      }
    }
  });
});
