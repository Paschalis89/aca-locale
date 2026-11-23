/**
 * Conservative guards for Shopify HTML. Never decode or rewrite user content.
 * Match only encoded *tags*, not ordinary escaped comparisons such as 2 &lt; 3.
 */
const ENCODED_TAG = /&(?:amp;){0,6}lt;\s*\/?\s*(?:p|div|span|h[1-6]|ul|ol|li|br|strong|em|code|a|blockquote|table|thead|tbody|tr|td|th|pre|img|section|article|b|i)\b[\s\S]{0,300}?&(?:amp;){0,6}gt;/i;
const TAG = /<\/?([a-z][\w:-]*)\b[^>]*>/gi;
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const BLOCKED_RAW_TAGS = /<(?:script|iframe|object|embed|form)(?=[\s/>])/i;

export type HtmlSafetyProblem = { code: 'HTML_ESCAPED_MARKUP' | 'HTML_CODE_ONLY' | 'HTML_UNBALANCED_TAGS' | 'HTML_UNSAFE_TAG'; message: string };

export function inspectShopifyHtml(value: string, options: { source?: boolean } = {}): HtmlSafetyProblem[] {
  const issues: HtmlSafetyProblem[] = [];
  if (ENCODED_TAG.test(value)) {
    issues.push({ code: 'HTML_ESCAPED_MARKUP', message: 'HTML tags are encoded as text. Correct the source in Shopify; ACA Locale never auto-decodes markup.' });
  }
  if (BLOCKED_RAW_TAGS.test(value)) {
    issues.push({ code: 'HTML_UNSAFE_TAG', message: 'HTML contains an unsafe active-content tag.' });
  }
  if (options.source && /<code(?:\s[^>]*)?>/i.test(value)) {
    const outside = value.replace(/<code(?:\s[^>]*)?>[\s\S]*?<\/code\s*>/gi, '').replace(/<[^>]*>/g, '').replace(/\s|&nbsp;/gi, '');
    if (!outside) {
      issues.push({ code: 'HTML_CODE_ONLY', message: 'The HTML contains only code content, not translatable prose.' });
    }
  }

  // A bounded, deterministic structural check. It deliberately does not parse,
  // normalize or modify the value; unsupported templating syntax is untouched.
  const stack: string[] = [];
  for (const match of value.matchAll(TAG)) {
    const name = match[1].toLowerCase();
    const raw = match[0];
    if (VOID_TAGS.has(name) || raw.endsWith('/>')) continue;
    if (raw.startsWith('</')) {
      if (stack.pop() !== name) {
        issues.push({ code: 'HTML_UNBALANCED_TAGS', message: 'Closing HTML tags do not match the opening structure.' });
        break;
      }
    } else stack.push(name);
  }
  if (stack.length && !issues.some(issue => issue.code === 'HTML_UNBALANCED_TAGS')) {
    issues.push({ code: 'HTML_UNBALANCED_TAGS', message: 'HTML contains unclosed tags.' });
  }
  return issues;
}
