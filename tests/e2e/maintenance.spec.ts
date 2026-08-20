import { test, expect } from "@playwright/test";

/**
 * Frontend maintenance UI against a mocked API response (no production deploy).
 */
test.describe("maintenance UI", () => {
  test("API maintenance response shows branded screen without logout", async ({ page }) => {
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
    });

    // Intercept every auth/API attempt so an already-running backend cannot win the race.
    await page.route("**/auth/restore", async (route) => {
      await route.fulfill({
        status: 503,
        headers: {
          "content-type": "application/json",
          "retry-after": "600",
          "cache-control": "no-store",
        },
        body: JSON.stringify({
          maintenance: true,
          code: "APP_UPDATE_IN_PROGRESS",
          message:
            "The application is being updated by the developer. Please try again after 5–10 minutes.",
          retryAfterSeconds: 600,
          error:
            "The application is being updated by the developer. Please try again after 5–10 minutes.",
        }),
      });
    });
    await page.route("**/auth/refresh", async (route) => {
      await route.fulfill({
        status: 503,
        headers: { "content-type": "application/json", "retry-after": "600" },
        body: JSON.stringify({
          maintenance: true,
          code: "APP_UPDATE_IN_PROGRESS",
          message:
            "The application is being updated by the developer. Please try again after 5–10 minutes.",
          retryAfterSeconds: 600,
        }),
      });
    });
    await page.route("**/maintenance/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          maintenance: true,
          code: "APP_UPDATE_IN_PROGRESS",
          message:
            "The application is being updated by the developer. Please try again after 5–10 minutes.",
          retryAfterSeconds: 600,
        }),
      });
    });

    await page.goto("/");
    // Boot splash can cover the overlay briefly; wait past it.
    await expect(page.getByRole("heading", { name: /Application Update in Progress/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/being updated by the developer|not submitted/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Try Again/i })).toBeVisible();
    await expect(page.getByText(/^503$/)).toHaveCount(0);
    const cached = await page.evaluate(() => window.sessionStorage.getItem("atd.session.user"));
    expect(cached).toBeTruthy();

    await page.getByRole("button", { name: /Try Again/i }).click();
    await expect(page.getByRole("heading", { name: /Application Update in Progress/i })).toBeVisible();
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
