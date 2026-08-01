#!/usr/bin/env bash
# Daily MySQL dump (+ face evidence) → Google Drive (via rclone).
#
# Same pattern as Inside Sales Tele Dashboard backups:
#   Full mysqldump each run → gdrive:HrmsBackups/*.sql.gz
#   Face evidence tree     → gdrive:HrmsBackups/*_face-evidence.tar.gz
# Retention default: last 3 days (BACKUP_KEEP_DAYS) — upload daily, prune older.
#
# One-time setup (VPS already has rclone remote `gdrive` from Tele):
#   sudo mkdir -p /opt/backups/anytime-crew-hub
#   sudo chown ubuntu:ubuntu /opt/backups/anytime-crew-hub
#   chmod +x scripts/backup-to-gdrive.sh
#   rclone mkdir gdrive:HrmsBackups
#   sudo tee /etc/cron.d/anytime-crew-hub-backup <<'EOF'
#   SHELL=/bin/bash
#   PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
#   # Daily at 02:20 Asia/Kolkata = 20:50 UTC (5 min after Tele)
#   50 20 * * * ubuntu /opt/anytime-crew-hub/scripts/backup-to-gdrive.sh >> /var/log/anytime-crew-hub-backup.log 2>&1
#   EOF
#   sudo touch /var/log/anytime-crew-hub-backup.log
#   sudo chown ubuntu:ubuntu /var/log/anytime-crew-hub-backup.log
#   ./scripts/backup-to-gdrive.sh
#
# Optional env overrides (shell or .env):
#   RCLONE_REMOTE=gdrive
#   GDRIVE_BACKUP_DIR=HrmsBackups
#   BACKUP_KEEP_DAYS=3
#   BACKUP_LOCAL_DIR=/opt/backups/anytime-crew-hub
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${APP_DIR}/.env"

RCLONE_REMOTE="${RCLONE_REMOTE:-gdrive}"
GDRIVE_BACKUP_DIR="${GDRIVE_BACKUP_DIR:-HrmsBackups}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-3}"
BACKUP_LOCAL_DIR="${BACKUP_LOCAL_DIR:-/opt/backups/anytime-crew-hub}"

log() { echo "[$(date -Iseconds)] $*"; }

die() {
  log "ERROR: $*"
  exit 1
}

[[ -f "$ENV_FILE" ]] || die "Missing $ENV_FILE"
command -v mysql >/dev/null || die "mysql client not found"
command -v mysqldump >/dev/null || die "mysqldump not found"
command -v rclone >/dev/null || die "rclone not found — install: curl https://rclone.org/install.sh | sudo bash"
command -v gzip >/dev/null || die "gzip not found"
command -v python3 >/dev/null || die "python3 not found"
command -v tar >/dev/null || die "tar not found"

