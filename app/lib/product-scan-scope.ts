/** Canonical, unambiguous Shopify PRODUCT resource identifier.
 * Shopify Admin URLs are accepted only from admin.shopify.com and, when
 * expectedShop is supplied, only for the authenticated shop.
 */
export function normalizeProductId(value: string, expectedShop?: string): string | null {
  const input = value.trim();
  if (/^[1-9]\d{0,19}$/.test(input)) return `gid://shopify/Product/${input}`;
  if (/^gid:\/\/shopify\/Product\/[1-9]\d{0,19}$/.test(input)) return input;

  if (!input.startsWith('https://')) return null;
  let url: URL;
  try { url = new URL(input); } catch { return null; }
  if (url.origin !== 'https://admin.shopify.com' || url.username || url.password || url.hash) return null;
  const match = url.pathname.match(/^\/store\/([a-z0-9][a-z0-9-]*)\/products\/([1-9]\d{0,19})\/?$/i);
  if (!match) return null;
  if (expectedShop) {
    const expectedSlug = expectedShop.toLowerCase().replace(/\.myshopify\.com$/, '');
    if (match[1].toLowerCase() !== expectedSlug) return null;
  }
  return `gid://shopify/Product/${match[2]}`;
}
