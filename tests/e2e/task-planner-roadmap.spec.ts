/**
 * Task Planner Roadmap + Components E2E.
 */
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { findOverflow } from "./helpers/overflow";
import { API_BASE } from "./helpers/users";

const VIEWPORTS = [
  { name: "320", width: 320, height: 568 },
  { name: "360", width: 360, height: 800 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 900 },
] as const;

async function openAwfProject(page: Page) {
  await page.goto("/tasks", { waitUntil: "domcontentloaded" });
  await page.locator(".atd-open-splash").waitFor({ state: "hidden", timeout: 30_000 }).catch(() => undefined);
  await expect(page.getByRole("heading", { name: /Work Planner/i })).toBeVisible({ timeout: 25_000 });
  const boardView = page.getByRole("group", { name: /Board view/i });
  if (!(await boardView.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /Anytime Workforce/i }).first().click();
  }
  await expect(boardView).toBeVisible({ timeout: 15_000 });
}

async function switchBoardView(page: Page, label: "Board" | "Backlog" | "Roadmap" | "All Work" | "Timeline") {
  await page.getByRole("group", { name: /Board view/i }).getByRole("button", { name: label, exact: true }).click();
}

async function awfBoard(page: Page) {
  const boardsRes = await page.request.get(`${API_BASE}/task-boards`);
  expect(boardsRes.ok(), await boardsRes.text()).toBeTruthy();
  const boards = (await boardsRes.json()) as Array<{
    id: string;
    keyPrefix?: string;
    stages: Array<{ id: string; name: string }>;
  }>;
  return boards.find((entry) => entry.keyPrefix === "AWF") ?? boards[0]!;
}

async function firstAssignee(page: Page, boardId: string) {
  const assignees = await page.request.get(`${API_BASE}/tasks/assignees?boardId=${boardId}`);
  const people = (await assignees.json()) as Array<{ id: string }>;
  return people[0]!.id;
}

async function createTaskViaApi(
  page: Page,
  board: { id: string; stages: Array<{ id: string; name: string }> },
  title: string,
  issueType = "TASK",
  extra: Record<string, unknown> = {},
) {
  const backlog = board.stages.find((s) => /backlog/i.test(s.name)) ?? board.stages[0]!;
  const create = await page.request.post(`${API_BASE}/tasks`, {
    data: {
      title,
      boardId: board.id,
      stageId: backlog.id,
      issueType,
      assigneeEmployeeIds: [await firstAssignee(page, board.id)],
      ...extra,
    },
  });
  expect(create.ok(), await create.text()).toBeTruthy();
  return (await create.json()) as { id: string; version: number; issueKey?: string };
}

test.describe("Roadmap E2E", () => {
  test("LEAD creates epics, roadmap shows scheduled and unscheduled", async ({ page }) => {
    await loginAs(page, "manager");
    const board = await awfBoard(page);
    await createTaskViaApi(page, board, `Roadmap Epic A ${Date.now()}`, "EPIC", {
      startDate: "2026-10-01",
      dueDate: "2026-10-31",
    });
    await createTaskViaApi(page, board, `Roadmap Epic B ${Date.now()}`, "EPIC");

    await openAwfProject(page);
    await switchBoardView(page, "Roadmap");
    await expect(page.getByTestId("roadmap-panel")).toBeVisible();
    await expect(page.getByTestId("roadmap-unscheduled")).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await openAwfProject(page);
    await switchBoardView(page, "Roadmap");
    await expect(page.getByTestId("roadmap-panel")).toBeVisible();
  });
});

test.describe("Component E2E", () => {
  test("ADMIN manages components and assigns to work item", async ({ page }) => {
    await loginAs(page, "developer_admin");
    await openAwfProject(page);
    await page.getByTestId("project-settings-button").click();
    await page.getByRole("button", { name: /^Components$/i }).click();
    await expect(page.getByTestId("project-components-settings")).toBeVisible();

    const attendance = `Attendance-${Date.now()}`;
    await page.getByTestId("component-create-name").fill(attendance);
    await page.getByTestId("component-create-submit").click();
    await expect(page.getByTestId(`component-row-${attendance}`)).toBeVisible();

    const mobile = `Mobile App-${Date.now()}`;
    await page.getByTestId("component-create-name").fill(mobile);
    await page.getByTestId("component-create-submit").click();
    await expect(page.getByTestId(`component-row-${mobile}`)).toBeVisible();

    const board = await awfBoard(page);
    const task = await createTaskViaApi(page, board, `Component target ${Date.now()}`, "STORY");
    const components = (await (await page.request.get(`${API_BASE}/task-boards/${board.id}/components`)).json()) as {
      components: Array<{ id: string; name: string }>;
    };
    const attendanceId = components.components.find((c) => c.name === attendance)!.id;
    const mobileId = components.components.find((c) => c.name === mobile)!.id;
    const put = await page.request.put(`${API_BASE}/tasks/${task.id}/components`, {
      data: { version: task.version, componentIds: [attendanceId, mobileId] },
    });
    expect(put.ok(), await put.text()).toBeTruthy();

    await page.getByTestId(`component-deactivate-${mobile}`).click();
    await expect(page.getByTestId(`component-row-${mobile}`)).toContainText("No");

    const refreshed = await page.request.get(`${API_BASE}/tasks/${task.id}`);
    const taskBody = (await refreshed.json()) as { components: Array<{ name: string; active?: boolean }> };
    expect(taskBody.components.some((c) => c.name === mobile)).toBe(true);
  });
});

test.describe("Authenticated roles", () => {
  test("MEMBER views epic detail progress", async ({ page }) => {
    await loginAs(page, "employee");
    const board = await awfBoard(page);
    const epic = await createTaskViaApi(page, board, `Member Epic ${Date.now()}`, "EPIC");
    await createTaskViaApi(page, board, "Child story", "STORY", { parentTaskId: epic.id });
    const children = await page.request.get(`${API_BASE}/tasks/${epic.id}/epic-children`);
    expect(children.ok()).toBeTruthy();
    const body = (await children.json()) as { progress: { totalCount: number } };
    expect(body.progress.totalCount).toBeGreaterThanOrEqual(1);
  });

  test("VIEWER cannot create component via API", async ({ page }) => {
    await loginAs(page, "viewer");
    const board = await awfBoard(page);
    const res = await page.request.post(`${API_BASE}/task-boards/${board.id}/components`, {
      data: { name: "Forbidden" },
    });
    expect(res.status()).toBe(403);
  });
});

for (const viewport of VIEWPORTS) {
  test(`responsive roadmap UI @ ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await loginAs(page, "manager");
    await openAwfProject(page);
    await switchBoardView(page, "Roadmap");
    await expect(page.getByTestId("roadmap-panel")).toBeVisible();
    const overflow = await findOverflow(page);
    expect(overflow, overflow ?? "no overflow").toBeFalsy();
  });
}