env_get() {
  local key="$1" line val
  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n1 || true)"
  [[ -n "$line" ]] || { echo ""; return 0; }
  val="${line#*=}"
  val="${val%$'\r'}"
  if [[ "$val" =~ ^\"(.*)\"$ ]]; then val="${BASH_REMATCH[1]}"; fi
  if [[ "$val" =~ ^\'(.*)\'$ ]]; then val="${BASH_REMATCH[1]}"; fi
  printf '%s' "$val"
}

_r="$(env_get RCLONE_REMOTE)"; [[ -n "$_r" ]] && RCLONE_REMOTE="$_r"
_d="$(env_get GDRIVE_BACKUP_DIR)"; [[ -n "$_d" ]] && GDRIVE_BACKUP_DIR="$_d"
_k="$(env_get BACKUP_KEEP_DAYS)"; [[ -n "$_k" ]] && BACKUP_KEEP_DAYS="$_k"
_l="$(env_get BACKUP_LOCAL_DIR)"; [[ -n "$_l" ]] && BACKUP_LOCAL_DIR="$_l"

RCLONE_REMOTE="${RCLONE_REMOTE:-gdrive}"
GDRIVE_BACKUP_DIR="${GDRIVE_BACKUP_DIR:-HrmsBackups}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-3}"
BACKUP_LOCAL_DIR="${BACKUP_LOCAL_DIR:-/opt/backups/anytime-crew-hub}"

DATABASE_URL="$(env_get DATABASE_URL)"
[[ -n "$DATABASE_URL" ]] || die "DATABASE_URL empty in $ENV_FILE"
FACE_EVIDENCE_DIR="$(env_get FACE_EVIDENCE_DIR)"

# Parse DATABASE_URL → host/user/password/db (password never printed)
eval "$(
  DATABASE_URL="$DATABASE_URL" python3 <<'PY'
import os, shlex, urllib.parse
u = urllib.parse.urlparse(os.environ["DATABASE_URL"])
db = (u.path or "/").lstrip("/").split("?")[0]
if not db:
    raise SystemExit("DATABASE_URL has no database name")
print(f"DB_HOST={shlex.quote(u.hostname or '127.0.0.1')}")
print(f"DB_PORT={shlex.quote(str(u.port or 3306))}")
print(f"DB_USER={shlex.quote(u.username or '')}")
print(f"DB_PASSWORD={shlex.quote(urllib.parse.unquote(u.password or ''))}")
print(f"DB_NAME={shlex.quote(db)}")
PY
)"

[[ -n "$DB_USER" ]] || die "DATABASE_URL missing user"
[[ -n "$DB_NAME" ]] || die "DATABASE_URL missing database name"

REMOTE_PATH="${RCLONE_REMOTE}:${GDRIVE_BACKUP_DIR}"
STAMP="$(date +%F_%H%M%S)"
HOST_SHORT="$(hostname -s 2>/dev/null || hostname || echo vps)"
SQL_NAME="${DB_NAME}_${HOST_SHORT}_${STAMP}.sql.gz"
SQL_PATH="${BACKUP_LOCAL_DIR}/${SQL_NAME}"
FACE_NAME="${DB_NAME}_${HOST_SHORT}_${STAMP}_face-evidence.tar.gz"
FACE_PATH="${BACKUP_LOCAL_DIR}/${FACE_NAME}"

mkdir -p "$BACKUP_LOCAL_DIR"
chmod 700 "$BACKUP_LOCAL_DIR" 2>/dev/null || true

if ! rclone listremotes | grep -qx "${RCLONE_REMOTE}:"; then
  die "rclone remote '${RCLONE_REMOTE}' not configured. Run Tele finish-gdrive-auth or rclone config"
fi

rclone mkdir "${REMOTE_PATH}" 2>/dev/null || true

log "Dumping ${DB_NAME} @ ${DB_HOST}:${DB_PORT} → ${SQL_PATH}"
export MYSQL_PWD="$DB_PASSWORD"
mysqldump \
  -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" \
  --single-transaction --routines --triggers --no-tablespaces \
  "$DB_NAME" | gzip -c >"$SQL_PATH"
unset MYSQL_PWD

BYTES="$(wc -c <"$SQL_PATH" | tr -d ' ')"
[[ "$BYTES" -gt 100 ]] || die "Dump looks empty (${BYTES} bytes)"

log "Uploading SQL to ${REMOTE_PATH}/${SQL_NAME} (${BYTES} bytes)"
rclone copyto "$SQL_PATH" "${REMOTE_PATH}/${SQL_NAME}" --retries 3 --low-level-retries 10

if [[ -n "$FACE_EVIDENCE_DIR" && -d "$FACE_EVIDENCE_DIR" ]]; then
  log "Archiving face evidence ${FACE_EVIDENCE_DIR} → ${FACE_PATH}"
  tar -C "$(dirname "$FACE_EVIDENCE_DIR")" -czf "$FACE_PATH" "$(basename "$FACE_EVIDENCE_DIR")"
  FBYTES="$(wc -c <"$FACE_PATH" | tr -d ' ')"
  log "Uploading face evidence (${FBYTES} bytes)"
  rclone copyto "$FACE_PATH" "${REMOTE_PATH}/${FACE_NAME}" --retries 3 --low-level-retries 10
else
  log "Skipping face evidence (FACE_EVIDENCE_DIR unset or missing)"
fi

log "Pruning Drive backups older than ${BACKUP_KEEP_DAYS} days under ${REMOTE_PATH}"
rclone delete "${REMOTE_PATH}" --min-age "${BACKUP_KEEP_DAYS}d" --include "*.sql.gz" 2>/dev/null || true
rclone delete "${REMOTE_PATH}" --min-age "${BACKUP_KEEP_DAYS}d" --include "*_face-evidence.tar.gz" 2>/dev/null || true
rclone rmdirs "${REMOTE_PATH}" --leave-root 2>/dev/null || true

find "$BACKUP_LOCAL_DIR" -type f \( -name '*.sql.gz' -o -name '*_face-evidence.tar.gz' \) -mtime +1 -delete 2>/dev/null || true

STATUS_PATH="${BACKUP_LOCAL_DIR}/last-backup.json"
FINISHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
FACE_STATUS_NAME=""
FACE_STATUS_BYTES="0"
if [[ -f "$FACE_PATH" ]]; then
  FACE_STATUS_NAME="$FACE_NAME"
  FACE_STATUS_BYTES="$(wc -c <"$FACE_PATH" | tr -d ' ')"
fi
python3 - "$STATUS_PATH" "$FINISHED_AT" "$SQL_NAME" "$REMOTE_PATH/$SQL_NAME" "$BYTES" \
  "$FACE_STATUS_NAME" "$FACE_STATUS_BYTES" <<'PY'
import json, sys
path, finished_at, file_name, remote_path, bytes_s, face_name, face_bytes = sys.argv[1:8]
payload = {
    "ok": True,
    "finishedAt": finished_at,
    "fileName": file_name,
    "remotePath": remote_path,
    "bytes": int(bytes_s),
}
if face_name:
    payload["faceEvidenceFileName"] = face_name
    payload["faceEvidenceBytes"] = int(face_bytes or 0)
with open(path, "w", encoding="utf-8") as f:
    json.dump(payload, f, indent=2)
    f.write("\n")
PY
chmod 640 "$STATUS_PATH" 2>/dev/null || true

log "OK — backup complete: ${SQL_NAME}"
rclone lsl "${REMOTE_PATH}/${SQL_NAME}" || true
if [[ -f "$FACE_PATH" ]]; then
  rclone lsl "${REMOTE_PATH}/${FACE_NAME}" || true
fi
