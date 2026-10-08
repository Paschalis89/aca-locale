import { DeepLTranslationAdapter } from './deepl-translation.adapter.js';

import type { ResolvedGlossaryRule } from '../glossary/glossary.types.js';

const baseRule = (
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

describe('DeepLTranslationAdapter glossary integration', () => {
  it('protects required glossary terms before DeepL and restores them afterwards', async () => {
    const deepL = {
      translate: vi.fn().mockImplementation(async (input: { text: string }) => ({
        text: input.text,
        billedCharacters: 20,
      })),
    } as any;

    const adapter = new DeepLTranslationAdapter(deepL);

    const result = await adapter.translate({
      text: 'Handmade ceramic from Vietri',
      sourceLocale: 'en',
      targetLocale: 'it',
      glossaryRules: [
        baseRule({
          sourceTerm: 'Handmade',
          targetLocale: 'it',
          targetTerm: 'Fatto a mano',
          ruleType: 'PREFERRED_TRANSLATION',
        }),
        baseRule({
          sourceTerm: 'Vietri',
          ruleType: 'DO_NOT_TRANSLATE',
        }),
      ],
    });

    const sentText = deepL.translate.mock.calls[0][0].text as string;

    expect(sentText).toContain('__ACA_GLOSSARY_');
    expect(sentText).not.toContain('Handmade');
    expect(sentText).not.toContain('Vietri');
    expect(result.text).toContain('Fatto a mano');
    expect(result.text).toContain('Vietri');
  });
});
