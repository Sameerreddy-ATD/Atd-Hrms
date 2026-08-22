#!/usr/bin/env bash
# Sequential DB integration suites on disposable MySQL (port 3308).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=lib/assert-disposable-db.sh
source "$ROOT/scripts/lib/assert-disposable-db.sh"

export DATABASE_URL="${DATABASE_URL:-mysql://atd_test:atd_test_pass@127.0.0.1:3308/atd_org_test}"
assert_disposable_database_url

echo "==> Organization integration"
RUN_ORG_INTEGRATION=1 npx vitest run --config vitest.config.ts tests/organizationIntegration.test.ts

echo "==> Shift roster foundation integration"
RUN_SHIFT_INTEGRATION=1 npx vitest run --config vitest.config.ts tests/shiftRosterIntegration.test.ts

echo "==> Attendance exceptions classification integration"
RUN_ATTENDANCE_EXCEPTION_INTEGRATION=1 npx vitest run --config vitest.config.ts tests/attendanceExceptionIntegration.test.ts

echo "==> Company default General Shift integration"
RUN_COMPANY_DEFAULT_INTEGRATION=1 npx vitest run --config vitest.config.ts tests/companyDefaultShiftIntegration.test.ts

echo "==> Leave management foundation integration"
RUN_LEAVE_INTEGRATION=1 npx vitest run --config vitest.config.ts tests/leaveManagementIntegration.test.ts

echo "==> Task planner foundation integration"
RUN_PLANNER_INTEGRATION=1 npx vitest run --config vitest.config.ts tests/taskPlannerFoundationIntegration.test.ts

echo "==> Task planner workflow engine integration"
RUN_WORKFLOW_INTEGRATION=1 npx vitest run --config vitest.config.ts tests/taskPlannerWorkflowIntegration.test.ts

echo "==> Task planner sprint integration"
RUN_SPRINT_INTEGRATION=1 npx vitest run --config vitest.config.ts tests/taskPlannerSprintIntegration.test.ts

echo "==> Task planner roadmap integration"
RUN_ROADMAP_INTEGRATION=1 npx vitest run --config vitest.config.ts tests/taskPlannerRoadmapIntegration.test.ts

echo "==> DB integration suites passed."
