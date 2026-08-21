#!/usr/bin/env bash
# Leave foundation migration acceptance on disposable MySQL only (port 3308).
# Fresh from-zero + incremental from production-base schema.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CONTAINER="${MYSQL_CONTAINER:-atd-hrms-mysql-org-test-1}"
MYSQL_ROOT_PASS="${MYSQL_ROOT_PASS:-org_test_root}"
LEAVE_MIGRATION="20260821190000_leave_management_foundation"

mysql_exec() {
  docker exec -i "$CONTAINER" mysql -uroot -p"$MYSQL_ROOT_PASS" --protocol=TCP "$@"
}

echo "==> Ensuring disposable MySQL is up..."
docker compose -f docker-compose.org-test.yml up -d --wait
mysql_exec -e "SELECT 1" >/dev/null

echo "==> A) FRESH DB — drop/create + migrate from zero"
mysql_exec -e "DROP DATABASE IF EXISTS atd_leave_fresh; CREATE DATABASE atd_leave_fresh CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql_exec -e "GRANT ALL ON atd_leave_fresh.* TO 'atd_test'@'%'; FLUSH PRIVILEGES;"
export DATABASE_URL="mysql://atd_test:atd_test_pass@127.0.0.1:3308/atd_leave_fresh"
npx prisma migrate deploy
# Prove leave foundation objects exist
HISTORY_TABLE=$(mysql_exec -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='atd_leave_fresh' AND table_name='leave_approval_history';")
HALF_COL=$(mysql_exec -N -e "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='atd_leave_fresh' AND table_name='leave_types' AND column_name='half_day_allowed';")
WITHDRAWN=$(mysql_exec -N -e "SELECT COLUMN_TYPE FROM information_schema.columns WHERE table_schema='atd_leave_fresh' AND table_name='leave_requests' AND column_name='status';" | grep -c WITHDRAWN || true)
if [[ "$HISTORY_TABLE" != "1" || "$HALF_COL" != "1" || "$WITHDRAWN" -lt 1 ]]; then
  echo "FAIL: fresh leave foundation schema incomplete"
  exit 1
fi
echo "FRESH_DB_MIGRATION=PASS"

echo "==> B) INCREMENTAL DB — schema through production base, then Leave migration"
mysql_exec -e "DROP DATABASE IF EXISTS atd_leave_incr; CREATE DATABASE atd_leave_incr CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql_exec -e "GRANT ALL ON atd_leave_incr.* TO 'atd_test'@'%'; FLUSH PRIVILEGES;"

# Apply all migrations except the leave foundation (simulate production at db77db0)
TMP_MIG=$(mktemp -d)
cp -a prisma/migrations/. "$TMP_MIG/"
rm -rf "$TMP_MIG/$LEAVE_MIGRATION"
export DATABASE_URL="mysql://atd_test:atd_test_pass@127.0.0.1:3308/atd_leave_incr"
# Use temporary migrations path via symlink swap
BACKUP_MIG="prisma/migrations.__leave_backup_$$"
mv prisma/migrations "$BACKUP_MIG"
mv "$TMP_MIG" prisma/migrations
set +e
npx prisma migrate deploy
DEPLOY_RC=$?
set -e
# restore migrations folder
rm -rf prisma/migrations
mv "$BACKUP_MIG" prisma/migrations
if [[ $DEPLOY_RC -ne 0 ]]; then
  echo "FAIL: incremental base migrate failed"
  exit 1
fi

# Seed marker rows that must survive Leave migration
mysql_exec atd_leave_incr <<'SQL'
INSERT INTO leave_types (leave_type_id, name, code, paid, active, carry_forward, requires_medical_document, approval_required)
VALUES ('lt_leave_accept_casual', 'Casual Leave Accept', 'CASUAL_ACCEPT_TEST', 1, 1, 1, 0, 1)
ON DUPLICATE KEY UPDATE name=VALUES(name);
CREATE TABLE IF NOT EXISTS _leave_accept_marker (
  id INT PRIMARY KEY,
  note VARCHAR(100) NOT NULL
);
INSERT INTO _leave_accept_marker (id, note) VALUES (1, 'pre_leave_migration')
ON DUPLICATE KEY UPDATE note=VALUES(note);
SQL

TYPE_BEFORE=$(mysql_exec -N -e "SELECT COUNT(*) FROM atd_leave_incr.leave_types WHERE leave_type_id='lt_leave_accept_casual';")
MARKER_BEFORE=$(mysql_exec -N -e "SELECT note FROM atd_leave_incr._leave_accept_marker WHERE id=1;")

# Apply only the leave foundation migration SQL against incremental DB
mysql_exec atd_leave_incr < "prisma/migrations/$LEAVE_MIGRATION/migration.sql"
# Record migration in Prisma table
mysql_exec atd_leave_incr -e "INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) VALUES (UUID(), 'leave-accept-manual', NOW(3), '$LEAVE_MIGRATION', NULL, NULL, NOW(3), 1);"

TYPE_AFTER=$(mysql_exec -N -e "SELECT COUNT(*) FROM atd_leave_incr.leave_types WHERE leave_type_id='lt_leave_accept_casual';")
MARKER_AFTER=$(mysql_exec -N -e "SELECT note FROM atd_leave_incr._leave_accept_marker WHERE id=1;")
HALF_AFTER=$(mysql_exec -N -e "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='atd_leave_incr' AND table_name='leave_types' AND column_name='half_day_allowed';")
HISTORY_AFTER=$(mysql_exec -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='atd_leave_incr' AND table_name='leave_approval_history';")

if [[ "$TYPE_BEFORE" != "1" || "$TYPE_AFTER" != "1" || "$MARKER_BEFORE" != "pre_leave_migration" || "$MARKER_AFTER" != "pre_leave_migration" || "$HALF_AFTER" != "1" || "$HISTORY_AFTER" != "1" ]]; then
  echo "FAIL: incremental leave migration did not preserve data or apply columns"
  echo "TYPE_BEFORE=$TYPE_BEFORE TYPE_AFTER=$TYPE_AFTER MARKER_BEFORE=$MARKER_BEFORE MARKER_AFTER=$MARKER_AFTER HALF_AFTER=$HALF_AFTER HISTORY_AFTER=$HISTORY_AFTER"
  exit 1
fi
echo "INCREMENTAL_DB_MIGRATION=PASS"

# Reset primary org-test DB to full current schema for integration/E2E
echo "==> Resetting atd_org_test for Leave integration/E2E"
mysql_exec -e "DROP DATABASE IF EXISTS atd_org_test; CREATE DATABASE atd_org_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql_exec -e "GRANT ALL ON atd_org_test.* TO 'atd_test'@'%'; FLUSH PRIVILEGES;"
export DATABASE_URL="mysql://atd_test:atd_test_pass@127.0.0.1:3308/atd_org_test"
npx prisma migrate deploy
npx prisma generate >/dev/null

echo "LEAVE_MIGRATION_REHEARSAL=PASS"
