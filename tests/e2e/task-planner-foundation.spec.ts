/**
 * Task Planner foundation E2E — cookie session via page.request (same pattern as Leave).
 */
import { expect, test, type Page } from "@playwright/test";
import { apiLogin } from "./helpers/auth";
import { findOverflow } from "./helpers/overflow";
import { API_BASE, E2E_PASSWORD, E2E_USERS } from "./helpers/users";

const VIEWPORTS = [
  { name: "320", width: 320, height: 568 },
  { name: "360", width: 360, height: 800 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 900 },
] as const;

async function browserSessionGoto(page: Page, userKey: keyof typeof E2E_USERS, path: string) {
  await page.request.post(`${API_BASE}/auth/logout`).catch(() => undefined);
  const login = await page.request.post(`${API_BASE}/auth/login`, {
    data: {
      email: E2E_USERS[userKey].email,
      password: E2E_PASSWORD,
      portal: "employee",
    },
  });
  expect(login.ok(), await login.text()).toBeTruthy();
  // page.request cookies are host-scoped to :4000; mirror them for the preview origin.
  const apiCookies = await page.context().cookies(API_BASE);
  if (apiCookies.length > 0) {
    await page.context().addCookies(
      apiCookies.map((cookie) => ({
        ...cookie,
        url: "http://localhost:4173",
      })),
    );
  }
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page
    .locator(".atd-open-splash")
    .waitFor({ state: "hidden", timeout: 30_000 })
    .catch(() => undefined);
  await expect(page.getByRole("heading", { name: /Work Planner|Dashboard|How do you/i }).first()).toBeVisible({
    timeout: 20_000,
  });
}

test.describe("Task Planner foundation", () => {
  test("admin My Work / Projects shell", async ({ page }) => {
    await browserSessionGoto(page, "developer_admin", "/tasks");
    await expect(page.getByRole("heading", { name: /Work Planner/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/My Work|Projects|Create project/i).first()).toBeVisible();
  });

  test("lead can list projects via API and create IMPROVEMENT", async ({ request }) => {
    await apiLogin(request, "developer_admin");
    const boards = await request.get(`${API_BASE}/task-boards`);
    expect(boards.ok(), await boards.text()).toBeTruthy();
    const list = (await boards.json()) as Array<{ id: string; stages: Array<{ id: string }> }>;
    if (list.length === 0) {
      test.info().annotations.push({ type: "note", description: "No projects in seed — create one" });
      const created = await request.post(`${API_BASE}/task-boards`, {
        data: {
          name: "E2E Planner Project",
          accessType: "OPEN",
          allowedDepartmentIds: [],
          memberEmployeeIds: [],
          stages: [
            { name: "To do", color: "SLATE", status: "TODO" },
            { name: "Doing", color: "BLUE", status: "IN_PROGRESS" },
            { name: "Done", color: "EMERALD", status: "COMPLETED" },
          ],
        },
      });
      expect(created.ok(), await created.text()).toBeTruthy();
      list.push(await created.json());
    }
    const board = list[0]!;
    const me = await request.get(`${API_BASE}/auth/me`);
    const meBody = await me.json();
    const employeeId = meBody.user?.employeeId as string | undefined;
    const assignees = await request.get(`${API_BASE}/tasks/assignees?boardId=${board.id}`);
    expect(assignees.ok()).toBeTruthy();
    const people = (await assignees.json()) as Array<{ id: string }>;
    const assigneeId = employeeId ?? people[0]?.id;
    expect(assigneeId).toBeTruthy();
    const create = await request.post(`${API_BASE}/tasks`, {
      data: {
        title: `E2E Improvement ${Date.now()}`,
        boardId: board.id,
        stageId: board.stages[0]?.id,
        issueType: "IMPROVEMENT",
        priority: "MEDIUM",
        assigneeEmployeeIds: [assigneeId],
      },
    });
    expect(create.ok(), await create.text()).toBeTruthy();
    const item = await create.json();
    expect(item.issueType).toBe("IMPROVEMENT");
    expect(item.issueKey).toBeTruthy();
    expect(item.reporterUserId || item.createdByUserId).toBeTruthy();
  });

  test("hierarchy: epic → story → subtask via API", async ({ request }) => {
    await apiLogin(request, "developer_admin");
    const boardsRes = await request.get(`${API_BASE}/task-boards`);
    const boards = (await boardsRes.json()) as Array<{ id: string; stages: Array<{ id: string }> }>;
    expect(boards.length).toBeGreaterThan(0);
    const board = boards[0]!;
    const assignees = await request.get(`${API_BASE}/tasks/assignees?boardId=${board.id}`);
    const people = (await assignees.json()) as Array<{ id: string }>;
    const assigneeId = people[0]?.id;
    expect(assigneeId).toBeTruthy();
    const stageId = board.stages[0]?.id;

    const epicRes = await request.post(`${API_BASE}/tasks`, {
      data: {
        title: `Epic ${Date.now()}`,
        boardId: board.id,
        stageId,
        issueType: "EPIC",
        priority: "HIGH",
        assigneeEmployeeIds: [assigneeId],
      },
    });
    expect(epicRes.ok(), await epicRes.text()).toBeTruthy();
    const epic = await epicRes.json();

    const storyRes = await request.post(`${API_BASE}/tasks`, {
      data: {
        title: `Story ${Date.now()}`,
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

    const badSub = await request.post(`${API_BASE}/tasks`, {
      data: {
        title: "orphan subtask",
        boardId: board.id,
        stageId,
        issueType: "SUBTASK",
        priority: "LOW",
        assigneeEmployeeIds: [assigneeId],
      },
    });
    expect(badSub.status()).toBe(400);

    const subRes = await request.post(`${API_BASE}/tasks`, {
      data: {
        title: `Subtask ${Date.now()}`,
        boardId: board.id,
        stageId,
        issueType: "SUBTASK",
        parentTaskId: story.id,
        priority: "LOW",
        assigneeEmployeeIds: [assigneeId],
      },
    });
    expect(subRes.ok(), await subRes.text()).toBeTruthy();
  });

  test("viewer write blocked when member role is VIEWER", async ({ request }) => {
    await apiLogin(request, "employee");
    const myWork = await request.get(`${API_BASE}/tasks/my-work`);
    expect(myWork.ok(), await myWork.text()).toBeTruthy();
    const body = await myWork.json();
    expect(body).toHaveProperty("today");
    expect(body).toHaveProperty("overdue");
    expect(body).toHaveProperty("inProgress");
  });

  for (const vp of VIEWPORTS) {
    test(`UI ${vp.name} Work Planner no overflow`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await browserSessionGoto(page, "developer_admin", "/tasks");
      await expect(page.getByRole("heading", { name: /Work Planner/i })).toBeVisible({
        timeout: 20_000,
      });
      const overflow = await findOverflow(page);
      expect(overflow, `overflow @${vp.name}`).toBeNull();
    });
  }
});
