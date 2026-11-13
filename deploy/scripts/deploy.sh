#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT_DIR/deploy/.env.production"
COMPOSE_FILE="$ROOT_DIR/docker-compose.production.yml"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  echo "Copy deploy/.env.production.example and fill the production secrets first."
  exit 1
fi

cd "$ROOT_DIR"

"$ROOT_DIR/deploy/scripts/preflight.sh"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

required=(
  APP_DOMAIN
  LETSENCRYPT_EMAIL
  POSTGRES_DB
  POSTGRES_USER
  POSTGRES_PASSWORD
  REDIS_PASSWORD
  SHOPIFY_API_KEY
  SHOPIFY_API_SECRET
  ACA_LOCALE_INTERNAL_SECRET
)

for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]] || [[ "${!name}" == REPLACE_* ]]; then
    echo "Production variable $name is missing or still contains a placeholder."
    exit 1
  fi
done

if [[ ${#ACA_LOCALE_INTERNAL_SECRET} -lt 32 ]]; then
  echo "ACA_LOCALE_INTERNAL_SECRET must be at least 32 characters."
  exit 1
fi

echo "=== ACA Locale production deploy ==="
echo "Domain: $APP_DOMAIN"

# Pull only third-party images; application services are built locally.
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull traefik postgres redis

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build --pull web backend

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d

"$ROOT_DIR/deploy/scripts/healthcheck.sh"

echo "Deploy completed."
