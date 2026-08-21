import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { API_BASE, E2E_PASSWORD, E2E_USERS, type E2eUserKey } from "./users";

export type PageDiagnostics = {
  url: string;
  title: string;
  consoleErrors: string[];
  networkFailures: string[];
};

/** Attach error collectors to a page for diagnostic output on failure. */
export function attachDiagnostics(page: Page): PageDiagnostics {
  const diagnostics: PageDiagnostics = {
    url: "",
    title: "",
    consoleErrors: [],
    networkFailures: [],
  };
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    // Expected: anonymous /auth/restore returns 401 before login.
    if (/401 \(Unauthorized\)/i.test(text)) return;
    diagnostics.consoleErrors.push(text);
  });
  page.on("pageerror", (error) => {
    diagnostics.consoleErrors.push(`${error.name}: ${error.message}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500) {
      diagnostics.networkFailures.push(`${response.status()} ${response.url()}`);
    }
  });
  return diagnostics;
}

export async function capturePageState(page: Page, diagnostics: PageDiagnostics) {
  diagnostics.url = page.url();
  diagnostics.title = await page.title();
}

export function formatDiagnostics(diagnostics: PageDiagnostics) {
  return [
    `URL: ${diagnostics.url}`,
    `Title: ${diagnostics.title}`,
    diagnostics.consoleErrors.length
      ? `Console errors:\n${diagnostics.consoleErrors.join("\n")}`
      : "Console errors: none",
    diagnostics.networkFailures.length
      ? `Network failures:\n${diagnostics.networkFailures.join("\n")}`
      : "Network failures: none",
  ].join("\n");
}

/**
 * Sign in through the employee portal login form.
 * Navigates to /login?as=employee to skip the portal-selection step.
 *
 * Uses form.requestSubmit() because Playwright's button click can miss the
 * React submit handler on this page under headless Chromium.
 */
export async function loginAs(page: Page, userKey: E2eUserKey) {
  const user = E2E_USERS[userKey];
  const diagnostics = attachDiagnostics(page);

  // Dismiss sheets/dialogs that can intercept clicks after org management flows.
  await page.keyboard.press("Escape").catch(() => undefined);

  // Authenticated sessions hard-redirect /login → /dashboard; clear session first.
  await page.request.post(`${API_BASE}/auth/logout`).catch(() => undefined);
  await page.context().clearCookies();
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  }).catch(() => undefined);

  await page.goto("/login?as=employee", { waitUntil: "domcontentloaded" });

  // Boot splash can intercept pointer events after remount; wait it out.
  await page
    .locator(".atd-open-splash")
    .waitFor({ state: "hidden", timeout: 30_000 })
    .catch(() => undefined);

  const loginHeading = page.getByRole("heading", { name: /team member sign-in/i });
  await expect(loginHeading, "Employee login form should render").toBeVisible({ timeout: 15_000 });

  const emailField = page.locator("#login-id");
  await expect(emailField, "Work email field must be present").toBeVisible({ timeout: 15_000 });
  // Wait for React hydration — filling before hydrate gets wiped on remount.
  await emailField.click({ force: true });
  for (let attempt = 0; attempt < 5; attempt++) {
    await emailField.fill("");
    await emailField.fill(user.email);
    if ((await emailField.inputValue()) === user.email) break;
    await page.waitForTimeout(250);
  }
  await expect(emailField).toHaveValue(user.email);

  const passwordField = page.locator("#password");
  await expect(passwordField, "Password field must be present").toBeVisible();
  await passwordField.fill(E2E_PASSWORD);
  await expect(passwordField).toHaveValue(E2E_PASSWORD);

  const loginWait = page.waitForResponse(
    (response) =>
      response.url().includes("/auth/login") && response.request().method() === "POST",
    { timeout: 25_000 },
  );

  await page.locator("form").evaluate((form: HTMLFormElement) => form.requestSubmit());

  const loginResponse = await loginWait.catch(async () => {
    await capturePageState(page, diagnostics);
    const validation = await page.locator(".text-destructive").allTextContents();
    throw new Error(
      `No POST /auth/login response\nValidation: ${JSON.stringify(validation)}\n${formatDiagnostics(diagnostics)}`,
    );
  });

  if (!loginResponse.ok()) {
    const body = await loginResponse.text().catch(() => "");
    await capturePageState(page, diagnostics);
    throw new Error(
      `POST /auth/login failed (${loginResponse.status()}): ${body}\n${formatDiagnostics(diagnostics)}`,
    );
  }

  await page.waitForURL(/dashboard|first-login|face-enrollment|face/, { timeout: 25_000 });

  if (page.url().includes("first-login")) {
    await page.locator("#password, #newPassword").first().fill(E2E_PASSWORD);
    const confirm = page.locator("#confirmPassword");
    if (await confirm.count()) await confirm.fill(E2E_PASSWORD);
    await page.getByRole("button", { name: /save|continue|update/i }).click();
    await page.waitForURL(/dashboard/, { timeout: 20_000 });
  }

  await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

  const meUser = await page.evaluate(async (apiBase) => {
    const res = await fetch(`${apiBase}/auth/me`, { credentials: "include" });
    if (!res.ok) throw new Error(`/auth/me ${res.status}`);
    const json = (await res.json()) as { user?: { role?: string; email?: string }; role?: string; email?: string };
    return json.user ?? json;
  }, API_BASE);
  expect(meUser.email?.toLowerCase()).toBe(user.email.toLowerCase());
  expect(String(meUser.role).toUpperCase()).toBe(user.role.toUpperCase());

  return { user, me: meUser };
}

/** API login for tests that need request context without browser navigation. */
export async function apiLogin(request: APIRequestContext, userKey: E2eUserKey) {
  const user = E2E_USERS[userKey];
  const res = await request.post(`${API_BASE}/auth/login`, {
    data: { email: user.email, password: E2E_PASSWORD, portal: "employee" },
  });
  expect(res.ok(), `API login failed for ${userKey}: ${res.status()} ${await res.text()}`).toBeTruthy();
  const me = await request.get(`${API_BASE}/auth/me`);
  expect(me.ok()).toBeTruthy();
  const body = (await me.json()) as {
    user?: { role?: string; employeeId?: string; id?: string };
    role?: string;
    employeeId?: string;
  };
  const role = body.user?.role ?? body.role;
  expect(String(role).toUpperCase()).toBe(user.role.toUpperCase());
  return {
    ...body,
    ok: true as const,
    user: {
      ...(body.user ?? {}),
      role,
      employeeId: body.user?.employeeId ?? body.employeeId,
    },
  };
}
