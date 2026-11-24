import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const service = read('backend/src/operations/operations.service.ts');
const controller = read('backend/src/operations/operations.controller.ts');
const gateway = read('app/routes/api.backend.operations.ts');
const ui = read('app/routes/app._index.tsx');

test('operations endpoint authenticates Shopify ID token and takes tenant from verified context', () => {
  assert.match(controller, /@UseGuards\(ShopifyAuthGuard\)/);
  assert.match(controller, /@CurrentShop\(\) shop: ShopifyAuthContext/);
  assert.match(controller, /this\.service\.snapshot\(shop\.shopDomain\)/);
  assert.doesNotMatch(controller, /@Query|@Param|@Body/);
});
test('all database queries remain tenant-scoped and return aggregate data', () => {
  assert.match(service, /findUnique\(\{\s*where: \{ shopifyDomain \}/);
  assert.match(service, /const shopId = shop\.id/);
  assert.match(service, /where: \{ shopId, status: 'FAILED' \}/);
  assert.match(service, /where: \{ job: \{ shopId \}, status: 'FAILED' \}/);
  assert.match(service, /where: \{ shopId, provider: provider\.provider, success: true/);
  assert.doesNotMatch(service, /errorMessage|sourceValue|translatedValue|approvedValue/);
});
test('provider recovery requires a newer successful event than latest error', () => {
  assert.match(service, /success\.createdAt > error\.createdAt/);
  assert.match(service, /'RECOVERED' : 'DEGRADED'/);
  assert.match(service, /providerList\.length === 0 \? 'UNKNOWN'/);
});
test('web gateway denies missing token, does not cache and has timeout', () => {
  assert.match(gateway, /status: 401/);
  assert.match(gateway, /Authorization: authorization/);
  assert.match(gateway, /Cache-Control': 'no-store'/);
  assert.match(gateway, /AbortSignal\.timeout\(8000\)/);
});
test('dashboard has an operations tab, manual refresh and safe no-data messaging', () => {
  assert.match(ui, /id: "operations", label: "Operations"/);
  assert.match(ui, /activeTab === "operations"/);
  assert.match(ui, /Refresh snapshot/);
  assert.match(ui, /Availability is unknown/);
});
