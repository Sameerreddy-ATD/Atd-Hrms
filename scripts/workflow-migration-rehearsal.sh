#!/usr/bin/env bash
# Task Planner workflow migration acceptance on disposable MySQL (port 3308).
# Fresh from-zero + incremental: foundation schema/data → workflow migration.
# NEVER points at production.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOCK_FILE="${TMPDIR:-/tmp}/atd-workflow-migration-rehearsal.lock"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "FATAL: another workflow migration rehearsal is already running (lock: $LOCK_FILE)" >&2
  exit 1
fi

# shellcheck source=lib/assert-disposable-db.sh
source "$ROOT/scripts/lib/assert-disposable-db.sh"

CONTAINER="${MYSQL_CONTAINER:-atd-hrms-mysql-org-test-1}"
MYSQL_ROOT_PASS="${MYSQL_ROOT_PASS:-org_test_root}"
PLANNER_MIGRATION="20260821200000_task_planner_foundation"
WORKFLOW_MIGRATION="20260822120000_task_planner_workflow_engine"

mysql_exec() {
  docker exec -i "$CONTAINER" mysql -uroot -p"$MYSQL_ROOT_PASS" --protocol=TCP "$@" 2>/dev/null
}

ensure_mysql() {
  if docker exec "$CONTAINER" mysql -uroot -p"$MYSQL_ROOT_PASS" --protocol=TCP -e "SELECT 1" >/dev/null 2>&1; then
    return 0
  fi
  echo "==> Starting disposable MySQL via docker compose..."
  docker compose -f docker-compose.org-test.yml up -d --wait
  docker exec "$CONTAINER" mysql -uroot -p"$MYSQL_ROOT_PASS" --protocol=TCP -e "SELECT 1" >/dev/null
}

echo "==> Ensuring disposable MySQL is up..."
ensure_mysql

