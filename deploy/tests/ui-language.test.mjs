import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { uiTranslate } from '../../app/lib/ui-language.ts';

const ui = readFileSync(new URL('../../app/routes/app._index.tsx', import.meta.url), 'utf8');

test('Italian is available and English remains unchanged', () => {
  assert.equal(uiTranslate('Jobs', 'it'), 'Lavori');
  assert.equal(uiTranslate('Jobs', 'en'), 'Jobs');
  assert.equal(uiTranslate('Translation Operations', 'it'), 'Gestione traduzioni');
});
test('Merchant content and unknown technical identifiers are not translated', () => {
  assert.equal(uiTranslate('gid://shopify/Product/12345', 'it'), 'gid://shopify/Product/12345');
  assert.equal(uiTranslate('CUSTOM_UNKNOWN_STATUS', 'it'), 'CUSTOM_UNKNOWN_STATUS');
});
test('Language selector and persistence exist on the embedded dashboard', () => {
  assert.match(ui, /aca-locale-ui-language/);
  assert.match(ui, /<UiLanguageContext.Provider value=\{language\}>/);
  assert.match(ui, /<option value="it">/);
  assert.match(ui, /<option value="en">/);
});
test('Existing Markets and Operations modules remain present', () => {
  assert.match(ui, /aca-markets-table/);
  assert.match(ui, /activeTab === "operations"/);
  assert.match(ui, /activeTab === "markets"/);
});
