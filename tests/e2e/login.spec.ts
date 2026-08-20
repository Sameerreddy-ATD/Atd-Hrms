import { expect, test } from "@playwright/test";

test.describe("login page", () => {
  test("portal chooser renders without overflow", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /how do you sign in/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /team members/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /bowser pilots/i })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
  });

  test("employee portal shows accessible work-email and password fields", async ({ page }) => {
    await page.goto("/login?as=employee");
    await expect(page.getByRole("heading", { name: /team member sign-in/i })).toBeVisible();
    await expect(page.getByLabel(/work email/i)).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
  });

  test("driver portal shows mobile field instead of email", async ({ page }) => {
    await page.goto("/login?as=driver");
    await expect(page.getByRole("heading", { name: /bowser pilot sign-in/i })).toBeVisible();
    await expect(page.getByLabel(/mobile/i)).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
  });
});
