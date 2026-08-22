/**
 * Task Planner Collaboration E2E — relations, labels, watchers, work logs, activity.
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
) {
  const backlog = board.stages.find((s) => /backlog/i.test(s.name)) ?? board.stages[0]!;
  const create = await page.request.post(`${API_BASE}/tasks`, {
    data: {
      title,
      boardId: board.id,
      stageId: backlog.id,
      issueType,
      assigneeEmployeeIds: [await firstAssignee(page, board.id)],
    },
  });
  expect(create.ok(), await create.text()).toBeTruthy();
  const body = (await create.json()) as { id: string; version: number; title?: string; issueKey?: string };
  return { ...body, title: body.title ?? title };
}

async function openTaskFromBoard(page: Page, task: { title: string }) {
  await openAwfProject(page);
  const escaped = task.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const taskButton = page.getByRole("button", { name: new RegExp(escaped) });
  await expect(taskButton.first()).toBeVisible({ timeout: 20_000 });
  await taskButton.first().click();
  await expect(page.getByTestId("task-collaboration-panels")).toBeVisible({ timeout: 20_000 });
}

async function openTaskDetail(page: Page, task: { id: string; title: string }) {
  await page.goto("/tasks", { waitUntil: "domcontentloaded" });
  await page.locator(".atd-open-splash").waitFor({ state: "hidden", timeout: 30_000 }).catch(() => undefined);
  const escaped = task.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const taskButton = page.getByRole("button", { name: new RegExp(escaped) });
  await expect(taskButton.first()).toBeVisible({ timeout: 20_000 });
  await taskButton.first().click();
  await expect(page.getByTestId("task-collaboration-panels")).toBeVisible({ timeout: 20_000 });
}

test.describe("Collaboration member E2E", () => {
  test("member adds label, watches, logs work, sees activity", async ({ page }) => {
    await loginAs(page, "developer_admin");
    const board = await awfBoard(page);
    const label = await page.request.post(`${API_BASE}/task-boards/${board.id}/labels`, {
      data: { name: `mobile-${Date.now()}` },
    });
    expect(label.ok(), await label.text()).toBeTruthy();
    const labelBody = (await label.json()) as { id: string };

    await page.context().clearCookies();
    await loginAs(page, "employee");
    const memberBoard = await awfBoard(page);
    const task = await createTaskViaApi(page, memberBoard, `Collab Member ${Date.now()}`);
    const assignLabels = await page.request.put(`${API_BASE}/tasks/${task.id}/labels`, {
      data: { version: task.version, labelIds: [labelBody.id] },
    });
    expect(assignLabels.ok(), await assignLabels.text()).toBeTruthy();

    const watch = await page.request.post(`${API_BASE}/tasks/${task.id}/watchers/me`);
    expect(watch.ok()).toBeTruthy();

    const log = await page.request.post(`${API_BASE}/tasks/${task.id}/work-logs`, {
      data: { duration: "1h 30m", workDate: "2026-08-22" },
    });
    expect(log.ok(), await log.text()).toBeTruthy();

    await openTaskDetail(page, task);
    await expect(page.getByTestId("labels-panel")).toBeVisible();
    await expect(page.getByTestId("work-logs-panel")).toContainText("1h 30m");
    await expect(page.getByTestId("watch-toggle")).toContainText("Watching");
  });
});

test.describe("Dependency cycle E2E", () => {
  test("rejects circular BLOCKS chain", async ({ page }) => {
    await loginAs(page, "manager");
    const board = await awfBoard(page);
    const a = await createTaskViaApi(page, board, `Dep A ${Date.now()}`);
    const b = await createTaskViaApi(page, board, `Dep B ${Date.now()}`);
    const c = await createTaskViaApi(page, board, `Dep C ${Date.now()}`);

    expect(
      (await page.request.post(`${API_BASE}/tasks/${a.id}/relations`, {
        data: { targetTaskId: b.id, relationType: "BLOCKS" },
      })).ok(),
    ).toBeTruthy();
    expect(
      (await page.request.post(`${API_BASE}/tasks/${b.id}/relations`, {
        data: { targetTaskId: c.id, relationType: "BLOCKS" },
      })).ok(),
    ).toBeTruthy();

    const cycle = await page.request.post(`${API_BASE}/tasks/${c.id}/relations`, {
      data: { targetTaskId: a.id, relationType: "BLOCKS" },
    });
    expect(cycle.status()).toBe(409);
    const rels = await page.request.get(`${API_BASE}/tasks/${a.id}/relations`);
    const body = (await rels.json()) as { blocks: unknown[] };
    expect(body.blocks.length).toBe(1);
  });
});

test.describe("Work log E2E", () => {
  test("persists minutes and totals after edit", async ({ page }) => {
    await loginAs(page, "employee");
    const board = await awfBoard(page);
    const task = await createTaskViaApi(page, board, `Worklog ${Date.now()}`);

    await page.request.post(`${API_BASE}/tasks/${task.id}/work-logs`, {
      data: { duration: "1h 30m", workDate: "2026-08-22" },
    });
    const second = await page.request.post(`${API_BASE}/tasks/${task.id}/work-logs`, {
      data: { duration: "30m", workDate: "2026-08-22" },
    });
    const log = (await second.json()) as { id: string };

    await page.request.patch(`${API_BASE}/work-logs/${log.id}`, {
      data: { duration: "45m" },
    });

    const list = await page.request.get(`${API_BASE}/tasks/${task.id}/work-logs`);
    const totals = (await list.json()) as { totals: { totalMinutes: number } };
    expect(totals.totals.totalMinutes).toBe(135);
  });
});

test.describe("Label settings E2E", () => {
  test("ADMIN manages labels in project settings", async ({ page }) => {
    await loginAs(page, "developer_admin");
    await openAwfProject(page);
    await page.getByTestId("project-settings-button").click();
    await page.getByRole("button", { name: /^Labels$/i }).click();
    await expect(page.getByTestId("project-labels-settings")).toBeVisible();

    const mobile = `mobile-${Date.now()}`;
    const backend = `backend-${Date.now()}`;

    await page.getByTestId("label-create-name").fill(mobile);
    await page.getByTestId("label-create-submit").click();
    await expect(page.getByTestId(`label-row-${mobile}`)).toBeVisible();

    await page.getByTestId("label-create-name").fill(backend);
    await page.getByTestId("label-create-submit").click();
    await expect(page.getByTestId(`label-row-${backend}`)).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    await openAwfProject(page);
    await page.getByTestId("project-settings-button").click();
    await page.getByRole("button", { name: /^Labels$/i }).click();
    await expect(page.getByTestId(`label-row-${mobile}`)).toBeVisible();
    await expect(page.getByTestId(`label-row-${backend}`)).toBeVisible();

    await page.getByTestId(`label-edit-description-${mobile}`).fill("Mobile workstream");
    await page.getByTestId(`label-edit-color-${mobile}`).fill("#22c55e");
    await page.getByTestId(`label-save-${mobile}`).click();

    await page.getByTestId(`label-deactivate-${backend}`).click();
    await expect(page.getByTestId(`label-status-${backend}`)).toContainText("Inactive");

    await page.reload({ waitUntil: "domcontentloaded" });
    await openAwfProject(page);
    await page.getByTestId("project-settings-button").click();
    await page.getByRole("button", { name: /^Labels$/i }).click();
    await expect(page.getByTestId(`label-status-${backend}`)).toContainText("Inactive");
  });

  test("VIEWER cannot mutate labels via API", async ({ page }) => {
    await loginAs(page, "developer_admin");
    const board = await awfBoard(page);
    const create = await page.request.post(`${API_BASE}/task-boards/${board.id}/labels`, {
      data: { name: `viewer-block-${Date.now()}` },
    });
    expect(create.ok()).toBeTruthy();
    const label = (await create.json()) as { id: string };

    await page.context().clearCookies();
    await loginAs(page, "viewer");

    const createDenied = await page.request.post(`${API_BASE}/task-boards/${board.id}/labels`, {
      data: { name: "viewer-hack" },
    });
    expect(createDenied.status()).toBe(403);

    const patch = await page.request.patch(`${API_BASE}/task-labels/${label.id}`, {
      data: { name: "hacked" },
    });
    expect(patch.status()).toBe(403);

    const deactivate = await page.request.patch(`${API_BASE}/task-labels/${label.id}`, {
      data: { active: false },
    });
    expect(deactivate.status()).toBe(403);
  });
});

test.describe("Label E2E", () => {
  test("deactivated label stays on item but cannot be newly assigned", async ({ page }) => {
    await loginAs(page, "developer_admin");
    const board = await awfBoard(page);
    const task = await createTaskViaApi(page, board, `Label ${Date.now()}`);

    const backend = await page.request.post(`${API_BASE}/task-boards/${board.id}/labels`, {
      data: { name: `backend-${Date.now()}` },
    });
    const backendLabel = (await backend.json()) as { id: string };

    await page.request.put(`${API_BASE}/tasks/${task.id}/labels`, {
      data: { version: task.version, labelIds: [backendLabel.id] },
    });

    await page.request.patch(`${API_BASE}/task-labels/${backendLabel.id}`, {
      data: { active: false },
    });

    const mobile = await page.request.post(`${API_BASE}/task-boards/${board.id}/labels`, {
      data: { name: `mobile-${Date.now()}` },
    });
    const mobileLabel = (await mobile.json()) as { id: string };

    const assignInactive = await page.request.put(`${API_BASE}/tasks/${task.id}/labels`, {
      data: { version: task.version + 1, labelIds: [backendLabel.id, mobileLabel.id] },
    });
    expect(assignInactive.status()).toBe(409);
  });
});

test.describe("Viewer E2E", () => {
  test("viewer reads collaboration UI and cannot mutate via UI or API", async ({ page }) => {
    await loginAs(page, "developer_admin");
    const board = await awfBoard(page);
    const task = await createTaskViaApi(page, board, `Viewer read ${Date.now()}`);
    const related = await createTaskViaApi(page, board, `Viewer rel ${Date.now()}`);

    const labelRes = await page.request.post(`${API_BASE}/task-boards/${board.id}/labels`, {
      data: { name: `viewer-read-${Date.now()}`, description: "Read-only label", color: "#3b82f6" },
    });
    expect(labelRes.ok()).toBeTruthy();
    const label = (await labelRes.json()) as { id: string; name: string };

    const labeled = await page.request.put(`${API_BASE}/tasks/${task.id}/labels`, {
      data: { version: task.version, labelIds: [label.id] },
    });
    expect(labeled.ok()).toBeTruthy();

    await page.request.post(`${API_BASE}/tasks/${task.id}/work-logs`, {
      data: { duration: "2h", workDate: "2026-08-22", description: "Viewer read test" },
    });

    expect(
      (
        await page.request.post(`${API_BASE}/tasks/${task.id}/relations`, {
          data: { targetTaskId: related.id, relationType: "RELATES_TO" },
        })
      ).ok(),
    ).toBeTruthy();

    await page.context().clearCookies();
    await loginAs(page, "viewer");

    await openTaskFromBoard(page, task);

    await expect(page.getByTestId("relations-panel")).toBeVisible();
    await expect(page.getByTestId("labels-panel")).toContainText(label.name);
    await expect(page.getByTestId("work-logs-panel")).toContainText("2h");
    await expect(page.getByTestId("activity-panel")).toBeVisible();

    await expect(page.getByTestId("relation-search")).toHaveCount(0);
    await expect(page.getByTestId("inline-label-input")).toHaveCount(0);
    await expect(page.getByTestId("work-log-submit")).toHaveCount(0);
    await expect(page.getByTestId("project-settings-button")).toHaveCount(0);

    const rel = await page.request.post(`${API_BASE}/tasks/${task.id}/relations`, {
      data: { targetTaskId: related.id, relationType: "BLOCKS" },
    });
    expect(rel.status()).toBeGreaterThanOrEqual(400);

    const log = await page.request.post(`${API_BASE}/tasks/${task.id}/work-logs`, {
      data: { duration: "1h", workDate: "2026-08-22" },
    });
    expect(log.status()).toBe(403);

    const assignLabels = await page.request.put(`${API_BASE}/tasks/${task.id}/labels`, {
      data: { version: task.version + 1, labelIds: [label.id] },
    });
    expect(assignLabels.status()).toBeGreaterThanOrEqual(400);
  });
});

for (const vp of VIEWPORTS) {
  test(`collaboration UI responsive @${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await loginAs(page, "employee");
    const board = await awfBoard(page);
    const task = await createTaskViaApi(page, board, `UI ${vp.name} ${Date.now()}`);
    await openTaskDetail(page, task);
    const overflow = await findOverflow(page);
    expect(overflow, overflow ? JSON.stringify(overflow) : undefined).toBeNull();
  });
}
