import test from "node:test";
import assert from "node:assert/strict";
import { normalizeProductId } from "./product-scan-scope.ts";

test("accepts a numeric Shopify Product ID", () => {
  assert.equal(normalizeProductId(" 1234567890 "), "gid://shopify/Product/1234567890");
});
test("accepts an exact Product GID", () => {
  assert.equal(normalizeProductId("gid://shopify/Product/12345"), "gid://shopify/Product/12345");
});
test("rejects other resource types and malformed IDs", () => {
  for (const input of ["", "0", "-1", "1/2", "gid://shopify/ProductVariant/1", "gid://shopify/Product/1/other", "https://shopify.com/1", "123abc"]) {
    assert.equal(normalizeProductId(input), null, input);
  }
});
test('accepts a full Shopify Admin product URL', () => {
  const url = 'https://admin.shopify.com/store/f84c20-60/products/11593966518599';
  assert.equal(normalizeProductId(url), 'gid://shopify/Product/11593966518599');
  assert.equal(normalizeProductId(url + '?foo=bar', 'f84c20-60.myshopify.com'), 'gid://shopify/Product/11593966518599');
});
test('rejects admin links belonging to another shop', () => {
  const url = 'https://admin.shopify.com/store/other-shop/products/11593966518599';
  assert.equal(normalizeProductId(url, 'f84c20-60.myshopify.com'), null);
});
test('rejects lookalike hosts, non-product routes and invalid URLs', () => {
  for (const url of [
    'https://admin.shopify.com.evil.example/store/f84c20-60/products/123',
    'http://admin.shopify.com/store/f84c20-60/products/123',
    'https://admin.shopify.com/store/f84c20-60/collections/123',
    'https://admin.shopify.com/store/f84c20-60/products/123/variants',
    'https://admin.shopify.com/store/f84c20-60/products/0',
    'https://admin.shopify.com/store/f84c20-60/products/123#fragment',
    'https://admin.shopify.com@evil.example/store/f84c20-60/products/123',
  ]) assert.equal(normalizeProductId(url, 'f84c20-60.myshopify.com'), null, url);
});
