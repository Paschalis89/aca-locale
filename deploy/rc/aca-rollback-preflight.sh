#!/usr/bin/env bash
# ACA Locale v1.0 RC: non-mutating rollback readiness preflight.
set -euo pipefail
usage() {
  cat <<'EOF'
Usage: bash deploy/rc/aca-rollback-preflight.sh
Checks Git cleanliness, deployed container status and pre-release rollback images.
READ-ONLY: never executes docker tag, compose up/down, Git reset or database restore.
EOF
}
if (($#)); then
  if [[ $# -eq 1 && ( "$1" == '--help' || "$1" == '-h' ) ]]; then usage; exit 0; fi
  usage >&2; exit 2
fi
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
command -v docker >/dev/null || { echo '[FAIL] docker missing' >&2; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo '[FAIL] Git tree is not clean' >&2; exit 1; }
[[ -f deploy/.env.production && -f docker-compose.production.yml ]] || { echo '[FAIL] compose or env file missing' >&2; exit 1; }
compose=(docker compose --env-file deploy/.env.production -f docker-compose.production.yml)
for service in backend web postgres redis traefik; do
  id="$("${compose[@]}" ps -q "$service")"
  [[ -n "$id" ]] || { echo "[FAIL] $service missing" >&2; exit 1; }
  state="$(docker inspect -f '{{.State.Status}}' "$id")"
  [[ "$state" == running ]] || { echo "[FAIL] $service status: $state" >&2; exit 1; }
  echo "[PASS] $service running"
done
for image in aca-locale-backend:pre-v0.9.19.1b aca-locale-web:pre-v0.9.19.1b; do
  if docker image inspect "$image" >/dev/null 2>&1; then
    echo "[PASS] rollback image exists: $image"
  else
    echo "[WARN] rollback image not found: $image (do not attempt rollback without a tested image)"
  fi
done
printf '[INFO] current revision: %s\n' "$(git rev-parse --short HEAD)"
echo '[PASS] rollback preflight completed; no changes performed'
echo '[NOTE] Restore the exact pair of tested images only under a controlled maintenance procedure.'
echo '[NOTE] Do not roll back database migrations blindly. Snapshot and verify current state first.'
