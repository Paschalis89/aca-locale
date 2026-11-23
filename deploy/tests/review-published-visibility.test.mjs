import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const ui = readFileSync(new URL('../../app/routes/app._index.tsx', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../../backend/src/translation-jobs/translation-jobs.service.ts', import.meta.url), 'utf8');
test('explicit history statuses are selectable in UI and accepted by server', () => {
  for (const state of ['APPROVED','PUBLISHED','REJECTED']) {
    assert.match(ui, new RegExp(`<option value="${state}">`));
    assert.match(backend, new RegExp(`'${state}'`));
  }
});
test('ALL remains actionable and still uses authenticated shopId', () => {
  assert.match(backend, /actionableStatuses = \['VALIDATED', 'NEEDS_REVIEW'\]/);
  assert.match(backend, /job: \{ shopId: shop\.id,/);
});
test('bulk select does not select completed translations', () => {
  assert.match(ui, /visibleIds = filteredReviewQueue\.filter\(\(\{ item \}\) => \(item\.status === "VALIDATED" \|\| item\.status === "NEEDS_REVIEW"\)/);
});
