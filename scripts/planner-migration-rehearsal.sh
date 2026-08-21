#!/usr/bin/env bash
# Task Planner foundation migration on disposable MySQL (port 3308).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CONTAINER="${MYSQL_CONTAINER:-atd-hrms-mysql-org-test-1}"
MYSQL_ROOT_PASS="${MYSQL_ROOT_PASS:-org_test_root}"
PLANNER_MIGRATION="20260821200000_task_planner_foundation"
BASE_CUTOFF="20260821190000_leave_management_foundation"

mysql_exec() {
  docker exec -i "$CONTAINER" mysql -uroot -p"$MYSQL_ROOT_PASS" --protocol=TCP "$@"
}

echo "==> Ensuring disposable MySQL is up..."
docker compose -f docker-compose.org-test.yml up -d --wait
mysql_exec -e "SELECT 1" >/dev/null

echo "==> A) FRESH DB"
mysql_exec -e "DROP DATABASE IF EXISTS atd_planner_fresh; CREATE DATABASE atd_planner_fresh CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql_exec -e "GRANT ALL ON atd_planner_fresh.* TO 'atd_test'@'%'; FLUSH PRIVILEGES;"
export DATABASE_URL="mysql://atd_test:atd_test_pass@127.0.0.1:3308/atd_planner_fresh"
npx prisma migrate deploy
REPORTER=$(mysql_exec -N -e "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='atd_planner_fresh' AND table_name='work_tasks' AND column_name='reporter_user_id';")
CAT=$(mysql_exec -N -e "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='atd_planner_fresh' AND table_name='task_stages' AND column_name='status_category';")
ROLE=$(mysql_exec -N -e "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='atd_planner_fresh' AND table_name='task_board_members' AND column_name='role';")
TYPES=$(mysql_exec -N -e "SELECT COLUMN_TYPE FROM information_schema.columns WHERE table_schema='atd_planner_fresh' AND table_name='work_tasks' AND column_name='issue_type';" | grep -c SUBTASK || true)
if [[ "$REPORTER" != "1" || "$CAT" != "1" || "$ROLE" != "1" || "$TYPES" -lt 1 ]]; then
  echo "FAIL: fresh planner foundation incomplete"
  exit 1
fi
echo "FRESH_DB_MIGRATION=PASS"

echo "==> B) INCREMENTAL from leave foundation (a908cdf tip)"
mysql_exec -e "DROP DATABASE IF EXISTS atd_planner_incr; CREATE DATABASE atd_planner_incr CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql_exec -e "GRANT ALL ON atd_planner_incr.* TO 'atd_test'@'%'; FLUSH PRIVILEGES;"
TMP_MIG=$(mktemp -d)
cp -a prisma/migrations/. "$TMP_MIG/"
rm -rf "$TMP_MIG/$PLANNER_MIGRATION"
export DATABASE_URL="mysql://atd_test:atd_test_pass@127.0.0.1:3308/atd_planner_incr"
# migrate with temp folder lacking planner migration
BACKUP_MIG=$(mktemp -d)
mv prisma/migrations "$BACKUP_MIG/migrations"
mv "$TMP_MIG" prisma/migrations
npx prisma migrate deploy
# restore full migrations and deploy planner only
rm -rf prisma/migrations
mv "$BACKUP_MIG/migrations" prisma/migrations
npx prisma migrate deploy

REPORTER2=$(mysql_exec -N -e "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='atd_planner_incr' AND table_name='work_tasks' AND column_name='reporter_user_id';")
APPLIED=$(mysql_exec -N -e "SELECT COUNT(*) FROM atd_planner_incr._prisma_migrations WHERE migration_name='$PLANNER_MIGRATION' AND finished_at IS NOT NULL;")
if [[ "$REPORTER2" != "1" || "$APPLIED" != "1" ]]; then
  echo "FAIL: incremental planner foundation"
  exit 1
fi
echo "INCREMENTAL_DB_MIGRATION=PASS"
echo "PLANNER_MIGRATION_REHEARSAL=PASS"
