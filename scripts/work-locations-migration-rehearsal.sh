#!/usr/bin/env bash
# Module 2 migration safety rehearsal on disposable MySQL only (port 3308 / docker).
# Paths:
#   A) Fresh database — all migrations from zero
#   B) Incremental — production-equivalent baseline through org foundation,
#      seed 3 legacy branches + employee/attendance refs, then Module 2 migration
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CONTAINER="${MYSQL_CONTAINER:-atd-hrms-mysql-org-test-1}"
MYSQL_ROOT_PASS="${MYSQL_ROOT_PASS:-org_test_root}"

mysql_exec() {
  docker exec -i "$CONTAINER" mysql -uroot -p"$MYSQL_ROOT_PASS" --protocol=TCP "$@"
}

echo "==> Waiting for disposable MySQL container ${CONTAINER}"
for i in $(seq 1 40); do
  if mysql_exec -e "SELECT 1" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
mysql_exec -e "SELECT 1" >/dev/null

run_migrate() {
  local db="$1"
  export DATABASE_URL="mysql://atd_test:atd_test_pass@127.0.0.1:3308/${db}"
  npx prisma migrate deploy
}

echo ""
echo "======== PATH A: Fresh database ========"
mysql_exec -e "DROP DATABASE IF EXISTS atd_wl_fresh; CREATE DATABASE atd_wl_fresh CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql_exec -e "GRANT ALL ON atd_wl_fresh.* TO 'atd_test'@'%'; FLUSH PRIVILEGES;"
run_migrate atd_wl_fresh
FRESH_COUNT=$(mysql_exec -N -e "SELECT COUNT(*) FROM atd_wl_fresh.branches;")
echo "FRESH_BRANCH_COUNT=${FRESH_COUNT}"

echo ""
echo "======== PATH B: Incremental (3-location fixture) ========"
mysql_exec -e "DROP DATABASE IF EXISTS atd_wl_incr; CREATE DATABASE atd_wl_incr CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql_exec -e "GRANT ALL ON atd_wl_incr.* TO 'atd_test'@'%'; FLUSH PRIVILEGES;"

WL_DIR="$ROOT/prisma/migrations/20260820180000_work_locations_foundation"
WL_HOLD="/tmp/atd_hold_20260820180000_work_locations_foundation"
rm -rf "$WL_HOLD"
if [[ -d "$WL_DIR" ]]; then
  mv "$WL_DIR" "$WL_HOLD"
fi
cleanup_hold() {
  if [[ -d "$WL_HOLD" ]]; then
    mv "$WL_HOLD" "$WL_DIR"
  fi
}
trap cleanup_hold EXIT

run_migrate atd_wl_incr

mysql_exec atd_wl_incr <<'SQL'
INSERT INTO departments (department_id, name, unit_code, unit_type, created_at, updated_at)
VALUES ('dept_wl_ops', 'Operations', 'WL_OPS_INCR', 'TEAM', NOW(3), NOW(3));

INSERT INTO branches (
  branch_id, branch_name, branch_code, address, city, status,
  latitude, longitude, attendance_radius_meters, is_hub, created_at, updated_at
) VALUES
('br_madhapur', 'Madhapur Office', 'MADHAPUR_OFFICE', 'Madhapur Main Road', 'Hyderabad', 'ACTIVE',
  17.4391592, 78.3947783, 250, 0, NOW(3), NOW(3)),
('br_banjara', 'Banjara Hills', 'BANJARA_HILLS', 'Road No 12', 'Hyderabad', 'ACTIVE',
  17.4130575, 78.4232275, 250, 0, NOW(3), NOW(3)),
('br_hub1', 'Madhapur Hub-1', 'MADHAPUR_HUB_1', 'Hub Lane', 'Hyderabad', 'ACTIVE',
  17.460285, 78.397064, 250, 1, NOW(3), NOW(3));

INSERT INTO employees (
  employee_id, employee_code, name, department_id, home_branch_id, status,
  organization_level, created_at, updated_at
) VALUES (
  'emp_wl_ravi', 'WL-INCR-001', 'Ravi Kumar', 'dept_wl_ops', 'br_madhapur', 'ACTIVE',
  'MEMBER', NOW(3), NOW(3)
);

INSERT INTO attendance_events (
  event_id, employee_id, event_type, event_time, event_date, event_source,
  branch_id, latitude, longitude, created_at
) VALUES (
  'evt_wl_hub', 'emp_wl_ravi', 'FIELD_CHECK_IN', '2026-03-01 04:00:00.000', '2026-03-01',
  'MOBILE_GPS', 'br_hub1', 17.460285, 78.397064, NOW(3)
);
SQL

