#!/usr/bin/env bash
# ACA Locale v0.9.19.3 - non-destructive production acceptance probe
set -euo pipefail
umask 077
ROOT="${ACA_LOCALE_ROOT:-/opt/aca-locale}"
ENV_FILE="${ACA_LOCALE_ENV_FILE:-deploy/.env.production}"
COMPOSE_FILE="${ACA_LOCALE_COMPOSE_FILE:-docker-compose.production.yml}"
BACKUP_DIR="${ACA_LOCALE_BACKUP_DIR:-/var/backups/aca-locale}"
EXPECT_COMMIT="${ACA_ACCEPTANCE_EXPECT_COMMIT:-}"
usage() { printf 'Usage: bash %s [--help]\nRead-only production acceptance: Docker, readiness, auth denial, operational metrics. No shop writes.\n' "$0"; }
if (($#)); then [[ $# -eq 1 && ( "$1" == --help || "$1" == -h ) ]] && { usage; exit 0; }; usage >&2; exit 2; fi
cd "$ROOT"
[[ -r "$ENV_FILE" && -r "$COMPOSE_FILE" ]] || { echo '[FAIL] production compose config missing' >&2; exit 1; }
command -v docker >/dev/null || { echo '[FAIL] docker unavailable' >&2; exit 1; }
compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }
fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }
warn() { printf '[WARN] %s\n' "$1"; }
printf 'ACA Locale production acceptance UTC: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
revision="$(git rev-parse --short HEAD 2>/dev/null || true)"
[[ -n "$revision" ]] || fail 'no git revision'
printf 'Revision: %s\n' "$revision"
if [[ -n "$EXPECT_COMMIT" ]]; then
  [[ "$(git rev-parse HEAD)" == "$(git rev-parse "$EXPECT_COMMIT" 2>/dev/null || true)" ]] || fail 'unexpected git revision'
  pass 'expected git revision'
fi
[[ -z "$(git status --porcelain)" ]] || warn 'repository has uncommitted files'
for service in web backend postgres redis traefik; do
  cid="$(compose ps -q "$service" 2>/dev/null)"
  [[ -n "$cid" ]] || fail "$service container missing"
  state="$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null)"
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$cid" 2>/dev/null)"
  [[ "$state" == running ]] || fail "$service not running"
  if [[ "$service" == traefik ]]; then
    [[ "$health" == healthy || "$health" == no-healthcheck ]] || fail 'traefik health unexpected'
  else
    [[ "$health" == healthy ]] || fail "$service not healthy"
  fi
  pass "$service: $state ($health)"
done
# HTTP probes execute inside backend container: no external exposure and no tokens.
# Node is included in backend runtime image. Return only safe fields.
compose exec -T backend node - <<'JS' || fail 'backend HTTP acceptance failed'
(async () => {
  const port = Number(process.env.PORT || 3001);
  const prefix = (process.env.API_PREFIX || 'api/v1').replace(/^\/+|\/+$/g, '');
  const base = `http://127.0.0.1:${port}`;
  const check = async (path, expected, validator) => {
    const res = await fetch(`${base}/${path}`, { signal: AbortSignal.timeout(8000), redirect: 'manual' });
    if (res.status !== expected) throw new Error(`${path} status ${res.status}, expected ${expected}`);
    const body = await res.json();
    if (!validator(body)) throw new Error(`${path} unexpected response`);
    console.log(`[PASS] ${path}: ${res.status}`);
  };
  await check(`${prefix}/health/live`, 200, b => b?.status === 'ok');
  await check(`${prefix}/health/ready`, 200, b => b?.status === 'ok' && b?.checks?.database?.status === 'up' && b?.checks?.redis?.status === 'up');
  await check(`${prefix}/operations/snapshot`, 401, b => b && typeof b === 'object');
  await check(`${prefix}/translations/jobs`, 401, b => b && typeof b === 'object');
})().catch(e => { console.error(`[FAIL] ${e.message}`); process.exitCode = 1; });
JS
pass 'unauthenticated Operations and Jobs endpoints deny access'
if [[ -x deploy/operations/aca-ops-health.sh || -r deploy/operations/aca-ops-health.sh ]]; then
  ACA_LOCALE_ROOT="$ROOT" ACA_LOCALE_ENV_FILE="$ENV_FILE" ACA_LOCALE_COMPOSE_FILE="$COMPOSE_FILE" ACA_LOCALE_BACKUP_DIR="$BACKUP_DIR" bash deploy/operations/aca-ops-health.sh || fail 'operational CLI critical condition'
  pass 'operational snapshot (warnings require review)'
else
  fail 'operations health script missing'
fi
printf '\n[PASS] Automatic read-only acceptance finished. Manual Shopify and disaster recovery gates remain.\n'
