import { expect, test, type Page } from "@playwright/test";
import { attachDiagnostics, formatDiagnostics, loginAs } from "./helpers/auth";
import { findOverflow } from "./helpers/overflow";

const WIDTHS = [
  { label: "320px small phone", width: 320, height: 640 },
  { label: "360px phone", width: 360, height: 740 },
  { label: "768px tablet", width: 768, height: 1024 },
  { label: "1440px desktop", width: 1440, height: 900 },
];

const ROUTES = [
  "/dashboard",
  "/attendance",
  "/attendance/mine",
  "/leave/apply",
  "/leave/balance",
  "/leave/history",
  "/employees",
  "/users",
  "/tasks",
  "/assets",
  "/announcements",
  "/notifications",
  "/profile",
  "/settings",
  "/audit",
  "/departments",
  "/branches",
  "/holidays",
  "/employee-services",
  "/my-assets",
];

test.describe("authenticated responsive sweep", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(240_000);

  test("developer admin routes fit viewport without page errors", async ({ page }) => {
    const diagnostics = attachDiagnostics(page);
    await page.setViewportSize({ width: WIDTHS[0].width, height: WIDTHS[0].height });
    await loginAs(page, "developer_admin");

    const overflows: string[] = [];
    let screensChecked = 0;

    for (const viewport of WIDTHS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const route of ROUTES) {
        await page.goto(route, { waitUntil: "domcontentloaded" });
        if (!page.url().includes(route.split("?")[0])) continue;
        screensChecked += 1;
        await page.locator("main").first().waitFor({ state: "visible", timeout: 15_000 });
        await page.waitForTimeout(400);
        const overflow = await findOverflow(page);
        if (overflow) {
          overflows.push(
            `${viewport.label} ${route}: content ${overflow.scrollWidth}px in ${overflow.docWidth}px` +
              (overflow.worst ? ` — widest offender ${overflow.worst.selector}` : ""),
          );
        }
      }
    }

    expect(screensChecked, "Screens actually measured").toBeGreaterThanOrEqual(
      ROUTES.length * WIDTHS.length * 0.7,
    );
    expect(overflows, "Horizontal overflow").toEqual([]);
    expect(diagnostics.consoleErrors, formatDiagnostics(diagnostics)).toEqual([]);
    expect(diagnostics.networkFailures, formatDiagnostics(diagnostics)).toEqual([]);
  });
});
