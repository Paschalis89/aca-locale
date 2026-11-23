#!/usr/bin/env bash
# Run the real transaction advisory-lock integration spec against a disposable PG16.
# No ports are exposed beyond loopback. No persistent volumes are used.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NAME="aca-lock-qa-$$"
PORT=""
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
command -v docker >/dev/null || { echo '[FAIL] docker is required' >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo '[FAIL] Docker daemon is unavailable' >&2; exit 1; }
[[ -d "$ROOT/backend/node_modules" ]] || { echo '[FAIL] Install backend dependencies locally first' >&2; exit 1; }

docker run -d --name "$NAME" \
  --network bridge \
  --publish 127.0.0.1::5432 \
  --tmpfs /var/lib/postgresql/data:rw,size=256m \
  -e POSTGRES_USER=aca_lockqa \
  -e POSTGRES_PASSWORD=aca_ephemeral_only \
  -e POSTGRES_DB=aca_lockqa \
  postgres:16-alpine >/dev/null

ready=0
for i in $(seq 1 45); do
  if docker exec "$NAME" pg_isready -U aca_lockqa -d aca_lockqa >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
[[ "$ready" == 1 ]] || { echo '[FAIL] Ephemeral PostgreSQL not ready' >&2; exit 1; }
PORT="$(docker port "$NAME" 5432/tcp | awk -F: 'NR==1 {print $NF}')"
[[ "$PORT" =~ ^[0-9]+$ ]] || { echo '[FAIL] Could not resolve ephemeral port' >&2; exit 1; }
echo "[INFO] Ephemeral PostgreSQL bound to 127.0.0.1:$PORT"
(
  cd "$ROOT/backend"
  ACA_LOCK_TEST_DATABASE_URL="postgresql://aca_lockqa:aca_ephemeral_only@127.0.0.1:${PORT}/aca_lockqa" \
    npx --no-install vitest run test/translation-scope-lock.integration.spec.ts
)
echo '[PASS] Real PostgreSQL advisory-lock integration test'
