import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src=readFileSync(new URL('../../app/routes/app._index.tsx',import.meta.url),'utf8');
test('Languages navigation item removed',()=>assert.doesNotMatch(src,/id: "languages", label: "Languages"/));
test('sync moved into markets section',()=>{
const markets=src.indexOf('{activeTab === "markets" ? (');
const sync=src.indexOf('label="Sync Shopify configuration"');
const core=src.indexOf('{activeTab === "ai-core" ? (');
assert.ok(markets>=0&&sync>markets&&sync<core);
});
test('languages displayed from live Shopify locales',()=>assert.match(src,/liveLocales\.map\(item/));
test('successful sync has user-visible timestamp',()=>assert.match(src,/Last successful configuration sync in this session/));
