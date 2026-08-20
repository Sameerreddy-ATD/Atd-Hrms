import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { E2E_PASSWORD } from "./helpers/users";

/** Lightweight desktop smoke after shared modal / permission changes. */
test.describe("desktop smoke — login, org, create login", () => {
  test("login, organization page, and create login dialog work", async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    await loginAs(page, "developer_admin");

    await page.goto("/departments", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/allow precise location/i)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Inside Sales details", exact: true }),
    ).toBeVisible({
      timeout: 15_000,
    });

    await page.goto("/users?create=true", { waitUntil: "domcontentloaded" });
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await dialog.locator("#create-full-name").fill("Desktop Smoke User");
    await expect(dialog.locator("#create-full-name")).toHaveValue("Desktop Smoke User");
    await dialog.locator("#create-email").fill(`e2e-desktop-smoke-${Date.now()}@test.local`);
    await dialog.locator("#create-temp-password").fill(E2E_PASSWORD);
    await dialog.getByRole("button", { name: /cancel/i }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  });
});
