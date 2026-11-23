import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const src = readFileSync(new URL('../../app/routes/app._index.tsx', import.meta.url), 'utf8');
test('review queue identifies resource and job per item', () => {
  assert.match(src, /Resource: \{item\.field\?\.resource\?\.shopifyResourceId/);
  assert.match(src, /Job: \{job\.id\}/);
});
test('detail panel identifies the exact resource and item', () => {
  assert.match(src, /Shopify resource identity/);
  assert.match(src, /Item: \{selectedItem\.id\}/);
});
test('publish requires resource ID and user confirmation', () => {
  assert.match(src, /if \(!resourceId\)/);
  assert.match(src, /if \(!window\.confirm\(confirmation\)\) return/);
  assert.match(src, /await runAction\(\s*"publish-item"/);
});