echo "==> A) FRESH DB"
mysql_exec -e "DROP DATABASE IF EXISTS atd_workflow_fresh; CREATE DATABASE atd_workflow_fresh CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql_exec -e "GRANT ALL ON atd_workflow_fresh.* TO 'atd_test'@'%'; FLUSH PRIVILEGES;"
export DATABASE_URL="mysql://atd_test:atd_test_pass@127.0.0.1:3308/atd_workflow_fresh"
assert_disposable_database_url
npx prisma migrate deploy
WF=$(mysql_exec -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='atd_workflow_fresh' AND table_name='task_workflows';")
WFS=$(mysql_exec -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='atd_workflow_fresh' AND table_name='task_workflow_statuses';")
WFT=$(mysql_exec -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='atd_workflow_fresh' AND table_name='task_workflow_transitions';")
HIST=$(mysql_exec -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='atd_workflow_fresh' AND table_name='task_transition_history';")
COL=$(mysql_exec -N -e "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='atd_workflow_fresh' AND table_name='work_tasks' AND column_name='workflow_status_id';")
ATT=$(mysql_exec -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='atd_workflow_fresh' AND table_name='attendance_events';")
LEAVE=$(mysql_exec -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='atd_workflow_fresh' AND table_name='leave_requests';")
if [[ "$WF" != "1" || "$WFS" != "1" || "$WFT" != "1" || "$HIST" != "1" || "$COL" != "1" || "$ATT" != "1" || "$LEAVE" != "1" ]]; then
  echo "FAIL: fresh workflow migration incomplete (wf=$WF wfs=$WFS wft=$WFT hist=$HIST col=$COL att=$ATT leave=$LEAVE)"
  exit 1
fi
echo "FRESH_DB_MIGRATION=PASS"

echo "==> B) INCREMENTAL foundation schema + seed → workflow migration"
if [[ ! -d "prisma/migrations/$WORKFLOW_MIGRATION" ]]; then
  echo "FAIL: workflow migration folder missing from prisma/migrations"
  exit 1
fi
mysql_exec -e "DROP DATABASE IF EXISTS atd_workflow_incr; CREATE DATABASE atd_workflow_incr CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql_exec -e "GRANT ALL ON atd_workflow_incr.* TO 'atd_test'@'%'; FLUSH PRIVILEGES;"

TMP_MIG=$(mktemp -d)
cp -a prisma/migrations/. "$TMP_MIG/"
rm -rf "$TMP_MIG/$WORKFLOW_MIGRATION"
export DATABASE_URL="mysql://atd_test:atd_test_pass@127.0.0.1:3308/atd_workflow_incr"
assert_disposable_database_url
BACKUP_MIG=$(mktemp -d)
mv prisma/migrations "$BACKUP_MIG/migrations"
mv "$TMP_MIG" prisma/migrations
restore_prisma_migrations() {
  if [[ -n "${BACKUP_MIG:-}" && -d "$BACKUP_MIG/migrations" ]]; then
    rm -rf prisma/migrations
    cp -a "$BACKUP_MIG/migrations/." prisma/migrations/
  fi
}
trap restore_prisma_migrations EXIT
set +e
npx prisma migrate deploy
DEPLOY_RC=$?
set -e
restore_prisma_migrations
trap - EXIT
if [[ $DEPLOY_RC -ne 0 ]]; then
  echo "FAIL: incremental foundation migrate failed"
  exit 1
fi

APPLIED_P=$(mysql_exec -N -e "SELECT COUNT(*) FROM atd_workflow_incr._prisma_migrations WHERE migration_name='$PLANNER_MIGRATION' AND finished_at IS NOT NULL;")
APPLIED_W0=$(mysql_exec -N -e "SELECT COUNT(*) FROM atd_workflow_incr._prisma_migrations WHERE migration_name='$WORKFLOW_MIGRATION' AND finished_at IS NOT NULL;")
if [[ "$APPLIED_P" != "1" || "$APPLIED_W0" != "0" ]]; then
  echo "FAIL: expected foundation applied and workflow absent before seed (p=$APPLIED_P w=$APPLIED_W0)"
  exit 1
fi

echo "==> Seeding representative Planner foundation data"
mysql_exec atd_workflow_incr <<'SQL'
INSERT INTO users (id, email, name, role, status, password_hash, created_at, updated_at)
VALUES
  ('u_wf_accept_admin', 'wf-accept-admin@test.local', 'WF Accept Admin', 'DEVELOPER_ADMIN', 'ACTIVE', 'x', NOW(3), NOW(3)),
  ('u_wf_accept_member', 'wf-accept-member@test.local', 'WF Accept Member', 'EMPLOYEE', 'ACTIVE', 'x', NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT INTO employees (employee_id, employee_code, name, email, status, created_at, updated_at)
VALUES
  ('e_wf_accept_lead', 'WF-ACCEPT-L', 'WF Accept Lead', 'wf-accept-lead@test.local', 'ACTIVE', NOW(3), NOW(3)),
  ('e_wf_accept_member', 'WF-ACCEPT-M', 'WF Accept Member', 'wf-accept-member@test.local', 'ACTIVE', NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE name=VALUES(name);

UPDATE users SET employee_id='e_wf_accept_member' WHERE id='u_wf_accept_member';

INSERT INTO task_boards (
  board_id, name, key_prefix, next_issue_number, description, access_type, archived, version,
  created_by_user_id, lead_employee_id, created_at, updated_at
) VALUES (
  'b_wf_accept', 'Accept Project', 'ACC', 3, 'Incremental acceptance seed', 'MEMBER_GATED', 0, 1,
  'u_wf_accept_admin', 'e_wf_accept_lead', NOW(3), NOW(3)
) ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT INTO task_stages (stage_id, board_id, name, color, sort_order, is_completed, status, status_category)
VALUES
  ('s_wf_todo', 'b_wf_accept', 'Custom Intake', 'SLATE', 0, 0, 'TODO', 'TODO'),
  ('s_wf_doing', 'b_wf_accept', 'Custom Build', 'AMBER', 1, 0, 'IN_PROGRESS', 'IN_PROGRESS'),
  ('s_wf_done', 'b_wf_accept', 'Custom Ship', 'EMERALD', 2, 1, 'COMPLETED', 'DONE')
ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT INTO task_board_members (board_id, employee_id, role)
VALUES
  ('b_wf_accept', 'e_wf_accept_lead', 'PROJECT_LEAD'),
  ('b_wf_accept', 'e_wf_accept_member', 'MEMBER')
ON DUPLICATE KEY UPDATE role=VALUES(role);

INSERT INTO work_tasks (
  task_id, title, description, status, priority, progress, version, `rank`,
  board_id, stage_id, issue_number, issue_key, issue_type,
  created_by_user_id, reporter_user_id, parent_task_id, archived_at,
  last_activity_at, created_at, updated_at
) VALUES
  ('t_wf_epic', 'Seed Epic', 'epic desc', 'TODO', 'HIGH', 0, 1, 1000,
   'b_wf_accept', 's_wf_todo', 1, 'ACC-1', 'EPIC',
   'u_wf_accept_admin', 'u_wf_accept_admin', NULL, NULL, NOW(3), NOW(3), NOW(3)),
  ('t_wf_story', 'Seed Story', 'story desc', 'IN_PROGRESS', 'MEDIUM', 40, 2, 2500,
   'b_wf_accept', 's_wf_doing', 2, 'ACC-2', 'STORY',
   'u_wf_accept_admin', 'u_wf_accept_member', 't_wf_epic', NULL, NOW(3), NOW(3), NOW(3)),
  ('t_wf_arch', 'Seed Archived', 'archived', 'IN_PROGRESS', 'LOW', 10, 1, 3000,
   'b_wf_accept', 's_wf_doing', 3, 'ACC-3', 'TASK',
   'u_wf_accept_admin', 'u_wf_accept_admin', NULL, NOW(3), NOW(3), NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE title=VALUES(title);

INSERT INTO task_assignments (assignment_id, task_id, employee_id, assigned_by_user_id, assigned_at)
VALUES ('as_wf_story', 't_wf_story', 'e_wf_accept_member', 'u_wf_accept_admin', NOW(3))
ON DUPLICATE KEY UPDATE assigned_by_user_id=VALUES(assigned_by_user_id);

INSERT INTO task_updates (update_id, task_id, author_user_id, activity_type, message, created_at)
VALUES ('u_wf_comment', 't_wf_story', 'u_wf_accept_member', 'COMMENT', 'preserve this comment', NOW(3))
ON DUPLICATE KEY UPDATE message=VALUES(message);

INSERT INTO task_attachments (attachment_id, task_id, file_name, mime_type, size_bytes, storage_key, uploaded_by_id, created_at)
VALUES ('a_wf_file', 't_wf_story', 'seed.txt', 'text/plain', 11, 'wf-accept-seed.txt', 'u_wf_accept_admin', NOW(3))
ON DUPLICATE KEY UPDATE file_name=VALUES(file_name);

CREATE TABLE IF NOT EXISTS _wf_accept_snapshot (
  k VARCHAR(64) PRIMARY KEY,
  v TEXT NOT NULL
);
DELETE FROM _wf_accept_snapshot;
INSERT INTO _wf_accept_snapshot (k, v)
SELECT 'board_ids', GROUP_CONCAT(board_id ORDER BY board_id) FROM task_boards WHERE board_id='b_wf_accept';
INSERT INTO _wf_accept_snapshot (k, v)
SELECT 'stage_ids', GROUP_CONCAT(stage_id ORDER BY stage_id) FROM task_stages WHERE board_id='b_wf_accept';
INSERT INTO _wf_accept_snapshot (k, v)
SELECT 'task_ids', GROUP_CONCAT(task_id ORDER BY task_id) FROM work_tasks WHERE board_id='b_wf_accept';
INSERT INTO _wf_accept_snapshot (k, v)
SELECT 'issue_keys', GROUP_CONCAT(issue_key ORDER BY issue_key) FROM work_tasks WHERE board_id='b_wf_accept';
INSERT INTO _wf_accept_snapshot (k, v)
SELECT 'issue_numbers', GROUP_CONCAT(issue_number ORDER BY issue_number) FROM work_tasks WHERE board_id='b_wf_accept';
INSERT INTO _wf_accept_snapshot (k, v)
SELECT 'ranks', GROUP_CONCAT(CONCAT(task_id, ':', `rank`) ORDER BY task_id) FROM work_tasks WHERE board_id='b_wf_accept';
INSERT INTO _wf_accept_snapshot (k, v)
SELECT 'stages', GROUP_CONCAT(CONCAT(task_id, ':', stage_id, ':', status) ORDER BY task_id) FROM work_tasks WHERE board_id='b_wf_accept';
INSERT INTO _wf_accept_snapshot (k, v)
SELECT 'reporters', GROUP_CONCAT(CONCAT(task_id, ':', IFNULL(reporter_user_id,'')) ORDER BY task_id) FROM work_tasks WHERE board_id='b_wf_accept';
INSERT INTO _wf_accept_snapshot (k, v)
SELECT 'assignments', GROUP_CONCAT(CONCAT(task_id, ':', employee_id) ORDER BY task_id, employee_id) FROM task_assignments WHERE task_id IN (SELECT task_id FROM work_tasks WHERE board_id='b_wf_accept');
INSERT INTO _wf_accept_snapshot (k, v)
SELECT 'comments', GROUP_CONCAT(update_id ORDER BY update_id) FROM task_updates WHERE task_id IN (SELECT task_id FROM work_tasks WHERE board_id='b_wf_accept');
INSERT INTO _wf_accept_snapshot (k, v)
SELECT 'attachments', GROUP_CONCAT(attachment_id ORDER BY attachment_id) FROM task_attachments WHERE task_id IN (SELECT task_id FROM work_tasks WHERE board_id='b_wf_accept');
INSERT INTO _wf_accept_snapshot (k, v)
SELECT 'archived', GROUP_CONCAT(CONCAT(task_id, ':', IF(archived_at IS NULL,'0','1')) ORDER BY task_id) FROM work_tasks WHERE board_id='b_wf_accept';
INSERT INTO _wf_accept_snapshot (k, v)
SELECT 'attendance_count', CAST(COUNT(*) AS CHAR) FROM attendance_events;
INSERT INTO _wf_accept_snapshot (k, v)
SELECT 'leave_count', CAST(COUNT(*) AS CHAR) FROM leave_requests;
SQL

BEFORE_KEYS=$(mysql_exec -N -e "SELECT v FROM atd_workflow_incr._wf_accept_snapshot WHERE k='issue_keys';")
BEFORE_STAGES=$(mysql_exec -N -e "SELECT v FROM atd_workflow_incr._wf_accept_snapshot WHERE k='stages';")
BEFORE_RANKS=$(mysql_exec -N -e "SELECT v FROM atd_workflow_incr._wf_accept_snapshot WHERE k='ranks';")
BEFORE_COMMENTS=$(mysql_exec -N -e "SELECT v FROM atd_workflow_incr._wf_accept_snapshot WHERE k='comments';")
BEFORE_ATTACH=$(mysql_exec -N -e "SELECT v FROM atd_workflow_incr._wf_accept_snapshot WHERE k='attachments';")
BEFORE_ARCH=$(mysql_exec -N -e "SELECT v FROM atd_workflow_incr._wf_accept_snapshot WHERE k='archived';")
BEFORE_ATT=$(mysql_exec -N -e "SELECT v FROM atd_workflow_incr._wf_accept_snapshot WHERE k='attendance_count';")
BEFORE_LEAVE=$(mysql_exec -N -e "SELECT v FROM atd_workflow_incr._wf_accept_snapshot WHERE k='leave_count';")

echo "==> Applying workflow migration"
export DATABASE_URL="mysql://atd_test:atd_test_pass@127.0.0.1:3308/atd_workflow_incr"
assert_disposable_database_url
npx prisma migrate deploy

APPLIED_W=$(mysql_exec -N -e "SELECT COUNT(*) FROM atd_workflow_incr._prisma_migrations WHERE migration_name='$WORKFLOW_MIGRATION' AND finished_at IS NOT NULL;")
COL2=$(mysql_exec -N -e "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='atd_workflow_incr' AND table_name='work_tasks' AND column_name='workflow_status_id';")
if [[ "$APPLIED_W" != "1" || "$COL2" != "1" ]]; then
  echo "FAIL: incremental workflow migration"
  exit 1
fi

AFTER_KEYS=$(mysql_exec -N -e "SELECT GROUP_CONCAT(issue_key ORDER BY issue_key) FROM atd_workflow_incr.work_tasks WHERE board_id='b_wf_accept';")
AFTER_STAGES=$(mysql_exec -N -e "SELECT GROUP_CONCAT(CONCAT(task_id, ':', stage_id, ':', status) ORDER BY task_id) FROM atd_workflow_incr.work_tasks WHERE board_id='b_wf_accept';")
AFTER_RANKS=$(mysql_exec -N -e 'SELECT GROUP_CONCAT(CONCAT(task_id, ":", `rank`) ORDER BY task_id) FROM atd_workflow_incr.work_tasks WHERE board_id="b_wf_accept";')
AFTER_COMMENTS=$(mysql_exec -N -e "SELECT GROUP_CONCAT(update_id ORDER BY update_id) FROM atd_workflow_incr.task_updates WHERE task_id IN (SELECT task_id FROM atd_workflow_incr.work_tasks WHERE board_id='b_wf_accept');")
AFTER_ATTACH=$(mysql_exec -N -e "SELECT GROUP_CONCAT(attachment_id ORDER BY attachment_id) FROM atd_workflow_incr.task_attachments WHERE task_id IN (SELECT task_id FROM atd_workflow_incr.work_tasks WHERE board_id='b_wf_accept');")
AFTER_ARCH=$(mysql_exec -N -e "SELECT GROUP_CONCAT(CONCAT(task_id, ':', IF(archived_at IS NULL,'0','1')) ORDER BY task_id) FROM atd_workflow_incr.work_tasks WHERE board_id='b_wf_accept';")
AFTER_ATT=$(mysql_exec -N -e "SELECT COUNT(*) FROM atd_workflow_incr.attendance_events;")
AFTER_LEAVE=$(mysql_exec -N -e "SELECT COUNT(*) FROM atd_workflow_incr.leave_requests;")
STAGE_COUNT=$(mysql_exec -N -e "SELECT COUNT(*) FROM atd_workflow_incr.task_stages WHERE board_id='b_wf_accept';")
WF_COUNT=$(mysql_exec -N -e "SELECT COUNT(*) FROM atd_workflow_incr.task_workflows WHERE board_id='b_wf_accept';")
MAPPED=$(mysql_exec -N -e "SELECT COUNT(*) FROM atd_workflow_incr.work_tasks WHERE board_id='b_wf_accept' AND workflow_status_id IS NOT NULL;")

fail=0
[[ "$AFTER_KEYS" == "$BEFORE_KEYS" ]] || { echo "FAIL: issue keys changed ($BEFORE_KEYS -> $AFTER_KEYS)"; fail=1; }
[[ "$AFTER_STAGES" == "$BEFORE_STAGES" ]] || { echo "FAIL: stage/status meaning changed ($BEFORE_STAGES -> $AFTER_STAGES)"; fail=1; }
[[ "$AFTER_RANKS" == "$BEFORE_RANKS" ]] || { echo "FAIL: ranks changed ($BEFORE_RANKS -> $AFTER_RANKS)"; fail=1; }
[[ "$AFTER_COMMENTS" == "$BEFORE_COMMENTS" ]] || { echo "FAIL: comments changed"; fail=1; }
[[ "$AFTER_ATTACH" == "$BEFORE_ATTACH" ]] || { echo "FAIL: attachments changed"; fail=1; }
[[ "$AFTER_ARCH" == "$BEFORE_ARCH" ]] || { echo "FAIL: archived state changed"; fail=1; }
[[ "$AFTER_ATT" == "$BEFORE_ATT" ]] || { echo "FAIL: attendance mutated"; fail=1; }
[[ "$AFTER_LEAVE" == "$BEFORE_LEAVE" ]] || { echo "FAIL: leave mutated"; fail=1; }
[[ "$STAGE_COUNT" == "3" ]] || { echo "FAIL: stages not preserved ($STAGE_COUNT)"; fail=1; }
[[ "$WF_COUNT" -ge 1 ]] || { echo "FAIL: workflow not created"; fail=1; }
[[ "$MAPPED" == "3" ]] || { echo "FAIL: work items not mapped to workflow statuses ($MAPPED)"; fail=1; }

if [[ "$fail" -ne 0 ]]; then
  exit 1
fi

echo "EXISTING_STAGES_PRESERVED=PASS"
echo "EXISTING_ITEMS_PRESERVED=PASS"
echo "ISSUE_KEYS_PRESERVED=PASS"
echo "RANK_PRESERVED=PASS"
echo "COMMENTS_PRESERVED=PASS"
echo "ATTACHMENTS_PRESERVED=PASS"
echo "INCREMENTAL_DB_MIGRATION=PASS"
echo "WORKFLOW_MIGRATION_REHEARSAL=PASS"
