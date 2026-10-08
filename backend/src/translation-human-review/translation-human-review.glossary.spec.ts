import { TranslationHumanReviewService } from './translation-human-review.service.js';

const glossaryRules = [
  {
    id: 'g1',
    glossaryId: 'glossary-1',
    glossaryName: 'Master Glossary',
    sourceTerm: 'Handmade',
    targetLocale: 'it',
    targetTerm: 'Fatto a mano',
    ruleType: 'PREFERRED_TRANSLATION' as const,
    caseSensitive: false,
    notes: null,
  },
];

describe('TranslationHumanReviewService glossary integration', () => {
  it('revalidates a human-edited value against the active glossary', async () => {
    const item = {
      id: 'item-1',
      jobId: 'job-1',
      fieldId: 'field-1',
      status: 'VALIDATED',
      sourceValue: 'Handmade bowl',
      translatedValue: 'Ciotola fatta a mano',
      job: {
        id: 'job-1',
        shopId: 'shop-1',
        sourceLocale: 'en',
        targetLocale: 'it',
        status: 'COMPLETED',
        provider: 'DEEPL',
        model: null,
        fallbackProvider: null,
        fallbackModel: null,
        reviewProvider: 'ANTHROPIC',
        reviewModel: 'test-model',
      },
      field: {
        key: 'title',
        type: 'SINGLE_LINE_TEXT_FIELD',
        sourceLocale: 'en',
        resource: {
          resourceType: 'PRODUCT',
          shopifyResourceId: 'gid://shopify/Product/1',
        },
      },
    };

    const prisma = {
      translationJobItem: {
        findFirst: vi.fn().mockResolvedValue(item),
        update: vi.fn().mockResolvedValue({ ...item, status: 'APPROVED' }),
      },
    } as any;

    const validator = {
      validate: vi.fn().mockReturnValue({
        passed: true,
        version: 'deterministic-v2-glossary',
        errorCount: 0,
        warningCount: 0,
        issues: [],
      }),
    } as any;

    const glossary = {
      resolveRulesForText: vi.fn().mockResolvedValue(glossaryRules),
    } as any;

    const service = new TranslationHumanReviewService(
      prisma,
      validator,
      glossary,
    );

    await service.approve(
      'shop-a.myshopify.com',
      'job-1',
      'item-1',
      { approvedValue: 'Ciotola fatta a mano' } as any,
    );

    expect(validator.validate).toHaveBeenCalledWith(
      expect.objectContaining({ glossaryRules }),
    );
  });
});
