#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT_DIR/deploy/.env.production"
COMPOSE_FILE="$ROOT_DIR/docker-compose.production.yml"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

cd "$ROOT_DIR"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

for i in $(seq 1 30); do
  backend_status="$(${compose[@]} ps --format json backend 2>/dev/null | grep -o '"Health":"[^"]*"' | head -1 || true)"
  web_status="$(${compose[@]} ps --format json web 2>/dev/null | grep -o '"Health":"[^"]*"' | head -1 || true)"

  if [[ "$backend_status" == *healthy* ]] && [[ "$web_status" == *healthy* ]]; then
    break
  fi

  sleep 2
done

${compose[@]} ps

echo "Checking public HTTPS endpoint..."
curl --fail --silent --show-error --location --max-time 15 \
  "https://${APP_DOMAIN}/" >/dev/null

echo "HTTPS endpoint OK: https://${APP_DOMAIN}/"
