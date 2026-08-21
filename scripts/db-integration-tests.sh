#!/usr/bin/env bash
# Sequential DB integration suites on disposable MySQL (port 3308).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export DATABASE_URL="${DATABASE_URL:-mysql://atd_test:atd_test_pass@127.0.0.1:3308/atd_org_test}"

echo "==> Organization integration"
RUN_ORG_INTEGRATION=1 npx vitest run --config vitest.config.ts tests/organizationIntegration.test.ts

echo "==> Work locations integration"
RUN_WL_INTEGRATION=1 npx vitest run --config vitest.config.ts tests/workLocationsIntegration.test.ts

echo "==> DB integration suites passed."
