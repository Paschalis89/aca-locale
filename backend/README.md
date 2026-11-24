# ACA Locale backend

NestJS TypeScript API for the ACA Locale Shopify translation service. Database: PostgreSQL 16 via Prisma. Queue/retry processing: Redis and BullMQ. The Shopify embedded frontend is in the repository's `app/` directory.

## Main modules

- `src/shopify-auth/` and `src/internal/`: Shopify request authentication and internal integrations
- `src/shops/`, `src/languages/`, `src/markets/`, `src/shopify-sync/`: merchant and Shopify configuration synchronization
- `src/translation-scanner/`, `src/translation-jobs/`: resource scanning and queue lifecycle
- `src/translation-engine/`, `src/translation-validation/`: translation providers, safeguards and validation
- `src/translation-review/`, `src/translation-human-review/`, `src/translation-publication/`: review and publication workflow
- `src/glossary/`: term management
- `src/ai/`, `src/operations/`, `src/health/`, `src/readiness/`: AI configuration, operational reporting and health

## Setup and QA

See `backend/.env.example`, `package.json` and `prisma.config.ts` for the **current** configuration. Use a local/test PostgreSQL database; never point local commands at production by accident.

```bash
cd backend
npm ci
npm test
npm run build
```

Vitest tests reside in `src/**/*.spec.ts` and `test/*.spec.ts`. Some integration tests require additional isolated infrastructure and may be skipped in a normal unit run; report skips explicitly rather than claiming all integrations passed.

## Prisma

- Backend schema: `backend/prisma/schema.prisma`
- Versioned migrations: `backend/prisma/migrations/`
- The frontend Shopify session-store schema is distinct: `/prisma/schema.prisma`

Do not remove or squash existing migrations in a live application without an approved, tested migration plan. Production should use reviewed migration deployment procedures, not `prisma migrate dev` against a production database.

## Production

`docker-compose.production.yml` defines the backend service. The app's operational scripts are in `deploy/scripts/`, `deploy/operations/`, `deploy/acceptance/` and `deploy/rc/` at the repository root.

The API's internal services must remain inaccessible directly from the public internet. The public Shopify UI must authenticate before accessing tenant-scoped data. Keep credentials in the production environment and never in Git.

Do not launch manual SQL updates or synthetic Shopify webhook events on production as casual QA. Use isolated test data and preserve the actual Shopify merchant state.
