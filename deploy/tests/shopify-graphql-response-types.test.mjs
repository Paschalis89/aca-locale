import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../../app/routes/api.shopify.translation-jobs.$jobId.items.$itemId.publish.ts', import.meta.url), 'utf8');
test('source read GraphQL response explicitly describes top-level errors', () => {
  assert.match(src, /const resourceJson\s*=\s*\(await resourceResponse\.json\(\)\) as unknown as \{\s*errors\?: unknown;/);
});
test('registration GraphQL response explicitly describes top-level errors', () => {
  assert.match(src, /const registerJson\s*=\s*\(await registerResponse\.json\(\)\) as unknown as \{\s*errors\?: unknown;/);
});
test('source identity and digest safety remain in place', () => {
  assert.match(src, /verifySourceIdentity\(/);
  assert.match(src, /SOURCE_DIGEST_MISMATCH/);
  assert.match(src, /publication\/prepare/);
});
