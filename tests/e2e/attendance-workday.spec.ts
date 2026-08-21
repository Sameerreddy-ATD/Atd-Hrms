import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { attachDiagnostics, formatDiagnostics, loginAs } from "./helpers/auth";
import { API_BASE } from "./helpers/users";

/**
 * Authenticated Attendance Workday Core E2E (disposable seed only).
 * Seed password: E2eTestPass123! — face verification disabled on E2E departments.
 */

const VIEWPORTS = [
  { name: "320", width: 320, height: 568 },
  { name: "360", width: 360, height: 800 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
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

async function punchViaApi(
  request: APIRequestContext,
  kind: "check-in" | "check-out",
  employeeId: string,
  opts?: { eventTime?: string; clientEventId?: string },
) {
  const path =
    kind === "check-in" ? "/attendance/mobile/check-in" : "/attendance/mobile/check-out";
  const body: Record<string, unknown> = {
    latitude: 17.385,
    longitude: 78.4867,
    locationAccuracy: 12,
    mobileDeviceId: "e2e-playwright-device",
    clientEventId: opts?.clientEventId,
    eventTime: opts?.eventTime,
  };
  if (kind === "check-in") body.employeeId = employeeId;
  return request.post(`${API_BASE}${path}`, { data: body });
}

async function ensureCheckedOut(request: APIRequestContext, employeeId: string) {
  const current0 = await request.get(`${API_BASE}/attendance/current`);
  expect(current0.ok()).toBeTruthy();
  const state0 = await current0.json();
  if (state0.checkedIn) {
    const out = await punchViaApi(request, "check-out", employeeId);
    expect(out.status(), await out.text()).toBe(201);
  }
}

test.describe("attendance workday authenticated", () => {
  test("check-in / check-out / reload persistence", async ({ page }) => {
    const diagnostics = attachDiagnostics(page);
    await loginAs(page, "employee");
    const request = page.request;
    const employeeId = await employeeIdFromSession(request);
    await ensureCheckedOut(request, employeeId);

    const inRes = await punchViaApi(request, "check-in", employeeId, {
      clientEventId: `e2e-in-${Date.now()}`,
    });
    expect(inRes.status(), await inRes.text()).toBe(201);

    const currentIn = await (await request.get(`${API_BASE}/attendance/current`)).json();
    expect(currentIn.checkedIn).toBe(true);
    expect(currentIn.nextExpectedAction).toBe("CHECK_OUT");

    await page.goto("/attendance/mine");
    await expect(page.getByTestId("attendance-workday-card")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/^Checked In$/)).toBeVisible();

    await page.reload();
    await expect(page.getByText(/^Checked In$/)).toBeVisible({ timeout: 20_000 });

    const outRes = await punchViaApi(request, "check-out", employeeId, {
      clientEventId: `e2e-out-${Date.now()}`,
    });
    expect(outRes.status(), await outRes.text()).toBe(201);

    const currentOut = await (await request.get(`${API_BASE}/attendance/current`)).json();
    expect(currentOut.checkedIn).toBe(false);

    await page.goto("/attendance/mine");
    await expect(page.getByTestId("attendance-workday-card")).toBeVisible();
    await expect(page.getByText(/^Checked Out$/)).toBeVisible();

    diagnostics.url = page.url();
    void formatDiagnostics(diagnostics);
  });

  test("double-tap check-in creates one session", async ({ page }) => {
    await loginAs(page, "employee");
    const request = page.request;
    const employeeId = await employeeIdFromSession(request);
    await ensureCheckedOut(request, employeeId);
    const key = `e2e-double-${Date.now()}`;
    const [a, b] = await Promise.all([
      punchViaApi(request, "check-in", employeeId, { clientEventId: key }),
      punchViaApi(request, "check-in", employeeId, { clientEventId: key }),
    ]);
    expect([a.status(), b.status()].every((s) => s === 201 || s === 409)).toBe(true);
    const current = await (await request.get(`${API_BASE}/attendance/current`)).json();
    expect(current.checkedIn).toBe(true);
    expect(current.sessions.filter((s: { status: string }) => s.status === "OPEN").length).toBe(1);
    await punchViaApi(request, "check-out", employeeId);
  });

  test("dashboard and mine agree on current state", async ({ page }) => {
    await loginAs(page, "employee");
    const request = page.request;
    const employeeId = await employeeIdFromSession(request);
    await ensureCheckedOut(request, employeeId);
    await punchViaApi(request, "check-in", employeeId, { clientEventId: `e2e-dash-${Date.now()}` });

    await page.goto("/dashboard");
    await expect(page.getByTestId("attendance-workday-card")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("attendance-workday-card").getByText(/^Checked In$/)).toBeVisible();
    await page.goto("/attendance/mine");
    await expect(page.getByTestId("attendance-workday-card").getByText(/^Checked In$/)).toBeVisible({
      timeout: 20_000,
    });
    await punchViaApi(request, "check-out", employeeId);
  });

  test("second session same workday via API", async ({ page }) => {
    await loginAs(page, "employee");
    const request = page.request;
    const employeeId = await employeeIdFromSession(request);
    await ensureCheckedOut(request, employeeId);
    const t = Date.now();
    expect(
      (await punchViaApi(request, "check-in", employeeId, { clientEventId: `s1-in-${t}` })).status(),
    ).toBe(201);
    expect(
      (await punchViaApi(request, "check-out", employeeId, { clientEventId: `s1-out-${t}` })).status(),
    ).toBe(201);
    expect(
      (await punchViaApi(request, "check-in", employeeId, { clientEventId: `s2-in-${t}` })).status(),
    ).toBe(201);
    expect(
      (await punchViaApi(request, "check-out", employeeId, { clientEventId: `s2-out-${t}` })).status(),
    ).toBe(201);
    const current = await (await request.get(`${API_BASE}/attendance/current`)).json();
    expect(current.sessions.length).toBeGreaterThanOrEqual(2);
    const closed = current.sessions.filter((s: { status: string }) => s.status === "CLOSED");
    expect(closed.length).toBeGreaterThanOrEqual(2);
  });
});

test.describe("attendance workday responsive matrix", () => {
  for (const vp of VIEWPORTS) {
    test(`no overflow + workday card @${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await loginAs(page, "employee");
      await page.goto("/attendance/mine");
      await expect(
        page.getByTestId("attendance-workday-card").or(page.getByTestId("workday-card-loading")),
      ).toBeVisible({ timeout: 25_000 });
      await assertNoHorizontalOverflow(page);
      await page.goto("/dashboard");
      await assertNoHorizontalOverflow(page);
    });
  }
});
