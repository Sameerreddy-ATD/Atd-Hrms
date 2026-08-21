/**
 * Task Planner foundation E2E — same-origin session via Vite /api proxy.
 * Topology: docs/TASK_PLANNER_E2E_TOPOLOGY.md
 */
import { expect, test, type Page } from "@playwright/test";
import { apiLogin, loginAs } from "./helpers/auth";
import { findOverflow } from "./helpers/overflow";
import { API_BASE, E2E_PASSWORD, E2E_USERS } from "./helpers/users";

const VIEWPORTS = [
  { name: "320", width: 320, height: 568 },
  { name: "360", width: 360, height: 800 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 900 },
] as const;

const SETTINGS_SECTIONS = [
  "details",
  "members",
  "work-types",
  "fields",
  "permissions",
  "archive",
] as const;

const SETTINGS_LABELS: Record<(typeof SETTINGS_SECTIONS)[number], string> = {
  details: "Details",
  members: "Members",
  "work-types": "Work Types",
  fields: "Fields",
  permissions: "Permissions",
  archive: "Archive",
};

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

async function switchBoardView(page: Page, label: "Board" | "Backlog" | "Timeline" | "All Work") {
  await page
    .getByRole("group", { name: /Board view/i })
    .getByRole("button", { name: label, exact: true })
    .click();
}

async function openSettingsSection(page: Page, section: (typeof SETTINGS_SECTIONS)[number]) {
  const mobileToggle = page.getByTestId("project-settings-mobile-nav");
  if (await mobileToggle.isVisible().catch(() => false)) {
    const label = SETTINGS_LABELS[section];
    const sectionButton = page
      .getByRole("navigation", { name: /Settings sections/i })
      .getByRole("button", { name: label, exact: true });
    if (!(await sectionButton.isVisible().catch(() => false))) {
      await mobileToggle.click();
    }
    await sectionButton.click();
    return;
  }
  await page.getByTestId(`settings-nav-${section}`).click();
}

test.describe("Task Planner foundation — same-origin auth", () => {
  test("session cookie is same-origin and survives reload", async ({ page }) => {
    await loginAs(page, "employee");
    const meBefore = await page.request.get(`${API_BASE}/auth/me`);
    expect(meBefore.ok(), await meBefore.text()).toBeTruthy();
    await page.goto("/tasks", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Work Planner/i })).toBeVisible({
      timeout: 20_000,
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Work Planner/i })).toBeVisible({
      timeout: 20_000,
    });
    const meAfter = await page.request.get(`${API_BASE}/auth/me`);
    expect(meAfter.ok(), await meAfter.text()).toBeTruthy();
    const body = await meAfter.json();
    expect(String(body.user?.email ?? body.email).toLowerCase()).toBe(
      E2E_USERS.employee.email.toLowerCase(),
    );
  });
});