LOCATIONS_BEFORE=$(mysql_exec -N -e "SELECT COUNT(*) FROM atd_wl_incr.branches;")
IDS_BEFORE=$(mysql_exec -N -e "SELECT GROUP_CONCAT(branch_id ORDER BY branch_id) FROM atd_wl_incr.branches;")
HOME_BEFORE=$(mysql_exec -N -e "SELECT home_branch_id FROM atd_wl_incr.employees WHERE employee_id='emp_wl_ravi';")
ATT_BEFORE=$(mysql_exec -N -e "SELECT branch_id FROM atd_wl_incr.attendance_events WHERE event_id='evt_wl_hub';")

echo "LOCATIONS_BEFORE_MIGRATION=${LOCATIONS_BEFORE}"
echo "BRANCH_IDS_BEFORE=${IDS_BEFORE}"
echo "HOME_BRANCH_BEFORE=${HOME_BEFORE}"
echo "ATTENDANCE_BRANCH_BEFORE=${ATT_BEFORE}"

cleanup_hold
trap - EXIT
run_migrate atd_wl_incr

LOCATIONS_AFTER=$(mysql_exec -N -e "SELECT COUNT(*) FROM atd_wl_incr.branches;")
IDS_AFTER=$(mysql_exec -N -e "SELECT GROUP_CONCAT(branch_id ORDER BY branch_id) FROM atd_wl_incr.branches;")
HOME_AFTER=$(mysql_exec -N -e "SELECT home_branch_id FROM atd_wl_incr.employees WHERE employee_id='emp_wl_ravi';")
ATT_AFTER=$(mysql_exec -N -e "SELECT branch_id FROM atd_wl_incr.attendance_events WHERE event_id='evt_wl_hub';")
HUB_TYPE=$(mysql_exec -N -e "SELECT location_type FROM atd_wl_incr.branches WHERE branch_id='br_hub1';")
OFFICE_TYPE=$(mysql_exec -N -e "SELECT location_type FROM atd_wl_incr.branches WHERE branch_id='br_madhapur';")
ASSIGN_COUNT=$(mysql_exec -N -e "SELECT COUNT(*) FROM atd_wl_incr.employee_work_location_assignments WHERE employee_id='emp_wl_ravi';")

echo "LOCATIONS_AFTER_MIGRATION=${LOCATIONS_AFTER}"
echo "BRANCH_IDS_AFTER=${IDS_AFTER}"
echo "HOME_BRANCH_AFTER=${HOME_AFTER}"
echo "ATTENDANCE_BRANCH_AFTER=${ATT_AFTER}"
echo "HUB_LOCATION_TYPE=${HUB_TYPE}"
echo "OFFICE_LOCATION_TYPE=${OFFICE_TYPE}"
echo "BASE_OFFICE_BACKFILL_ROWS=${ASSIGN_COUNT}"

fail=0
[[ "$LOCATIONS_BEFORE" == "3" ]] || { echo "FAIL: expected LOCATIONS_BEFORE=3"; fail=1; }
[[ "$LOCATIONS_AFTER" == "3" ]] || { echo "FAIL: expected LOCATIONS_AFTER=3"; fail=1; }
[[ "$IDS_BEFORE" == "$IDS_AFTER" ]] || { echo "FAIL: branch IDs changed"; fail=1; }
[[ "$HOME_BEFORE" == "$HOME_AFTER" ]] || { echo "FAIL: home_branch_id changed"; fail=1; }
[[ "$ATT_BEFORE" == "$ATT_AFTER" ]] || { echo "FAIL: attendance branch_id changed"; fail=1; }
[[ "$HUB_TYPE" == "PARKING_HUB" ]] || { echo "FAIL: hub type backfill"; fail=1; }
[[ "$OFFICE_TYPE" == "OFFICE" ]] || { echo "FAIL: office type backfill"; fail=1; }
[[ "$ASSIGN_COUNT" == "1" ]] || { echo "FAIL: base office backfill count"; fail=1; }

if [[ "$fail" -ne 0 ]]; then
  echo "MIGRATION_REHEARSAL=FAIL"
  exit 1
fi

echo "LOCATION_IDS_PRESERVED=YES"
echo "HOME_BRANCH_IDS_PRESERVED=YES"
echo "ATTENDANCE_BRANCH_IDS_PRESERVED=YES"
echo "MIGRATION_REHEARSAL=PASS"
