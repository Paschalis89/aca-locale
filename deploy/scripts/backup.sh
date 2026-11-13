#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT_DIR/deploy/.env.production"
COMPOSE_FILE="$ROOT_DIR/docker-compose.production.yml"
BACKUP_DIR="${ACA_LOCALE_BACKUP_DIR:-/var/backups/aca-locale}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

DB_BACKUP="$BACKUP_DIR/aca-locale-postgres-$TIMESTAMP.dump"
SESSION_BACKUP="$BACKUP_DIR/aca-locale-shopify-session-$TIMESTAMP.tar.gz"

cd "$ROOT_DIR"

compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

${compose[@]} exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
  > "$DB_BACKUP"

# Copy the Shopify session SQLite database from the named volume without
# exposing it through a host port.
docker run --rm \
  -v aca-locale-shopify-session:/data:ro \
  -v "$BACKUP_DIR":/backup \
  alpine:3.22 \
  sh -c "cd /data && tar -czf /backup/$(basename "$SESSION_BACKUP") ."

sha256sum "$DB_BACKUP" "$SESSION_BACKUP" \
  > "$BACKUP_DIR/aca-locale-$TIMESTAMP.sha256"

# Local retention: 14 days. Off-site retention can be added on the server.
find "$BACKUP_DIR" -type f -mtime +14 -delete

echo "Database backup: $DB_BACKUP"
echo "Session backup:  $SESSION_BACKUP"
