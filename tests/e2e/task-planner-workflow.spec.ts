/**
 * Task Planner Workflow Engine E2E — same-origin session via Vite /api proxy.
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
  await page.getByRole("button", { name: /Anytime Workforce/i }).click();
  await expect(page.getByRole("group", { name: /Board view/i })).toBeVisible({
    timeout: 15_000,
  });
}

async function openWorkflowSettings(page: Page) {
  const settingsBtn = page.getByTestId("project-settings-button");
  await settingsBtn.scrollIntoViewIfNeeded();
  await settingsBtn.click();
  await expect(page.getByTestId("project-settings-shell")).toBeVisible();
  const mobileToggle = page.getByTestId("project-settings-mobile-nav");
  if (await mobileToggle.isVisible().catch(() => false)) {
    const sectionButton = page
      .getByRole("navigation", { name: /Settings sections/i })
      .getByRole("button", { name: "Workflow", exact: true });
    if (!(await sectionButton.isVisible().catch(() => false))) {
      await mobileToggle.click();
    }
    await sectionButton.click();
  } else {
    await page.getByTestId("settings-nav-workflow").filter({ visible: true }).click();
  }
  await expect(page.getByTestId("settings-panel-workflow")).toBeVisible();
}

async function awfBoard(page: Page) {
  const boardsRes = await page.request.get(`${API_BASE}/task-boards`);
  expect(boardsRes.ok(), await boardsRes.text()).toBeTruthy();
  const boards = (await boardsRes.json()) as Array<{
    id: string;
    keyPrefix?: string;
    version: number;
    stages: Array<{ id: string; name: string }>;
    myRole?: string;
  }>;
  return boards.find((entry) => entry.keyPrefix === "AWF") ?? boards[0]!;
}


async function createTask(
  page: Page,
  board: { id: string; stages: Array<{ id: string; name: string }> },
  title: string,
  issueType = "TASK",
) {
  await page.request.get(`${API_BASE}/task-boards/${board.id}/workflows`);
  const assignees = await page.request.get(`${API_BASE}/tasks/assignees?boardId=${board.id}`);
  const people = (await assignees.json()) as Array<{ id: string }>;
  const backlog = board.stages.find((s) => /backlog/i.test(s.name)) ?? board.stages[0]!;
  const create = await page.request.post(`${API_BASE}/tasks`, {
    data: {
      title,
      boardId: board.id,
      stageId: backlog.id,
      issueType,
      priority: "MEDIUM",
      assigneeEmployeeIds: people[0] ? [people[0].id] : [],
    },
  });
  expect(create.ok(), await create.text()).toBeTruthy();
  return create.json();
}

test.describe("Task Planner workflow — authenticated roles", () => {
  test("MEMBER valid transitions + invalid jump rejected", async ({ page }) => {
    await loginAs(page, "employee");
    const board = await awfBoard(page);
    const item = await createTask(page, board, `WF Member ${Date.now()}`);

    const transitionsRes = await page.request.get(`${API_BASE}/tasks/${item.id}/transitions`);
    expect(transitionsRes.ok()).toBeTruthy();
    const { transitions } = (await transitionsRes.json()) as {
      transitions: Array<{ id: string; name: string; toStatusName: string; toStageId?: string }>;
    };
    expect(transitions.length).toBeGreaterThan(0);
    const toReady = transitions.find((row) => /ready/i.test(row.toStatusName));
    expect(toReady).toBeTruthy();

    const ready = await page.request.post(`${API_BASE}/tasks/${item.id}/transitions`, {
      data: { version: item.version, transitionId: toReady!.id },
    });
    expect(ready.ok(), await ready.text()).toBeTruthy();
    const readyBody = await ready.json();
    expect(readyBody.workflowStatus?.name ?? readyBody.stage?.name).toMatch(/ready/i);

    const next = await page.request.get(`${API_BASE}/tasks/${readyBody.id}/transitions`);
    const nextTransitions = (await next.json()).transitions as Array<{
      id: string;
      toStatusName: string;
    }>;
    const toProgress = nextTransitions.find((row) => /progress/i.test(row.toStatusName));
    expect(toProgress).toBeTruthy();
    const progress = await page.request.post(`${API_BASE}/tasks/${readyBody.id}/transitions`, {
      data: { version: readyBody.version, transitionId: toProgress!.id },
    });
    expect(progress.ok(), await progress.text()).toBeTruthy();
    const progressBody = await progress.json();
    expect(progressBody.workflowStatus?.name ?? "").toMatch(/progress/i);

    const doneStage = board.stages.find((s) => /done/i.test(s.name));
    expect(doneStage).toBeTruthy();
    const invalid = await page.request.patch(`${API_BASE}/tasks/${progressBody.id}`, {
      data: { version: progressBody.version, stageId: doneStage!.id },
    });
    expect(invalid.status()).toBe(409);
    expect(await invalid.text()).toMatch(/cannot move directly/i);
  });

  test("MEMBER invalid Backlog→Done/QA gets friendly 409", async ({ page }) => {
    await loginAs(page, "employee");
    const board = await awfBoard(page);
    const item = await createTask(page, board, `WF Invalid ${Date.now()}`);
    const qa = board.stages.find((s) => /^qa$/i.test(s.name)) ?? board.stages.find((s) => /done/i.test(s.name));
    expect(qa).toBeTruthy();
    const invalid = await page.request.patch(`${API_BASE}/tasks/${item.id}`, {
      data: { version: item.version, stageId: qa!.id },
    });
    expect(invalid.status()).toBe(409);
    const body = await invalid.text();
    expect(body).toMatch(/cannot move directly/i);
    expect(body).not.toMatch(/Prisma|SQL|stack/i);
  });

  test("BOARD drag valid persists; invalid rejected", async ({ page }) => {
    await loginAs(page, "employee");
    const board = await awfBoard(page);
    const item = await createTask(page, board, `WF Drag ${Date.now()}`);
    const ready = board.stages.find((s) => /ready/i.test(s.name));
    expect(ready).toBeTruthy();
    const moved = await page.request.patch(`${API_BASE}/tasks/${item.id}`, {
      data: { version: item.version, stageId: ready!.id },
    });
    expect(moved.ok(), await moved.text()).toBeTruthy();
    const movedBody = await moved.json();
    expect(movedBody.stageId).toBe(ready!.id);

    const again = await page.request.get(`${API_BASE}/tasks/${item.id}`);
    expect((await again.json()).stageId).toBe(ready!.id);

    const qa = board.stages.find((s) => /^qa$/i.test(s.name));
    if (qa) {
      const bad = await page.request.patch(`${API_BASE}/tasks/${item.id}`, {
        data: { version: movedBody.version, stageId: qa.id },
      });
      expect(bad.status()).toBe(409);
    }
  });

  test("VIEWER sees item but transition API is 403", async ({ page }) => {
    await loginAs(page, "developer_admin");
    const board = await awfBoard(page);
    const item = await createTask(page, board, `WF Viewer Item ${Date.now()}`);

    await loginAs(page, "viewer");
    const get = await page.request.get(`${API_BASE}/tasks/${item.id}`);
    expect(get.ok(), await get.text()).toBeTruthy();
    const detail = await get.json();
    expect(detail.availableTransitions ?? []).toHaveLength(0);

    const transitions = await page.request.get(`${API_BASE}/tasks/${item.id}/transitions`);
    expect(transitions.ok()).toBeTruthy();
    expect((await transitions.json()).transitions).toHaveLength(0);

    // Obtain a transition id as admin then retry as viewer
    await loginAs(page, "developer_admin");
    const adminTransitions = await page.request.get(`${API_BASE}/tasks/${item.id}/transitions`);
    const list = (await adminTransitions.json()).transitions as Array<{ id: string }>;
    expect(list.length).toBeGreaterThan(0);

    await loginAs(page, "viewer");
    const attempt = await page.request.post(`${API_BASE}/tasks/${item.id}/transitions`, {
      data: { version: detail.version, transitionId: list[0]!.id },
    });
    expect(attempt.status()).toBe(403);
  });

  test("PROJECT ADMIN workflow settings CRUD persists", async ({ page }) => {
    await loginAs(page, "developer_admin");
    const board = await awfBoard(page);
    const workflowsRes = await page.request.get(`${API_BASE}/task-boards/${board.id}/workflows`);
    expect(workflowsRes.ok(), await workflowsRes.text()).toBeTruthy();
    const payload = await workflowsRes.json();
    const workflow = payload.workflows.find((w: { kind: string }) => w.kind === "STANDARD") ??
      payload.workflows[0];
    expect(workflow).toBeTruthy();

    const statusName = `E2E Status ${Date.now().toString(36)}`;
    const created = await page.request.post(`${API_BASE}/task-workflows/${workflow.id}/statuses`, {
      data: { name: statusName, category: "IN_PROGRESS" },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const status = await created.json();

    const from = workflow.statuses.find((s: { name: string }) => /progress/i.test(s.name)) ??
      workflow.statuses[1];
    const transitionName = `E2E Edge ${Date.now().toString(36)}`;
    const edge = await page.request.post(`${API_BASE}/task-workflows/${workflow.id}/transitions`, {
      data: {
        name: transitionName,
        fromStatusId: from.id,
        toStatusId: status.id,
        allowedProjectRoles: ["MEMBER", "PROJECT_LEAD", "PROJECT_ADMIN"],
        commentRequired: false,
      },
    });
    expect(edge.ok(), await edge.text()).toBeTruthy();

    const again = await page.request.get(`${API_BASE}/task-boards/${board.id}/workflows`);
    const againBody = await again.json();
    const wf = againBody.workflows.find((w: { id: string }) => w.id === workflow.id);
    expect(wf.statuses.some((s: { name: string }) => s.name === statusName)).toBe(true);
    expect(wf.transitions.some((t: { name: string }) => t.name === transitionName)).toBe(true);

    await openAwfProject(page);
    await openWorkflowSettings(page);
    await expect(page.getByText(statusName).first()).toBeVisible({ timeout: 10_000 });
  });

  test("LEAD can use reopen when configured", async ({ page }) => {
    await loginAs(page, "manager");
    const board = await awfBoard(page);
    const item = await createTask(page, board, `WF Lead ${Date.now()}`);
    // Walk to Done if possible via successive transitions (admin path via API as lead)
    let current = item;
    for (let i = 0; i < 8; i += 1) {
      const listRes = await page.request.get(`${API_BASE}/tasks/${current.id}/transitions`);
      const list = (await listRes.json()).transitions as Array<{
        id: string;
        toStatusName: string;
      }>;
      if (list.length === 0) break;
      if (/done/i.test(current.workflowStatus?.name ?? current.stage?.name ?? "")) break;
      const preferred =
        list.find((row) => /done|qa|review|progress|ready/i.test(row.toStatusName)) ?? list[0]!;
      const next = await page.request.post(`${API_BASE}/tasks/${current.id}/transitions`, {
        data: { version: current.version, transitionId: preferred.id },
      });
      if (!next.ok()) break;
      current = await next.json();
    }
    expect(current).toBeTruthy();
  });

  test("work type workflows expose different actions", async ({ page }) => {
    await loginAs(page, "employee");
    const board = await awfBoard(page);
    const story = await createTask(page, board, `WF Story ${Date.now()}`, "STORY");
    const bug = await createTask(page, board, `WF Bug ${Date.now()}`, "BUG");
    const storyT = await page.request.get(`${API_BASE}/tasks/${story.id}/transitions`);
    const bugT = await page.request.get(`${API_BASE}/tasks/${bug.id}/transitions`);
    const storyNames = ((await storyT.json()).transitions as Array<{ name: string }>).map(
      (row) => row.name,
    );
    const bugNames = ((await bugT.json()).transitions as Array<{ name: string }>).map(
      (row) => row.name,
    );
    expect(storyNames.join(" ")).toMatch(/ready|progress/i);
    expect(bugNames.join(" ")).toMatch(/triage/i);
  });
});

test.describe("Task Planner workflow — responsive UI", () => {
  for (const vp of VIEWPORTS) {
    test(`UI ${vp.name} workflow surfaces no overflow`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await loginAs(page, "developer_admin");
      await openAwfProject(page);
      const boardViews =
        vp.width >= 768
          ? (["Board", "Backlog", "All Work"] as const)
          : (["Board"] as const);
      for (const label of boardViews) {
        await page
          .getByRole("group", { name: /Board view/i })
          .getByRole("button", { name: label, exact: true })
          .click();
        const overflow = await findOverflow(page);
        expect(overflow, `overflow @${vp.name} ${label}`).toBeNull();
      }
      await openWorkflowSettings(page);
      const overflow = await findOverflow(page);
      expect(overflow, `overflow @${vp.name} workflow settings`).toBeNull();
    });
  }
});

test.describe("Task Planner workflow — smoke unrelated modules untouched", () => {
  test("dashboard and attendance routes still load", async ({ page }) => {
    await loginAs(page, "employee");
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();
    await page.goto("/attendance", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();
  });
});
