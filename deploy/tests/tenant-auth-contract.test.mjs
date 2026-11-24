import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const backend = readFileSync('backend/src/internal/internal-translation-change.service.ts','utf8');
const gateway = readFileSync('app/routes/internal.shopify.auto-publish.ts','utf8');
const auth = readFileSync('backend/src/shopify-auth/shopify-auth.guard.ts','utf8');
const guard = readFileSync('backend/src/internal/internal-auth.guard.ts','utf8');

test('shop event lookup is tenant-scoped', () => {
  assert.match(backend, /shop:\s*\{\s*shopifyDomain/);
});
test('both completed operations validate event identity before idempotent acknowledgement', () => {
  for (const name of ['processUpsert','processDelete']) {
    const block = backend.split(`async ${name}(`)[1].split('async ')[0];
    assert.ok(block.indexOf('this.assertEventMatches(') >= 0);
    assert.ok(block.indexOf('this.assertEventMatches(') < block.indexOf("event.status ==="));
  }
});
test('publication gateway rejects ambiguous credentials and resource mismatch', () => {
  assert.match(gateway,/suppliedSecret\.includes\(','\)/);
  assert.match(gateway,/resource\.resourceId !== resourceId/);
  assert.match(gateway,/RESOURCE_ID_MISMATCH/);
});
test('Shopify auth verifies JWT, audience, issuer and shop domain', () => {
  assert.match(auth,/jwtVerify/);
  assert.match(auth,/audience: apiKey/);
  assert.match(auth,/issuerUrl\.hostname\.toLowerCase\(\) !== shopDomain/);
});
test('internal backend denies duplicate credentials', () => {
  assert.match(guard,/Array\.isArray\(rawProvided\)/);
  assert.match(guard,/timingSafeEqual/);
});
