ACA Locale 10G build/test fix

Fixes:
1. Prisma nullable JSON reset uses Prisma.JsonNull instead of JavaScript null.
2. TranslationQueueService.cancel keeps the legacy top-level cancellation contract for the primary translation queue job while still returning 10G stageJobs.

No schema or migration changes are included. Keep the migration already created locally:
20261113222623_add_translation_automation_recovery

After extracting from the repository root:

cd backend
npm run prisma:generate
npm run build
npm test
cd ..
npm run build
