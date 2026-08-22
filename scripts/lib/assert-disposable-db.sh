#!/usr/bin/env bash
# Shared guard: refuse production / non-disposable DATABASE_URL targets.
# Source from rehearsal / integration / e2e scripts.
#
# Expects DATABASE_URL already set (or sets a disposable default when ALLOWED).
# Prints sanitized TEST_DB_HOST / TEST_DB_PORT / TEST_DB_NAME (never password).

assert_disposable_database_url() {
  local url="${DATABASE_URL:-}"
  if [[ -z "$url" ]]; then
    echo "FATAL: DATABASE_URL is empty" >&2
    exit 1
  fi

  if [[ "${NODE_ENV:-}" == "production" ]]; then
    echo "FATAL: refusing database acceptance tests when NODE_ENV=production" >&2
    exit 1
  fi

  local host port db user
  # mysql://user:pass@host:port/db
  host="$(printf '%s' "$url" | sed -E 's#^[a-zA-Z0-9+.-]+://([^@/]+@)?([^:/?]+).*#\2#')"
  port="$(printf '%s' "$url" | sed -E 's#^[a-zA-Z0-9+.-]+://([^@/]+@)?[^:/?]+:([0-9]+).*#\2#')"
  if [[ "$port" == "$url" ]]; then port="3306"; fi
  db="$(printf '%s' "$url" | sed -E 's#^[a-zA-Z0-9+.-]+://[^/]+/([^?]+).*#\1#')"
  user="$(printf '%s' "$url" | sed -E 's#^[a-zA-Z0-9+.-]+://([^:/@]+).*#\1#')"

  case "$host" in
    127.0.0.1|localhost|::1) ;;
    *)
      echo "FATAL: TEST DB host '$host' is not a local disposable host" >&2
      exit 1
      ;;
  esac

  case "$db" in
    atd_org_test|atd_workflow_*|atd_planner_*|atd_leave_*|atd_wl_*|atd_wd_*|atd_fresh_mig)
      ;;
    anytimediesel_hrms|production|prod|staging)
      echo "FATAL: DATABASE_URL database name '$db' looks like production" >&2
      exit 1
      ;;
    *)
      # Allow other clearly test-prefixed names
      if [[ "$db" != atd_* && "$db" != *_test && "$db" != *_test_* ]]; then
        echo "FATAL: DATABASE_URL database '$db' is not a recognized disposable test database" >&2
        exit 1
      fi
      ;;
  esac

  if [[ "$url" == *"anytimediesel_hrms"* ]]; then
    echo "FATAL: DATABASE_URL references production database name anytimediesel_hrms" >&2
    exit 1
  fi

  echo "TEST_DB_HOST=$host"
  echo "TEST_DB_PORT=$port"
  echo "TEST_DB_NAME=$db"
}
