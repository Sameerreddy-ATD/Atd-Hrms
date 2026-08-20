#!/usr/bin/env bash
# Self-contained Module 1 E2E runner: MySQL → migrate → seed → backend → frontend → Playwright.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export DATABASE_URL="${DATABASE_URL:-mysql://atd_test:atd_test_pass@127.0.0.1:3308/atd_org_test}"
# Keep hostnames consistent with FRONTEND_ORIGIN (localhost) to avoid CORS cookie issues.
export E2E_API_BASE_URL="${E2E_API_BASE_URL:-http://localhost:4000}"
export JWT_ACCESS_SECRET="${JWT_ACCESS_SECRET:-e2e-dev-access-secret-1234567890123456}"
export JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-e2e-dev-refresh-secret-1234567890123456}"
export EMPLOYEE_DATA_ENCRYPTION_KEY="${EMPLOYEE_DATA_ENCRYPTION_KEY:-e2e-dev-encryption-key-1234567890123456}"
export COOKIE_SECURE=false
export NODE_ENV=development
export FRONTEND_ORIGIN="${E2E_BASE_URL:-http://localhost:4173}"

echo "==> E2E: starting disposable MySQL..."
docker compose -f docker-compose.org-test.yml up -d --wait

echo "==> E2E: applying migrations..."
npx prisma migrate deploy

echo "==> E2E: seeding deterministic users..."
node scripts/e2e-seed.mjs

echo "==> E2E: building backend + frontend if needed..."
npm run build:backend
npm run build

echo "==> E2E: running Playwright..."
npx playwright test "$@"
