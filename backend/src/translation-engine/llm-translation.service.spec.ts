import { LlmTranslationService } from './llm-translation.service.js';

import type { ResolvedGlossaryRule } from '../glossary/glossary.types.js';

describe('LlmTranslationService glossary prompt', () => {
  it('adds mandatory glossary instructions to the provider prompt', () => {
    const service = new LlmTranslationService({} as any);

    const glossaryRules: ResolvedGlossaryRule[] = [
      {
        id: 'g1',
        glossaryId: 'glossary-1',
        glossaryName: 'Master Glossary',
        sourceTerm: 'ACA',
        targetLocale: '*',
        targetTerm: null,
        ruleType: 'DO_NOT_TRANSLATE',
        caseSensitive: true,
        notes: null,
      },
      {
        id: 'g2',
        glossaryId: 'glossary-1',
        glossaryName: 'Master Glossary',
        sourceTerm: 'Handmade',
        targetLocale: 'it',
        targetTerm: 'Fatto a mano',
        ruleType: 'PREFERRED_TRANSLATION',
        caseSensitive: false,
        notes: null,
      },
    ];

    const prompt = (service as any).buildUserPrompt({
      text: 'ACA Handmade bowl',
      sourceLocale: 'en',
      targetLocale: 'it',
      glossaryRules,
    }) as string;

    expect(prompt).toContain('Mandatory glossary rules:');
    expect(prompt).toContain('DO_NOT_TRANSLATE');
    expect(prompt).toContain('"ACA"');
    expect(prompt).toContain('PREFERRED_TRANSLATION');
    expect(prompt).toContain('"Fatto a mano"');
  });
});
