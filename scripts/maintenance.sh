#!/usr/bin/env bash
# Toggle / report deployment maintenance mode (file-backed, not database).
# Idempotent: calling on/off twice is safe.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SHARED="${MAINTENANCE_SHARED_DIR:-}"
if [[ -z "$SHARED" ]]; then
  if [[ -d /opt/anytime-crew-hub/shared ]]; then
    SHARED="/opt/anytime-crew-hub/shared"
  elif [[ -d /opt/anytime-crew-hub ]]; then
    SHARED="/opt/anytime-crew-hub/shared"
  else
    SHARED="$ROOT/shared"
  fi
fi

JSON="$SHARED/maintenance.json"
FLAG="$SHARED/maintenance.on"
MSG="${MAINTENANCE_MESSAGE:-The application is being updated by the developer. Please try again after 5–10 minutes.}"
RETRY="${MAINTENANCE_RETRY_AFTER:-600}"

mkdir -p "$SHARED"

cmd="${1:-status}"

case "$cmd" in
  on)
    started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    cat >"$JSON" <<EOF
{
  "enabled": true,
  "reason": "DEPLOYMENT",
  "message": $(printf '%s' "$MSG" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "retryAfterSeconds": $RETRY,
  "startedAt": "$started",
  "startedBy": "deployment"
}
EOF
    printf '1\n' >"$FLAG"
    echo "Maintenance ON"
    echo "  json: $JSON"
    echo "  flag: $FLAG"
    ;;
  off)
    cat >"$JSON" <<EOF
{
  "enabled": false,
  "reason": "DEPLOYMENT",
  "message": $(printf '%s' "$MSG" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "retryAfterSeconds": $RETRY,
  "startedAt": null,
  "startedBy": null
}
EOF
    rm -f "$FLAG"
    echo "Maintenance OFF"
    echo "  json: $JSON"
    ;;
  status)
    if [[ -f "$FLAG" ]] || { [[ -f "$JSON" ]] && grep -q '"enabled": true' "$JSON" 2>/dev/null; }; then
      echo "Maintenance: ON"
    else
      echo "Maintenance: OFF"
    fi
    if [[ -f "$JSON" ]]; then
      echo "---"
      cat "$JSON"
    fi
    [[ -f "$FLAG" ]] && echo "flag: present ($FLAG)" || echo "flag: absent"
    ;;
  *)
    echo "Usage: $0 {on|off|status}" >&2
    exit 2
    ;;
esac
