import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

test('Docker image never persists Shopify API placeholders as ENV', () => {
  const dockerfile = read('Dockerfile');
  assert.doesNotMatch(dockerfile, /^ENV\s+SHOPIFY_API_(KEY|SECRET)=/m);
  assert.match(dockerfile, /SHOPIFY_API_KEY=build-only/);
  assert.match(dockerfile, /SHOPIFY_API_SECRET=build-only/);
  assert.match(dockerfile, /RUN SHOPIFY_SESSION_DATABASE_URL=/);
});

test('production injects Shopify credentials at runtime, not as build args', () => {
  const compose = read('docker-compose.production.yml');
  assert.match(compose, /SHOPIFY_API_SECRET:\s*\$\{SHOPIFY_API_SECRET\}/);
  assert.match(compose, /SHOPIFY_API_KEY:\s*\$\{SHOPIFY_API_KEY\}/);
  assert.doesNotMatch(compose, /SHOPIFY_API_SECRET\s*:\s*\$\{SHOPIFY_API_SECRET\}[\s\S]*?build:\s*\$\{SHOPIFY_API_SECRET\}/);
});

test('advisory lock test uses ephemeral PostgreSQL 16 bound to loopback', () => {
  const script = read('deploy/scripts/qa-postgres-lock.sh');
  assert.match(script, /127\.0\.0\.1::5432/);
  assert.match(script, /--tmpfs/);
  assert.match(script, /postgres:16-alpine/);
  assert.match(script, /translation-scope-lock\.integration\.spec\.ts/);
  assert.match(script, /trap cleanup EXIT/);
});

test('restore test is network isolated and never accesses production db', () => {
  const script = read('deploy/scripts/qa-backup-restore.sh');
  assert.match(script, /--network none/);
  assert.match(script, /--single-transaction/);
  assert.match(script, /--no-owner --no-privileges/);
  assert.match(script, /:ro/);
  assert.match(script, /trap cleanup EXIT/);
});

test('existing backup verifies both archive types and SHA-256', () => {
  const script = read('deploy/scripts/backup.sh');
  assert.match(script, /pg_restore -l/);
  assert.match(script, /tar -tzf/);
  assert.match(script, /sha256sum -c/);
});
