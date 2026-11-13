# ACA Locale - production deployment baseline

Target architecture for the internal Amalfi Coast Artistry installation:

- `locale.amalficoastartistry.com`
- Traefik 3.7.x with Let's Encrypt
- React Router Shopify application
- NestJS backend
- PostgreSQL 16
- Redis 7.4 extended-support branch
- persistent SQLite volume for the Shopify session store
- no public host ports for PostgreSQL, Redis or NestJS

## Files in this deployment patch

Replace:

- `Dockerfile`
- `.dockerignore`
- `.gitignore`
- `app/shopify.server.ts`
- `prisma/schema.prisma`

Add:

- `backend/Dockerfile`
- `backend/.dockerignore`
- `docker-compose.production.yml`
- `shopify.app.production.toml`
- `deploy/.env.production.example`
- `deploy/scripts/deploy.sh`
- `deploy/scripts/healthcheck.sh`
- `deploy/scripts/backup.sh`
- `deploy/scripts/restore.sh`

## Important local-development change

The root Prisma session database is now configured through:

```env
SHOPIFY_SESSION_DATABASE_URL=file:./dev.sqlite
```

Add that variable to the root local `.env` before running `shopify app dev` again.
The backend database configuration is unchanged.

## Production preparation

On the server:

```bash
cp deploy/.env.production.example deploy/.env.production
chmod 600 deploy/.env.production
```

Fill every `REPLACE_...` value. Generate strong secrets locally, for example:

```bash
openssl rand -hex 32
```

Do not paste production secrets into source control.

## DNS

Create an `A` record:

```text
locale.amalficoastartistry.com -> <ACA Locale VPS public IP>
```

Ports 80 and 443 must reach Traefik. PostgreSQL, Redis and NestJS stay internal to Docker.

## First server deploy

```bash
chmod +x deploy/scripts/*.sh
./deploy/scripts/deploy.sh
```

The backend container runs `prisma migrate deploy` before NestJS starts. The web container runs the Shopify session Prisma migration before React Router starts.

## Shopify production app

Create/select the production Shopify app and choose **Custom distribution** for the ACA store. Set its Client ID in:

```text
shopify.app.production.toml
```

and set the same Client ID/secret in `deploy/.env.production`.

The React Router runtime uses:

```env
SHOPIFY_APP_DISTRIBUTION=single_merchant
```

Development can keep:

```env
SHOPIFY_APP_DISTRIBUTION=app_store
```

if the current development app uses public/App Store style distribution.

When the domain is online and HTTPS is valid:

```bash
shopify app deploy -c production
```

Do this only after confirming the production `client_id` and URLs.

## Safe first ACA settings

Keep the initial live shop conservative:

```text
autoTranslate       false
enableAiReview      true
requireHumanReview  true
autoPublish         false
```

Then run the real Languages/Markets sync and a Store Scan before translating a small first batch.

## Backup

Manual backup:

```bash
sudo ACA_LOCALE_BACKUP_DIR=/var/backups/aca-locale ./deploy/scripts/backup.sh
```

Recommended cron after the first successful restore test:

```text
15 2 * * * cd /opt/aca-locale && ACA_LOCALE_BACKUP_DIR=/var/backups/aca-locale ./deploy/scripts/backup.sh >> /var/log/aca-locale-backup.log 2>&1
```

The script keeps 14 days locally. Add off-site backup after the initial production launch.

## Restore protection

Restore is intentionally blocked unless explicitly confirmed:

```bash
sudo CONFIRM_RESTORE=YES ./deploy/scripts/restore.sh /var/backups/aca-locale/<backup>.dump
```

## Production smoke checks

```bash
docker compose --env-file deploy/.env.production -f docker-compose.production.yml ps
curl -I https://locale.amalficoastartistry.com/
```

Backend health is not publicly exposed; inspect it from Docker:

```bash
docker compose --env-file deploy/.env.production -f docker-compose.production.yml \
  exec -T backend node -e \
  "fetch('http://127.0.0.1:3001/api/v1/health/ready').then(async r=>{console.log(r.status, await r.text()); process.exit(r.ok?0:1)}).catch(e=>{console.error(e);process.exit(1)})"
```

## Mandatory migration preflight

Before the first server deployment, the repository must contain the real NestJS Prisma migrations created during development:

```text
backend/prisma/migrations/<timestamp>_.../migration.sql
```

The production script deliberately refuses to deploy if those files are missing. `schema.prisma` alone is not a safe production migration strategy.

Run locally before pushing the production branch:

```bash
./deploy/scripts/preflight.sh
```

For the React Router production OAuth callback, the production config uses the current Shopify deployment convention:

```text
https://locale.amalficoastartistry.com/auth/callback
```
