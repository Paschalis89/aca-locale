import type {
  GlossaryProtection,
  ResolvedGlossaryRule,
} from './glossary.types.js';

export function normalizeGlossaryLocale(value: string) {
  return value.trim().replace('_', '-').toLowerCase();
}

export function glossaryLocaleCandidates(locale: string) {
  const normalized = normalizeGlossaryLocale(locale);

  const root = normalized.split('-')[0];

  return normalized === root ? [normalized] : [normalized, root];
}

export function glossaryTermMatches(
  value: string,
  term: string,
  caseSensitive: boolean,
) {
  if (!term) {
    return false;
  }

  return buildGlossaryTermRegex(term, caseSensitive).test(value);
}

export function selectGlossaryRulesForText(
  rules: ResolvedGlossaryRule[],
  sourceValue: string,
  targetLocale: string,
) {
  const localeCandidates = glossaryLocaleCandidates(targetLocale);

  const ranked = rules
    .filter((rule) => glossaryTermMatches(
      sourceValue,
      rule.sourceTerm,
      rule.caseSensitive,
    ))
    .map((rule) => ({
      rule,
      localeRank: glossaryLocaleRank(rule.targetLocale, localeCandidates),
    }))
    .filter((entry) => entry.localeRank >= 0)
    .sort((left, right) => {
      if (left.localeRank !== right.localeRank) {
        return left.localeRank - right.localeRank;
      }

      if (left.rule.sourceTerm.length !== right.rule.sourceTerm.length) {
        return right.rule.sourceTerm.length - left.rule.sourceTerm.length;
      }

      return 0;
    });

  const selected = new Map<string, ResolvedGlossaryRule>();

  for (const { rule } of ranked) {
    const key = [
      rule.sourceTerm.toLocaleLowerCase(),
      rule.ruleType,
    ].join('::');

    if (!selected.has(key)) {
      selected.set(key, rule);
    }
  }

  return Array.from(selected.values());
}

export function protectGlossaryTerms(
  sourceValue: string,
  rules: ResolvedGlossaryRule[],
) {
  let protectedText = sourceValue;

  const protections: GlossaryProtection[] = [];

  const protectableRules = rules
    .filter((rule) =>
      rule.ruleType === 'DO_NOT_TRANSLATE' ||
      rule.ruleType === 'PREFERRED_TRANSLATION',
    )
    .filter((rule) =>
      rule.ruleType !== 'PREFERRED_TRANSLATION' || Boolean(rule.targetTerm),
    )
    .sort((left, right) => right.sourceTerm.length - left.sourceTerm.length);

  for (const [index, rule] of protectableRules.entries()) {
    const replacement =
      rule.ruleType === 'DO_NOT_TRANSLATE'
        ? rule.sourceTerm
        : rule.targetTerm!;

    let token = `__ACA_GLOSSARY_${index}__`;

    let suffix = 0;

    while (protectedText.includes(token)) {
      suffix += 1;
      token = `__ACA_GLOSSARY_${index}_${suffix}__`;
    }

    const next = replaceOutsideStructuralSegments(
      protectedText,
      rule.sourceTerm,
      token,
      rule.caseSensitive,
    );

    if (next === protectedText) {
      continue;
    }

    protectedText = next;

    protections.push({
      token,
      replacement,
      rule,
    });
  }

  return {
    text: protectedText,
    protections,
  };
}

export function restoreGlossaryTerms(
  translatedValue: string,
  protections: GlossaryProtection[],
) {
  let restored = translatedValue;

  for (const protection of protections) {
    restored = restored.split(protection.token).join(protection.replacement);
  }

  return restored;
}

export function formatGlossaryRulesForPrompt(
  rules: ResolvedGlossaryRule[],
) {
  if (rules.length === 0) {
    return [];
  }

  return [
    'Mandatory glossary rules:',
    ...rules.map((rule) => {
      const source = JSON.stringify(rule.sourceTerm);

      if (rule.ruleType === 'DO_NOT_TRANSLATE') {
        return `- DO_NOT_TRANSLATE: keep ${source} unchanged${rule.caseSensitive ? ' with exact case' : ''}.`;
      }

      if (rule.ruleType === 'PREFERRED_TRANSLATION') {
        return `- PREFERRED_TRANSLATION: when translating ${source}, use ${JSON.stringify(rule.targetTerm ?? '')}${rule.caseSensitive ? ' with exact case' : ''}.`;
      }

      return `- FORBIDDEN_TRANSLATION: when translating ${source}, never use ${JSON.stringify(rule.targetTerm ?? '')}.`;
    }),
    'These glossary rules are merchant-approved and override your default terminology choices.',
  ];
}

function glossaryLocaleRank(
  ruleLocale: string,
  localeCandidates: string[],
) {
  const normalizedRuleLocale = normalizeGlossaryLocale(ruleLocale);

  const exactIndex = localeCandidates.indexOf(normalizedRuleLocale);

  if (exactIndex >= 0) {
    return exactIndex;
  }

  return normalizedRuleLocale === '*' ? localeCandidates.length : -1;
}

function replaceOutsideStructuralSegments(
  value: string,
  sourceTerm: string,
  replacement: string,
  caseSensitive: boolean,
) {
  const structuralPattern =
    /(<[^>]*>|\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|https?:\/\/[^\s<>"']+|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b)/giu;

  let result = '';
  let cursor = 0;

  for (const match of value.matchAll(structuralPattern)) {
    const index = match.index ?? 0;

    result += replaceTerm(
      value.slice(cursor, index),
      sourceTerm,
      replacement,
      caseSensitive,
    );

    result += match[0];

    cursor = index + match[0].length;
  }

  result += replaceTerm(
    value.slice(cursor),
    sourceTerm,
    replacement,
    caseSensitive,
  );

  return result;
}

function replaceTerm(
  value: string,
  sourceTerm: string,
  replacement: string,
  caseSensitive: boolean,
) {
  return value.replace(
    buildGlossaryTermRegex(sourceTerm, caseSensitive),
    replacement,
  );
}

function buildGlossaryTermRegex(
  term: string,
  caseSensitive: boolean,
) {
  const escaped = escapeRegex(term);

  const startsWithWord = /^[\p{L}\p{N}_]/u.test(term);
  const endsWithWord = /[\p{L}\p{N}_]$/u.test(term);

  const prefix = startsWithWord ? '(?<![\\p{L}\\p{N}_])' : '';
  const suffix = endsWithWord ? '(?![\\p{L}\\p{N}_])' : '';

  return new RegExp(
    `${prefix}${escaped}${suffix}`,
    caseSensitive ? 'gu' : 'giu',
  );
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
