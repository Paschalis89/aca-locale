#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: CONFIRM_RESTORE=YES $0 /path/to/aca-locale-postgres-YYYYMMDDTHHMMSSZ.dump"
  exit 1
fi

if [[ "${CONFIRM_RESTORE:-}" != "YES" ]]; then
  echo "Restore blocked. Set CONFIRM_RESTORE=YES explicitly."
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT_DIR/deploy/.env.production"
COMPOSE_FILE="$ROOT_DIR/docker-compose.production.yml"
BACKUP_FILE="$1"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Backup file not found: $BACKUP_FILE"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

cd "$ROOT_DIR"
compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

# Stop application processes so nothing writes during the restore.
${compose[@]} stop web backend

cat "$BACKUP_FILE" | ${compose[@]} exec -T postgres \
  pg_restore \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges

${compose[@]} up -d backend web

"$ROOT_DIR/deploy/scripts/healthcheck.sh"
