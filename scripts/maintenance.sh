#!/usr/bin/env bash
# Toggle / report deployment maintenance mode (file-backed, not database).
# Idempotent: calling on/off twice is safe.
#
# On production hosts with Caddy, also toggles
# /opt/anytime-crew-hub/shared/caddy/50-maintenance.conf and reloads Caddy
# (Caddy 2.11 has no reliable file.exists CEL matcher).
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
CADDY_DIR="$SHARED/caddy"
CADDY_SNIPPET="$CADDY_DIR/50-maintenance.conf"
MSG="${MAINTENANCE_MESSAGE:-The application is being updated by the developer. Please try again after 5–10 minutes.}"
RETRY="${MAINTENANCE_RETRY_AFTER:-600}"

mkdir -p "$SHARED" "$CADDY_DIR"
# Keep import glob valid when maintenance is off.
if [[ ! -f "$CADDY_DIR/00-placeholder.conf" ]]; then
  printf '# placeholder so Caddy import glob always matches\n' >"$CADDY_DIR/00-placeholder.conf"
fi

reload_caddy_if_needed() {
  if [[ -f /etc/caddy/Caddyfile ]] && command -v caddy >/dev/null 2>&1; then
    if caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
      if sudo -n systemctl reload caddy >/dev/null 2>&1; then
        echo "  caddy: reloaded"
      elif sudo systemctl reload caddy >/dev/null 2>&1; then
        echo "  caddy: reloaded"
      else
        echo "  caddy: reload failed — run: sudo systemctl reload caddy" >&2
        return 1
      fi
    else
      echo "  caddy: validate failed — not reloading" >&2
      caddy validate --config /etc/caddy/Caddyfile || true
      return 1
    fi
  fi
}

write_caddy_on_snippet() {
  # Prefer shipped template next to this script's repo, else embedded fallback.
  local template="$ROOT/deploy/caddy/maintenance-on.conf"
  if [[ -f "$template" ]]; then
    cp -a "$template" "$CADDY_SNIPPET"
  else
    cat >"$CADDY_SNIPPET" <<'EOF'
@maintApiv1 path /api/v1 /api/v1/*
handle @maintApiv1 {
	reverse_proxy 127.0.0.1:4000 {
		@bad status 502
		handle_response @bad {
			header Retry-After 600
			header Cache-Control no-store
			header Content-Type application/json
			respond `{"maintenance":true,"code":"APP_UPDATE_IN_PROGRESS","message":"The application is being updated by the developer. Please try again after 5–10 minutes.","retryAfterSeconds":600,"error":"The application is being updated by the developer. Please try again after 5–10 minutes."}` 503
		}
	}
}

@maintApi path /api /api/*
handle @maintApi {
	handle_path /api/* {
		reverse_proxy 127.0.0.1:4000 {
			@bad2 status 502
			handle_response @bad2 {
				header Retry-After 600
				header Cache-Control no-store
				header Content-Type application/json
				respond `{"maintenance":true,"code":"APP_UPDATE_IN_PROGRESS","message":"The application is being updated by the developer. Please try again after 5–10 minutes.","retryAfterSeconds":600,"error":"The application is being updated by the developer. Please try again after 5–10 minutes."}` 503
			}
		}
	}
}

handle {
	root * /opt/anytime-crew-hub/public
	rewrite * /maintenance.html
	header Cache-Control "no-store"
	header Retry-After 600
	file_server
}
EOF
  fi
}

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
    write_caddy_on_snippet
    echo "Maintenance ON"
    echo "  json: $JSON"
    echo "  flag: $FLAG"
    echo "  caddy snippet: $CADDY_SNIPPET"
    reload_caddy_if_needed || true
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
    rm -f "$FLAG" "$CADDY_SNIPPET"
    echo "Maintenance OFF"
    echo "  json: $JSON"
    reload_caddy_if_needed || true
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
    [[ -f "$CADDY_SNIPPET" ]] && echo "caddy snippet: present" || echo "caddy snippet: absent"
    ;;
  *)
    echo "Usage: $0 {on|off|status}" >&2
    exit 2
    ;;
esac
