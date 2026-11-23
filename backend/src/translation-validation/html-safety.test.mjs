import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectShopifyHtml } from './html-safety.ts';

test('clean paragraph is safe', () => assert.deepEqual(inspectShopifyHtml('<p>Handmade plate</p>', {source:true}), []));
test('escaped comparison is not encoded HTML markup', () => assert.deepEqual(inspectShopifyHtml('<p>2 &lt; 3</p>'), []));
test('encoded paragraph is unsafe', () => assert.ok(inspectShopifyHtml('<p>&lt;p&gt;Text&lt;/p&gt;</p>').some(x => x.code === 'HTML_ESCAPED_MARKUP')));
test('double-encoded paragraph is unsafe', () => assert.ok(inspectShopifyHtml('<p>&amp;lt;p&amp;gt;Text&amp;lt;/p&amp;gt;</p>').some(x => x.code === 'HTML_ESCAPED_MARKUP')));
test('code-only source is unsafe', () => assert.ok(inspectShopifyHtml('<p><code>Only code</code></p>', {source:true}).some(x => x.code === 'HTML_CODE_ONLY')));
test('inline code alongside prose is safe', () => assert.deepEqual(inspectShopifyHtml('<p>Try <code>npm test</code> now.</p>', {source:true}), []));
test('mismatched closing tags unsafe', () => assert.ok(inspectShopifyHtml('<p><strong>bad</p></strong>').some(x => x.code === 'HTML_UNBALANCED_TAGS')));
test('script is unsafe', () => assert.ok(inspectShopifyHtml('<p>Hey</p><script>alert(1)</script>').some(x => x.code === 'HTML_UNSAFE_TAG')));
