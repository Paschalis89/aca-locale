import { AiTranslationReviewerService } from './ai-translation-reviewer.service.js';

import type { ResolvedGlossaryRule } from '../glossary/glossary.types.js';

describe('AiTranslationReviewerService glossary prompt', () => {
  it('tells the reviewer that glossary rules are mandatory', () => {
    const service = new AiTranslationReviewerService({} as any);

    const glossaryRules: ResolvedGlossaryRule[] = [
      {
        id: 'g1',
        glossaryId: 'glossary-1',
        glossaryName: 'Master Glossary',
        sourceTerm: 'Vietri',
        targetLocale: '*',
        targetTerm: null,
        ruleType: 'DO_NOT_TRANSLATE',
        caseSensitive: true,
        notes: null,
      },
    ];

    const prompt = (service as any).buildUserPrompt({
      sourceValue: 'Ceramics from Vietri',
      translatedValue: 'Ceramiche di Vietri',
      sourceLocale: 'en',
      targetLocale: 'it',
      provider: 'ANTHROPIC',
      model: 'test-model',
      glossaryRules,
    }) as string;

    expect(prompt).toContain('Mandatory glossary rules:');
    expect(prompt).toContain('DO_NOT_TRANSLATE');
    expect(prompt).toContain('Treat every glossary rule as mandatory');
    expect(prompt).toContain('suggestedTranslation');
  });
});
