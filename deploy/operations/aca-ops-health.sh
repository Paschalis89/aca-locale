#!/usr/bin/env bash
# ACA Locale v0.9.19.1a: read-only operational diagnostics.
set -euo pipefail
umask 077

ROOT="${ACA_LOCALE_ROOT:-/opt/aca-locale}"
ENV_FILE="${ACA_LOCALE_ENV_FILE:-deploy/.env.production}"
COMPOSE_FILE="${ACA_LOCALE_COMPOSE_FILE:-docker-compose.production.yml}"
BACKUP_DIR="${ACA_LOCALE_BACKUP_DIR:-/var/backups/aca-locale}"
MAX_BACKUP_AGE_HOURS="${ACA_MAX_BACKUP_AGE_HOURS:-36}"
MAX_JOB_AGE_MINUTES="${ACA_MAX_JOB_AGE_MINUTES:-60}"
MAX_WEBHOOK_AGE_MINUTES="${ACA_MAX_WEBHOOK_AGE_MINUTES:-15}"
DATABASE_CHECK=1

usage() {
  printf 'Usage: %s [--skip-db] [--help]\n' "$0"
  printf 'Read-only health snapshot for ACA Locale production. No tokens or raw payloads are printed.\n'
}
for arg in "$@"; do
  case "$arg" in
    --skip-db) DATABASE_CHECK=0 ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done

for key in MAX_BACKUP_AGE_HOURS MAX_JOB_AGE_MINUTES MAX_WEBHOOK_AGE_MINUTES; do
  value="${!key}"
  if [[ ! "$value" =~ ^[1-9][0-9]*$ ]] || (( value > 100000 )); then
    printf 'ERROR invalid %s\n' "$key" >&2
    exit 2
  fi
done
cd "$ROOT"
if [[ ! -r "$ENV_FILE" || ! -r "$COMPOSE_FILE" ]]; then
  printf 'ERROR: deployment configuration not readable.\n' >&2
  exit 2
fi
if ! command -v docker >/dev/null 2>&1; then
  printf 'ERROR: docker command not found.\n' >&2
  exit 2
fi

compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }
status_ok=1
notice() { printf '[%s] %s\n' "$1" "$2"; }
fail() { notice CRITICAL "$1"; status_ok=0; }

printf 'ACA Locale operational snapshot (UTC): %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
if command -v git >/dev/null 2>&1; then
  printf 'Git revision: %s\n' "$(git rev-parse --short HEAD 2>/dev/null || printf unknown)"
fi

printf '\n== Docker services ==\n'
for service in web backend postgres redis traefik; do
  container_id="$(compose ps -q "$service" 2>/dev/null || true)"
  if [[ -z "$container_id" ]]; then
    fail "${service}: container absent"; continue
  fi
  state="$(docker inspect --format '{{.State.Status}}' "$container_id" 2>/dev/null || true)"
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$container_id" 2>/dev/null || true)"
  if [[ "$state" != running ]]; then
    fail "${service}: ${state:-unknown}"
  elif [[ "$health" == unhealthy ]]; then
    fail "${service}: unhealthy"
  elif [[ "$health" == starting ]]; then
    notice WARN "${service}: starting"
  elif [[ "$health" == healthy || "$health" == no-healthcheck ]]; then
    notice OK "${service}: running ($health)"
  else
    notice WARN "${service}: running (health unknown)"
  fi
done

printf '\n== Disk ==\n'
# Percentage only; no host/user paths are echoed.
disk_pct="$(df -P "$ROOT" | awk 'NR==2 {gsub(/%/,"",$5); print $5}')"
if [[ "$disk_pct" =~ ^[0-9]+$ ]]; then
  if (( disk_pct >= 90 )); then fail "disk usage: ${disk_pct}%"
  elif (( disk_pct >= 80 )); then notice WARN "disk usage: ${disk_pct}%"
  else notice OK "disk usage: ${disk_pct}%"; fi
else notice WARN 'disk usage unavailable'; fi

printf '\n== Backups ==\n'
# Check for an existing production manifest; do not create or change backups.
latest="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'aca-locale-*.sha256' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n 1 | cut -d' ' -f2- || true)"
if [[ -z "$latest" ]]; then
  notice WARN 'no SHA-256 backup manifest found'
else
  age_hours=$(( ( $(date +%s) - $(stat -c %Y "$latest") ) / 3600 ))
  if (( age_hours > MAX_BACKUP_AGE_HOURS )); then notice WARN "latest backup manifest: ${age_hours}h old"
  else notice OK "latest backup manifest: ${age_hours}h old"; fi
  # This is an existence/freshness check, not a restore or checksum audit.
fi

if (( DATABASE_CHECK )); then
  printf '\n== Database aggregates (no content) ==\n'
  # PostgreSQL credentials are resolved exclusively inside the DB container.
  # Deliberately do not dump error output (could contain operational secrets).
  tmp_out="$(mktemp)"
  trap 'rm -f "$tmp_out"' EXIT
  if compose exec -T postgres sh -c 'exec psql -X -q -t -A -F "|" -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >"$tmp_out" 2>/dev/null <<SQL
SELECT 'jobs_failed', COUNT(*) FROM "TranslationJob" WHERE status = 'FAILED';
SELECT 'jobs_stale_running', COUNT(*) FROM "TranslationJob" WHERE status = 'RUNNING' AND "updatedAt" < NOW() - make_interval(mins => ${MAX_JOB_AGE_MINUTES});
SELECT 'jobs_due_retry', COUNT(*) FROM "TranslationJob" WHERE "automationNextRetryAt" IS NOT NULL AND "automationNextRetryAt" <= NOW() AND status NOT IN ('COMPLETED', 'CANCELLED');
SELECT 'webhooks_failed', COUNT(*) FROM "TranslationChangeEvent" WHERE status = 'FAILED';
SELECT 'webhooks_stale_processing', COUNT(*) FROM "TranslationChangeEvent" WHERE status = 'PROCESSING' AND "updatedAt" < NOW() - make_interval(mins => ${MAX_WEBHOOK_AGE_MINUTES});
SELECT 'items_failed', COUNT(*) FROM "TranslationJobItem" WHERE status = 'FAILED';
SELECT 'usage_errors_24h', COUNT(*) FROM "TranslationUsageEvent" WHERE success = false AND "createdAt" >= NOW() - INTERVAL '24 hours';
SQL
  then
    while IFS='|' read -r metric count; do
      [[ -z "$metric" ]] && continue
      if [[ ! "$count" =~ ^[0-9]+$ ]]; then
        notice WARN "${metric}: unexpected response"
      elif (( count > 0 )); then
        notice WARN "${metric}: ${count}"
      else
        notice OK "${metric}: 0"
      fi
    done < "$tmp_out"
  else
    notice WARN 'database operational query unavailable (review logs manually)'
  fi
else
  printf '\nDatabase queries skipped (--skip-db).\n'
fi

printf '\n== Summary ==\n'
if (( status_ok )); then
  notice OK 'No critical container/disk condition detected. WARN entries still need review.'
else
  notice CRITICAL 'Critical infrastructure condition detected.'
  exit 1
fi
