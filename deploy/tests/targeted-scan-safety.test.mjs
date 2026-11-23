import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
test('targeted GraphQL uses a single resource and not a paginated catalog query', () => {
 const scanner = read('app/lib/shopify-translation-scanner.server.ts');
 assert.match(scanner, /translatableResource\(resourceId: \$resourceId\)/);
 assert.match(scanner, /resource\.resourceId !== resourceId/);
});
test('targeted Shopify scan never sets completeScan=true', () => {
 const route = read('app/routes/api.shopify.translatable-resources.ts');
 assert.match(route, /completeScan: !targeted/);
 assert.match(route, /scopedResourceId: productId/);
 assert.match(route, /fetchSingleProductTranslationResource/);
});
test('Nest scanner rejects mismatched scoped payload', () => {
 const service = read('backend/src/translation-scanner/translation-scanner.service.ts');
 assert.match(service, /scan\.resources\.length !== 1/);
 assert.match(service, /scan\.resources\[0\]\?\.resourceId !== scan\.scopedResourceId/);
});
test('targeted jobs include a product GID in Prisma filtering', () => {
 const service = read('backend/src/translation-jobs/translation-jobs.service.ts');
 assert.match(service, /shopifyResourceId: body\.shopifyProductId/);
 assert.match(service, /resourceTypes\[0\] !== 'PRODUCT'/);
});
test('safe QA mode is selected by default', () => {
 const ui = read('app/routes/app._index.tsx');
 assert.match(ui, /useState\(true\).*?targetedProductScan|\[targetedProductScan, setTargetedProductScan\] = useState\(true\)/);
});
