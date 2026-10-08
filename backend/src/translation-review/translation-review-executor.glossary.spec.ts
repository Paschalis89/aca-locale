import { TranslationReviewExecutorService } from './translation-review-executor.service.js';

const glossaryRules = [
  {
    id: 'g1',
    glossaryId: 'glossary-1',
    glossaryName: 'Master Glossary',
    sourceTerm: 'Vietri',
    targetLocale: '*',
    targetTerm: null,
    ruleType: 'DO_NOT_TRANSLATE' as const,
    caseSensitive: true,
    notes: null,
  },
];

describe('TranslationReviewExecutorService glossary integration', () => {
  it('passes the same merchant glossary context to AI review', async () => {
    const job = {
      id: 'job-1',
      shopId: 'shop-1',
      sourceLocale: 'en',
      targetLocale: 'it',
      status: 'COMPLETED',
      reviewProvider: 'ANTHROPIC',
      reviewModel: 'test-model',
      items: [
        {
          id: 'item-1',
          status: 'VALIDATED',
          sourceValue: 'Ceramics from Vietri',
          translatedValue: 'Ceramiche di Vietri',
          aiReviewedAt: null,
          field: {
            key: 'title',
            type: 'SINGLE_LINE_TEXT_FIELD',
            resource: { resourceType: 'PRODUCT' },
          },
        },
      ],
    };

    const prisma = {
      translationJob: {
        findFirst: vi.fn().mockResolvedValue(job),
        findUnique: vi.fn().mockResolvedValue(job),
      },
      translationJobItem: {
        update: vi.fn().mockResolvedValue({}),
      },
      translationUsageEvent: {
        create: vi.fn().mockResolvedValue({}),
      },
    } as any;

    const reviewer = {
      review: vi.fn().mockResolvedValue({
        approved: true,
        score: 98,
        issues: [],
        suggestedTranslation: null,
        provider: 'ANTHROPIC',
        model: 'test-model',
        inputTokens: 20,
        outputTokens: 8,
      }),
    } as any;

    const glossary = {
      resolveRulesForText: vi.fn().mockResolvedValue(glossaryRules),
    } as any;

    const service = new TranslationReviewExecutorService(
      prisma,
      reviewer,
      glossary,
    );

    await service.reviewJob('shop-a.myshopify.com', 'job-1');

    expect(reviewer.review).toHaveBeenCalledWith(
      expect.objectContaining({ glossaryRules }),
    );
  });
});
