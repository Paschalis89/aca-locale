# ACA Locale 10G - Retry, throttling and recovery

This patch completes the operational reliability layer for continuous translation.

## What 10G adds

- exponential retry for automatic translation failures
- separate AI-review retry jobs (no second DeepL/LLM translation)
- separate Shopify-publication retry jobs (no second translation/review)
- terminal source-freshness failure classification
- recovery of orphaned automatic QUEUED jobs after restart
- recovery of stale RUNNING jobs
- recovery of failed automatic AI review and auto-publish stages
- deterministic queue job IDs / duplicate protection per stage
- global BullMQ rate limiter
- per-shop concurrency guard (single-worker ACA deployment)
- retry-attempt caps
- automation stage/error/attempt persistence in PostgreSQL
- last known Shopify gateway URL persisted for recovery

## Modified files

- `backend/prisma/schema.prisma`
- `backend/src/config/environment.validation.ts`
- `backend/src/internal/internal-translation-change.service.ts`
- `backend/src/translation-jobs/translation-jobs.service.ts`
- `backend/src/translation-jobs/translation-queue.service.ts`
- `backend/src/translation-jobs/dto/translation-job-response.dto.ts`

## New file

- `backend/src/translation-jobs/translation-queue.resilience.spec.ts`

## Apply

Extract the patch at the repository root, preserving paths.

Then:

```bash
cd ~/Progetti/work/aca-locale/backend

npx prisma format
npx prisma migrate dev --name add_translation_automation_recovery
npm run prisma:generate

npm run build
npm test
npm run docs:generate

cd ~/Progetti/work/aca-locale
npm run build
```

## Recommended backend `.env`

Replace the old `TRANSLATION_QUEUE_ATTEMPTS=40` value. 10G intentionally uses bounded retry counts.

```env
TRANSLATION_QUEUE_PREFIX=aca-locale
TRANSLATION_QUEUE_CONCURRENCY=2
TRANSLATION_QUEUE_PER_SHOP_CONCURRENCY=1

TRANSLATION_QUEUE_ATTEMPTS=5
TRANSLATION_QUEUE_REVIEW_ATTEMPTS=5
TRANSLATION_QUEUE_PUBLISH_ATTEMPTS=8
TRANSLATION_QUEUE_BACKOFF_MS=10000

TRANSLATION_QUEUE_RATE_LIMIT_MAX=10
TRANSLATION_QUEUE_RATE_LIMIT_DURATION_MS=1000

TRANSLATION_QUEUE_RECOVERY_INTERVAL_MS=60000
TRANSLATION_QUEUE_STALE_RUNNING_MS=300000
TRANSLATION_QUEUE_RECOVERY_BATCH_SIZE=100
```

`TRANSLATION_QUEUE_ATTEMPTS` is hard-capped to 10 in the queue service, review attempts to 10 and publish attempts to 12.

## New TranslationJob fields

```text
automationStage
translationAttempts
reviewAttempts
publishAttempts
automationLastError
automationLastAttemptAt
automationNextRetryAt
automationCompletedAt
shopifyGatewayUrl
```

These do not replace the core job lifecycle (`QUEUED`, `RUNNING`, `COMPLETED`, etc.). They describe the automation pipeline around it.

## Stage behavior

### Translation error

```text
Translation provider fails
  -> failed item stays FAILED
  -> if error is retryable, BullMQ retries only the translation stage
  -> before retry, only retryable FAILED items are reset to PENDING
  -> successful items are never translated again
```

The following source-snapshot failures are terminal and are not retried:

```text
SOURCE_CHANGED_BEFORE_EXECUTION
RESOURCE_DELETED_BEFORE_EXECUTION
FIELD_DELETED_BEFORE_EXECUTION
SOURCE_FIELD_NOT_FOUND_BEFORE_EXECUTION
Source value is empty
```

### AI-review error

```text
Translation already completed
  -> AI review fails
  -> dedicated `retry-ai-review` queue job
  -> translation executor is not called again
```

### Shopify publish error

```text
Translation/review already completed
  -> Shopify publish fails
  -> dedicated `retry-auto-publish` queue job
  -> no second translation
  -> no second AI review
```

The existing auto-approved `APPROVED` state is preserved, so a publication retry can safely continue from the same approved value.

## Startup / periodic recovery

On backend startup and every `TRANSLATION_QUEUE_RECOVERY_INTERVAL_MS`, 10G searches automatic jobs for:

- `QUEUED` jobs missing from Redis/BullMQ
- stale `RUNNING` jobs
- failed AI-review stage eligible for retry
- auto-approved unpublished items eligible for publication retry

Recovery respects `autoTranslate`, retry caps and shop status.

## Test 1 - build and unit tests

```bash
cd ~/Progetti/work/aca-locale/backend
npm run build
npm test
```

Expected: all existing tests plus `translation-queue.resilience.spec.ts` pass.

The existing test that logs a simulated `Automatic AI review failed...` message is intentionally exercising failure isolation; it is not a failing test if Vitest reports PASS.

## Test 2 - inspect old queued automatic jobs

Before starting backend:

```bash
docker exec -it aca-locale-postgres \
  psql -U aca_locale -d aca_locale \
  -c 'select "id","origin","status","automationStage","translationAttempts","reviewAttempts","publishAttempts","automationLastError","createdAt" from "TranslationJob" where "origin"='\''SHOPIFY_CHANGE'\'' order by "createdAt" desc limit 20;'
```

For recovery testing, enable automatic translation temporarily:

```bash
docker exec -it aca-locale-postgres \
  psql -U aca_locale -d aca_locale \
  -c 'update "ShopSettings" set "autoTranslate"=true,"updatedAt"=now() where "shopId"=(select "id" from "Shop" where "shopifyDomain"='\''aca-locale-dev-cfoxunuo.myshopify.com'\'');'
```

Restart NestJS. Old `SHOPIFY_CHANGE / QUEUED` jobs should be re-enqueued automatically. Jobs whose source changed/deleted should terminate through source-freshness protection instead of translating stale content.

## Test 3 - normal successful 10G pipeline

Keep safe settings if you do not want auto-publish:

```text
autoTranslate=true
autoPublish=false
requireHumanReview=true
enableAiReview=true
```

Change a new Shopify product title. After completion:

```bash
docker exec -it aca-locale-postgres \
  psql -U aca_locale -d aca_locale \
  -c 'select "id","status","automationStage","translationAttempts","reviewAttempts","publishAttempts","automationLastError","automationNextRetryAt","automationCompletedAt","shopifyGatewayUrl" from "TranslationJob" where "origin"='\''SHOPIFY_CHANGE'\'' order by "createdAt" desc limit 10;'
```

A normal successful job should show at least one translation attempt and no unbounded retry loop.

## Test 4 - queue stage status

Use the existing authenticated endpoint for a job:

```text
GET /api/v1/translations/jobs/:id/queue
```

10G now reports three deterministic queue stages:

```text
translation
review
publish
```

Each includes state, attempts made, max attempts and failed reason when present.

## After testing

Return ACA to safe settings until 10H exposes these switches in the UI:

```bash
docker exec -it aca-locale-postgres \
  psql -U aca_locale -d aca_locale \
  -c 'update "ShopSettings" set "autoTranslate"=false,"autoPublish"=false,"requireHumanReview"=true,"enableAiReview"=true,"updatedAt"=now() where "shopId"=(select "id" from "Shop" where "shopifyDomain"='\''aca-locale-dev-cfoxunuo.myshopify.com'\'');'
```

