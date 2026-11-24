import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const route = readFileSync(new URL('../../app/routes/webhooks.app.scopes_update.tsx', import.meta.url), 'utf8');
const changes = readFileSync(new URL('../../app/routes/webhooks.translation-content.ts', import.meta.url), 'utf8');
test('scope update first authenticates with official Shopify webhook verifier', () => {
  assert.match(route, /await authenticate\.webhook\(request\)/);
  assert.ok(route.indexOf('authenticate.webhook(request)') < route.indexOf('db.session.updateMany'));
});
test('scope update is idempotent when the session was removed', () => {
  assert.match(route, /if \(!session\) return new Response\(null, \{ status: 200 \}\)/);
  assert.match(route, /db\.session\.updateMany/);
});
test('scope update validates and bounds the source of session mutation', () => {
  assert.match(route, /Array\.isArray\(current\)/);
  assert.match(route, /where: \{ id: session\.id, shop: session\.shop \}/);
});
test('content-change route distinguishes in-flight duplicates from completed ones', () => {
  assert.match(changes, /shouldRetryProcessingWebhookClaim\(claim\)/);
  assert.match(changes, /status: 503/);
  assert.match(changes, /status: 200/);
});
