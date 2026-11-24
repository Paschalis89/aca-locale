# ACA Locale

ACA Locale is the private, single-merchant Shopify localization application for Amalfi Coast Artistry. It supports translation workflows, review and approval, translation publication/verification, market/language synchronization, international SEO review, usage reporting and operational monitoring.

**Production app:** `https://locale.amalficoastartistry.com` (embedded in Shopify Admin). Do not use the public URL as a substitute for Shopify embedded authentication.

## Architecture

| Component | Location | Purpose |
| --- | --- | --- |
| React Router / Shopify embedded app | `app/` | Dashboard, authenticated Shopify routes, server-side proxies |
| NestJS / Prisma | `backend/` | Translation pipeline, jobs, review, persistence and operations |
| PostgreSQL 16 | Production Docker service | Application data |
| Redis / BullMQ | Production Docker service | Queued and retryable work |
| SQLite session store | `prisma/`, persistent production volume | Shopify OAuth session persistence (separate from PostgreSQL) |
| Traefik | `docker-compose.production.yml` | HTTPS reverse proxy |

The application has distinct **frontend** and **backend** Prisma schemas. Do not conflate or overwrite them.

## Functional areas

- Overview and Store Scan: discover translatable Shopify resources; targeted scans are preferable to broad scans during QA.
- Jobs / Review: create and execute jobs, review or regenerate items, approve and publish translations, then verify them against Shopify.
- Markets & Localization: synchronize Shopify market and locale information.
- International SEO: inspect localization coverage and issues.
- Usage, AI configuration and Operations: provider usage, settings, status and diagnostic snapshots.
- Dashboard interface languages: Italian and English. This choice does not change the Shopify translation target language.

Actual available functionality and permissions are controlled by the deployed version and Shopify installation.

## Development and verification

Use Node.js version from `.nvmrc` and configuration examples from `.env.example` and `backend/.env.example`. Never commit real `.env` files or access tokens.

```bash
npm ci
npm run typecheck
npm run build

cd backend
npm ci
npm test
npm run build
```

For Shopify-linked local development, consult `shopify.app.toml` and the project's Shopify CLI configuration; do not run a production configuration against a test shop. Database migrations must be applied through the reviewed Prisma workflow for the **correct** schema and environment.

## Production operations

See [Production deployment and recovery](README-PRODUCTION-DEPLOY.md). The production stack is defined in `docker-compose.production.yml`, using `deploy/.env.production` stored **only on the VPS**. Always verify backups, migrations, image versions and the current Git revision before making changes.

For a read-only production acceptance run:

```bash
cd /opt/aca-locale
ACA_LOCALE_BACKUP_DIR=/var/backups/aca-locale \
  bash deploy/acceptance/aca-production-acceptance.sh
```

For the current Git-tracked utility scripts, see `deploy/scripts/`, `deploy/operations/`, `deploy/acceptance/` and `deploy/rc/`. Do **not** delete these folders as part of a documentation cleanup.

## Release and security principles

1. Test locally, including frontend typecheck/build and backend unit tests as appropriate.
2. Commit and push reviewed changes; on the VPS use `git fetch` and `git merge --ff-only` after a clean-tree check.
3. Create and verify a fresh PostgreSQL **and session-store** backup prior to deployment.
4. Build/recreate only affected Docker services, avoiding `docker compose down` and volume deletion.
5. Run acceptance checks and verify Shopify UI after deployment.
6. Never treat mocked tenant/webhook tests, backup integrity or rollback preflight as proof of a complete end-to-end disaster-recovery test.

## Documentation

- `README-PRODUCTION-DEPLOY.md` — production maintenance, backups and acceptance
- `backend/README.md` — API/backend structure and testing
- `CHANGELOG.md` — ACA Locale project-specific milestones
- `deploy/tests/qa-v0917-checklist.md` — historical manual QA checklist, retained as a reference; follow the newer RC acceptance scripts for current checks

The original generic Shopify and NestJS template documentation and release history remain accessible in Git history prior to the documentation-cleanup commit.
