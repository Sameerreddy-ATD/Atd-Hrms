#!/usr/bin/env bash
# Leave foundation authenticated E2E on disposable MySQL (port 3308).
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

npx prisma migrate deploy
npx prisma generate >/dev/null
node scripts/e2e-seed.mjs
npm run build:backend
test -d dist/client/assets || npm run build

npm run start:backend > /tmp/e2e-leave-backend.log 2>&1 &
echo $! > /tmp/e2e-leave-backend.pid
npm run preview -- --host localhost --port 4173 > /tmp/e2e-leave-frontend.log 2>&1 &
echo $! > /tmp/e2e-leave-frontend.pid

for i in $(seq 1 90); do
  if curl -sf http://localhost:4000/health >/dev/null && curl -sf -o /dev/null http://localhost:4173; then
    break
  fi
  sleep 1
done
curl -sf http://localhost:4000/health

E2E_SKIP_INFRA=1 E2E_BASE_URL=http://localhost:4173 E2E_API_BASE_URL=http://localhost:4000 \
  npx playwright test tests/e2e/leave-management.spec.ts --project=desktop-chromium
EC=$?

kill "$(cat /tmp/e2e-leave-backend.pid)" "$(cat /tmp/e2e-leave-frontend.pid)" 2>/dev/null || true
exit "$EC"
