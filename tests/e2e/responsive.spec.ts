import { expect, test, type Page } from "@playwright/test";

/**
 * Walks the authenticated app at the widths the product has to support and
 * fails on horizontal overflow, uncaught page errors, and failed API calls.
 *
 * Needs a seeded backend. Set E2E_LOGIN_EMAIL / E2E_LOGIN_PASSWORD; the suite
 * skips itself when they are absent so CI without a database stays green.
 */
const EMAIL = process.env.E2E_LOGIN_EMAIL;
const PASSWORD = process.env.E2E_LOGIN_PASSWORD;

/** The narrowest phone the product supports, plus the usual breakpoints. */
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

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(EMAIL!);
  await page.locator("#password").fill(PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/dashboard|first-login|face/, { timeout: 20_000 });
  // A freshly seeded account is forced through a password change first.
  if (page.url().includes("first-login")) {
    await page.locator("#password, #newPassword").first().fill(PASSWORD!);
    const confirm = page.locator("#confirmPassword");
    if (await confirm.count()) await confirm.fill(PASSWORD!);
    await page.getByRole("button", { name: /save|continue|update/i }).click();
    await page.waitForURL(/dashboard/, { timeout: 20_000 });
  }
}

/**
 * Measures the widest offending element rather than only the document, so a
 * failure names the element to fix instead of just reporting a number.
 */
async function findOverflow(page: Page) {
  return page.evaluate(() => {
    const docWidth = document.documentElement.clientWidth;
    // 1px of slack absorbs sub-pixel rounding in the layout engine.
    const limit = docWidth + 1;
    let worst: { selector: string; right: number } | null = null;
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.position === "fixed" || style.visibility === "hidden") continue;
      // An element inside its own horizontal scroller is intentional.
      let parent = el.parentElement;
      let scrollable = false;
      while (parent && parent !== document.body) {
        const overflowX = getComputedStyle(parent).overflowX;
        if (overflowX === "auto" || overflowX === "scroll") {
          scrollable = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (scrollable) continue;
      if (rect.right > limit && (!worst || rect.right > worst.right)) {
        const id = el.id ? `#${el.id}` : "";
        const cls =
          el.className && typeof el.className === "string"
            ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}`
            : "";
        worst = {
          selector: `${el.tagName.toLowerCase()}${id}${cls}`,
          right: Math.round(rect.right),
        };
      }
    }
    if (!worst && document.documentElement.scrollWidth <= limit) return null;
    return {
      docWidth,
      scrollWidth: Math.max(document.documentElement.scrollWidth, worst?.right ?? 0),
      worst,
    };
  });
}

test.describe("authenticated responsive sweep", () => {
  test.skip(!EMAIL || !PASSWORD, "Set E2E_LOGIN_EMAIL and E2E_LOGIN_PASSWORD to run");
  test.describe.configure({ mode: "serial" });
  // One test walks every route, so it needs far more than the default budget.
  test.setTimeout(180_000);

  // Sign in once and resize between passes: the auth limiter is deliberately
  // strict, and a login per viewport would exhaust it.
  test("every screen fits its viewport and raises no page errors", async ({ page }) => {
    const pageErrors: string[] = [];
    const serverErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(`${error.name}: ${error.message}`));
    page.on("response", (response) => {
      if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
    });

    await page.setViewportSize({ width: WIDTHS[0].width, height: WIDTHS[0].height });
    await signIn(page);

    const overflows: string[] = [];
    let screensChecked = 0;
    for (const viewport of WIDTHS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const route of ROUTES) {
        // The app polls for notifications, so networkidle never settles.
        await page.goto(route, { waitUntil: "domcontentloaded" });
        // Routes the signed-in role cannot open are not this test's concern.
        if (!page.url().includes(route)) continue;
        screensChecked += 1;
        await page.locator("main").first().waitFor({ state: "visible", timeout: 15_000 });
        // Let data land and the layout settle before measuring.
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

    // Guards against a vacuous pass: a redirect loop or a broken sign-in would
    // otherwise skip every route and still report success.
    expect(screensChecked, "Screens actually measured").toBeGreaterThanOrEqual(
      ROUTES.length * WIDTHS.length * 0.8,
    );
    expect(overflows, "Horizontal overflow").toEqual([]);
    expect(pageErrors, "Uncaught page errors").toEqual([]);
    expect(serverErrors, "Server errors during navigation").toEqual([]);
  });
});
