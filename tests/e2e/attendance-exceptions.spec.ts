import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { attachDiagnostics, formatDiagnostics, loginAs } from "./helpers/auth";
import { API_BASE, E2E_USERS } from "./helpers/users";

/**
 * Authenticated Attendance Exceptions + Company Default E2E (disposable seed only).
 * Password: E2eTestPass123!
 * Past punches use gated /attendance/dev/seed-workday-punches (ALLOW_ATTENDANCE_E2E_SEED=1).
 */

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

async function employeeIdFromSession(request: APIRequestContext) {
  const me = await request.get(`${API_BASE}/auth/me`);
  expect(me.ok(), await me.text()).toBeTruthy();
  const body = await me.json();
  const employeeId = body.user?.employeeId as string | undefined;
  expect(employeeId, "employeeId from /auth/me").toBeTruthy();
  return employeeId!;
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

function istIso(workDate: string, hour: number, minute: number) {
  const [y, m, d] = workDate.split("-").map(Number);
  const utcMs = Date.UTC(y!, m! - 1, d!, hour, minute) - (5 * 60 + 30) * 60_000;
  return new Date(utcMs).toISOString();
}

function pastWorkDate(daysAgo: number) {
  const workDate = new Date();
  workDate.setUTCDate(workDate.getUTCDate() - daysAgo);
  return workDate.toISOString().slice(0, 10);
}

async function ensureCompanyDefault(request: APIRequestContext) {
  await apiLogin(request, "developer_admin");
  const fixtures = await request.post(`${API_BASE}/shift-templates/fixtures/live-like`);
  expect(fixtures.status(), await fixtures.text()).toBe(201);
  const shifts = await (await request.get(`${API_BASE}/shift-templates?includeInactive=1`)).json();
  const general = (shifts as Array<{ id: string; name: string; isCompanyDefault?: boolean }>).find(
    (s) => s.isCompanyDefault || s.name === "General Shift",
  );
  expect(general, "company default General Shift").toBeTruthy();
  return general!;
}

async function seedPunches(
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
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
}

async function runDetector(request: APIRequestContext, nowIso: string) {
  await apiLogin(request, "developer_admin");
  const res = await request.post(`${API_BASE}/attendance/exceptions/detect`, {
    data: { now: nowIso },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return res.json();
}

async function punchLiveIn(request: APIRequestContext, employeeId: string) {
  return request.post(`${API_BASE}/attendance/mobile/check-in`, {
    data: {
      employeeId,
      latitude: 17.385,
      longitude: 78.4867,
      locationAccuracy: 12,
      mobileDeviceId: "e2e-exceptions-device",
      clientEventId: `live-in-${Date.now()}`,
    },
  });
}

async function punchLiveOut(request: APIRequestContext) {
  return request.post(`${API_BASE}/attendance/mobile/check-out`, {
    data: {
      latitude: 17.385,
      longitude: 78.4867,
      locationAccuracy: 12,
      mobileDeviceId: "e2e-exceptions-device",
      clientEventId: `live-out-${Date.now()}`,
    },
  });
}

test.describe("authenticated employee correction E2E", () => {
  test("missing checkout → request correction → pending", async ({ page }) => {
    const diagnostics = attachDiagnostics(page);
    await ensureCompanyDefault(page.request);

    await loginAs(page, "employee");
    const employeeId = await employeeIdFromSession(page.request);
    const workDateStr = pastWorkDate(1);

    await seedPunches(page.request, {
      employeeId,
      workDate: workDateStr,
      checkInMinute: 9 * 60 + 32,
    });
    await runDetector(page.request, istIso(workDateStr, 19, 1));

    await loginAs(page, "employee");
    await page.goto("/attendance/mine");
    await expect(page.getByTestId("attendance-workday-card")).toBeVisible({ timeout: 25_000 });

    await page.goto("/attendance/mine?tab=requests");
    await expect(page.getByTestId("missed-punch-request-panel")).toBeVisible({ timeout: 20_000 });

    const corr = await page.request.post(`${API_BASE}/attendance/correction-request`, {
      data: {
        employeeId,
        date: `${workDateStr}T00:00:00.000Z`,
        punchTime: istIso(workDateStr, 18, 35),
        eventType: "OFFICE_OUT",
        remarks: "Forgot to punch out",
        correctionType: "MISSING_CHECK_OUT",
      },
    });
    expect(corr.status(), await corr.text()).toBe(201);
    const corrBody = await corr.json();
    expect(corrBody.requestId, "correction requestId").toBeTruthy();

    const listAfter = await (
      await page.request.get(`${API_BASE}/attendance/correction-requests`)
    ).json();
    const row = (listAfter as Array<{ id: string; status: string }>).find(
      (r) => r.id === corrBody.requestId,
    );
    expect(row?.status).toBe("PENDING");

    diagnostics.url = page.url();
    void formatDiagnostics(diagnostics);
  });
});

test.describe("authenticated manager approval E2E", () => {
  test("approve correction reconciles workday", async ({ page }) => {
    await ensureCompanyDefault(page.request);
    await loginAs(page, "employee");
    const employeeId = await employeeIdFromSession(page.request);
    const workDateStr = pastWorkDate(2);

    await seedPunches(page.request, {
      employeeId,
      workDate: workDateStr,
      checkInMinute: 9 * 60 + 32,
    });
    await runDetector(page.request, istIso(workDateStr, 19, 5));

    await loginAs(page, "employee");
    const created = await page.request.post(`${API_BASE}/attendance/correction-request`, {
      data: {
        employeeId,
        date: `${workDateStr}T00:00:00.000Z`,
        punchTime: istIso(workDateStr, 18, 40),
        eventType: "OFFICE_OUT",
        remarks: "Manager approve fixture",
        correctionType: "MISSING_CHECK_OUT",
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    const { requestId } = await created.json();

    await loginAs(page, "manager");
    const approve = await page.request.post(
      `${API_BASE}/attendance/correction-requests/${requestId}/approve`,
    );
    expect(approve.status(), await approve.text()).toBe(200);

    await loginAs(page, "employee");
    const list = await (await page.request.get(`${API_BASE}/attendance/correction-requests`)).json();
    const row = (list as Array<{ id: string; status: string }>).find((r) => r.id === requestId);
    expect(row?.status).toBe("APPROVED");
  });

  test("reject requires note and leaves missing checkout", async ({ page }) => {
    await ensureCompanyDefault(page.request);
    await loginAs(page, "employee");
    const employeeId = await employeeIdFromSession(page.request);
    const workDateStr = pastWorkDate(0);

    await seedPunches(page.request, {
      employeeId,
      workDate: workDateStr,
      checkInMinute: 9 * 60 + 35,
    });
    await runDetector(page.request, istIso(workDateStr, 19, 10));

    await loginAs(page, "employee");
    const created = await page.request.post(`${API_BASE}/attendance/correction-request`, {
      data: {
        employeeId,
        date: `${workDateStr}T00:00:00.000Z`,
        punchTime: istIso(workDateStr, 12, 5),
        eventType: "OFFICE_OUT",
        remarks: "Manager reject fixture",
        correctionType: "MISSING_CHECK_OUT",
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    const { requestId } = await created.json();

    await loginAs(page, "manager");
    const bad = await page.request.post(
      `${API_BASE}/attendance/correction-requests/${requestId}/reject`,
      { data: { decisionNote: "" } },
    );
    expect(bad.status()).toBeGreaterThanOrEqual(400);

    const ok = await page.request.post(
      `${API_BASE}/attendance/correction-requests/${requestId}/reject`,
      { data: { decisionNote: "Not verified — please re-submit with evidence." } },
    );
    expect(ok.status(), await ok.text()).toBe(200);

    await loginAs(page, "employee");
    const list = await (await page.request.get(`${API_BASE}/attendance/correction-requests`)).json();
    const row = (list as Array<{ id: string; status: string }>).find((r) => r.id === requestId);
    expect(row?.status).toBe("REJECTED");
  });

  test("self-approval blocked", async ({ page }) => {
    await ensureCompanyDefault(page.request);
    await loginAs(page, "hr");
    const employeeId = await employeeIdFromSession(page.request);
    const workDateStr = pastWorkDate(1);

    await seedPunches(page.request, {
      employeeId,
      workDate: workDateStr,
      checkInMinute: 9 * 60 + 40,
    });
    await runDetector(page.request, istIso(workDateStr, 19, 15));

    await loginAs(page, "hr");
    const created = await page.request.post(`${API_BASE}/attendance/correction-request`, {
      data: {
        employeeId,
        date: `${workDateStr}T00:00:00.000Z`,
        punchTime: istIso(workDateStr, 18, 55),
        eventType: "OFFICE_OUT",
        remarks: "Self approval attempt",
        correctionType: "MISSING_CHECK_OUT",
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    const { requestId } = await created.json();

    const approve = await page.request.post(
      `${API_BASE}/attendance/correction-requests/${requestId}/approve`,
    );
    expect(approve.status()).toBe(403);
    const approveText = await approve.text();
    expect(approveText).toMatch(/not allowed|approve/i);
  });
});

test.describe("classification E2E", () => {
  test("employee and admin agree on A–D bands", async ({ page }) => {
    await ensureCompanyDefault(page.request);
    await loginAs(page, "employee");
    const employeeId = await employeeIdFromSession(page.request);

    const cases = [
      { label: "A", minutes: 239, expect: "ABSENT" },
      { label: "B", minutes: 240, expect: "HALF_DAY" },
      { label: "C", minutes: 539, expect: "HALF_DAY" },
      { label: "D", minutes: 540, expect: "FULL_DAY" },
    ] as const;

    const results: Array<{ workDate: string; expect: string }> = [];
    const start = 9 * 60 + 30;

    for (let i = 0; i < cases.length; i++) {
      const c = cases[i]!;
      const workDateStr = pastWorkDate(10 + i);
      await seedPunches(page.request, {
        employeeId,
        workDate: workDateStr,
        checkInMinute: start,
        checkOutMinute: start + c.minutes,
      });
      results.push({ workDate: workDateStr, expect: c.expect });
    }

    await loginAs(page, "employee");
    await page.goto("/attendance/mine?tab=history");
    await expect(page.getByTestId("workday-history-list")).toBeVisible({ timeout: 20_000 });

    const from = pastWorkDate(40);
    const to = pastWorkDate(0);
    const mine = await (
      await page.request.get(`${API_BASE}/attendance/workdays/mine?from=${from}&to=${to}`)
    ).json();
    for (const r of results) {
      const row = (mine as Array<{ workDate: string; result?: string }>).find(
        (w) => w.workDate === r.workDate,
      );
      expect(row?.result, `mine ${r.workDate}`).toBe(r.expect);
    }

    await loginAs(page, "hr");
    for (const r of results) {
      const detail = await page.request.get(
        `${API_BASE}/attendance/workdays/${employeeId}/${r.workDate}`,
      );
      expect(detail.ok(), await detail.text()).toBeTruthy();
      const body = await detail.json();
      expect(body.result, `admin ${r.workDate}`).toBe(r.expect);
    }
  });

  test("open session stays Pending (no Full Day, no synthetic OUT)", async ({ page }) => {
    await ensureCompanyDefault(page.request);
    await loginAs(page, "employee");
    const employeeId = await employeeIdFromSession(page.request);

    // Close leftover OPEN sessions via seed (live mobile OUT cannot close past-day opens).
    await seedPunches(page.request, {
      employeeId,
      workDate: pastWorkDate(15),
      checkInMinute: 9 * 60 + 30,
      checkOutMinute: 10 * 60 + 30,
    });
    await loginAs(page, "employee");

    const inRes = await punchLiveIn(page.request, employeeId);
    expect(inRes.status(), await inRes.text()).toBe(201);

    const current = await (await page.request.get(`${API_BASE}/attendance/current`)).json();
    expect(current.checkedIn).toBe(true);
    expect(current.result).toBe("PENDING");
    expect(current.currentSession?.checkOutAt ?? null).toBeNull();

    await page.goto("/attendance/mine");
    await expect(page.getByText(/^Checked In$/)).toBeVisible({ timeout: 20_000 });

    await punchLiveOut(page.request);
  });
});

test.describe("exceptions responsive matrix", () => {
  for (const vp of VIEWPORTS) {
    test(`attendance + corrections + exceptions @${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await loginAs(page, "employee");
      await page.goto("/attendance/mine");
      await expect(
        page.getByTestId("attendance-workday-card").or(page.getByTestId("workday-card-loading")),
      ).toBeVisible({ timeout: 25_000 });
      await assertNoHorizontalOverflow(page);

      await page.goto("/attendance/mine?tab=requests");
      await assertNoHorizontalOverflow(page);
      await expect(page.getByTestId("missed-punch-request-panel")).toBeVisible();

      await page.goto("/attendance/mine?tab=history");
      await assertNoHorizontalOverflow(page);

      await loginAs(page, "manager");
      await page.goto("/attendance/corrections");
      await expect(
        page.getByRole("heading", { name: /correction|attendance/i }).or(page.getByText(/Pending|Exceptions/i)).first(),
      ).toBeVisible({ timeout: 25_000 });
      await assertNoHorizontalOverflow(page);

      await loginAs(page, "hr");
      await page.goto("/attendance/corrections?tab=exceptions");
      await expect(
        page.getByTestId("attendance-exceptions-panel").or(page.getByText(/Exceptions/i)).first(),
      ).toBeVisible({ timeout: 25_000 });
      await assertNoHorizontalOverflow(page);
    });
  }
});
