#!/usr/bin/env bash
# ACA Locale v0.9.19.2: isolated production-backup restore drill.
# Read-only against production; uses ephemeral postgres with --network none.
set -euo pipefail
umask 077

BACKUP_DIR="${ACA_LOCALE_BACKUP_DIR:-/var/backups/aca-locale}"
IMAGE="${ACA_RESTORE_IMAGE:-postgres:16-alpine}"
KEEP_CONTAINER=0
MANIFEST=""

usage() {
  cat <<'HELP'
Usage: bash deploy/operations/aca-restore-drill.sh [--manifest /absolute/path/file.sha256] [--keep-container]
Checks backup SHA-256, archive formats, then restores PostgreSQL into an
isolated disposable container (--network none, no ports, no production volumes).
The Shopify session archive is validated, but NEVER restored into production.
Defaults to the newest aca-locale-*.sha256 in ACA_LOCALE_BACKUP_DIR.
--keep-container is for controlled debugging; the container has no network.
HELP
}
while (($#)); do
  case "$1" in
    --manifest) [[ $# -ge 2 ]] || { usage >&2; exit 2; }; MANIFEST="$2"; shift 2 ;;
    --keep-container) KEEP_CONTAINER=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done
[[ -d "$BACKUP_DIR" ]] || { echo '[FAIL] backup directory missing' >&2; exit 1; }
if [[ -z "$MANIFEST" ]]; then
  mapfile -t manifests < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'aca-locale-*.sha256' -printf '%f\n' | LC_ALL=C sort -r)
  ((${#manifests[@]})) || { echo '[FAIL] no backup manifests' >&2; exit 1; }
  MANIFEST="$BACKUP_DIR/${manifests[0]}"
fi
[[ -f "$MANIFEST" && -r "$MANIFEST" ]] || { echo '[FAIL] manifest unavailable' >&2; exit 1; }
MANIFEST="$(realpath "$MANIFEST")"
BACKUP_DIR="$(realpath "$BACKUP_DIR")"
[[ "$(dirname "$MANIFEST")" == "$BACKUP_DIR" ]] || { echo '[FAIL] manifest must be inside backup directory' >&2; exit 1; }
base="$(basename "$MANIFEST")"
[[ "$base" =~ ^aca-locale-([0-9]{8}T[0-9]{6}Z)\.sha256$ ]] || { echo '[FAIL] unexpected manifest name' >&2; exit 1; }
stamp="${BASH_REMATCH[1]}"
DB_FILE="$BACKUP_DIR/aca-locale-postgres-$stamp.dump"
SESSION_FILE="$BACKUP_DIR/aca-locale-shopify-session-$stamp.tar.gz"
[[ -f "$DB_FILE" && -f "$SESSION_FILE" ]] || { echo '[FAIL] matching backup files missing' >&2; exit 1; }

# Reject extra or unexpected entries in the manifest before using sha256sum -c.
python3 - "$MANIFEST" "$DB_FILE" "$SESSION_FILE" <<'PY'
import sys
manifest, db, sessions = sys.argv[1:]
with open(manifest, encoding='utf-8') as f:
    lines = [line.rstrip('\n') for line in f]
expected = {db, sessions}
seen = set()
for line in lines:
    if len(line) < 67 or line[64:66] != '  ' or any(ch not in '0123456789abcdefABCDEF' for ch in line[:64]):
        raise SystemExit('[FAIL] malformed checksum manifest')
    path = line[66:]
    if path not in expected or path in seen:
        raise SystemExit('[FAIL] unexpected/duplicate checksum manifest entry')
    seen.add(path)
if seen != expected:
    raise SystemExit('[FAIL] backup checksum entries incomplete')
PY
printf '[INFO] backup timestamp: %s\n' "$stamp"
(cd / && sha256sum --status -c "$MANIFEST") || { echo '[FAIL] checksum mismatch' >&2; exit 1; }
echo '[PASS] PostgreSQL and Shopify session checksum integrity'

# Read archive structure without writing any session data to disk.
tar -tzf "$SESSION_FILE" >/dev/null || { echo '[FAIL] session tar invalid' >&2; exit 1; }
if ! tar -tzf "$SESSION_FILE" | grep -Eq '(^|/)shopify-session\.sqlite$'; then
  echo '[WARN] expected Shopify session SQLite filename not found; archive is readable but content must be inspected privately'
else
  echo '[PASS] Shopify session tar structure'
fi

command -v docker >/dev/null || { echo '[FAIL] docker not installed' >&2; exit 1; }
docker image inspect "$IMAGE" >/dev/null 2>&1 || { echo '[FAIL] postgres:16 image unavailable locally; do not pull automatically' >&2; exit 1; }
# Check custom-format dump header without parsing/printing data.
[[ "$(head -c 5 "$DB_FILE")" == PGDMP ]] || { echo '[FAIL] PostgreSQL backup is not custom format' >&2; exit 1; }
echo '[PASS] PostgreSQL custom backup header'

CID=""
cleanup() {
  if [[ -n "$CID" && "$KEEP_CONTAINER" -eq 0 ]]; then
    docker rm -f "$CID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
CID="$(docker run --detach --network none --publish-all=false --label aca-locale.restore-drill=true \
  --env POSTGRES_HOST_AUTH_METHOD=trust "$IMAGE")" || { echo '[FAIL] isolated database did not start' >&2; exit 1; }
[[ -n "$CID" ]] || { echo '[FAIL] no ephemeral container id' >&2; exit 1; }
for attempt in $(seq 1 45); do
  if docker exec "$CID" pg_isready -U postgres -d postgres >/dev/null 2>&1; then break; fi
  if ((attempt == 45)); then echo '[FAIL] isolated PostgreSQL not ready' >&2; exit 1; fi
  sleep 1
done
network="$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$CID")"
ports="$(docker inspect -f '{{json .HostConfig.PortBindings}}' "$CID")"
[[ "$network" == none && ( "$ports" == null || "$ports" == '{}' ) ]] || { echo '[FAIL] isolation guarantee missing' >&2; exit 1; }
echo '[PASS] temporary PostgreSQL: no network, no published ports'

# Restore to disposable default database. NO production connection strings used.
if ! docker exec -i "$CID" pg_restore -U postgres -d postgres --no-owner --no-privileges --exit-on-error \
  < "$DB_FILE" >/dev/null; then
  echo '[FAIL] isolated pg_restore failed' >&2
  exit 1
fi
echo '[PASS] isolated PostgreSQL restore completed'

# Catalog-only checks (no rows or customer/product content exposed).
docker exec "$CID" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -Atc \
  'SELECT CASE WHEN COUNT(*) >= 5 THEN '\''PASS'\'' ELSE '\''FAIL'\'' END FROM pg_catalog.pg_tables WHERE schemaname = '\''public'\'';' \
  | grep -qx PASS || { echo '[FAIL] restored application tables missing' >&2; exit 1; }
echo '[PASS] restored public schema has application tables'
if ((KEEP_CONTAINER)); then
  echo '[WARN] disposable container deliberately retained for debugging; remove with docker rm -f <container-id>'
  echo "[INFO] container id: $CID"
else
  echo '[PASS] disposable container scheduled for cleanup'
fi
echo '[PASS] ACA Locale isolated restore drill completed; production unchanged'
