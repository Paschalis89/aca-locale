import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const src = readFileSync('backend/test/rc-security-resilience.spec.ts', 'utf8');
const script = readFileSync('deploy/rc/aca-rc-final-qa.sh', 'utf8');
test('cross-shop negative path is explicitly exercised', () => {
  assert.match(src, /service\.findOne\(shopB, 'job-a'\)/);
  assert.match(src, /processUpsert\(\{ \.\.\.upsertInput, shopifyDomain: shopB \}\)/);
});
test('completed duplicate and resource mismatch are exercised', () => {
  assert.match(src, /alreadyCompleted: true/);
  assert.match(src, /gid:\/\/shopify\/Product\/999/);
});
test('processing and failed retry branches are exercised', () => {
  assert.match(src, /status: 'PROCESSING'/);
  assert.match(src, /eventHarness\('FAILED'\)/);
  assert.match(src, /6 \* 60 \* 1000/);
});
test('runner does not deploy or mutate production', () => {
  for (const unsafe of [/docker compose.*up/, /docker compose.*down/, /git push/, /prisma migrate/, /curl.*POST/]) {
    assert.doesNotMatch(script, unsafe);
  }
  assert.match(script, /npm run typecheck/);
});
