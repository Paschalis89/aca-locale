import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeDeepLHtmlResult, assertTranslatableDeepLHtml } from './deepl-html-guard.ts';

const source = '<p>Questo piatto in ceramica è realizzato a mano da artigiani della Costiera Amalfitana.</p>';
const english = '<p>This ceramic plate is handmade by artisans from the Amalfi Coast.</p>';

test('allows real HTML and translated prose without rewriting markup', () => {
  assert.doesNotThrow(() => assertTranslatableDeepLHtml(source));
  assert.doesNotThrow(() => assertSafeDeepLHtmlResult(source, english, 'it', 'en'));
});
test('blocks code-only descriptions before requesting DeepL', () => {
  assert.throws(() => assertTranslatableDeepLHtml('<p><code>Descrizione prodotto in italiano</code></p>'), /code block/);
});
test('blocks double-escaped HTML source', () => {
  assert.throws(() => assertTranslatableDeepLHtml('<p>&lt;p&gt;Testo italiano&lt;/p&gt;</p>'), /escaped markup/);
});
test('blocks double-escaped HTML output', () => {
  assert.throws(() => assertSafeDeepLHtmlResult(source, '<p>&lt;p&gt;Hello&lt;/p&gt;</p>', 'it', 'en'), /escaped HTML markup/);
});
test('blocks unchanged long prose in a different language', () => {
  assert.throws(() => assertSafeDeepLHtmlResult(source, source, 'it', 'en'), /identical to the source/);
});
test('allows unchanged short product names and same-language content', () => {
  assert.doesNotThrow(() => assertSafeDeepLHtmlResult('<p>Vietri</p>', '<p>Vietri</p>', 'it', 'en'));
  assert.doesNotThrow(() => assertSafeDeepLHtmlResult(source, source, 'it', 'it'));
});
test('blocks modified HTML tags but preserves valid inline formatting', () => {
  assert.throws(() => assertSafeDeepLHtmlResult(source, '<div>Hello</div>', 'it', 'en'), /tag structure/);
  assert.doesNotThrow(() => assertSafeDeepLHtmlResult('<p><strong>Bellissimo piatto di ceramica</strong></p>', '<p><strong>Beautiful ceramic plate</strong></p>', 'it', 'en'));
});