test.describe("Task Planner foundation — authenticated roles", () => {
  test("employee can open My Work / Projects / Board views", async ({ page }) => {
    await loginAs(page, "employee");
    await openAwfProject(page);
    for (const label of ["Board", "Backlog", "Timeline", "All Work"] as const) {
      await switchBoardView(page, label);
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("lead can open project settings shell sections", async ({ page }) => {
    await loginAs(page, "manager");
    await openAwfProject(page);
    await page.getByTestId("project-settings-button").click();
    await expect(page.getByTestId("project-settings-shell")).toBeVisible();
    for (const section of SETTINGS_SECTIONS) {
      await openSettingsSection(page, section);
      await expect(page.getByTestId(`settings-panel-${section}`)).toBeVisible();
    }
  });

  test("viewer UI is read-only and mutations return 403", async ({ page }) => {
    await loginAs(page, "viewer");
    await openAwfProject(page);
    await expect(page.getByTestId("create-work-item")).toHaveCount(0);
    await expect(page.getByTestId("project-settings-button")).toHaveCount(0);

    for (const label of ["Board", "Backlog", "All Work"] as const) {
      await switchBoardView(page, label);
    }

    const boards = await page.request.get(`${API_BASE}/task-boards`);
    expect(boards.ok()).toBeTruthy();
    const list = (await boards.json()) as Array<{
      id: string;
      stages: Array<{ id: string }>;
      myRole?: string;
    }>;
    const awf = list.find((board) => board.id) ?? list[0];
    expect(awf).toBeTruthy();
    expect(awf!.myRole).toBe("VIEWER");

    const assignees = await page.request.get(`${API_BASE}/tasks/assignees?boardId=${awf!.id}`);
    expect(assignees.ok()).toBeTruthy();
    const people = (await assignees.json()) as Array<{ id: string }>;
    const assigneeId = people[0]?.id;
    expect(assigneeId).toBeTruthy();

    const create = await page.request.post(`${API_BASE}/tasks`, {
      data: {
        title: `Viewer blocked ${Date.now()}`,
        boardId: awf!.id,
        stageId: awf!.stages[0]?.id,
        issueType: "TASK",
        priority: "LOW",
        assigneeEmployeeIds: [assigneeId],
      },
    });
    expect(create.status()).toBe(403);

    const tasksRes = await page.request.get(
      `${API_BASE}/tasks?scope=team&boardId=${awf!.id}&limit=20&detail=summary`,
    );
    expect(tasksRes.ok()).toBeTruthy();
    const tasks = (await tasksRes.json()) as Array<{ id: string; version: number; stageId?: string }>;
    if (tasks[0]) {
      const patch = await page.request.patch(`${API_BASE}/tasks/${tasks[0].id}`, {
        data: { version: tasks[0].version, title: "viewer edit blocked" },
      });
      expect(patch.status()).toBe(403);
      if (awf!.stages[1]?.id) {
        const move = await page.request.patch(`${API_BASE}/tasks/${tasks[0].id}`, {
          data: { version: tasks[0].version, stageId: awf!.stages[1].id },
        });
        expect(move.status()).toBe(403);
      }
    }

    const archiveBoard = await page.request.patch(`${API_BASE}/task-boards/${awf!.id}`, {
      data: { version: 1, archived: true },
    });
    expect(archiveBoard.status()).toBe(403);
  });
});

test.describe("Task Planner foundation — hierarchy + keys + board", () => {
  test("hierarchy UI: epic → story → subtask; orphan subtask friendly", async ({ page }) => {
    await loginAs(page, "developer_admin");
    await openAwfProject(page);

    const boards = await page.request.get(`${API_BASE}/task-boards`);
    const list = (await boards.json()) as Array<{
      id: string;
      stages: Array<{ id: string }>;
      keyPrefix?: string;
    }>;
    const board = list.find((entry) => entry.keyPrefix === "AWF") ?? list[0]!;
    const assignees = await page.request.get(`${API_BASE}/tasks/assignees?boardId=${board.id}`);
    const people = (await assignees.json()) as Array<{ id: string }>;
    const assigneeId = people[0]?.id;
    expect(assigneeId).toBeTruthy();
    const stageId = board.stages[0]?.id;

    const epicRes = await page.request.post(`${API_BASE}/tasks`, {
      data: {
        title: `UI Epic ${Date.now()}`,
        boardId: board.id,
        stageId,
        issueType: "EPIC",
        priority: "HIGH",
        assigneeEmployeeIds: [assigneeId],
      },
    });
    expect(epicRes.ok(), await epicRes.text()).toBeTruthy();
    const epic = await epicRes.json();

    const storyRes = await page.request.post(`${API_BASE}/tasks`, {
      data: {
        title: `UI Story ${Date.now()}`,
        boardId: board.id,
        stageId,
        issueType: "STORY",
        parentTaskId: epic.id,
        priority: "MEDIUM",
        assigneeEmployeeIds: [assigneeId],
      },
    });
    expect(storyRes.ok(), await storyRes.text()).toBeTruthy();
    const story = await storyRes.json();
    expect(story.parentTaskId).toBe(epic.id);

    const subRes = await page.request.post(`${API_BASE}/tasks`, {
      data: {
        title: `UI Subtask ${Date.now()}`,
        boardId: board.id,
        stageId,
        issueType: "SUBTASK",
        parentTaskId: story.id,
        priority: "LOW",
        assigneeEmployeeIds: [assigneeId],
      },
    });
    expect(subRes.ok(), await subRes.text()).toBeTruthy();
    const sub = await subRes.json();
    expect(sub.parentTaskId).toBe(story.id);

    await page.reload({ waitUntil: "domcontentloaded" });
    await openAwfProject(page);
    await switchBoardView(page, "All Work");
    await expect(page.getByText(epic.title).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(story.title).first()).toBeVisible();
    await expect(page.getByText(sub.title).first()).toBeVisible();

    // Friendly orphan Subtask validation (select assignee so API hierarchy error surfaces)
    await switchBoardView(page, "Board");
    await page.getByTestId("create-work-item").click();
    const dialog = page.locator("[role='dialog']").last();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole("combobox").first().click();
    await page.getByRole("option", { name: /^Subtask$/i }).click();
    await dialog.locator("#new-task-title, input").first().fill(`orphan sub ${Date.now()}`);
    await dialog.getByRole("checkbox", { name: /Select E2E Analyst/i }).check();
    await dialog.getByRole("button", { name: /create|save/i }).click();
    await expect(page.getByText(/subtask requires a parent/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await page.keyboard.press("Escape").catch(() => undefined);

    const orphan = await page.request.post(`${API_BASE}/tasks`, {
      data: {
        title: "orphan subtask api",
        boardId: board.id,
        stageId,
        issueType: "SUBTASK",
        priority: "LOW",
        assigneeEmployeeIds: [assigneeId],
      },
    });
    expect(orphan.status()).toBe(400);
    const orphanBody = await orphan.text();
    expect(orphanBody).not.toMatch(/Prisma|SQL|stack/i);
    expect(orphanBody.toLowerCase()).toMatch(/subtask|parent/);
  });

  test("issue key preserved after project key change", async ({ page }) => {
    await loginAs(page, "developer_admin");
    const boardsRes = await page.request.get(`${API_BASE}/task-boards`);
    const boards = (await boardsRes.json()) as Array<{
      id: string;
      keyPrefix?: string;
      version: number;
      name: string;
      accessType: string;
      allowedDepartmentIds: string[];
      memberEmployeeIds: string[];
      members?: Array<{ employeeId: string; role: string }>;
      stages: Array<{ id: string; name: string; color: string; status: string }>;
      customFieldDefs?: unknown[];
      description?: string;
      leadEmployeeId?: string;
    }>;
    const board = boards.find((entry) => entry.keyPrefix === "AWF") ?? boards[0]!;
    const assignees = await page.request.get(`${API_BASE}/tasks/assignees?boardId=${board.id}`);
    const people = (await assignees.json()) as Array<{ id: string }>;
    const create = await page.request.post(`${API_BASE}/tasks`, {
      data: {
        title: `Key preserve ${Date.now()}`,
        boardId: board.id,
        stageId: board.stages[0]?.id,
        issueType: "TASK",
        priority: "MEDIUM",
        assigneeEmployeeIds: people[0] ? [people[0].id] : [],
      },
    });
    expect(create.ok(), await create.text()).toBeTruthy();
    const item = await create.json();
    expect(item.issueKey).toMatch(/^AWF-\d+$/);
    const oldKey = item.issueKey as string;

    const nextPrefix = board.keyPrefix === "AWF" ? "AWFX" : "AWF";
    const update = await page.request.patch(`${API_BASE}/task-boards/${board.id}`, {
      data: {
        version: board.version,
        name: board.name,
        keyPrefix: nextPrefix,
        description: board.description ?? null,
        leadEmployeeId: board.leadEmployeeId ?? null,
        accessType: board.accessType,
        allowedDepartmentIds: board.allowedDepartmentIds,
        memberEmployeeIds: board.memberEmployeeIds,
        members: board.members,
        stages: board.stages.map((stage) => ({
          id: stage.id,
          name: stage.name,
          color: stage.color,
          status: stage.status,
        })),
        customFieldDefs: board.customFieldDefs ?? [],
      },
    });
    expect(update.ok(), await update.text()).toBeTruthy();

    const fresh = await page.request.get(`${API_BASE}/tasks/${item.id}`);
    expect(fresh.ok()).toBeTruthy();
    const body = await fresh.json();
    expect(body.issueKey).toBe(oldKey);

    // restore AWF for later tests
    const updatedBoard = await update.json();
    await page.request.patch(`${API_BASE}/task-boards/${board.id}`, {
      data: {
        version: updatedBoard.version,
        name: board.name,
        keyPrefix: "AWF",
        description: board.description ?? null,
        leadEmployeeId: board.leadEmployeeId ?? null,
        accessType: board.accessType,
        allowedDepartmentIds: board.allowedDepartmentIds,
        memberEmployeeIds: board.memberEmployeeIds,
        members: board.members,
        stages: board.stages.map((stage) => ({
          id: stage.id,
          name: stage.name,
          color: stage.color,
          status: stage.status,
        })),
        customFieldDefs: board.customFieldDefs ?? [],
      },
    });
  });

  test("board stage move + rank persist; stale version rolls back", async ({ page }) => {
    await loginAs(page, "developer_admin");
    const boardsRes = await page.request.get(`${API_BASE}/task-boards`);
    const boards = (await boardsRes.json()) as Array<{
      id: string;
      keyPrefix?: string;
      stages: Array<{ id: string }>;
    }>;
    const board = boards.find((entry) => entry.keyPrefix === "AWF") ?? boards[0]!;
    const assignees = await page.request.get(`${API_BASE}/tasks/assignees?boardId=${board.id}`);
    const people = (await assignees.json()) as Array<{ id: string }>;
    const create = await page.request.post(`${API_BASE}/tasks`, {
      data: {
        title: `Rank move ${Date.now()}`,
        boardId: board.id,
        stageId: board.stages[0]?.id,
        issueType: "TASK",
        priority: "MEDIUM",
        assigneeEmployeeIds: people[0] ? [people[0].id] : [],
      },
    });
    expect(create.ok(), await create.text()).toBeTruthy();
    const item = await create.json();
    const targetStage = board.stages[1]?.id ?? board.stages[0]?.id;
    const moved = await page.request.patch(`${API_BASE}/tasks/${item.id}`, {
      data: { version: item.version, stageId: targetStage },
    });
    expect(moved.ok(), await moved.text()).toBeTruthy();
    const movedBody = await moved.json();
    expect(movedBody.stageId).toBe(targetStage);

    await page.reload({ waitUntil: "domcontentloaded" });
    const again = await page.request.get(`${API_BASE}/tasks/${item.id}`);
    const againBody = await again.json();
    expect(againBody.stageId).toBe(targetStage);
    expect(againBody.rank).toBeTruthy();

    const stale = await page.request.patch(`${API_BASE}/tasks/${item.id}`, {
      data: { version: item.version, title: "stale conflict" },
    });
    expect(stale.status()).toBe(409);
  });
});

test.describe("Task Planner foundation — responsive UI", () => {
  for (const vp of VIEWPORTS) {
    test(`UI ${vp.name} planner surfaces no overflow`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await loginAs(page, "developer_admin");
      await openAwfProject(page);

      for (const label of ["Board", "Backlog", "Timeline", "All Work"] as const) {
        await switchBoardView(page, label);
        const overflow = await findOverflow(page);
        expect(overflow, `overflow @${vp.name} ${label}`).toBeNull();
      }

      // Open a work item if present
      const card = page
        .locator("button, [role='button']")
        .filter({ hasText: /AWF-|UI Epic|UI Story|Rank/i })
        .first();
      if (await card.isVisible().catch(() => false)) {
        await card.click();
        await page.waitForTimeout(300);
        const overflowDetail = await findOverflow(page);
        expect(overflowDetail, `overflow @${vp.name} detail`).toBeNull();
        await page.keyboard.press("Escape").catch(() => undefined);
      }

      await page.getByTestId("project-settings-button").click();
      await expect(page.getByTestId("project-settings-shell")).toBeVisible();
      for (const section of SETTINGS_SECTIONS) {
        await openSettingsSection(page, section);
        await expect(page.getByTestId(`settings-panel-${section}`)).toBeVisible();
        const overflowSettings = await findOverflow(page);
        expect(overflowSettings, `overflow @${vp.name} settings ${section}`).toBeNull();
      }
    });
  }
});

test.describe("Task Planner foundation — API smoke", () => {
  test("lead can create IMPROVEMENT", async ({ request }) => {
    await apiLogin(request, "manager");
    const boards = await request.get(`${API_BASE}/task-boards`);
    expect(boards.ok(), await boards.text()).toBeTruthy();
    const list = (await boards.json()) as Array<{ id: string; stages: Array<{ id: string }>; keyPrefix?: string }>;
    const board = list.find((entry) => entry.keyPrefix === "AWF") ?? list[0]!;
    const assignees = await request.get(`${API_BASE}/tasks/assignees?boardId=${board.id}`);
    const people = (await assignees.json()) as Array<{ id: string }>;
    const create = await request.post(`${API_BASE}/tasks`, {
      data: {
        title: `E2E Improvement ${Date.now()}`,
        boardId: board.id,
        stageId: board.stages[0]?.id,
        issueType: "IMPROVEMENT",
        priority: "MEDIUM",
        assigneeEmployeeIds: people[0] ? [people[0].id] : [],
      },
    });
    expect(create.ok(), await create.text()).toBeTruthy();
    const item = await create.json();
    expect(item.issueType).toBe("IMPROVEMENT");
  });
});

// silence unused import if tree-shaken checks complain
void E2E_PASSWORD;
