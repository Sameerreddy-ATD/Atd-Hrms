import { test, expect } from "@playwright/test";

/**
 * Frontend maintenance UI against a mocked API response (no production deploy).
 * Deterministic readiness: splash gone + alertdialog labelled, no fixed sleeps.
 */
async function mockMaintenanceApis(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      "atd.session.user",
      JSON.stringify({
        id: "u1",
        email: "e2e@test.local",
        name: "E2E User",
        role: "EMPLOYEE",
        mustChangePassword: false,
      }),
    );
    // Skip branded open splash so MaintenanceGate is not raced by lockup animation.
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      if (typeof key === "string" && key.startsWith("atd.boot.lockup.played:")) return "1";
      return originalGetItem.call(this, key);
    };
  });

  const maintenanceBody = {
    maintenance: true,
    code: "APP_UPDATE_IN_PROGRESS",
    message:
      "The application is being updated by the developer. Please try again after 5–10 minutes.",
    retryAfterSeconds: 600,
    error:
      "The application is being updated by the developer. Please try again after 5–10 minutes.",
  };

  await page.route("**/auth/restore", async (route) => {
    await route.fulfill({
      status: 503,
      headers: {
        "content-type": "application/json",
        "retry-after": "600",
        "cache-control": "no-store",
      },
      body: JSON.stringify(maintenanceBody),
    });
  });
  await page.route("**/auth/refresh", async (route) => {
    await route.fulfill({
      status: 503,
      headers: { "content-type": "application/json", "retry-after": "600" },
      body: JSON.stringify(maintenanceBody),
    });
  });
  await page.route("**/maintenance/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(maintenanceBody),
    });
  });
  // Any other API during the overlay should not 401-logout the session.
  await page.route("**/localhost:4000/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/auth/restore") || url.includes("/auth/refresh") || url.includes("/maintenance/status")) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 503,
      headers: { "content-type": "application/json", "retry-after": "600" },
      body: JSON.stringify(maintenanceBody),
    });
  });
}

test.describe("maintenance UI", () => {
  test("API maintenance response shows branded screen without logout", async ({ page }) => {
    await mockMaintenanceApis(page);

    await page.goto("/");
    await expect(page.locator(".atd-open-splash")).toHaveCount(0, { timeout: 30_000 });
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(
      dialog.getByRole("heading", { name: /Application Update in Progress/i }),
    ).toBeVisible();
    await expect(dialog.getByText(/being updated by the developer|not submitted/i)).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Try Again/i })).toBeVisible();
    await expect(page.getByText(/^503$/)).toHaveCount(0);
    const cached = await page.evaluate(() => window.sessionStorage.getItem("atd.session.user"));
    expect(cached).toBeTruthy();
    // Must not bounce to login while maintenance overlay is up.
    await expect(page).not.toHaveURL(/\/login/);

    await dialog.getByRole("button", { name: /Try Again/i }).click();
    await expect(
      page.getByRole("alertdialog").getByRole("heading", { name: /Application Update in Progress/i }),
    ).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("static maintenance.html is branded and accessible", async ({ page }) => {
    await page.goto("/maintenance.html");
    await expect(page.getByRole("heading", { name: /Application Update in Progress/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Try Again/i })).toBeVisible();
    await expect(page.locator("main")).toBeVisible();
  });
});

test.describe("maintenance UI viewports", () => {
  for (const size of [
    { w: 320, h: 568 },
    { w: 390, h: 844 },
    { w: 768, h: 1024 },
    { w: 1440, h: 900 },
  ] as const) {
    test(`${size.w}x${size.h}`, async ({ page }) => {
      await page.setViewportSize({ width: size.w, height: size.h });
      await page.goto("/maintenance.html");
      await expect(page.getByRole("heading", { name: /Application Update in Progress/i })).toBeVisible();
      const box = await page.locator("main").boundingBox();
      expect(box).toBeTruthy();
      expect(box!.width).toBeLessThanOrEqual(size.w);
    });
  }
});
