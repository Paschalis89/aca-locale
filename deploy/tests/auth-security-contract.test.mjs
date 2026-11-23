import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('Shopify authentication stays JWT-signature-verified and audience-bound', () => {
  const body = read('backend/src/shopify-auth/shopify-auth.guard.ts');
  assert.match(body, /jwtVerify\(token, secret/);
  assert.match(body, /algorithms: \['HS256'\]/);
  assert.match(body, /audience: apiKey/);
});
test('Shopify tenant origin and token lifetime are constrained', () => {
  const body = read('backend/src/shopify-auth/shopify-auth.guard.ts');
  assert.match(body, /destinationUrl\.pathname !== '\/'/);
  assert.match(body, /issuerUrl\.pathname/);
  assert.match(body, /Number\.isInteger\(payload\.exp\)/);
  assert.match(body, /request\.shopifyAuth =/);
});
test('Internal guard uses timing safe comparison and rejects duplicates', () => {
  const body = read('backend/src/internal/internal-auth.guard.ts');
  assert.match(body, /timingSafeEqual/);
  assert.match(body, /Array\.isArray\(rawProvided\)/);
  assert.match(body, /Ambiguous internal API secret/);
});
test('Dedicated negative authentication tests are included', () => {
  assert.match(read('backend/test/shopify-auth.guard.spec.ts'), /without an expiration/);
  assert.match(read('backend/test/internal-auth.guard.spec.ts'), /duplicate secret headers/);
});
