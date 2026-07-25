import { expect, test } from "@playwright/test";

type TestUser = { role: string; email: string; password: string };

function configuredUsers(): TestUser[] {
  try {
    return JSON.parse(process.env.E2E_USERS_JSON ?? "[]") as TestUser[];
  } catch {
    return [];
  }
}

test("login screen is usable on desktop and mobile", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.locator("#password")).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
});

for (const user of configuredUsers()) {
  test(`${user.role} can sign in and open permitted navigation`, async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(user.email);
    await page.locator("#password").fill(user.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/dashboard|first-login/);
    await expect(page.locator("main")).toBeVisible();
  });
}
