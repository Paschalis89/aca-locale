#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT_DIR/deploy/.env.production"
COMPOSE_FILE="$ROOT_DIR/docker-compose.production.yml"
SHOPIFY_CONFIG="$ROOT_DIR/shopify.app.production.toml"

fail() {
  echo "PRECHECK FAILED: $*" >&2
  exit 1
}

[[ -f "$ENV_FILE" ]] || fail "Missing deploy/.env.production"
[[ -f "$COMPOSE_FILE" ]] || fail "Missing docker-compose.production.yml"
[[ -f "$SHOPIFY_CONFIG" ]] || fail "Missing shopify.app.production.toml"
[[ -f "$ROOT_DIR/prisma/migrations/20240530213853_create_session_table/migration.sql" ]] \
  || fail "Root Shopify session migration is missing"

if ! find "$ROOT_DIR/backend/prisma/migrations" -mindepth 2 -maxdepth 2 -name migration.sql -print -quit 2>/dev/null | grep -q .; then
  fail "No backend Prisma migration files found. Production must not start from schema.prisma alone."
fi

if grep -q 'REPLACE_WITH_PRODUCTION_CLIENT_ID' "$SHOPIFY_CONFIG"; then
  fail "shopify.app.production.toml still contains the Client ID placeholder"
fi

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
  SCOPES
  ACA_LOCALE_INTERNAL_SECRET
)

for name in "${required[@]}"; do
  value="${!name:-}"
  [[ -n "$value" ]] || fail "$name is empty"
  [[ "$value" != REPLACE_* ]] || fail "$name still contains a placeholder"
done

[[ ${#ACA_LOCALE_INTERNAL_SECRET} -ge 32 ]] \
  || fail "ACA_LOCALE_INTERNAL_SECRET must be at least 32 characters"

[[ "$APP_DOMAIN" == "locale.amalficoastartistry.com" ]] \
  || echo "WARNING: APP_DOMAIN is $APP_DOMAIN, not locale.amalficoastartistry.com"

if command -v docker >/dev/null 2>&1; then
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config -q
else
  echo "WARNING: Docker is not installed yet; Compose validation skipped."
fi

if git -C "$ROOT_DIR" ls-files --error-unmatch deploy/.env.production >/dev/null 2>&1; then
  fail "deploy/.env.production is tracked by Git"
fi

if git -C "$ROOT_DIR" ls-files --error-unmatch .env >/dev/null 2>&1; then
  fail "root .env is tracked by Git"
fi

if git -C "$ROOT_DIR" ls-files --error-unmatch backend/.env >/dev/null 2>&1; then
  fail "backend/.env is tracked by Git"
fi

echo "ACA Locale production preflight: OK"
