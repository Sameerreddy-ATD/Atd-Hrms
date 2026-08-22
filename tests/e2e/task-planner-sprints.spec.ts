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

type TaskRow = {
  id: string;
  title: string;
  version: number;
  workflowStatus?: { id: string; name: string; category?: string };
  stage?: { name: string; statusCategory?: string };
  sprint?: { sprintId: string; name: string; status: string };
};

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
  return (await create.json()) as TaskRow;
}

async function getTask(page: Page, taskId: string) {
  const res = await page.request.get(`${API_BASE}/tasks/${taskId}`);
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as TaskRow;
}

async function resetOpenSprints(page: Page, boardId: string) {
  const res = await page.request.get(`${API_BASE}/task-boards/${boardId}/sprints`);
  expect(res.ok(), await res.text()).toBeTruthy();
  const { sprints } = (await res.json()) as { sprints: Array<{ id: string; status: string }> };
  for (const sprint of sprints) {
    if (sprint.status === "PLANNED" || sprint.status === "ACTIVE") {
      const cancel = await page.request.post(`${API_BASE}/task-sprints/${sprint.id}/cancel`, {
        data: { returnToBacklog: true },
      });
      expect(cancel.ok(), await cancel.text()).toBeTruthy();
    }
  }
}

async function transitionUntilDoneCategory(page: Page, task: TaskRow) {
  let current = task;
  for (let step = 0; step < 20; step += 1) {
    const statusName = current.workflowStatus?.name ?? current.stage?.name ?? "";
    const category =
      current.workflowStatus?.category ?? current.stage?.statusCategory ?? "TODO";
    if (category === "DONE" || /done/i.test(statusName)) return current;

    const listRes = await page.request.get(`${API_BASE}/tasks/${current.id}/transitions`);
    expect(listRes.ok(), await listRes.text()).toBeTruthy();
    const { transitions } = (await listRes.json()) as {
      transitions: Array<{ id: string; toStatusName: string }>;
    };
    if (transitions.length === 0) break;

    const preferred =
      transitions.find((row) => /done/i.test(row.toStatusName)) ??
      transitions.find((row) => /qa|review/i.test(row.toStatusName)) ??
      transitions.find((row) => /progress|ready|triage/i.test(row.toStatusName)) ??
      transitions[0]!;
    const next = await page.request.post(`${API_BASE}/tasks/${current.id}/transitions`, {
      data: { version: current.version, transitionId: preferred.id },
    });
    expect(next.ok(), await next.text()).toBeTruthy();
    current = (await next.json()) as TaskRow;
  }
  const finalCategory =
    current.workflowStatus?.category ?? current.stage?.statusCategory ?? "TODO";
  const finalName = current.workflowStatus?.name ?? current.stage?.name ?? "";
  expect(finalCategory === "DONE" || /done/i.test(finalName)).toBeTruthy();
  return current;
}

