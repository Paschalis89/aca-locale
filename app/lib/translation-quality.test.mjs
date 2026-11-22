import assert from 'node:assert/strict';
import test from 'node:test';
import { qualitySnapshot } from './translation-quality.ts';

test('unknown validation remains unscored, never interpreted as success', () => {
  const result = qualitySnapshot({ validationErrors: 0, validationWarnings: 0 });
  assert.equal(result.state, 'NOT_CHECKED');
  assert.equal(result.score, null);
});

test('critical placeholder mismatch is blocked regardless of warning total', () => {
  const result = qualitySnapshot({ validationPassed: false, validationErrors: 1, validationWarnings: 0, validationIssues: [{ code: 'LIQUID_TOKEN_MISMATCH', severity: 'ERROR', message: 'Liquid mismatch' }] });
  assert.equal(result.state, 'BLOCKED');
  assert.ok(result.score <= 49);
  assert.equal(result.issues[0].group, 'Placeholders & Liquid');
});

test('warnings require review, no warnings produce pass', () => {
  assert.equal(qualitySnapshot({ validationPassed: true, validationWarnings: 2 }).state, 'REVIEW');
  assert.equal(qualitySnapshot({ validationPassed: true, validationWarnings: 0 }).state, 'PASSED');
});

test('malformed JSON is bounded and ignored rather than rendered', () => {
  const result = qualitySnapshot({ validationPassed: true, validationIssues: [{ code: '<script>', severity: 'ERROR', message: 'bad' }, null, { code: 'GLOSSARY_FORBIDDEN_TERM_USED', severity: 'WARNING', message: 'Term used' }] });
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].group, 'Terminology');
});
