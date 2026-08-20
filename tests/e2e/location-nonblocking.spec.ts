import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { E2E_PASSWORD } from "./helpers/users";

/**
 * Product rule: precise-location sheet must not block Organization / Create Login.
 * It may appear only for attendance location actions.
 */
test.describe("location permission is contextual", () => {
  test("location permission prompt does not block unrelated routes", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, "developer_admin");

    // Unrelated module: Organization Structure must work without location granted.
    await page.goto("/departments", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/allow precise location/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /allow location/i })).toHaveCount(0);

    const mobileUnit = page.getByRole("button", { name: /Inside Sales/i }).first();
    if (await mobileUnit.count()) {
      await mobileUnit.click();
    } else {
      await page.getByRole("button", { name: /Inside Sales details/i }).click();
    }
    await expect(page.getByRole("tab", { name: /^heads$/i })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /^close$/i }).click();

    // Unrelated module: Create Login must accept input without location overlay.
    await page.goto("/users?create=true", { waitUntil: "domcontentloaded" });
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/allow precise location/i)).toHaveCount(0);
    await dialog.locator("#create-full-name").fill("Overlay Check User");
    await expect(dialog.locator("#create-full-name")).toHaveValue("Overlay Check User");
    await dialog.locator("#create-email").fill(`e2e-overlay-${Date.now()}@test.local`);
    await dialog.locator("#create-temp-password").fill(E2E_PASSWORD);
    await dialog.getByRole("button", { name: /cancel/i }).click();

    // Attendance action: Check In should surface the contextual permission UX.
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
    const checkIn = page.getByRole("button", { name: /check in/i }).first();
    await expect(checkIn).toBeVisible({ timeout: 15_000 });
    await checkIn.click();
    await expect(page.getByText(/allow precise location/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /allow location/i })).toBeVisible();
    await page.getByRole("button", { name: /not now/i }).click();
    await expect(page.getByText(/allow precise location/i)).toHaveCount(0);

    // After Not now, Organization remains usable.
    await page.goto("/departments", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/allow precise location/i)).toHaveCount(0);
  });
});
