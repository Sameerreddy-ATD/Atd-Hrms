import { expect, test, type Page } from "@playwright/test";
import { attachDiagnostics, formatDiagnostics, loginAs } from "./helpers/auth";
import { findOverflow } from "./helpers/overflow";
import { API_BASE } from "./helpers/users";

const VIEWPORTS = [
  { label: "320x568", width: 320, height: 568 },
  { label: "360x740", width: 360, height: 740 },
  { label: "390x844", width: 390, height: 844 },
  { label: "768x1024", width: 768, height: 1024 },
  { label: "1024x768", width: 1024, height: 768 },
  { label: "1440x900", width: 1440, height: 900 },
];

async function gotoShifts(page: Page) {
  await page.goto("/shifts", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: /Shift Management/i })).toBeVisible({
    timeout: 20_000,
  });
  const dismiss = page.getByRole("button", { name: /Not now|Dismiss install tip/i });
  if (await dismiss.first().isVisible({ timeout: 1500 }).catch(() => false)) {
    await dismiss.first().click();
  }
}

test.describe("shift roster foundation — browser E2E", () => {
  test.setTimeout(180_000);

  test("create general, night, split; edit night next-day; persistence", async ({ page }) => {
    const diagnostics = attachDiagnostics(page);
    await loginAs(page, "developer_admin");
    await gotoShifts(page);

    const stamp = Date.now().toString().slice(-5);

    async function createTemplate(opts: {
      name: string;
      code: string;
      segments: Array<{ start: string; end: string; nextDay?: boolean }>;
    }) {
      await page.getByRole("button", { name: /^Add template$/i }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await dialog.locator("#shift-name").fill(opts.name);
      await dialog.locator("#shift-code").fill(opts.code);

      for (let i = 0; i < opts.segments.length; i++) {
        if (i > 0) {
          await dialog.getByRole("button", { name: /Add Segment/i }).click();
        }
        const start = dialog.locator(`input[type='time']`).nth(i * 2);
        const end = dialog.locator(`input[type='time']`).nth(i * 2 + 1);
        await start.fill(opts.segments[i]!.start);
        await end.fill(opts.segments[i]!.end);
        if (opts.segments[i]!.nextDay) {
          const endsSelect = dialog.locator("[data-testid='segment-ends']").nth(i);
          if (await endsSelect.count()) {
            await endsSelect.click();
            await page.getByRole("option", { name: /Next Day/i }).click();
          } else {
            const combobox = dialog.getByRole("combobox").nth(i);
            await combobox.click();
            await page.getByRole("option", { name: /Next Day/i }).click();
          }
        }
      }

      const responsePromise = page.waitForResponse(
        (r) =>
          r.url().includes("/shift-templates") &&
          r.request().method() === "POST" &&
          r.ok(),
        { timeout: 20_000 },
      );
      await dialog.getByRole("button", { name: /Create template|Save template|Create|Save/i }).click();
      await responsePromise;
      await expect(dialog).toBeHidden({ timeout: 15_000 });
    }

    await createTemplate({
      name: `E2E General ${stamp}`,
      code: `E2E_GEN_${stamp}`,
      segments: [{ start: "09:00", end: "18:00" }],
    });
    await expect(page.getByText(`E2E General ${stamp}`).filter({ visible: true }).first()).toBeVisible({
      timeout: 15_000,
    });

    await createTemplate({
      name: `E2E Night ${stamp}`,
      code: `E2E_NIGHT_${stamp}`,
      segments: [{ start: "22:00", end: "03:00", nextDay: true }],
    });
    await expect(page.getByText(`E2E Night ${stamp}`).filter({ visible: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/22:00/i).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText(/03:00|Next Day/i).filter({ visible: true }).first()).toBeVisible();

    await createTemplate({
      name: `E2E Split ${stamp}`,
      code: `E2E_SPLIT_${stamp}`,
      segments: [
        { start: "09:00", end: "13:00" },
        { start: "17:00", end: "21:00" },
      ],
    });
    await expect(page.getByText(`E2E Split ${stamp}`).filter({ visible: true }).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Shift Management/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(`E2E Night ${stamp}`).filter({ visible: true }).first()).toBeVisible({
      timeout: 15_000,
    });

    expect(diagnostics.consoleErrors, formatDiagnostics(diagnostics)).toEqual([]);
  });

  test("employee is forbidden from shift-template and roster writes (403)", async ({ request }) => {
    const login = await request.post(`${API_BASE}/auth/login`, {
      data: { email: "e2e-employee@test.local", password: "E2eTestPass123!" },
    });
    expect(login.ok()).toBeTruthy();
    const create = await request.post(`${API_BASE}/shift-templates`, {
      data: {
        name: "Forbidden Shift",
        code: `FORBIDDEN_${Date.now().toString().slice(-5)}`,
        segments: [{ startMinute: 540, endMinute: 1080, endDayOffset: 0 }],
      },
    });
    expect(create.status()).toBe(403);
    const roster = await request.put(`${API_BASE}/roster`, {
      data: {
        employeeId: "any",
        workDate: "2026-08-21",
        shiftId: null,
      },
    });
    expect(roster.status()).toBe(403);
  });

  test("unauthorized employee does not see Add template control", async ({ page }) => {
    await loginAs(page, "employee");
    await page.goto("/shifts", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    await expect(page.getByRole("button", { name: /^Add template$/i })).toHaveCount(0);
  });

  for (const viewport of VIEWPORTS) {
    test(`shift management layout fits ${viewport.label}`, async ({ page }, testInfo) => {
      // Full viewport matrix on desktop; one mobile smoke on android-pixel to avoid login flake.
      if (testInfo.project.name === "android-pixel" && viewport.label !== "390x844") {
        test.skip();
      }
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await loginAs(page, "developer_admin");
      await gotoShifts(page);
      expect(await findOverflow(page), `overflow at ${viewport.label}`).toBeNull();
    });
  }
});
