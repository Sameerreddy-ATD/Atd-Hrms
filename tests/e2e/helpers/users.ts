/** Deterministic E2E credentials — test-only disposable database. */
export const E2E_PASSWORD = "E2eTestPass123!";
/** Prefer same-origin preview proxy (`:4173/api`) — see docs/TASK_PLANNER_E2E_TOPOLOGY.md */
export const API_BASE = process.env.E2E_API_BASE_URL ?? "http://localhost:4173/api";
/** Direct backend health / optional bypass (not used for browser session cookies). */
export const BACKEND_HEALTH = process.env.E2E_BACKEND_URL ?? "http://localhost:4000";

export type E2eUserKey =
  | "developer_admin"
  | "ceo"
  | "chief_of_staff"
  | "manager"
  | "employee"
  | "hr"
  | "sales"
  | "driver"
  | "viewer"
  | "viewer_candidate";

export const E2E_USERS: Record<E2eUserKey, { email: string; role: string; name: string }> = {
  developer_admin: {
    email: "e2e-developer_admin@test.local",
    role: "DEVELOPER_ADMIN",
    name: "E2E Developer Admin",
  },
  ceo: { email: "e2e-ceo@test.local", role: "CEO", name: "E2E CEO" },
  chief_of_staff: {
    email: "e2e-chief_of_staff@test.local",
    role: "CHIEF_OF_STAFF",
    name: "E2E Chief of Staff",
  },
  manager: { email: "e2e-manager@test.local", role: "MANAGER", name: "E2E Operations Head" },
  employee: { email: "e2e-employee@test.local", role: "EMPLOYEE", name: "E2E Analyst" },
  hr: { email: "e2e-hr@test.local", role: "HR", name: "E2E HR" },
  sales: { email: "e2e-sales@test.local", role: "SALES", name: "E2E Sales" },
  driver: { email: "e2e-driver@test.local", role: "DRIVER", name: "E2E Bowser Pilot" },
  viewer: { email: "e2e-viewer@test.local", role: "EMPLOYEE", name: "E2E Viewer" },
  viewer_candidate: {
    email: "e2e-viewer-candidate@test.local",
    role: "EMPLOYEE",
    name: "E2E Viewer Candidate",
  },
};

export const EXPECTED_UNIT_NAMES = [
  "Chief of Staff",
  "Chief of Operations",
  "Sales Team",
  "Operations Department",
  "Maintenance Manager",
  "Procurement",
  "Fleet & Driver Team",
  "Analytics",
  "Routing & Planning",
  "Special Projects",
  "Principal Advisor",
  "Hr Department",
  "Interns",
  "Software",
  "Inside Sales",
  "Marketing",
  "Accounts Team",
  "Advisor Growth & Strategy",
  "Compliance",
  "Executive Leadership",
];
