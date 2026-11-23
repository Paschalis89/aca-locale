/**
 * Fail-closed checks for Shopify HTML sent to / returned from DeepL.
 * Never decode or rewrite user HTML: doing so can change intended text,
 * attributes, Liquid placeholders, and the source digest.
 */
export function assertTranslatableDeepLHtml(source: string): void {
  if (hasEncodedMarkup(source)) {
    throw new Error(
      'Shopify HTML contains escaped markup (&lt;...&gt;). Correct the rich-text source in Shopify before translating; ACA Locale will not auto-decode HTML.',
    );
  }

  if (isOnlyCodeContent(source)) {
    throw new Error(
      'Shopify HTML contains only <code> content. Move prose out of the code block in Shopify before translating.',
    );
  }
}

export function assertSafeDeepLHtmlResult(
  source: string,
  translated: string,
  sourceLocale: string,
  targetLocale: string,
): void {
  if (hasEncodedMarkup(translated)) {
    throw new Error(
      'DeepL returned escaped HTML markup. Translation withheld to prevent publishing literal <p> tags.',
    );
  }

  // A changed tag structure must never be treated as a successful translation.
  // This is a conservative guard, not an HTML parser; the existing deterministic
  // validator remains responsible for full placeholder/HTML validation.
  if (!sameHtmlTags(source, translated)) {
    throw new Error('DeepL changed the HTML tag structure. Translation withheld for review.');
  }

  const sourceLanguage = sourceLocale.split(/[-_]/)[0]?.toLowerCase();
  const targetLanguage = targetLocale.split(/[-_]/)[0]?.toLowerCase();
  const sourceText = visibleText(source);
  const outputText = visibleText(translated);

  // Long prose left untouched is a strong signal of an HTML translation failure.
  // Short labels and proper names are allowed to remain unchanged.
  if (
    sourceLanguage !== targetLanguage &&
    sourceText.length >= 40 &&
    /[A-Za-z\u00c0-\u024f]/u.test(sourceText) &&
    sourceText.toLocaleLowerCase() === outputText.toLocaleLowerCase()
  ) {
    throw new Error(
      'DeepL returned HTML prose identical to the source. Translation withheld rather than marking it successful.',
    );
  }
}

function hasEncodedMarkup(html: string): boolean {
  return /&(?:amp;){0,6}lt;\s*\/?\s*(?:p|div|span|h[1-6]|ul|ol|li|br|strong|em|code|a|blockquote|table|thead|tbody|tr|td|th|pre|img|section|article|b|i)\b[\s\S]{0,300}?&(?:amp;){0,6}gt;/i.test(html);
}

function isOnlyCodeContent(html: string): boolean {
  if (!/<code(?:\s[^>]*)?>/i.test(html)) return false;
  const withoutCode = html.replace(/<code(?:\s[^>]*)?>[\s\S]*?<\/code\s*>/gi, '');
  return visibleText(withoutCode).length === 0;
}

function visibleText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:nbsp|amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tags(html: string): string[] {
  return [...html.matchAll(/<\/?([a-z][\w:-]*)\b[^>]*>/gi)]
    .map((match) => `${match[0].startsWith('</') ? '/' : ''}${match[1].toLowerCase()}`);
}

function sameHtmlTags(a: string, b: string): boolean {
  return JSON.stringify(tags(a)) === JSON.stringify(tags(b));
}
