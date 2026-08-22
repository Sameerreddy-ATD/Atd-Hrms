#!/usr/bin/env bash
# Task Planner workflow migration on disposable MySQL (port 3308).
# Incremental path: production tip a908cdf → planner foundation → workflow engine.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CONTAINER="${MYSQL_CONTAINER:-atd-hrms-mysql-org-test-1}"
MYSQL_ROOT_PASS="${MYSQL_ROOT_PASS:-org_test_root}"
PLANNER_MIGRATION="20260821200000_task_planner_foundation"
WORKFLOW_MIGRATION="20260822120000_task_planner_workflow_engine"
BASE_CUTOFF="20260821190000_leave_management_foundation"

mysql_exec() {
  docker exec -i "$CONTAINER" mysql -uroot -p"$MYSQL_ROOT_PASS" --protocol=TCP "$@"
}

echo "==> Ensuring disposable MySQL is up..."
docker compose -f docker-compose.org-test.yml up -d --wait
mysql_exec -e "SELECT 1" >/dev/null

echo "==> A) FRESH DB"
mysql_exec -e "DROP DATABASE IF EXISTS atd_workflow_fresh; CREATE DATABASE atd_workflow_fresh CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql_exec -e "GRANT ALL ON atd_workflow_fresh.* TO 'atd_test'@'%'; FLUSH PRIVILEGES;"
export DATABASE_URL="mysql://atd_test:atd_test_pass@127.0.0.1:3308/atd_workflow_fresh"
npx prisma migrate deploy
WF=$(mysql_exec -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='atd_workflow_fresh' AND table_name='task_workflows';")
WFS=$(mysql_exec -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='atd_workflow_fresh' AND table_name='task_workflow_statuses';")
WFT=$(mysql_exec -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='atd_workflow_fresh' AND table_name='task_workflow_transitions';")
HIST=$(mysql_exec -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='atd_workflow_fresh' AND table_name='task_transition_history';")
COL=$(mysql_exec -N -e "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='atd_workflow_fresh' AND table_name='work_tasks' AND column_name='workflow_status_id';")
if [[ "$WF" != "1" || "$WFS" != "1" || "$WFT" != "1" || "$HIST" != "1" || "$COL" != "1" ]]; then
  echo "FAIL: fresh workflow migration incomplete"
  exit 1
fi
echo "FRESH_DB_MIGRATION=PASS"

echo "==> B) INCREMENTAL production→foundation→workflow"
mysql_exec -e "DROP DATABASE IF EXISTS atd_workflow_incr; CREATE DATABASE atd_workflow_incr CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql_exec -e "GRANT ALL ON atd_workflow_incr.* TO 'atd_test'@'%'; FLUSH PRIVILEGES;"
TMP_MIG=$(mktemp -d)
cp -a prisma/migrations/. "$TMP_MIG/"
rm -rf "$TMP_MIG/$PLANNER_MIGRATION" "$TMP_MIG/$WORKFLOW_MIGRATION"
export DATABASE_URL="mysql://atd_test:atd_test_pass@127.0.0.1:3308/atd_workflow_incr"
BACKUP_MIG=$(mktemp -d)
mv prisma/migrations "$BACKUP_MIG/migrations"
mv "$TMP_MIG" prisma/migrations
npx prisma migrate deploy
# restore and apply foundation + workflow
rm -rf prisma/migrations
mv "$BACKUP_MIG/migrations" prisma/migrations
npx prisma migrate deploy

APPLIED_P=$(mysql_exec -N -e "SELECT COUNT(*) FROM atd_workflow_incr._prisma_migrations WHERE migration_name='$PLANNER_MIGRATION' AND finished_at IS NOT NULL;")
APPLIED_W=$(mysql_exec -N -e "SELECT COUNT(*) FROM atd_workflow_incr._prisma_migrations WHERE migration_name='$WORKFLOW_MIGRATION' AND finished_at IS NOT NULL;")
COL2=$(mysql_exec -N -e "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='atd_workflow_incr' AND table_name='work_tasks' AND column_name='workflow_status_id';")
if [[ "$APPLIED_P" != "1" || "$APPLIED_W" != "1" || "$COL2" != "1" ]]; then
  echo "FAIL: incremental workflow migration"
  exit 1
fi
echo "INCREMENTAL_DB_MIGRATION=PASS"
echo "WORKFLOW_MIGRATION_REHEARSAL=PASS"