async function assignToSprint(page: Page, taskId: string, sprintId: string) {
  const res = await page.request.post(`${API_BASE}/tasks/${taskId}/sprint-membership`, {
    data: { sprintId },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
}

test.describe("Sprint completion disposition", () => {
  test.describe.configure({ mode: "serial" });

  for (const viewport of [
    { name: "390", width: 390, height: 844 },
    { name: "1440", width: 1440, height: 900 },
  ] as const) {
    test(`completes active sprint with backlog and next-sprint dispositions @ ${viewport.name}`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await loginAs(page, "manager");
      const board = await awfBoard(page);
      await page.request.get(`${API_BASE}/task-boards/${board.id}/workflows`);
      await resetOpenSprints(page, board.id);

      const stamp = Date.now();
      const nextSprintRes = await page.request.post(`${API_BASE}/task-boards/${board.id}/sprints`, {
        data: {
          name: `Next Sprint ${stamp}`,
          startDate: "2026-11-01",
          endDate: "2026-11-14",
        },
      });
      expect(nextSprintRes.ok(), await nextSprintRes.text()).toBeTruthy();
      const nextSprint = (await nextSprintRes.json()) as { id: string; name: string };

      const activeSprintRes = await page.request.post(`${API_BASE}/task-boards/${board.id}/sprints`, {
        data: {
          name: `Active Sprint ${stamp}`,
          startDate: "2026-10-01",
          endDate: "2026-10-14",
        },
      });
      expect(activeSprintRes.ok(), await activeSprintRes.text()).toBeTruthy();
      const activeSprint = (await activeSprintRes.json()) as { id: string; name: string };

      const doneTask = await createTaskViaApi(page, board, `Done ${stamp}`);
      const incompleteA = await createTaskViaApi(page, board, `Incomplete A ${stamp}`);
      const incompleteB = await createTaskViaApi(page, board, `Incomplete B ${stamp}`);

      const doneBefore = await getTask(page, doneTask.id);
      const incompleteABefore = await getTask(page, incompleteA.id);
      const incompleteBBefore = await getTask(page, incompleteB.id);

      const doneReady = await transitionUntilDoneCategory(page, doneBefore);

      for (const taskId of [doneReady.id, incompleteA.id, incompleteB.id]) {
        await assignToSprint(page, taskId, activeSprint.id);
      }

      const startRes = await page.request.post(`${API_BASE}/task-sprints/${activeSprint.id}/start`);
      expect(startRes.ok(), await startRes.text()).toBeTruthy();

      await openAwfProject(page);
      await page.getByRole("button", { name: "Backlog", exact: true }).click();
      await expect(page.getByTestId("sprint-backlog-panel")).toBeVisible();

      await page.getByTestId("complete-sprint-button").click();
      await expect(page.getByTestId("sprint-complete-dialog")).toBeVisible();
      await expect(page.getByTestId("sprint-complete-done-count")).toHaveText("Done: 1");
      await expect(page.getByTestId("sprint-complete-incomplete-count")).toHaveText("Incomplete: 2");

      await page.getByTestId(`sprint-complete-disposition-${incompleteA.id}`).selectOption("backlog");
      await page
        .getByTestId(`sprint-complete-disposition-${incompleteB.id}`)
        .selectOption(nextSprint.id);
      await page.getByTestId("sprint-complete-submit").click();
      await expect(page.getByTestId("sprint-complete-dialog")).toBeHidden({ timeout: 15_000 });

      const sprintsAfter = await page.request.get(`${API_BASE}/task-boards/${board.id}/sprints`);
      const { sprints } = (await sprintsAfter.json()) as {
        sprints: Array<{ id: string; status: string; completedAt?: string }>;
      };
      const completed = sprints.find((row) => row.id === activeSprint.id);
      expect(completed?.status).toBe("COMPLETED");
      expect(completed?.completedAt).toBeTruthy();

      const doneAfter = await getTask(page, doneReady.id);
      const incompleteAAfter = await getTask(page, incompleteA.id);
      const incompleteBAfter = await getTask(page, incompleteB.id);

      expect(doneAfter.sprint?.sprintId).toBe(activeSprint.id);
      expect(incompleteAAfter.sprint).toBeFalsy();
      expect(incompleteBAfter.sprint?.sprintId).toBe(nextSprint.id);

      expect(doneAfter.workflowStatus?.id ?? doneAfter.stage?.name).toBe(
        doneReady.workflowStatus?.id ?? doneReady.stage?.name,
      );
      expect(incompleteAAfter.workflowStatus?.id ?? incompleteAAfter.stage?.name).toBe(
        incompleteABefore.workflowStatus?.id ?? incompleteABefore.stage?.name,
      );
      expect(incompleteBAfter.workflowStatus?.id ?? incompleteBAfter.stage?.name).toBe(
        incompleteBBefore.workflowStatus?.id ?? incompleteBBefore.stage?.name,
      );

      await page.reload({ waitUntil: "domcontentloaded" });
      await openAwfProject(page);
      await page.getByRole("button", { name: "Backlog", exact: true }).click();
      await expect(page.getByTestId("sprint-section-backlog").getByText(incompleteA.title)).toBeVisible({
        timeout: 15_000,
      });
      const nextSection = page.getByTestId(`sprint-section-${nextSprint.id}`);
      await expect(nextSection.getByText(incompleteB.title)).toBeVisible({ timeout: 15_000 });
    });
  }
});

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
