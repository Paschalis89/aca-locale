export type SeoInput = {
  key: string;
  locale: string;
  value: string;
  resourceType?: string;
};

export type SeoFinding = {
  code: string;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  message: string;
};

export type SeoAudit = {
  field: 'TITLE' | 'DESCRIPTION' | 'HANDLE' | 'ALT' | 'OTHER';
  length: number;
  status: 'PASS' | 'REVIEW' | 'ERROR' | 'NOT_APPLICABLE';
  findings: SeoFinding[];
};

export const seoFieldType = (key: string): SeoAudit['field'] => {
  const normalized = key.trim().toLowerCase();
  if (/(^|[._-])(meta[_-]?title|seo[_-]?title|title[_-]?tag)([._-]|$)/.test(normalized)) return 'TITLE';
  if (/(^|[._-])(meta[_-]?description|seo[_-]?description)([._-]|$)/.test(normalized)) return 'DESCRIPTION';
  if (/(^|[._-])(handle|slug)([._-]|$)/.test(normalized)) return 'HANDLE';
  if (/(^|[._-])(alt|alt[_-]?text|image[_-]?alt)([._-]|$)/.test(normalized)) return 'ALT';
  return 'OTHER';
};

const stripMarkup = (text: string) => text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

export function auditSeoField(input: SeoInput): SeoAudit {
  const field = seoFieldType(input.key);
  const value = input.value.trim();
  const visible = stripMarkup(value);
  const length = [...visible].length;
  const findings: SeoFinding[] = [];
  const warn = (code: string, message: string) => findings.push({ code, severity: 'WARNING', message });
  const error = (code: string, message: string) => findings.push({ code, severity: 'ERROR', message });
  if (field === 'OTHER') return { field, length, status: 'NOT_APPLICABLE', findings };
  if (!value) error('EMPTY_VALUE', 'No translated value available for this SEO field.');
  if (field === 'TITLE' && value) {
    if (length > 60) warn('TITLE_LENGTH', 'Long SEO title (over 60 characters); search results may truncate it.');
    if (length < 25) warn('SHORT_TITLE', 'Very short SEO title (under 25 characters); review relevance.');
  }
  if (field === 'DESCRIPTION' && value) {
    if (length > 160) warn('DESCRIPTION_LENGTH', 'Meta description exceeds 160 characters; search results may truncate it.');
    if (length < 70) warn('SHORT_DESCRIPTION', 'Short meta description (under 70 characters); review relevance.');
  }
  if (field === 'HANDLE' && value) {
    if (/\s/.test(value) || /[?#]/.test(value)) error('INVALID_SLUG', 'Slug contains whitespace or URL query/fragment characters.');
    if (/[A-Z]/.test(value)) warn('SLUG_CASE', 'Consider lowercase characters for a consistent URL.');
    if (value.length > 90) warn('LONG_SLUG', 'Long slug; consider a shorter, descriptive handle.');
  }
  if (field === 'ALT' && value) {
    if (length > 125) warn('LONG_ALT', 'ALT text exceeds 125 characters; consider a concise description.');
    if (/^(image|photo|picture) of\b/i.test(visible)) warn('REDUNDANT_ALT', 'ALT text starts with a redundant image label.');
  }
  return { field, length, status: findings.some(f => f.severity === 'ERROR') ? 'ERROR' : findings.length ? 'REVIEW' : 'PASS', findings };
}

export function summarizeSeoAudit(rows: Array<{ key: string; locale: string; value: string; resourceType?: string }>) {
  const relevant = rows.map(row => ({ ...row, audit: auditSeoField(row) })).filter(row => row.audit.field !== 'OTHER');
  return {
    evaluated: relevant.length,
    passing: relevant.filter(row => row.audit.status === 'PASS').length,
    review: relevant.filter(row => row.audit.status === 'REVIEW').length,
    errors: relevant.filter(row => row.audit.status === 'ERROR').length,
    rows: relevant,
  };
}
