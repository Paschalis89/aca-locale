import {
  glossaryTermMatches,
  protectGlossaryTerms,
  restoreGlossaryTerms,
  selectGlossaryRulesForText,
} from './glossary-rule.utils.js';

import type { ResolvedGlossaryRule } from './glossary.types.js';

const rule = (
  overrides: Partial<ResolvedGlossaryRule>,
): ResolvedGlossaryRule => ({
  id: 'rule-1',
  glossaryId: 'glossary-1',
  glossaryName: 'Master Glossary',
  sourceTerm: 'Vietri',
  targetLocale: '*',
  targetTerm: null,
  ruleType: 'DO_NOT_TRANSLATE',
  caseSensitive: false,
  notes: null,
  ...overrides,
});

describe('glossary rule utilities', () => {
  it('matches whole terms without matching substrings', () => {
    expect(glossaryTermMatches('Ceramics from Vietri', 'Vietri', false)).toBe(true);
    expect(glossaryTermMatches('A vietri collection', 'Vietri', false)).toBe(true);
    expect(glossaryTermMatches('vietrified', 'Vietri', false)).toBe(false);
  });

  it('respects case-sensitive rules', () => {
    expect(glossaryTermMatches('ACA collection', 'ACA', true)).toBe(true);
    expect(glossaryTermMatches('aca collection', 'ACA', true)).toBe(false);
  });

  it('prefers an exact target locale over wildcard rules', () => {
    const selected = selectGlossaryRulesForText(
      [
        rule({ id: 'wildcard', sourceTerm: 'Handmade', targetLocale: '*', targetTerm: 'Generic', ruleType: 'PREFERRED_TRANSLATION' }),
        rule({ id: 'italian', sourceTerm: 'Handmade', targetLocale: 'it', targetTerm: 'Fatto a mano', ruleType: 'PREFERRED_TRANSLATION' }),
      ],
      'Handmade bowl',
      'it-IT',
    );

    expect(selected).toHaveLength(1);
    expect(selected[0]?.id).toBe('italian');
  });

  it('protects preferred and do-not-translate terms and restores merchant-approved output', () => {
    const protectedInput = protectGlossaryTerms(
      'Handmade ceramic from Vietri',
      [
        rule({ id: 'preferred', sourceTerm: 'Handmade', targetLocale: 'it', targetTerm: 'Fatto a mano', ruleType: 'PREFERRED_TRANSLATION' }),
        rule({ id: 'protected', sourceTerm: 'Vietri', targetLocale: '*', targetTerm: null, ruleType: 'DO_NOT_TRANSLATE' }),
      ],
    );

    expect(protectedInput.text).not.toContain('Handmade');
    expect(protectedInput.text).not.toContain('Vietri');
    expect(protectedInput.protections).toHaveLength(2);

    const restored = restoreGlossaryTerms(
      protectedInput.text,
      protectedInput.protections,
    );

    expect(restored).toBe('Fatto a mano ceramic from Vietri');
  });

  it('does not rewrite terms inside URLs or HTML tags', () => {
    const protectedInput = protectGlossaryTerms(
      '<a href="https://example.com/Vietri">Vietri</a>',
      [rule({ sourceTerm: 'Vietri' })],
    );

    expect(protectedInput.text).toContain('https://example.com/Vietri');
    expect(protectedInput.text).toMatch(/>__ACA_GLOSSARY_0__<\/a>/);
  });

  it('does not protect forbidden terms before provider execution', () => {
    const protectedInput = protectGlossaryTerms(
      'Handmade bowl',
      [
        rule({
          sourceTerm: 'Handmade',
          targetLocale: 'it',
          targetTerm: 'artigianale',
          ruleType: 'FORBIDDEN_TRANSLATION',
        }),
      ],
    );

    expect(protectedInput.text).toBe('Handmade bowl');
    expect(protectedInput.protections).toHaveLength(0);
  });
});
