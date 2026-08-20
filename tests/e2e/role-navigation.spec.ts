import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { E2E_USERS } from "./helpers/users";

for (const [key, user] of Object.entries(E2E_USERS)) {
  if (key === "driver") continue; // driver uses mobile portal, not employee email login
  if (key === "viewer_candidate") continue; // spare seed account for assignment flows
  test(`${key} can sign in and reach dashboard`, async ({ page }) => {
    await loginAs(page, key as keyof typeof E2E_USERS);
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.locator("main")).toBeVisible();
  });
}
