import { defineConfig, devices } from "@playwright/test";

const API_BASE = process.env.E2E_API_BASE_URL ?? "http://localhost:4000";
const FRONTEND_PORT = process.env.E2E_FRONTEND_PORT ?? "4173";
const FRONTEND_URL = process.env.E2E_BASE_URL ?? `http://localhost:${FRONTEND_PORT}`;

const backendEnv = {
  DATABASE_URL:
    process.env.DATABASE_URL ?? "mysql://atd_test:atd_test_pass@127.0.0.1:3308/atd_org_test",
  NODE_ENV: "development",
  COOKIE_SECURE: "false",
  FRONTEND_ORIGIN: FRONTEND_URL,
  AUTH_RATE_LIMIT_MAX: "10000",
  AUTH_IDENTITY_RATE_LIMIT_MAX: "10000",
  ALLOW_ATTENDANCE_E2E_SEED: "1",
  JWT_ACCESS_SECRET:
    process.env.JWT_ACCESS_SECRET ?? "e2e-dev-access-secret-1234567890123456",
  JWT_REFRESH_SECRET:
    process.env.JWT_REFRESH_SECRET ?? "e2e-dev-refresh-secret-1234567890123456",
  EMPLOYEE_DATA_ENCRYPTION_KEY:
    process.env.EMPLOYEE_DATA_ENCRYPTION_KEY ?? "e2e-dev-encryption-key-1234567890123456",
};

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: FRONTEND_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "desktop-webkit",
      use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "android-pixel",
      use: { ...devices["Pixel 7"], viewport: { width: 412, height: 915 } },
    },
    {
      name: "android-small",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 320, height: 568 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "iphone-webkit",
      use: { ...devices["iPhone 14"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "ipad-webkit",
      use: { ...devices["iPad Pro 11"], viewport: { width: 834, height: 1194 } },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: "npm run start:backend",
          url: `${API_BASE}/health`,
          timeout: 120_000,
          reuseExistingServer: true,
          env: backendEnv,
        },
        {
          command: `npm run preview -- --host localhost --port ${FRONTEND_PORT}`,
          url: `${FRONTEND_URL}/login`,
          timeout: 120_000,
          reuseExistingServer: true,
        },
      ],
});
