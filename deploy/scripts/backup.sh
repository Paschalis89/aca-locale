#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT_DIR/deploy/.env.production"
COMPOSE_FILE="$ROOT_DIR/docker-compose.production.yml"
BACKUP_DIR="${ACA_LOCALE_BACKUP_DIR:-/var/backups/aca-locale}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
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
MANIFEST="$BACKUP_DIR/aca-locale-$TIMESTAMP.sha256"

cd "$ROOT_DIR"
compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

"${compose[@]}" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$DB_BACKUP"

# Session store is on a named Docker volume. Never expose it publicly.
docker run --rm \
  -v aca-locale-shopify-session:/data:ro \
  -v "$BACKUP_DIR":/backup \
  alpine:3.22 \
  sh -c "cd /data && tar -czf /backup/$(basename "$SESSION_BACKUP") ."

[[ -s "$DB_BACKUP" && -s "$SESSION_BACKUP" ]] || {
  echo '[FAIL] Empty or missing backup archive' >&2
  exit 1
}

"${compose[@]}" exec -T postgres pg_restore -l < "$DB_BACKUP" > /dev/null
tar -tzf "$SESSION_BACKUP" > /dev/null
sha256sum "$DB_BACKUP" "$SESSION_BACKUP" > "$MANIFEST"
sha256sum -c "$MANIFEST" > /dev/null

# Retention is best effort. An old-file cleanup error must not turn a
# successful verified backup into a failed deployment prerequisite.
if ! find "$BACKUP_DIR" -maxdepth 1 -type f -mtime +14 -delete; then
  echo '[WARN] Backup retention cleanup failed; archives were verified.' >&2
fi

echo "Database backup: $DB_BACKUP"
echo "Session backup:  $SESSION_BACKUP"
echo "SHA-256 manifest: $MANIFEST"
echo '[PASS] Backup integrity checks completed'
exit 0
