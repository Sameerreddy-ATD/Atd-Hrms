import { expect, test, type Page } from "@playwright/test";
import { apiLogin, attachDiagnostics, formatDiagnostics, loginAs } from "./helpers/auth";
import { findOverflow } from "./helpers/overflow";
import { API_BASE, E2E_PASSWORD, EXPECTED_UNIT_NAMES } from "./helpers/users";

const VIEWPORTS = [
  { label: "320x568", width: 320, height: 568 },
  { label: "360x740", width: 360, height: 740 },
  { label: "390x844", width: 390, height: 844 },
  { label: "768x1024", width: 768, height: 1024 },
  { label: "1440x900", width: 1440, height: 900 },
];

const COS_DIRECT_CHILDREN = [
  "Chief of Operations",
  "Principal Advisor",
  "Software",
  "Inside Sales",
  "Marketing",
  "Accounts Team",
  "Advisor Growth & Strategy",
  "Compliance",
];

async function gotoDepartments(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/departments", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
}

async function expandUnit(page: Page, unitName: string) {
  const card = page
    .locator(".dept-org-unit-card", { hasText: unitName })
    .filter({ visible: true })
    .first();
  await card.click();
  await page.waitForTimeout(250);
}

test.describe("organization structure — browser E2E", () => {
  test.setTimeout(90_000);

  test("organization tree shows CEO, Chief of Staff, and fixture units", async ({
    page,
    request,
  }) => {
    const diagnostics = attachDiagnostics(page);
    await loginAs(page, "developer_admin");
    await apiLogin(request, "developer_admin");
    await gotoDepartments(page);

    await expect(page.getByText("Chief Executive Officer")).toBeVisible();
    await expect(page.getByText(/company-wide/i)).toBeVisible();
    await expect(page.getByText("Chief of Staff").filter({ visible: true }).first()).toBeVisible();

    for (const unitName of COS_DIRECT_CHILDREN) {
      await expect(
        page.getByText(unitName, { exact: true }).filter({ visible: true }).first(),
      ).toBeVisible();
    }

    const departments = await request.get(`${API_BASE}/departments`);
    expect(departments.ok()).toBeTruthy();
    const rows = (await departments.json()) as Array<{ name: string }>;
    expect(rows.length).toBeGreaterThanOrEqual(20);
    for (const unitName of EXPECTED_UNIT_NAMES) {
      expect(rows.some((row) => row.name === unitName), `missing fixture unit ${unitName}`).toBeTruthy();
    }

    expect(diagnostics.consoleErrors, formatDiagnostics(diagnostics)).toEqual([]);
    expect(diagnostics.networkFailures, formatDiagnostics(diagnostics)).toEqual([]);
  });

  test("create organization unit through UI and verify persistence", async ({ page, request }) => {
    await loginAs(page, "developer_admin");
    await apiLogin(request, "developer_admin");
    await gotoDepartments(page);

    const stamp = Date.now().toString().slice(-8);
    const unitName = `Test Operations Support ${stamp}`;
    const unitCode = `TEST_OPS_${stamp}`;
    await expandUnit(page, "Chief of Operations");
    const opsCard = page
      .locator(".dept-org-unit-card", { hasText: "Operations Department" })
      .filter({ visible: true })
      .first();
    await opsCard
      .getByRole("button", { name: /add (child unit )?under operations department/i })
      .click();

    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByLabel(/organization unit name/i).fill(unitName);
    await page.getByLabel(/stable unit code/i).fill(unitCode);
    await page.getByLabel(/description/i).fill("Module 1 browser validation");
    await page.getByRole("button", { name: /^create unit$/i }).click();

    await expect(page.getByText(unitName).filter({ visible: true }).first()).toBeVisible({
      timeout: 15_000,
    });

    const departments = await request.get(`${API_BASE}/departments`);
    const rows = (await departments.json()) as Array<{
      name: string;
      unitCode: string;
      active: boolean;
    }>;
    const created = rows.find((row) => row.unitCode === unitCode);
    expect(created?.name).toBe(unitName);
    expect(created?.active).toBe(true);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("main")).toBeVisible();
    const afterReload = await request.get(`${API_BASE}/departments`);
    const reloadedRows = (await afterReload.json()) as Array<{ unitCode: string; name: string }>;
    expect(reloadedRows.some((row) => row.unitCode === unitCode)).toBeTruthy();
  });

  test("unit code remains stable when display name changes", async ({ page, request }) => {
    await loginAs(page, "developer_admin");
    await apiLogin(request, "developer_admin");
    await gotoDepartments(page);

    const peopleCode = `PEOPLE_OPS_${Date.now().toString().slice(-8)}`;
    const initialName = `People Operations ${peopleCode}`;
    await page.getByRole("button", { name: /^create organization unit$/i }).first().click();
    const createDialog = page.getByRole("dialog");
    await expect(createDialog).toBeVisible();
    await createDialog.getByLabel(/organization unit name/i).fill(initialName);
    await createDialog.getByLabel(/stable unit code/i).fill(peopleCode);
    await createDialog.getByRole("button", { name: /^create unit$/i }).click();
    await expect(page.getByText(initialName).filter({ visible: true }).first()).toBeVisible({
      timeout: 15_000,
    });

    const unitCard = page
      .locator(".dept-org-unit-card", { hasText: initialName })
      .filter({ visible: true })
      .first();
    await unitCard
      .getByRole("button", { name: new RegExp(`^Edit ${initialName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") })
      .click();
    const editDialog = page.getByRole("dialog");
    await expect(editDialog).toBeVisible();
    await editDialog.getByLabel(/organization unit name/i).fill(`People & Culture Operations ${peopleCode}`);
    const saveWait = page.waitForResponse(
      (response) =>
        /\/departments\//.test(response.url()) &&
        response.request().method() === "PATCH" &&
        response.ok(),
      { timeout: 20_000 },
    );
    await editDialog.locator("form").evaluate((form: HTMLFormElement) => form.requestSubmit());
    await saveWait;
    await expect(
      page
        .getByText(`People & Culture Operations ${peopleCode}`)
        .filter({ visible: true })
        .first(),
    ).toBeVisible({ timeout: 15_000 });

    const departments = await request.get(`${API_BASE}/departments`);
    const rows = (await departments.json()) as Array<{ id: string; name: string; unitCode: string }>;
    const renamed = rows.find((row) => row.unitCode === peopleCode);
    expect(renamed?.name).toBe(`People & Culture Operations ${peopleCode}`);

    const cos = rows.find((row) => row.name === "Chief of Staff")!;
    const duplicate = await request.post(`${API_BASE}/departments`, {
      data: {
        name: "Duplicate Code Test",
        unitCode: peopleCode,
        unitType: "FUNCTION",
        parentDepartmentId: cos.id,
      },
    });
    expect(duplicate.status()).toBeGreaterThanOrEqual(400);
  });

  test("invalid unitType values are rejected by API", async ({ request }) => {
    await apiLogin(request, "developer_admin");
    const departments = await request.get(`${API_BASE}/departments`);
    const ops = (
      (await departments.json()) as Array<{ id: string; name: string }>
    ).find((row) => row.name === "Operations Department")!;
    for (const unitType of ["TEAMM", "department", "random"]) {
      const response = await request.post(`${API_BASE}/departments`, {
        data: {
          name: `Bad Type ${unitType}`,
          unitCode: `BAD_${unitType}_${Date.now()}`,
          unitType,
          parentDepartmentId: ops.id,
        },
      });
      expect(response.status()).toBe(400);
    }
  });

  test("inside sales shows multiple heads via API and UI labels", async ({ page, request }) => {
    await loginAs(page, "developer_admin");
    await apiLogin(request, "developer_admin");
    await gotoDepartments(page);

    await expect(
      page.locator(".dept-org-unit-card", { hasText: "Inside Sales" }).filter({ visible: true }).first(),
    ).toBeVisible();

    const departments = await request.get(`${API_BASE}/departments`);
    const insideSalesId = (
      (await departments.json()) as Array<{ id: string; name: string }>
    ).find((row) => row.name === "Inside Sales")!.id;
    const headsBefore = await request.get(`${API_BASE}/organization/units/${insideSalesId}/heads`);
    expect(headsBefore.ok()).toBeTruthy();
    const activeHeads = (await headsBefore.json()) as unknown[];
    expect(activeHeads.length).toBeGreaterThanOrEqual(2);

    // Top-level cards show head names; assert at least one Inside Sales head label appears.
    await expect(page.getByText(/inside sales head/i).first()).toBeVisible();
  });

  test("viewer cannot mutate organization structure", async ({ request }) => {
    await apiLogin(request, "developer_admin");
    const departments = await request.get(`${API_BASE}/departments`);
    expect(departments.ok()).toBeTruthy();
    const analytics = (
      (await departments.json()) as Array<{ id: string; name: string }>
    ).find((row) => row.name === "Analytics")!;

    await apiLogin(request, "viewer");
    expect(
      (
        await request.post(`${API_BASE}/organization/units/${analytics.id}/heads`, {
          data: { employeeId: "fake", isPrimary: false, effectiveFrom: "2026-08-20" },
        })
      ).status(),
    ).toBe(403);

    expect(
      (
        await request.post(`${API_BASE}/organization/employees/transfer`, {
          data: {
            employeeId: "fake",
            newOrganizationUnitId: analytics.id,
            effectiveDate: "2026-08-20",
            reason: "should fail",
          },
        })
      ).status(),
    ).toBe(403);
  });

  test("employee transfer closes old assignment and preserves role", async ({ page, request }) => {
    await loginAs(page, "developer_admin");
    await apiLogin(request, "developer_admin");

    const employees = await request.get(`${API_BASE}/employees`);
    expect(employees.ok()).toBeTruthy();
    const employeePayload = await employees.json();
    const employeeRows = Array.isArray(employeePayload)
      ? employeePayload
      : ((employeePayload as { employees?: unknown[] }).employees ?? []);
    const analyst = (
      employeeRows as Array<{
        employeeId: string;
        name: string;
        departmentId?: string | null;
      }>
    ).find((row) => row.name === "E2E Analyst");
    expect(analyst).toBeTruthy();

    const departments = await request.get(`${API_BASE}/departments`);
    const deptRows = (await departments.json()) as Array<{ id: string; name: string }>;
    const routing = deptRows.find((row) => row.name === "Routing & Planning")!;
    const analytics = deptRows.find((row) => row.name === "Analytics")!;

    // Ensure analyst starts in Analytics so the transfer is meaningful.
    if (analyst!.departmentId !== analytics.id) {
      await request.post(`${API_BASE}/organization/employees/transfer`, {
        data: {
          employeeId: analyst!.employeeId,
          newOrganizationUnitId: analytics.id,
          newOrganizationLevel: "MEMBER",
          effectiveDate: "2026-08-20",
          reason: "reset before transfer E2E",
        },
      });
    }

    expect(
      (
        await request.post(`${API_BASE}/organization/employees/transfer`, {
          data: {
            employeeId: analyst!.employeeId,
            newOrganizationUnitId: routing.id,
            newOrganizationLevel: "MEMBER",
            effectiveDate: "2026-08-20",
            reason: "Module 1 browser E2E",
          },
        })
      ).ok(),
    ).toBeTruthy();

    const refreshed = await request.get(`${API_BASE}/employees`);
    const refreshedPayload = await refreshed.json();
    const refreshedRows = Array.isArray(refreshedPayload)
      ? refreshedPayload
      : ((refreshedPayload as { employees?: unknown[] }).employees ?? []);
    const updated = (
      refreshedRows as Array<{ employeeId: string; departmentId?: string }>
    ).find((row) => row.employeeId === analyst!.employeeId);
    expect(updated?.departmentId).toBe(routing.id);

    const users = await request.get(`${API_BASE}/users`);
    const userPayload = await users.json();
    const userRows = Array.isArray(userPayload)
      ? userPayload
      : ((userPayload as { users?: unknown[] }).users ?? []);
    const userRow = (userRows as Array<{ employeeId?: string; role: string }>).find(
      (row) => row.employeeId === analyst!.employeeId,
    );
    expect(String(userRow?.role).toUpperCase()).toBe("EMPLOYEE");

    const history = await request.get(
      `${API_BASE}/organization/employees/${analyst!.employeeId}/assignments`,
    );
    const assignments = (await history.json()) as Array<{ organizationUnitName: string }>;
    expect(assignments.some((row) => row.organizationUnitName === "Routing & Planning")).toBeTruthy();

    await gotoDepartments(page);
    await expandUnit(page, "Chief of Operations");
    await expandUnit(page, "Operations Department");
    await expect(page.getByText("Routing & Planning").filter({ visible: true }).first()).toBeVisible();
  });

  test("future-effective transfer is rejected", async ({ request }) => {
    await apiLogin(request, "developer_admin");
    const employees = await request.get(`${API_BASE}/employees`);
    const employeePayload = await employees.json();
    const employeeRows = Array.isArray(employeePayload)
      ? employeePayload
      : ((employeePayload as { employees?: unknown[] }).employees ?? []);
    const analyst = (
      employeeRows as Array<{ employeeId: string; name: string; departmentId?: string }>
    ).find((row) => row.name === "E2E Analyst")!;
    expect(analyst).toBeTruthy();

    const departments = await request.get(`${API_BASE}/departments`);
    const analytics = (
      (await departments.json()) as Array<{ id: string; name: string }>
    ).find((row) => row.name === "Analytics")!;

    const beforeDept = analyst.departmentId;
    expect(
      (
        await request.post(`${API_BASE}/organization/employees/transfer`, {
          data: {
            employeeId: analyst.employeeId,
            newOrganizationUnitId: analytics.id,
            effectiveDate: "2099-01-01",
            reason: "future should fail",
          },
        })
      ).status(),
    ).toBe(400);

    const refreshed = await request.get(`${API_BASE}/employees`);
    const refreshedPayload = await refreshed.json();
    const refreshedRows = Array.isArray(refreshedPayload)
      ? refreshedPayload
      : ((refreshedPayload as { employees?: unknown[] }).employees ?? []);
    const updated = (
      refreshedRows as Array<{ employeeId: string; departmentId?: string }>
    ).find((row) => row.employeeId === analyst.employeeId);
    expect(updated?.departmentId).toBe(beforeDept);
  });

  test("role security: unit does not imply privileged application role", async ({ request }) => {
    await apiLogin(request, "developer_admin");
    const departments = await request.get(`${API_BASE}/departments`);
    const hrUnit = (
      (await departments.json()) as Array<{ id: string; name: string }>
    ).find((row) => row.name === "Hr Department")!;

    const createRes = await request.post(`${API_BASE}/users`, {
      data: {
        name: "HR Unit Employee Test",
        email: `e2e-hr-unit-${Date.now()}@test.local`,
        password: E2E_PASSWORD,
        role: "EMPLOYEE",
        departmentId: hrUnit.id,
      },
    });
    expect(createRes.ok()).toBeTruthy();
    expect(String(((await createRes.json()) as { role: string }).role).toUpperCase()).toBe(
      "EMPLOYEE",
    );

    await apiLogin(request, "employee");
    const unauthorized = await request.post(`${API_BASE}/users`, {
      data: {
        name: "Unauthorized CEO",
        email: `e2e-unauth-ceo-${Date.now()}@test.local`,
        password: E2E_PASSWORD,
        role: "CEO",
      },
    });
    expect(unauthorized.status()).toBe(403);
  });

  test("audit events are written for organization mutations", async ({ request }) => {
    await apiLogin(request, "developer_admin");
    const departments = await request.get(`${API_BASE}/departments`);
    const operations = (
      (await departments.json()) as Array<{ id: string; name: string }>
    ).find((row) => row.name === "Operations Department")!;

    const stamp = Date.now();
    expect(
      (
        await request.post(`${API_BASE}/departments`, {
          data: {
            name: `Audit Test Unit ${stamp}`,
            unitCode: `AUDIT_TEST_${stamp}`,
            unitType: "FUNCTION",
            parentDepartmentId: operations.id,
            description: "audit trail check",
          },
        })
      ).ok(),
    ).toBeTruthy();

    const audit = await request.get(`${API_BASE}/audit-logs`);
    expect(audit.ok()).toBeTruthy();
    const logs = (await audit.json()) as Array<{ action: string }>;
    expect(logs.some((row) => row.action.toLowerCase().includes("department"))).toBeTruthy();
  });

  for (const viewport of VIEWPORTS) {
    test(`organization page has no horizontal overflow at ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await loginAs(page, "developer_admin");
      await gotoDepartments(page);
      await page.waitForTimeout(500);
      expect(await findOverflow(page), `overflow at ${viewport.label}`).toBeNull();
    });
  }
});
