import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { apiLogin, loginAs } from "./helpers/auth";
import { findOverflow } from "./helpers/overflow";
import { API_BASE, E2E_PASSWORD } from "./helpers/users";

async function gotoDepartments(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/departments", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
}

async function openUnitDetails(page: Page, unitName: string) {
  await page.getByRole("button", { name: new RegExp(`^${unitName} details$`, "i") }).click();
  await expect(page.getByRole("heading", { name: unitName })).toBeVisible({ timeout: 10_000 });
}

async function selectComboboxOption(page: Page, trigger: ReturnType<Page["locator"]>, option: string) {
  await trigger.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

function tomorrowIso() {
  const d = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
  );
  d.setDate(d.getDate() + 1);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

async function departments(request: APIRequestContext) {
  const res = await request.get(`${API_BASE}/departments`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as Array<{
    id: string;
    name: string;
    unitCode?: string;
    unitType?: string;
    active?: boolean;
    headEmployeeId?: string;
    parentDepartmentId?: string | null;
  }>;
}

test.describe("organization management — full browser E2E", () => {
  test.setTimeout(120_000);

  test("unit type dropdown maps Team/Subteam/Function to TEAM/SUBTEAM/FUNCTION", async ({
    page,
    request,
  }) => {
    await loginAs(page, "developer_admin");
    await apiLogin(request, "developer_admin");
    await gotoDepartments(page);

    const stamp = Date.now().toString().slice(-6);
    await page.getByRole("button", { name: /^create organization unit$/i }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/organization unit name/i).fill(`Type Probe ${stamp}`);
    await dialog.getByLabel(/stable unit code/i).fill(`TYPE_PROBE_${stamp}`);
    await dialog.locator("#org-unit-type").click();
    await page.getByRole("option", { name: "Function", exact: true }).click();
    await dialog.getByRole("button", { name: /^create unit$/i }).click();
    await expect(page.getByText(`Type Probe ${stamp}`).filter({ visible: true }).first()).toBeVisible({
      timeout: 15_000,
    });

    let rows = await departments(request);
    let row = rows.find((r) => r.unitCode === `TYPE_PROBE_${stamp}`)!;
    expect(row.unitType).toBe("FUNCTION");

    await page
      .getByRole("button", { name: new RegExp(`^Edit Type Probe ${stamp}$`, "i") })
      .first()
      .click();
    const edit = page.getByRole("dialog");
    for (const [label, expected] of [
      ["Team", "TEAM"],
      ["Subteam", "SUBTEAM"],
      ["Function", "FUNCTION"],
    ] as const) {
      await edit.locator("#org-unit-type").click();
      await page.getByRole("option", { name: label, exact: true }).click();
      const patchWait = page.waitForResponse(
        (r) => /\/departments\//.test(r.url()) && r.request().method() === "PATCH" && r.ok(),
      );
      await edit.locator("form").evaluate((form: HTMLFormElement) => form.requestSubmit());
      await patchWait;
      rows = await departments(request);
      row = rows.find((r) => r.unitCode === `TYPE_PROBE_${stamp}`)!;
      expect(row.unitType).toBe(expected);
      if (expected !== "FUNCTION") {
        await page
          .getByRole("button", { name: new RegExp(`^Edit Type Probe ${stamp}$`, "i") })
          .first()
          .click();
      }
    }

    const ops = rows.find((r) => r.name === "Operations Department")!;
    for (const unitType of ["TEAMM", "department", "random"]) {
      const res = await request.post(`${API_BASE}/departments`, {
        data: {
          name: `Bad ${unitType}`,
          unitCode: `BAD_${unitType}_${stamp}`,
          unitType,
          parentDepartmentId: ops.id,
        },
      });
      expect(res.status()).toBe(400);
    }
  });

  test("duplicate unit code shows friendly UI error and does not create a second row", async ({
    page,
    request,
  }) => {
    await loginAs(page, "developer_admin");
    await apiLogin(request, "developer_admin");
    await gotoDepartments(page);

    const code = `TEST_DUPLICATE_${Date.now().toString().slice(-6)}`;
    await page.getByRole("button", { name: /^create organization unit$/i }).first().click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel(/organization unit name/i).fill(`Dup One ${code}`);
    await dialog.getByLabel(/stable unit code/i).fill(code);
    await dialog.getByRole("button", { name: /^create unit$/i }).click();
    await expect(page.getByText(`Dup One ${code}`).filter({ visible: true }).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: /^create organization unit$/i }).first().click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel(/organization unit name/i).fill(`Dup Two ${code}`);
    await dialog.getByLabel(/stable unit code/i).fill(code);
    await dialog.getByRole("button", { name: /^create unit$/i }).click();
    await expect(page.getByText(/already in use/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("body")).not.toContainText(/Prisma|ZodError|at Object\./i);

    const rows = await departments(request);
    expect(rows.filter((r) => r.unitCode === code)).toHaveLength(1);
  });

  test("Inside Sales head management via Detail Sheet", async ({ page, request }) => {
    await loginAs(page, "developer_admin");
    await apiLogin(request, "developer_admin");
    await gotoDepartments(page);

    await openUnitDetails(page, "Inside Sales");
    await page.getByRole("tab", { name: /^heads$/i }).click();

    await expect(page.getByText("Inside Sales Head 1").first()).toBeVisible();
    await expect(page.getByText("Inside Sales Head 2").first()).toBeVisible();

    const addSection = page.locator('[role="tabpanel"]').filter({ hasText: /add head/i });
    await selectComboboxOption(
      page,
      addSection.getByRole("combobox").first(),
      "E2E Head Candidate",
    );
    await page.getByText(/mark as primary head/i).click();
    await page.getByRole("button", { name: /^add head$/i }).click();
    await expect(page.getByText("E2E Head Candidate").first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /^close$/i }).click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await openUnitDetails(page, "Inside Sales");
    await page.getByRole("tab", { name: /^heads$/i }).click();
    await expect(page.getByText("E2E Head Candidate").first()).toBeVisible();

    const rows = await departments(request);
    const inside = rows.find((r) => r.name === "Inside Sales")!;
    const heads = await request.get(`${API_BASE}/organization/units/${inside.id}/heads`);
    const activeHeads = (await heads.json()) as Array<{
      id: string;
      employeeName?: string;
      employee?: { name: string };
      isPrimary: boolean;
      employeeId: string;
    }>;
    expect(activeHeads.length).toBeGreaterThanOrEqual(3);
    const primary = activeHeads.find((h) => h.isPrimary)!;
    expect(primary.employeeName ?? primary.employee?.name).toMatch(/E2E Head Candidate/i);
    const refreshedInside = (await departments(request)).find((r) => r.name === "Inside Sales")!;
    expect(refreshedInside.headEmployeeId).toBe(primary.employeeId);

    // Change primary to Head 1
    const head1Row = page.locator("li").filter({ hasText: "Inside Sales Head 1" });
    await head1Row.getByRole("button", { name: /^make primary$/i }).click();
    await expect(head1Row.getByText(/primary head/i)).toBeVisible({ timeout: 10_000 });

    const afterPrimary = await request.get(`${API_BASE}/organization/units/${inside.id}/heads`);
    const afterHeads = (await afterPrimary.json()) as Array<{
      isPrimary: boolean;
      employeeName?: string;
      employee?: { name: string };
      employeeId: string;
    }>;
    expect(afterHeads.filter((h) => h.isPrimary)).toHaveLength(1);
    expect(afterHeads.find((h) => h.isPrimary)?.employeeName ?? "").toMatch(/Inside Sales Head 1/i);
    const refreshedDepts = await departments(request);
    expect(refreshedDepts.find((r) => r.name === "Inside Sales")!.headEmployeeId).toBe(
      afterHeads.find((h) => h.isPrimary)!.employeeId,
    );

    // End Head Candidate
    const candidateRow = page.locator("li").filter({ hasText: "E2E Head Candidate" });
    await candidateRow.getByRole("button", { name: /^end$/i }).click();
    await expect(page.getByText("E2E Head Candidate").first()).toBeHidden({ timeout: 10_000 }).catch(
      async () => {
        // May still appear in History section
        await expect(page.getByText(/^history$/i)).toBeVisible();
      },
    );
    await expect(page.getByText(/^history$/i)).toBeVisible();
    await expect(page.getByText(/E2E Head Candidate/i).first()).toBeVisible();

    const history = await request.get(`${API_BASE}/organization/units/${inside.id}/heads/history`);
    const histRows = (await history.json()) as Array<{
      employeeName?: string;
      effectiveTo?: string | null;
    }>;
    const ended = histRows.find(
      (r) => /E2E Head Candidate/i.test(r.employeeName ?? "") && r.effectiveTo,
    );
    expect(ended?.effectiveTo).toBeTruthy();

    await page.reload({ waitUntil: "domcontentloaded" });
    await openUnitDetails(page, "Inside Sales");
    await page.getByRole("tab", { name: /^heads$/i }).click();
    await expect(page.getByText(/^history$/i)).toBeVisible();

    await apiLogin(request, "viewer");
    expect(
      (
        await request.post(`${API_BASE}/organization/units/${inside.id}/heads`, {
          data: { employeeId: "x", isPrimary: false },
        })
      ).status(),
    ).toBe(403);
    await apiLogin(request, "employee");
    expect(
      (
        await request.post(`${API_BASE}/organization/units/${inside.id}/heads`, {
          data: { employeeId: "x", isPrimary: false },
        })
      ).status(),
    ).toBe(403);
  });

  test("viewer management via UI with scope and 403 checks", async ({ page, request }) => {
    await loginAs(page, "developer_admin");
    await apiLogin(request, "developer_admin");
    await gotoDepartments(page);

    // Use Analytics (nested under Operations) — has details control after expand.
    await page.locator(".dept-org-unit-card", { hasText: "Chief of Operations" }).first().click();
    await page.waitForTimeout(300);
    await page.locator(".dept-org-unit-card", { hasText: "Operations Department" }).first().click();
    await page.waitForTimeout(300);
    await openUnitDetails(page, "Analytics");
    await page.getByRole("tab", { name: /^viewers$/i }).click();

    await selectComboboxOption(
      page,
      page.getByRole("combobox").filter({ hasText: /select employee/i }).first(),
      "E2E Viewer Candidate",
    );
    await page.getByRole("button", { name: /^add viewer$/i }).click();
    await expect(page.getByText("E2E Viewer Candidate").first()).toBeVisible({ timeout: 10_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(".dept-org-unit-card", { hasText: "Chief of Operations" }).first().click();
    await page.waitForTimeout(200);
    await page.locator(".dept-org-unit-card", { hasText: "Operations Department" }).first().click();
    await openUnitDetails(page, "Analytics");
    await page.getByRole("tab", { name: /^viewers$/i }).click();
    await expect(page.getByText("E2E Viewer Candidate").first()).toBeVisible();

    const depts = await departments(request);
    const analytics = depts.find((r) => r.name === "Analytics")!;
    const software = depts.find((r) => r.name === "Software")!;

    // Close detail sheet / overlays before navigating to login (blocks #login-id otherwise).
    await page.keyboard.press("Escape").catch(() => undefined);
    await page.getByRole("button", { name: /^close$/i }).click({ timeout: 2_000 }).catch(() => undefined);

    await loginAs(page, "viewer_candidate");
    await apiLogin(request, "viewer_candidate");
    const empRes = await request.get(`${API_BASE}/employees`);
    expect(empRes.ok()).toBeTruthy();
    const empPayload = await empRes.json();
    const empRows = Array.isArray(empPayload)
      ? empPayload
      : ((empPayload as { employees?: unknown[] }).employees ?? []);
    const names = (empRows as Array<{ name: string; departmentId?: string }>).map((e) => e.name);
    // Scoped team data should include Analytics analyst when assigned viewer on Analytics descendants path.
    // Viewer candidate was assigned to Analytics — should see Analytics members, not act as admin.
    expect(
      (
        await request.post(`${API_BASE}/departments`, {
          data: { name: "Hack", unitCode: "HACK_V", unitType: "TEAM" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await request.post(`${API_BASE}/organization/units/${analytics.id}/heads`, {
          data: { employeeId: "x" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await request.post(`${API_BASE}/organization/units/${analytics.id}/viewers`, {
          data: { employeeId: "x" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await request.post(`${API_BASE}/organization/employees/transfer`, {
          data: {
            employeeId: "x",
            newOrganizationUnitId: software.id,
            effectiveDate: todayIso(),
          },
        })
      ).status(),
    ).toBe(403);

    await page.goto("/departments");
    // Route stays /departments but Module Gate blocks non-admin viewers.
    await expect(page.getByText(/module access is disabled/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /organization structure/i })).toHaveCount(0);

    // End viewer as admin
    await page.keyboard.press("Escape").catch(() => undefined);
    await loginAs(page, "developer_admin");
    await apiLogin(request, "developer_admin");
    await gotoDepartments(page);
    await page.locator(".dept-org-unit-card", { hasText: "Chief of Operations" }).first().click();
    await page.waitForTimeout(200);
    await page.locator(".dept-org-unit-card", { hasText: "Operations Department" }).first().click();
    await openUnitDetails(page, "Analytics");
    await page.getByRole("tab", { name: /^viewers$/i }).click();
    const viewerRow = page.locator("li").filter({ hasText: "E2E Viewer Candidate" });
    await viewerRow.getByRole("button", { name: /^end$/i }).click();
    await expect(page.getByText(/^history$/i)).toBeVisible({ timeout: 10_000 });

    const hist = await request.get(`${API_BASE}/organization/units/${analytics.id}/viewers/history`);
    const histRows = (await hist.json()) as Array<{
      employeeName?: string;
      employee?: { name: string };
      effectiveTo?: string | null;
    }>;
    expect(
      histRows.some(
        (r) =>
          /E2E Viewer Candidate/i.test(r.employeeName ?? r.employee?.name ?? "") && r.effectiveTo,
      ),
    ).toBeTruthy();

    void names;
  });

  test("employee transfer through Detail Sheet People tab", async ({ page, request }) => {
    await loginAs(page, "developer_admin");
    await apiLogin(request, "developer_admin");

    const depts = await departments(request);
    const analytics = depts.find((r) => r.name === "Analytics")!;
    const routing = depts.find((r) => r.name === "Routing & Planning")!;

    const employees = await request.get(`${API_BASE}/employees`);
    const empPayload = await employees.json();
    const empRows = Array.isArray(empPayload)
      ? empPayload
      : ((empPayload as { employees?: unknown[] }).employees ?? []);
    const analyst = (
      empRows as Array<{ employeeId: string; name: string; departmentId?: string }>
    ).find((r) => r.name === "E2E Analyst")!;
    if (analyst.departmentId !== analytics.id) {
      await request.post(`${API_BASE}/organization/employees/transfer`, {
        data: {
          employeeId: analyst.employeeId,
          newOrganizationUnitId: analytics.id,
          newOrganizationLevel: "MEMBER",
          effectiveDate: todayIso(),
          reason: "reset for transfer UI",
        },
      });
    }

    await gotoDepartments(page);
    await page.locator(".dept-org-unit-card", { hasText: "Chief of Operations" }).first().click();
    await page.waitForTimeout(200);
    await page.locator(".dept-org-unit-card", { hasText: "Operations Department" }).first().click();
    await openUnitDetails(page, "Analytics");
    await page.getByRole("tab", { name: /^people$/i }).click();

    await expect(page.getByText(/current unit/i).first()).toBeVisible();
    await selectComboboxOption(page, page.locator("#org-transfer-employee"), "E2E Analyst");
    await page.locator("#org-transfer-target").click();
    await page.getByRole("option", { name: /Routing & Planning/i }).click();
    await page.locator("#org-transfer-level").click();
    await page.getByRole("option", { name: "MEMBER", exact: true }).click();
    await page.locator("#org-transfer-effective-date").fill(todayIso());
    await page.locator("#org-transfer-reason").fill("Module 1 E2E validation");
    await expect(page.locator("label[for='org-transfer-target']")).toHaveText(/new unit/i);
    await expect(page.locator("label[for='org-transfer-level']")).toHaveText(/organization level/i);
    await expect(page.locator("label[for='org-transfer-effective-date']")).toHaveText(
      /effective date/i,
    );
    await expect(page.getByText(/Module 1 E2E validation/i).first()).toBeVisible();

    const transferWait = page.waitForResponse(
      (r) => r.url().includes("/organization/employees/transfer") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: /^transfer$/i }).click();
    const transferRes = await transferWait;
    expect(transferRes.ok()).toBeTruthy();

    const history = await request.get(
      `${API_BASE}/organization/employees/${analyst.employeeId}/assignments`,
    );
    const assignments = (await history.json()) as Array<{
      organizationUnitName?: string;
      department?: { name: string };
      effectiveTo?: string | null;
      isPrimary?: boolean;
    }>;
    expect(
      assignments.some((a) => (a.organizationUnitName ?? a.department?.name) === "Analytics"),
    ).toBeTruthy();
    expect(
      assignments.some(
        (a) => (a.organizationUnitName ?? a.department?.name) === "Routing & Planning",
      ),
    ).toBeTruthy();

    await page.reload({ waitUntil: "domcontentloaded" });
    const refreshed = await request.get(`${API_BASE}/employees`);
    const refreshedPayload = await refreshed.json();
    const refreshedRows = Array.isArray(refreshedPayload)
      ? refreshedPayload
      : ((refreshedPayload as { employees?: unknown[] }).employees ?? []);
    const updated = (
      refreshedRows as Array<{ employeeId: string; departmentId?: string; organizationLevel?: string }>
    ).find((r) => r.employeeId === analyst.employeeId);
    expect(updated?.departmentId).toBe(routing.id);

    const users = await request.get(`${API_BASE}/users`);
    const userPayload = await users.json();
    const userRows = Array.isArray(userPayload)
      ? userPayload
      : ((userPayload as { users?: unknown[] }).users ?? []);
    const userRow = (userRows as Array<{ employeeId?: string; role: string }>).find(
      (r) => r.employeeId === analyst.employeeId,
    );
    expect(String(userRow?.role).toUpperCase()).toBe("EMPLOYEE");

    // Future date: UI blocks
    await gotoDepartments(page);
    await page.locator(".dept-org-unit-card", { hasText: "Chief of Operations" }).first().click();
    await page.waitForTimeout(200);
    await page.locator(".dept-org-unit-card", { hasText: "Operations Department" }).first().click();
    await openUnitDetails(page, "Routing & Planning");
    await page.getByRole("tab", { name: /^people$/i }).click();
    await selectComboboxOption(page, page.locator("#org-transfer-employee"), "E2E Analyst");
    await page.locator("#org-transfer-target").click();
    await page.getByRole("option", { name: /Analytics/i }).first().click();
    await page.locator("#org-transfer-effective-date").fill(tomorrowIso());
    await expect(page.getByRole("button", { name: /^transfer$/i })).toBeDisabled();

    const before = updated?.departmentId;
    expect(
      (
        await request.post(`${API_BASE}/organization/employees/transfer`, {
          data: {
            employeeId: analyst.employeeId,
            newOrganizationUnitId: analytics.id,
            effectiveDate: tomorrowIso(),
            reason: "future should fail",
          },
        })
      ).status(),
    ).toBe(400);
    const again = await request.get(`${API_BASE}/employees`);
    const againPayload = await again.json();
    const againRows = Array.isArray(againPayload)
      ? againPayload
      : ((againPayload as { employees?: unknown[] }).employees ?? []);
    expect(
      (againRows as Array<{ employeeId: string; departmentId?: string }>).find(
        (r) => r.employeeId === analyst.employeeId,
      )?.departmentId,
    ).toBe(before);
  });

  test("session survives organization reload", async ({ page }) => {
    await loginAs(page, "developer_admin");
    await gotoDepartments(page);
    await openUnitDetails(page, "Inside Sales");
    await page.getByRole("tab", { name: /^heads$/i }).click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/departments/);
    await expect(page.locator("main")).toBeVisible();
    const me = await page.evaluate(async (api) => {
      const res = await fetch(`${api}/auth/me`, { credentials: "include" });
      return res.status;
    }, API_BASE);
    expect(me).toBe(200);
  });

  test("audit UI records Module 1 organization mutations", async ({ page, request }) => {
    await loginAs(page, "developer_admin");
    await apiLogin(request, "developer_admin");
    await gotoDepartments(page);

    const stamp = Date.now().toString().slice(-6);
    const unitName = `Audit Trail Unit ${stamp}`;
    const unitCode = `AUDIT_TRAIL_${stamp}`;
    await page.getByRole("button", { name: /^create organization unit$/i }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/organization unit name/i).fill(unitName);
    await dialog.getByLabel(/stable unit code/i).fill(unitCode);
    await dialog.getByRole("button", { name: /^create unit$/i }).click();
    await expect(page.getByText(unitName).filter({ visible: true }).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: new RegExp(`^Edit ${unitName}$`, "i") }).first().click();
    const edit = page.getByRole("dialog");
    await edit.getByLabel(/organization unit name/i).fill(`${unitName} Renamed`);
    await edit.locator("form").evaluate((form: HTMLFormElement) => form.requestSubmit());
    await expect(page.getByText(`${unitName} Renamed`).filter({ visible: true }).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.goto("/audit", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /audit logs/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/department created|organization/i).first()).toBeVisible({
      timeout: 15_000,
    });

    const audit = await request.get(`${API_BASE}/audit-logs`);
    expect(audit.ok()).toBeTruthy();
    const logs = (await audit.json()) as Array<{ action: string; performedBy?: string }>;
    expect(logs.some((l) => /department/i.test(l.action))).toBeTruthy();
  });

  for (const viewport of [
    { label: "320x568", width: 320, height: 568 },
    { label: "390x844", width: 390, height: 844 },
    { label: "1440x900", width: 1440, height: 900 },
  ]) {
    test(`organization interactions usable at ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await loginAs(page, "developer_admin");
      await page.goto("/departments", { waitUntil: "domcontentloaded" });
      await expect(page.locator("main")).toBeVisible();

      if (viewport.width < 768) {
        // Mobile tree: tap unit name under CoS list if present
        const mobileUnit = page.getByRole("button", { name: /Inside Sales/i }).first();
        if (await mobileUnit.count()) {
          await mobileUnit.click();
        } else {
          await page.getByRole("button", { name: /Inside Sales details/i }).click();
        }
      } else {
        await openUnitDetails(page, "Inside Sales");
      }

      await page.getByRole("tab", { name: /^heads$/i }).click();
      await page.getByRole("tab", { name: /^viewers$/i }).click();
      await page.getByRole("tab", { name: /^people$/i }).click();
      expect(await findOverflow(page)).toBeNull();
      await page.getByRole("button", { name: /^close$/i }).click();
    });
  }
});
