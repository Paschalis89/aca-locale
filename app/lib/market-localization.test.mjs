import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMarketLocalizationRows, normalizeLocale, summarizeLocalization } from './market-localization.ts';

const markets = [{
  id: 'gid://shopify/Market/1', name: 'North America', status: 'ACTIVE',
  webPresences: { nodes: [{
    defaultLocale: { locale: 'en' },
    alternateLocales: [{ locale: 'fr-CA' }],
    rootUrls: [{ locale: 'en', url: 'https://example.com/en' }],
  }] },
}];
const locales = [
  { locale: 'en', published: true },
  { locale: 'fr-CA', published: false },
];
const jobs = [
  { targetLocale: 'en', status: 'COMPLETED' },
  { targetLocale: 'fr_CA', status: 'FAILED' },
  { targetLocale: 'ja', status: 'COMPLETED' },
];

test('normalizes Shopify and job locale identifiers without guessing regions', () => {
  assert.equal(normalizeLocale('fr_CA'), 'fr-ca');
  assert.equal(normalizeLocale('ja'), 'ja');
  assert.equal(normalizeLocale(null), '');
});
test('uses explicit web presence locales and publisher status', () => {
  const [row] = makeMarketLocalizationRows(markets, locales, jobs);
  assert.deepEqual(row.locales, ['en', 'fr-ca']);
  assert.deepEqual(row.publishedLocales, ['en']);
  assert.deepEqual(row.unpublishedLocales, ['fr-ca']);
  assert.equal(row.jobCount, 2);
  assert.equal(row.completedJobCount, 1);
});
test('does not fabricate market country or domain from market name', () => {
  const [row] = makeMarketLocalizationRows(markets, locales, jobs);
  assert.deepEqual(row.rootUrls, ['https://example.com/en']);
  assert.equal('countryCode' in row, false);
});
test('markets without web presence are unknown, not automatically untranslated', () => {
  const [row] = makeMarketLocalizationRows([{ id: 'x', name: 'Japan', status: 'ACTIVE' }], locales, jobs);
  assert.equal(row.localization, 'NO_WEB_PRESENCE');
  assert.equal(row.jobCount, 0);
  assert.deepEqual(row.locales, []);
});
test('keeps unmatched job locales separate from market coverage', () => {
  const result = summarizeLocalization(markets, locales, jobs);
  assert.equal(result.jobsWithoutMarketLocale, 1);
  assert.equal(result.jobsWithMarketLocale, 2);
});
test('never treats completion of job as published translation', () => {
  const [row] = makeMarketLocalizationRows(markets, locales, jobs);
  assert.equal(row.completedJobCount, 1);
  assert.equal('publishedTranslationCount' in row, false);
});
test('filters unsafe/unknown URLs and does not fabricate route', () => {
  const [row] = makeMarketLocalizationRows([{
    id: 'x', name: 'Other', webPresences: { nodes: [{rootUrls:[{locale: 'en', url: 'javascript:alert(1)'}, {locale: 'en', url: 'https://example.com/en'}]}] },
  }], locales, jobs);
  assert.deepEqual(row.rootUrls, ['https://example.com/en']);
});
