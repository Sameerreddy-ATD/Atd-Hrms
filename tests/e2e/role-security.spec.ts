import { expect, test } from "@playwright/test";
import { apiLogin, loginAs } from "./helpers/auth";
import { API_BASE, E2E_PASSWORD } from "./helpers/users";

test.describe("role security matrix — UI + API + DB", () => {
  test.setTimeout(180_000);

  test("organization unit never silently elevates User.role", async ({ page, request }) => {
    await loginAs(page, "developer_admin");
    await apiLogin(request, "developer_admin");

    const depts = (await (await request.get(`${API_BASE}/departments`)).json()) as Array<{
      id: string;
      name: string;
    }>;
    const idOf = (name: string) => depts.find((d) => d.name === name)?.id ?? null;

    const employeeCases = [
      { unit: "Hr Department", email: `e2e-role-hr-${Date.now()}@test.local` },
      { unit: "Fleet & Driver Team", email: `e2e-role-fleet-${Date.now()}@test.local` },
      { unit: "Sales Team", email: `e2e-role-sales-${Date.now()}@test.local` },
      { unit: "Chief of Staff", email: `e2e-role-cos-${Date.now()}@test.local` },
    ];

    for (const c of employeeCases) {
      const create = await request.post(`${API_BASE}/users`, {
        data: {
          name: `Role Matrix Employee`,
          email: c.email,
          password: E2E_PASSWORD,
          role: "EMPLOYEE",
          departmentId: idOf(c.unit),
        },
      });
      expect(create.ok(), await create.text()).toBeTruthy();
      expect(String(((await create.json()) as { role: string }).role).toUpperCase()).toBe(
        "EMPLOYEE",
      );
    }

    // No organization unit + EMPLOYEE must NOT become CEO — product requires a unit.
    const noUnitEmployee = await request.post(`${API_BASE}/users`, {
      data: {
        name: "No Unit Employee",
        email: `e2e-role-nounit-${Date.now()}@test.local`,
        password: E2E_PASSWORD,
        role: "EMPLOYEE",
        departmentId: null,
      },
    });
    expect(noUnitEmployee.status()).toBe(400);
    expect(await noUnitEmployee.text()).toMatch(/organization unit/i);

    const privileged = [
      { role: "CEO", departmentId: null as string | null, phone: undefined as string | undefined },
      { role: "CHIEF_OF_STAFF", departmentId: idOf("Chief of Staff"), phone: undefined },
      { role: "HR", departmentId: idOf("Hr Department"), phone: undefined },
      { role: "SALES", departmentId: idOf("Sales Team"), phone: undefined },
      {
        role: "DRIVER",
        departmentId: idOf("Fleet & Driver Team"),
        phone: `98${Date.now().toString().slice(-8)}`,
      },
    ] as const;

    for (const p of privileged) {
      const create = await request.post(`${API_BASE}/users`, {
        data: {
          name: `Priv ${p.role}`,
          email: `e2e-priv-${p.role.toLowerCase()}-${Date.now()}@test.local`,
          password: E2E_PASSWORD,
          role: p.role,
          departmentId: p.departmentId,
          phone: p.phone,
        },
      });
      expect(create.ok(), await create.text()).toBeTruthy();
      expect(String(((await create.json()) as { role: string }).role).toUpperCase()).toBe(p.role);
    }

    // UI path: Create Login with HR unit + Team Member → EMPLOYEE
    const uiEmail = `e2e-ui-employee-${Date.now()}@test.local`;
    await page.goto("/users?create=true", { waitUntil: "domcontentloaded" });
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await dialog.locator("#create-full-name").fill("UI Role Employee");
    await dialog.locator("#create-email").fill(uiEmail);
    await dialog.locator("#create-temp-password").fill(E2E_PASSWORD);
    // Select unit first (suggests HR), then explicitly confirm Team Member so roleTouched wins.
    await dialog.getByText(/^organization unit$/i).locator("..").getByRole("combobox").click();
    const hrOption = page.getByRole("option", { name: /Hr Department/i }).first();
    await expect(hrOption).toBeVisible({ timeout: 15_000 });
    await hrOption.click();
    await dialog.getByText(/application access role/i).locator("..").getByRole("combobox").click();
    await page.getByRole("option", { name: "Team Member", exact: true }).click();
    // Re-assert the combobox shows Team Member after unit suggestion.
    await expect(
      dialog.getByText(/application access role/i).locator("..").getByRole("combobox"),
    ).toContainText(/Team Member/i);
    const branchCombo = dialog.getByText(/attendance location/i).locator("..").getByRole("combobox");
    await expect(branchCombo).toBeVisible();
    await branchCombo.click();
    const hqOpt = page.getByRole("option", { name: /E2E HQ/i }).first();
    await expect(hqOpt).toBeVisible({ timeout: 10_000 });
    await hqOpt.click();
    await page.keyboard.press("Escape").catch(() => undefined);
    const createBtn = dialog.getByRole("button", { name: /create account/i });
    await createBtn.scrollIntoViewIfNeeded();
    const createWait = page.waitForResponse(
      (r) => r.url().includes("/users") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await createBtn.click();
    const uiRes = await createWait;
    expect(uiRes.ok() || uiRes.status() === 201, await uiRes.text()).toBeTruthy();
    expect(String(((await uiRes.json()) as { role: string }).role).toUpperCase()).toBe("EMPLOYEE");

    await apiLogin(request, "employee");
    for (const p of privileged) {
      const unauthorized = await request.post(`${API_BASE}/users`, {
        data: {
          name: `Bad ${p.role}`,
          email: `e2e-unauth-${p.role.toLowerCase()}-${Date.now()}@test.local`,
          password: E2E_PASSWORD,
          role: p.role,
          departmentId: p.departmentId,
          phone: p.phone,
        },
      });
      expect(unauthorized.status()).toBe(403);
    }
  });
});
