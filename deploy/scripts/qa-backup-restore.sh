#!/usr/bin/env bash
# Verify a pg_dump custom-format backup with an actual isolated PG16 restore.
# Usage: bash deploy/scripts/qa-backup-restore.sh /path/to/aca-locale-postgres-*.dump
# Only reads a local dump; no credentials or production network access needed.
set -euo pipefail
[[ $# == 1 ]] || { echo 'Usage: qa-backup-restore.sh BACKUP.dump' >&2; exit 2; }
DUMP="$(realpath "$1")"
[[ -s "$DUMP" && -f "$DUMP" ]] || { echo '[FAIL] Backup file not found/empty' >&2; exit 1; }
[[ "$(head -c 5 "$DUMP")" == PGDMP ]] || { echo '[FAIL] Not a custom-format pg_dump' >&2; exit 1; }
command -v docker >/dev/null || { echo '[FAIL] docker required' >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo '[FAIL] Docker unavailable' >&2; exit 1; }
NAME="aca-restore-qa-$$"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
DIR="$(dirname "$DUMP")"
FILE="$(basename "$DUMP")"
docker run -d --name "$NAME" --network none \
  --tmpfs /var/lib/postgresql/data:rw,size=512m \
  -v "$DIR:/backup:ro" \
  -e POSTGRES_USER=aca_restoreqa \
  -e POSTGRES_PASSWORD=aca_ephemeral_only \
  -e POSTGRES_DB=aca_restoreqa \
  postgres:16-alpine >/dev/null
ready=0
for i in $(seq 1 45); do
  if docker exec "$NAME" pg_isready -U aca_restoreqa -d aca_restoreqa >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[[ "$ready" == 1 ]] || { echo '[FAIL] Isolated PostgreSQL not ready' >&2; exit 1; }
echo "[INFO] Restore into isolated network=none PG16 (no host ports)"
docker exec "$NAME" pg_restore --exit-on-error --single-transaction --no-owner --no-privileges \
  -U aca_restoreqa -d aca_restoreqa "/backup/$FILE"
docker exec "$NAME" psql -v ON_ERROR_STOP=1 -At -U aca_restoreqa -d aca_restoreqa \
  -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" | \
  awk '{if ($1+0<1) exit 1; print "[PASS] Restored public tables:", $1}'
echo '[PASS] Isolated PostgreSQL restore verified'
