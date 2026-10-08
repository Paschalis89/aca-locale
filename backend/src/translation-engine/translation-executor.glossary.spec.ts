import { TranslationExecutorService } from './translation-executor.service.js';

const glossaryRules = [
  {
    id: 'g1',
    glossaryId: 'glossary-1',
    glossaryName: 'Master Glossary',
    sourceTerm: 'ACA',
    targetLocale: '*',
    targetTerm: null,
    ruleType: 'DO_NOT_TRANSLATE' as const,
    caseSensitive: true,
    notes: null,
  },
];

describe('TranslationExecutorService glossary integration', () => {
  it('passes resolved glossary rules to the provider and deterministic validator', async () => {
    const queuedJob = {
      id: 'job-1',
      shopId: 'shop-1',
      sourceLocale: 'en',
      targetLocale: 'it',
      status: 'QUEUED',
      provider: 'OPENAI',
      model: 'test-model',
      fallbackProvider: null,
      fallbackModel: null,
      startedAt: null,
      items: [
        {
          id: 'item-1',
          status: 'PENDING',
          sourceValue: 'ACA ceramic bowl',
          model: 'test-model',
          field: {
            type: 'SINGLE_LINE_TEXT_FIELD',
            key: 'title',
            sourceLocale: 'en',
            resource: {
              resourceType: 'PRODUCT',
              shopifyResourceId: 'gid://shopify/Product/1',
            },
          },
        },
      ],
    };

    const completedJob = {
      ...queuedJob,
      status: 'COMPLETED',
      completedItems: 1,
      failedItems: 0,
    };

    const prisma = {
      translationJob: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(queuedJob)
          .mockResolvedValueOnce(completedJob),
        findUnique: vi.fn().mockResolvedValue({ status: 'RUNNING' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue(completedJob),
      },
      translationJobItem: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      translationUsageEvent: {
        create: vi.fn().mockResolvedValue({}),
      },
    } as any;

    const adapter = {
      translate: vi.fn().mockResolvedValue({
        text: 'Ciotola in ceramica ACA',
        provider: 'OPENAI',
        model: 'test-model',
        inputTokens: 10,
        outputTokens: 5,
      }),
    };

    const providers = {
      getProvider: vi.fn(() => adapter),
    } as any;

    const validator = {
      validate: vi.fn(() => ({
        passed: true,
        version: 'deterministic-v2-glossary',
        errorCount: 0,
        warningCount: 0,
        issues: [],
      })),
    } as any;

    const glossary = {
      resolveRulesForText: vi.fn().mockResolvedValue(glossaryRules),
    } as any;

    const service = new TranslationExecutorService(
      prisma,
      providers,
      validator,
      glossary,
    );

    await service.execute('shop-a.myshopify.com', 'job-1');

    expect(glossary.resolveRulesForText).toHaveBeenCalledWith(
      'shop-a.myshopify.com',
      'en',
      'it',
      'ACA ceramic bowl',
    );

    expect(adapter.translate).toHaveBeenCalledWith(
      expect.objectContaining({ glossaryRules }),
    );

    expect(validator.validate).toHaveBeenCalledWith(
      expect.objectContaining({ glossaryRules }),
    );
  });
});
