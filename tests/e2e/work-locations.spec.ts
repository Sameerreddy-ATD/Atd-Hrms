import { expect, test, type Page } from "@playwright/test";
import { apiLogin, attachDiagnostics, formatDiagnostics, loginAs } from "./helpers/auth";
import { findOverflow } from "./helpers/overflow";
import { API_BASE } from "./helpers/users";

const VIEWPORTS = [
  { label: "320x568", width: 320, height: 568 },
  { label: "390x844", width: 390, height: 844 },
  { label: "768x1024", width: 768, height: 1024 },
  { label: "1440x900", width: 1440, height: 900 },
];

async function gotoWorkLocations(page: Page) {
  await page.goto("/branches", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: /Work Locations/i })).toBeVisible({
    timeout: 20_000,
  });
}

test.describe("work locations — browser E2E", () => {
  test.setTimeout(120_000);

  test("does not request geolocation on page load", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __geoCalls?: number }).__geoCalls = 0;
      const original = navigator.geolocation?.getCurrentPosition?.bind(navigator.geolocation);
      if (!original || !navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition = ((success, error, options) => {
        (window as unknown as { __geoCalls?: number }).__geoCalls =
          ((window as unknown as { __geoCalls?: number }).__geoCalls ?? 0) + 1;
        return original(success, error, options);
      }) as typeof navigator.geolocation.getCurrentPosition;
    });

    await loginAs(page, "developer_admin");
    await gotoWorkLocations(page);
    await page.waitForTimeout(1500);
    const calls = await page.evaluate(
      () => (window as unknown as { __geoCalls?: number }).__geoCalls ?? 0,
    );
    expect(calls).toBe(0);
  });

  test("create, rename without code change, radius update, deactivate/reactivate", async ({
    page,
    request,
  }) => {
    const diagnostics = attachDiagnostics(page);
    await loginAs(page, "developer_admin");
    await apiLogin(request, "developer_admin");
    await gotoWorkLocations(page);

    const stamp = Date.now().toString().slice(-6);
    const name = `E2E Depot ${stamp}`;
    const code = `E2E_DEPOT_${stamp}`;

    await page.getByRole("button", { name: /Add Location/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.locator("#wl-name").fill(name);
    await dialog.locator("#wl-code").fill(code);
    await dialog.locator("#wl-type").click();
    await page.getByRole("option", { name: "Depot" }).click();

    await dialog.locator("#wl-address1").fill("Plot 1 Industrial Area");
    await dialog.locator("#wl-city").fill("Hyderabad");
    await dialog.locator("#wl-postal").fill("500032");
    await dialog.locator("#wl-lat").fill("17.4500000");
    await dialog.locator("#wl-lng").fill("78.3800000");
    await dialog.locator("#wl-radius").fill("250");

    const createResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/work-locations") &&
        response.request().method() === "POST" &&
        !response.url().includes("deactivate") &&
        !response.url().includes("reactivate"),
      { timeout: 20_000 },
    );
    await dialog.getByRole("button", { name: /^Create location$/i }).click();
    const createResponse = await createResponsePromise;
    const createBody = await createResponse.text();
    expect(createResponse.ok(), `create failed: ${createResponse.status()} ${createBody}`).toBeTruthy();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText(name).filter({ visible: true }).first()).toBeVisible({
      timeout: 15_000,
    });

    const created = await request.get(`${API_BASE}/work-locations?q=${encodeURIComponent(code)}`);
    expect(created.ok()).toBeTruthy();
    const createdRows = (await created.json()) as Array<{
      id: string;
      locationCode: string;
      locationType: string;
      state: string;
      attendanceRadiusMeters: number;
    }>;
    const row = createdRows.find((item) => item.locationCode === code);
    expect(row).toBeTruthy();
    expect(row!.locationType).toBe("DEPOT");
    expect(row!.state).toBe("TELANGANA");
    expect(row!.attendanceRadiusMeters).toBe(250);

    // Narrow list so View targets the created row on mobile cards (code not shown in cards).
    await page.getByPlaceholder(/Search name, code, or city/i).fill(code);
    await expect(page.getByText(name).filter({ visible: true }).first()).toBeVisible();

    await page.getByRole("button", { name: /^View$/i }).filter({ visible: true }).first().click();
    await expect(page.getByText(code).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /^People/i })).toBeVisible();
    await page.getByRole("button", { name: /^Edit$/i }).filter({ visible: true }).first().click();
    await expect(dialog).toBeVisible();
    await dialog.locator("#wl-name").fill(`${name} Renamed`);
    await expect(dialog.locator("#wl-code")).toHaveValue(code);
    await dialog.locator("#wl-radius").fill("300");
    await dialog.getByRole("button", { name: /Save location/i }).click();

    const continueBtn = page.getByRole("button", { name: /Continue and save/i });
    if (await continueBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await continueBtn.click();
    }

    await expect(page.getByText(`${name} Renamed`).filter({ visible: true }).first()).toBeVisible({
      timeout: 15_000,
    });

    const updated = await request.get(`${API_BASE}/work-locations/${row!.id}`);
    expect(updated.ok()).toBeTruthy();
    const detail = (await updated.json()) as {
      locationCode: string;
      name: string;
      attendanceRadiusMeters: number;
    };
    expect(detail.locationCode).toBe(code);
    expect(detail.name).toContain("Renamed");
    expect(detail.attendanceRadiusMeters).toBe(300);

    // Real UI deactivate path: sticky sheet footer button → confirmation → list/status.
    const deactivateBtn = page.getByTestId("wl-detail-deactivate");
    await expect(deactivateBtn).toBeVisible({ timeout: 10_000 });
    const deactivateResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/work-locations/${row!.id}/deactivate`) &&
        response.request().method() === "POST",
      { timeout: 20_000 },
    );
    await deactivateBtn.click();
    await page.getByTestId("wl-deactivate-confirm").click();
    expect((await deactivateResponse).ok()).toBeTruthy();
    await expect(page.getByText(/Inactive/i).filter({ visible: true }).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Work Locations/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/Work Locations/i).first()).toBeVisible();
    await page.getByPlaceholder(/Search name, code, or city/i).fill(code);
    await expect(page.getByText(/Inactive/i).filter({ visible: true }).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: /^View$/i }).filter({ visible: true }).first().click();
    const reactivateBtn = page.getByTestId("wl-detail-reactivate");
    await expect(reactivateBtn).toBeVisible({ timeout: 10_000 });
    const reactivateResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/work-locations/${row!.id}/reactivate`) &&
        response.request().method() === "POST",
      { timeout: 20_000 },
    );
    await reactivateBtn.click();
    expect((await reactivateResponse).ok()).toBeTruthy();
    await expect(page.getByTestId("wl-detail-deactivate")).toBeVisible({ timeout: 15_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Work Locations/i })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByPlaceholder(/Search name, code, or city/i).fill(code);
    await expect(page.getByText(/Active/i).filter({ visible: true }).first()).toBeVisible({
      timeout: 15_000,
    });

    // Historical attendance / identity unchanged (location still resolvable by id).
    const after = await request.get(`${API_BASE}/work-locations/${row!.id}`);
    expect(after.ok()).toBeTruthy();
    const afterBody = (await after.json()) as { id: string; locationCode: string; status: string };
    expect(afterBody.id).toBe(row!.id);
    expect(afterBody.locationCode).toBe(code);
    expect(afterBody.status).toBe("ACTIVE");

    expect(diagnostics.consoleErrors, formatDiagnostics(diagnostics)).toEqual([]);
  });

  test("employee is forbidden from work-location mutations (403)", async ({ request }) => {
    const login = await request.post(`${API_BASE}/auth/login`, {
      data: { email: "e2e-employee@test.local", password: "E2eTestPass123!" },
    });
    expect(login.ok()).toBeTruthy();
    const create = await request.post(`${API_BASE}/work-locations`, {
      data: {
        name: "Forbidden Loc",
        code: `FORBIDDEN_${Date.now().toString().slice(-5)}`,
        locationType: "OFFICE",
        addressLine1: "x",
        city: "Hyderabad",
        state: "TELANGANA",
        postalCode: "500001",
        latitude: 17.4,
        longitude: 78.4,
        attendanceRadiusMeters: 250,
      },
    });
    expect(create.status()).toBe(403);
  });

  for (const viewport of VIEWPORTS) {
    test(`work locations layout fits ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await loginAs(page, "developer_admin");
      await gotoWorkLocations(page);
      expect(await findOverflow(page), `overflow at ${viewport.label}`).toBeNull();
    });
  }
});
