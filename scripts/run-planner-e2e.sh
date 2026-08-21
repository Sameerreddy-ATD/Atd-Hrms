#!/usr/bin/env bash
# Task Planner foundation authenticated E2E on disposable MySQL (port 3308).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

pkill -9 -f "playwright test" 2>/dev/null || true
pkill -9 -f "dist-server/server/src/index" 2>/dev/null || true
pkill -9 -f "vite preview" 2>/dev/null || true
fuser -k 4000/tcp 4173/tcp 2>/dev/null || true
sleep 1

docker compose -f docker-compose.org-test.yml up -d --wait

export DATABASE_URL="mysql://atd_test:atd_test_pass@127.0.0.1:3308/atd_org_test"
export ALLOW_ATTENDANCE_E2E_SEED=1
export COOKIE_SECURE=false
export NODE_ENV=development
export JWT_ACCESS_SECRET=e2e-dev-access-secret-1234567890123456
export JWT_REFRESH_SECRET=e2e-dev-refresh-secret-1234567890123456
export EMPLOYEE_DATA_ENCRYPTION_KEY=e2e-dev-encryption-key-1234567890123456
export FRONTEND_ORIGIN=http://localhost:4173
export AUTH_RATE_LIMIT_MAX=10000
export AUTH_IDENTITY_RATE_LIMIT_MAX=10000
# Same-origin browser + API via Vite preview /api proxy (see docs/TASK_PLANNER_E2E_TOPOLOGY.md)
export E2E_API_BASE_URL=http://localhost:4173/api
export E2E_BACKEND_URL=http://localhost:4000
export VITE_API_BASE_URL=/api

npx prisma migrate deploy
npx prisma generate >/dev/null
node scripts/e2e-seed.mjs
npm run build:backend
VITE_API_BASE_URL=/api npm run build

npm run start:backend > /tmp/e2e-planner-backend.log 2>&1 &
echo $! > /tmp/e2e-planner-backend.pid
npm run preview -- --host localhost --port 4173 > /tmp/e2e-planner-frontend.log 2>&1 &
echo $! > /tmp/e2e-planner-frontend.pid

for i in $(seq 1 90); do
  if curl -sf http://localhost:4000/health >/dev/null \
    && curl -sf -o /dev/null http://localhost:4173 \
    && curl -sf http://localhost:4173/api/health >/dev/null; then
    break
  fi
  sleep 1
done

npx playwright test tests/e2e/task-planner-foundation.spec.ts --project=desktop-chromium --reporter=line
STATUS=$?

kill "$(cat /tmp/e2e-planner-backend.pid)" "$(cat /tmp/e2e-planner-frontend.pid)" 2>/dev/null || true
exit $STATUS
