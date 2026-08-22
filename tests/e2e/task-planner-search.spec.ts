/**
 * Task Planner Search + Saved Views E2E
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

async function openPlanner(page: Page) {
  await page.goto("/tasks", { waitUntil: "domcontentloaded" });
  await page.locator(".atd-open-splash").waitFor({ state: "hidden", timeout: 30_000 }).catch(() => undefined);
  await expect(page.getByRole("heading", { name: /Work Planner/i })).toBeVisible({ timeout: 25_000 });
}

async function awfBoard(page: Page) {
  const boardsRes = await page.request.get(`${API_BASE}/task-boards`);
  expect(boardsRes.ok(), await boardsRes.text()).toBeTruthy();
  const boards = (await boardsRes.json()) as Array<{ id: string; keyPrefix?: string; stages: Array<{ id: string; name: string }> }>;
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
  issueType = "BUG",
  priority = "HIGH",
) {
  const backlog = board.stages.find((s) => /backlog/i.test(s.name)) ?? board.stages[0]!;
  const create = await page.request.post(`${API_BASE}/tasks`, {
    data: {
      title,
      boardId: board.id,
      stageId: backlog.id,
      issueType,
      priority,
      assigneeEmployeeIds: [await firstAssignee(page, board.id)],
    },
  });
  expect(create.ok(), await create.text()).toBeTruthy();
  return (await create.json()) as { id: string; version: number; issueKey?: string; title: string };
}

async function openAwfProject(page: Page) {
  await openPlanner(page);
  await page.getByTestId("project-open-AWF").click();
  await expect(page.getByRole("group", { name: /Board view/i })).toBeVisible({ timeout: 15_000 });
}

async function createPayBoard(page: Page) {
  const suffix = Date.now().toString(36).slice(-4).toUpperCase();
  const adminAssignee = await firstAssignee(page, (await awfBoard(page)).id);
  const create = await page.request.post(`${API_BASE}/task-boards`, {
    data: {
      name: "Payroll Restricted",
      keyPrefix: `PAY${suffix}`,
      accessType: "MEMBER_GATED",
      memberEmployeeIds: [adminAssignee],
      stages: [
        { name: "Backlog", color: "SLATE", status: "TODO" },
        { name: "Done", color: "EMERALD", status: "COMPLETED", isCompleted: true },
      ],
    },
  });
  expect(create.ok(), await create.text()).toBeTruthy();
  return (await create.json()) as { id: string; stages: Array<{ id: string; name: string }> };
}

async function searchPlanner(page: Page, text: string) {
  const input = page.getByTestId("planner-search-input");
  await input.fill("");
  await input.pressSequentially(text, { delay: 40 });
}

test.describe("Search member E2E", () => {
  test("member searches issue key and title", async ({ page }) => {
    await loginAs(page, "employee");
    const board = await awfBoard(page);
    const task = await createTaskViaApi(page, board, `Mobile attendance ${Date.now()}`, "TASK");

    await openPlanner(page);
    await page.getByTestId("planner-global-search-trigger").click();
    await searchPlanner(page, task.issueKey ?? "AWF");
    await expect(page.getByTestId("planner-search-result").first()).toBeVisible({ timeout: 20_000 });

    await searchPlanner(page, "Mobile");
    await expect(page.getByTestId("planner-search-result").filter({ hasText: task.title }).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});

test.describe("Search security E2E", () => {
  test("viewer cannot find inaccessible PAY project item", async ({ page }) => {
    await loginAs(page, "developer_admin");
    const payBoard = await createPayBoard(page);
    const payTask = await createTaskViaApi(page, payBoard, "Payment issue", "BUG");

    await page.context().clearCookies();
    await loginAs(page, "viewer");
    const search = await page.request.get(
      `${API_BASE}/tasks/search?q=${encodeURIComponent(payTask.issueKey ?? "PAY-1")}`,
    );
    expect(search.ok()).toBeTruthy();
    const body = (await search.json()) as { results: Array<{ issueKey?: string }> };
    expect(body.results.some((row) => row.issueKey === payTask.issueKey)).toBe(false);

    const titleSearch = await page.request.get(`${API_BASE}/tasks/search?q=${encodeURIComponent("Payment issue")}`);
    const titleBody = (await titleSearch.json()) as { results: Array<{ title: string }> };
    expect(titleBody.results.some((row) => row.title.includes("Payment issue"))).toBe(false);
  });
});

test.describe("Saved view member E2E", () => {
  test("member saves personal view and reload restores filters", async ({ page }) => {
    await loginAs(page, "employee");
    const board = await awfBoard(page);
    await createTaskViaApi(page, board, `Saved view bug ${Date.now()}`, "BUG", "HIGH");

    await openAwfProject(page);
    await page.getByRole("button", { name: /All Work/i }).click();
    await page.getByRole("combobox").filter({ hasText: /Priority/i }).click();
    await page.getByRole("option", { name: /High/i }).click();
    await page.getByTestId("save-view-button").click();
    const viewName = `High priority mobile bugs ${Date.now()}`;
    await page.getByLabel("Name").fill(viewName);
    await page.getByRole("button", { name: /^Save view$/i }).click();
    await expect(page.getByText("Saved view created")).toBeVisible({ timeout: 10_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await openPlanner(page);
    await page.getByTestId("open-saved-views").click();
    await expect(page.getByTestId("saved-view-card").filter({ hasText: viewName })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId("saved-view-card").filter({ hasText: viewName }).getByRole("button", { name: /^Open$/ }).click();
    await expect(page.getByRole("button", { name: /All Work/i })).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Search responsive E2E", () => {
  for (const viewport of VIEWPORTS) {
    test(`search UI ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await loginAs(page, "employee");
      await openPlanner(page);
      await page.getByTestId("planner-global-search-trigger").click();
      await expect(page.getByTestId("planner-search-input")).toBeVisible({ timeout: 10_000 });
      const overflow = await findOverflow(page);
      expect(overflow).toBeNull();
    });
  }
});
