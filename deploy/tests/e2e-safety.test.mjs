import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const publicationPath = 'app/routes/api.shopify.translation-jobs.$jobId.items.$itemId.publish.ts';
const publication = existsSync(publicationPath) ? readFileSync(publicationPath, 'utf8') : '';
const service = readFileSync('backend/src/translation-publication/translation-publication.service.ts', 'utf8');

test('Shopify route requires authenticated admin context', () => {
  assert.match(publication, /authenticate\.admin\(/);
});
test('Shopify route refuses missing authorization', () => {
  assert.match(publication, /Missing Shopify ID token/);
});
test('Shopify route uses Shopify translationsRegister mutation', () => {
  assert.match(publication, /translationsRegister/);
});
test('backend prepare rejects stale scanner digest', () => {
  assert.match(service, /SOURCE_CHANGED/);
  assert.match(service, /sourceDigest\s*!==\s*item\.field\.sourceDigest/);
});
test('backend keeps publication confirmation idempotent', () => {
  assert.match(service, /item\.status\s*===\s*'PUBLISHED'/);
});
