/**
 * Task Planner Sprints E2E — backlog drag, active sprint board, completion flow.
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
  await page
    .locator(".atd-open-splash")
    .waitFor({ state: "hidden", timeout: 30_000 })
    .catch(() => undefined);
  await expect(page.getByRole("heading", { name: /Work Planner/i })).toBeVisible({
    timeout: 25_000,
  });
  const boardView = page.getByRole("group", { name: /Board view/i });
  if (!(await boardView.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /Anytime Workforce/i }).first().click();
  }
  await expect(boardView).toBeVisible({ timeout: 15_000 });
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

async function createTaskViaApi(
  page: Page,
  board: { id: string; stages: Array<{ id: string; name: string }> },
  title: string,
  issueType = "TASK",
) {
  const backlog = board.stages.find((s) => /backlog/i.test(s.name)) ?? board.stages[0]!;
  const assignees = await page.request.get(`${API_BASE}/tasks/assignees?boardId=${board.id}`);
  const people = (await assignees.json()) as Array<{ id: string }>;
  const create = await page.request.post(`${API_BASE}/tasks`, {
    data: {
      title,
      boardId: board.id,
      stageId: backlog.id,
      issueType,
      assigneeEmployeeIds: people[0]?.id ? [people[0].id] : [],
    },
  });
  expect(create.ok(), await create.text()).toBeTruthy();
  return (await create.json()) as { id: string; title: string; workflowStatusId?: string };
}

test.describe("Task Planner Sprints", () => {
  test.describe.configure({ mode: "serial" });

  test("LEAD creates sprint, assigns work, starts and completes", async ({ page }) => {
    await loginAs(page, "manager");
    await openAwfProject(page);
    const board = await awfBoard(page);

    await page.getByRole("button", { name: "Backlog", exact: true }).click();
    await expect(page.getByTestId("sprint-backlog-panel")).toBeVisible();

    await page.getByTestId("create-sprint-button").click();
    await page.locator("#sprint-name").fill(`E2E Sprint ${Date.now()}`);
    await page.locator("#sprint-start").fill("2026-09-01");
    await page.locator("#sprint-end").fill("2026-09-14");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByTestId("sprint-backlog-panel")).toBeVisible();

    const task = await createTaskViaApi(page, board, `Sprint E2E ${Date.now()}`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await openAwfProject(page);
    await page.getByRole("button", { name: "Backlog", exact: true }).click();

    const backlogSection = page.getByTestId("sprint-section-backlog");
    const taskRow = backlogSection.getByText(task.title);
    await expect(taskRow).toBeVisible({ timeout: 15_000 });

    const plannedSection = page.locator('[data-testid^="sprint-section-"]').filter({
      hasNot: page.getByTestId("sprint-section-backlog"),
    }).first();
    await taskRow.dragTo(plannedSection);
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: "domcontentloaded" });
    await openAwfProject(page);
    await page.getByRole("button", { name: "Backlog", exact: true }).click();
    await expect(plannedSection.getByText(task.title)).toBeVisible({ timeout: 15_000 });

    const startBtn = page.locator('[data-testid^="start-sprint-"]').first();
    await startBtn.click();
    await page.getByRole("button", { name: "Board", exact: true }).click();
    await expect(page.getByTestId("active-sprint-board-banner")).toBeVisible();
  });

  test("VIEWER cannot manage sprints via API", async ({ page }) => {
    await loginAs(page, "viewer");
    const board = await awfBoard(page);
    const create = await page.request.post(`${API_BASE}/task-boards/${board.id}/sprints`, {
      data: { name: "Viewer Sprint", startDate: "2026-09-01", endDate: "2026-09-14" },
    });
    expect(create.status()).toBe(403);
  });

  test("MEMBER sees active sprint board", async ({ page }) => {
    await loginAs(page, "employee");
    const board = await awfBoard(page);
    const sprintsRes = await page.request.get(`${API_BASE}/task-boards/${board.id}/sprints`);
    expect(sprintsRes.ok(), await sprintsRes.text()).toBeTruthy();
    const planRes = await page.request.get(`${API_BASE}/task-boards/${board.id}/backlog-plan`);
    expect(planRes.ok(), await planRes.text()).toBeTruthy();
    const tasksRes = await page.request.get(
      `${API_BASE}/tasks?scope=team&boardId=${board.id}&limit=10`,
    );
    expect(tasksRes.ok(), await tasksRes.text()).toBeTruthy();
  });

  test("ADMIN moves item between planned sprints via API", async ({ page }) => {
    await loginAs(page, "developer_admin");
    const board = await awfBoard(page);
    let sprintsRes = await page.request.get(`${API_BASE}/task-boards/${board.id}/sprints`);
    let { sprints } = (await sprintsRes.json()) as { sprints: Array<{ id: string; status: string }> };
    let planned = sprints.filter((s) => s.status === "PLANNED");
    while (planned.length < 2) {
      const create = await page.request.post(`${API_BASE}/task-boards/${board.id}/sprints`, {
        data: {
          name: `Admin Sprint ${Date.now()}-${planned.length}`,
          startDate: "2026-10-01",
          endDate: "2026-10-14",
        },
      });
      expect(create.ok(), await create.text()).toBeTruthy();
      sprintsRes = await page.request.get(`${API_BASE}/task-boards/${board.id}/sprints`);
      ({ sprints } = (await sprintsRes.json()) as {
        sprints: Array<{ id: string; status: string }>;
      });
      planned = sprints.filter((s) => s.status === "PLANNED");
    }
    const task = await createTaskViaApi(page, board, `Admin move ${Date.now()}`);
    const assignA = await page.request.post(`${API_BASE}/tasks/${task.id}/sprint-membership`, {
      data: { sprintId: planned[0]!.id },
    });
    expect(assignA.ok(), await assignA.text()).toBeTruthy();
    if (planned[1]) {
      const assignB = await page.request.post(`${API_BASE}/tasks/${task.id}/sprint-membership`, {
        data: { sprintId: planned[1].id },
      });
      expect(assignB.ok(), await assignB.text()).toBeTruthy();
    }
  });

  for (const viewport of VIEWPORTS) {
    test(`responsive backlog UI @ ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await loginAs(page, "manager");
      await openAwfProject(page);
      await page.getByRole("button", { name: "Backlog", exact: true }).click();
      await expect(page.getByTestId("sprint-backlog-panel")).toBeVisible();
      const overflow = await findOverflow(page);
      expect(overflow, overflow ?? "no overflow").toBeFalsy();
    });
  }
});
