#!/usr/bin/env bash
# Module 1 migration rehearsal on disposable MySQL (port 3307).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export DATABASE_URL="mysql://atd_test:atd_test_pass@127.0.0.1:3308/atd_org_test"

echo "==> Starting disposable MySQL 8.0..."
docker compose -f docker-compose.org-test.yml up -d --wait

echo "==> Fresh database: deploy all migrations..."
npx prisma migrate deploy

echo "==> Migration status..."
npx prisma migrate status

echo "==> Fresh migration rehearsal complete."
