import test from 'node:test';
import assert from 'node:assert/strict';
import { auditSeoField, seoFieldType, summarizeSeoAudit } from './international-seo.ts';

test('recognizes Shopify meta fields but not ordinary product title', () => {
  assert.equal(seoFieldType('meta_title'), 'TITLE');
  assert.equal(seoFieldType('seo_description'), 'DESCRIPTION');
  assert.equal(seoFieldType('title'), 'OTHER');
});
test('warns when the SEO title is over 60 characters', () => {
  const result = auditSeoField({key:'meta_title', locale:'en', value:'A'.repeat(61)});
  assert.equal(result.status, 'REVIEW');
  assert.equal(result.findings[0].code, 'TITLE_LENGTH');
});
test('warns for short meta descriptions', () => {
  assert.equal(auditSeoField({key:'meta_description',locale:'ja',value:'Short text'}).status, 'REVIEW');
});
test('rejects empty or invalid slug', () => {
  assert.equal(auditSeoField({key:'handle',locale:'en',value:''}).status, 'ERROR');
  assert.equal(auditSeoField({key:'handle',locale:'en',value:'bad slug'}).findings[0].code, 'INVALID_SLUG');
});
test('checks image ALT text without changing the source', () => {
  const value = 'Photo of an artisan plate';
  assert.equal(auditSeoField({key:'image_alt',locale:'en',value}).findings[0].code, 'REDUNDANT_ALT');
  assert.equal(value, 'Photo of an artisan plate');
});
test('does not label unknown field keys as SEO errors', () => {
  assert.equal(auditSeoField({key:'body_html',locale:'en',value:''}).status, 'NOT_APPLICABLE');
});
test('counts findings only from relevant fields', () => {
  const result = summarizeSeoAudit([{key:'meta_title',locale:'en',value:'Sample optimized title for a handcrafted ceramic plate'}, {key:'body_html',locale:'en',value:''}]);
  assert.equal(result.evaluated, 1);
  assert.equal(result.passing, 1);
});
