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
