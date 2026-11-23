/** Fail-closed identity checks for Shopify translation source read-back. */
export function verifySourceIdentity(
  expected: { resourceId: string; sourceLocale: string; fieldKey: string },
  actual: { resourceId?: string | null; translatableContent?: Array<{ key?: string; locale?: string | null; digest?: string | null; value?: string | null }> } | null | undefined,
): { ok: true; content: { key?: string; locale?: string | null; digest?: string | null; value?: string | null } } | { ok: false; code: string } {
  if (!actual || actual.resourceId !== expected.resourceId) return { ok: false, code: "SOURCE_RESOURCE_MISMATCH" };
  const content = actual.translatableContent?.find(c => c.key === expected.fieldKey);
  if (!content) return { ok: false, code: "SOURCE_FIELD_MISSING" };
  if (content.locale !== expected.sourceLocale) return { ok: false, code: "SOURCE_LOCALE_MISMATCH" };
  if (!content.digest) return { ok: false, code: "SOURCE_DIGEST_MISSING" };
  return { ok: true, content };
}
