import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { compareShopifyTranslation, readBackShopifyTranslation } from '../../app/lib/shopify-publication-verification.server.ts';
const input = { resourceId: 'gid://shopify/Product/11593966518599', fieldKey: 'body_html', locale: 'en', approvedValue: '<p>Hand painted ceramic plate.</p>' };
const translation = { key: 'body_html', locale: 'en', value: input.approvedValue, outdated: false, market: null };
test('verified: exact global translation', () => {
  const r = compareShopifyTranslation(input, [translation]);
  assert.equal(r.status, 'VERIFIED');
  assert.equal(r.actualValue, input.approvedValue);
});
test('mismatch: decoded or changed HTML is never silently normalized', () => {
  const r = compareShopifyTranslation(input, [{...translation,value:'<p>&lt;p&gt;Hand painted ceramic plate.&lt;/p&gt;</p>'}]);
  assert.equal(r.status, 'MISMATCH');
});
test('mismatch: outdated translation', () => assert.equal(compareShopifyTranslation(input,[{...translation,outdated:true}]).status,'MISMATCH'));
test('mismatch: missing global translation, even if market-specific exists', () => assert.equal(compareShopifyTranslation(input,[{...translation,market:{id:'gid://shopify/Market/1'}}]).status,'MISMATCH'));
test('failed: malformed Shopify response is not a verified translation', () => assert.equal(compareShopifyTranslation(input,undefined).status,'VERIFICATION_FAILED'));
test('failed: duplicate global rows do not produce a false verification', () => assert.equal(compareShopifyTranslation(input,[translation,translation]).status,'MISMATCH'));
test('read-back: query Shopify, verify result, never mutate', async () => {
  const calls=[];
  const admin={graphql: async (query,args) => { calls.push([query,args]); return {json:async()=>({data:{translatableResource:{resourceId:input.resourceId,translations:[translation]}}})}; }};
  assert.equal((await readBackShopifyTranslation(admin,input)).status,'VERIFIED');
  assert.equal(calls.length,1);
  assert.match(calls[0][0],/query AcaLocaleVerifyPublication/);
  assert.doesNotMatch(calls[0][0],/mutation/);
  assert.deepEqual(calls[0][1].variables,{resourceId:input.resourceId,locale:'en'});
});
test('read-back: Shopify GraphQL errors yield verification_failed', async () => {
  const admin={graphql:async()=>({json:async()=>({errors:[{message:'access denied'}]})})};
  assert.equal((await readBackShopifyTranslation(admin,input)).status,'VERIFICATION_FAILED');
});
test('read-back: a missing resource yields verification_failed', async () => {
  const admin={graphql:async()=>({json:async()=>({data:{translatableResource:null}})})};
  assert.equal((await readBackShopifyTranslation(admin,input)).status,'VERIFICATION_FAILED');
});
test('read-only endpoint requires published state and resource identity', () => {
  const route=readFileSync(new URL('../../app/routes/api.shopify.translation-jobs.$jobId.items.$itemId.verify.ts',import.meta.url),'utf8');
  assert.match(route,/item\.status !== "PUBLISHED"/);
  assert.match(route,/item\.approvedValue/);
  assert.match(route,/authenticate\.admin\(request\)/);
  assert.match(route,/"Cache-Control": "no-store"/);
  assert.doesNotMatch(route,/translationsRegister|publication\/confirm/);
});
