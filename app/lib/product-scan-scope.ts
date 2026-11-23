/** Canonical, unambiguous Shopify PRODUCT resource identifier. */
export function normalizeProductId(value: string): string | null {
  const id = value.trim();
  if (/^[1-9]\d{0,19}$/.test(id)) return `gid://shopify/Product/${id}`;
  if (/^gid:\/\/shopify\/Product\/[1-9]\d{0,19}$/.test(id)) return id;
  return null;
}
