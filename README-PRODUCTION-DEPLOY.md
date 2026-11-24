# ACA Locale — Production deployment and recovery

This is the **operating guide**, not a first-install ZIP patch. The current stack runs on the ACA Locale Contabo VPS with domain `locale.amalficoastartistry.com`.

## Stack and boundaries

- `docker-compose.production.yml` with `deploy/.env.production`
- `web`: React Router embedded Shopify UI
- `backend`: NestJS/Prisma API
- `postgres`: PostgreSQL 16 application database
- `redis`: job queue
- `traefik`: TLS routing / Let's Encrypt
- Persistent **separate** Shopify session-storage volume (SQLite); session data is not contained in the PostgreSQL dump

Never publish PostgreSQL, Redis or backend direct host ports; keep production secrets outside Git.

## Baseline verification (read-only)

```bash
cd /opt/aca-locale
git status -sb
git log -1 --oneline
docker compose --env-file deploy/.env.production \
  -f docker-compose.production.yml ps -a
```

If the working tree is dirty or services unhealthy, investigate before a deployment.

## Safe source update

```bash
cd /opt/aca-locale
test -z "$(git status --porcelain)" || { echo 'STOP: dirty worktree'; exit 1; }
git fetch origin main
git merge --ff-only origin/main
```

A documentation-only change requires **no Docker rebuild**. For a frontend-only change, build/recreate **only** `web` following backup validation. Do not use `docker compose down` or remove volumes.

## Backups (PostgreSQL + Shopify sessions)

```bash
cd /opt/aca-locale
ACA_LOCALE_BACKUP_DIR=/var/backups/aca-locale \
  bash deploy/scripts/backup.sh
```

Confirm both database dump and session backup, their SHA-256 manifest and the script's PASS result. Backups must remain outside the Git repository. Verify retention, off-site copy and restore drills separately. Never log session tokens.

## Production acceptance

```bash
ACA_LOCALE_BACKUP_DIR=/var/backups/aca-locale \
  bash deploy/acceptance/aca-production-acceptance.sh
```

This checks service health, internal readiness, unauthenticated endpoint rejection, backups and operations warnings. It is **not** a substitute for real authenticated Shopify/manual testing or an executed disaster-recovery rollback.

Additional tools:

- `deploy/operations/aca-ops-health.sh` — operational snapshot
- `deploy/operations/aca-restore-drill.sh` — isolated PostgreSQL restore drill
- `deploy/rc/aca-session-recovery-drill.py` — session backup inspection in isolation
- `deploy/rc/aca-rollback-preflight.sh` — image availability preflight only
- `deploy/rc/aca-rc-final-qa.sh` — RC test gate

Read each script and its environment requirements prior to execution. The presence of a rollback image tag does not prove a successful live rollback.

## Actual restore / rollback

A true restoration can overwrite state. Use `deploy/scripts/restore.sh` only under an approved maintenance procedure, after checking the current backup pair and exact image/schema compatibility. Do not run manual SQL migrations or restore production sessions to a developer laptop.

## Shopify configuration

Shopify application configuration resides in `shopify.app*.toml`; secrets and live values reside in the VPS environment. Shopify app CLI deployment changes app configuration and must be reviewed separately from Docker deployment. Do not trigger Shopify app reinstallation or change the installed app Client ID casually.

## Historical first-deployment guidance

The previous version of this document contained a first-time installation walkthrough (including the initial `shopify app deploy -c production` instructions). It remains available through Git history at `0ada7b1`. This document intentionally focuses on **maintenance of the already deployed application**.
