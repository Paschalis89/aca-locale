# ACA Locale 10G - Retry / Recovery / Throttling

This archive is intentionally flat: extract it directly in the ACA Locale repository root.

## Apply

```bash
cd ~/Progetti/work/aca-locale
unzip -o ~/Scaricati/aca-locale-10g-flat.zip
```

## Verify schema

```bash
cd ~/Progetti/work/aca-locale/backend
grep -nE 'automationStage|translationAttempts|reviewAttempts|publishAttempts|automationLastError|automationNextRetryAt' prisma/schema.prisma
```

The grep must return the 10G fields.

## Create migration

```bash
npx prisma format
npx prisma migrate dev --name add_translation_automation_recovery
npm run prisma:generate
```

## Verify migration

```bash
find prisma/migrations -maxdepth 2 -type f -name migration.sql -print | sort | tail -6
```

## Build and test

```bash
npm run build
npm test
cd ~/Progetti/work/aca-locale
npm run build
```

The backend test suite should now also include `translation-queue.resilience.spec.ts`.
