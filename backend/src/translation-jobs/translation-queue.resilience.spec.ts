import { TranslationQueueService } from './translation-queue.service.js';

describe('TranslationQueueService 10G retry isolation', () => {
  const config = {
    get: vi.fn((key: string) => {
      const values: Record<string, unknown> = {
        TRANSLATION_QUEUE_PER_SHOP_CONCURRENCY: 1,
        TRANSLATION_QUEUE_BACKOFF_MS: 10,
      };

      return values[key];
    }),
  } as any;

  it('treats source freshness failures as terminal translation errors', () => {
    const service = new TranslationQueueService(
      config,
      {} as any,
      {} as any,
    );

    expect(
      (service as any).isTerminalTranslationError(
        'SOURCE_CHANGED_BEFORE_EXECUTION',
      ),
    ).toBe(true);

    expect(
      (service as any).isTerminalTranslationError(
        'provider temporarily unavailable',
      ),
    ).toBe(false);
  });

  it('retries AI review without re-running translation', async () => {
    const translationExecutor = {
      execute: vi.fn(),
    } as any;

    const reviewExecutor = {
      reviewJob: vi
        .fn()
        .mockRejectedValue(new Error('review provider unavailable')),
    } as any;

    const prisma = {
      translationJob: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst: vi.fn().mockResolvedValue({
          origin: 'SHOPIFY_CHANGE',
          status: 'COMPLETED',
          reviewProvider: 'ANTHROPIC',
          reviewModel: 'claude-sonnet-test',
          shop: {
            settings: {
              enableAiReview: true,
              requireHumanReview: true,
              autoPublish: false,
            },
          },
          items: [{ id: 'item-1' }],
        }),
      },
    } as any;

    const service = new TranslationQueueService(
      config,
      translationExecutor,
      {} as any,
      reviewExecutor,
      prisma,
    );

    const queueJob = {
      name: 'retry-ai-review',
      data: {
        jobId: 'job-1',
        shopifyDomain: 'shop-a.myshopify.com',
      },
      attemptsMade: 0,
      updateProgress: vi.fn().mockResolvedValue(undefined),
    } as any;

    await expect((service as any).processJob(queueJob)).rejects.toThrow(
      'review provider unavailable',
    );

    expect(translationExecutor.execute).not.toHaveBeenCalled();
    expect(reviewExecutor.reviewJob).toHaveBeenCalledTimes(1);
  });

  it('retries publication without re-running translation or AI review', async () => {
    const translationExecutor = {
      execute: vi.fn(),
    } as any;

    const reviewExecutor = {
      reviewJob: vi.fn(),
    } as any;

    const prisma = {
      translationJob: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    } as any;

    const automaticPublication = {
      publishEligibleItems: vi.fn().mockResolvedValue({
        attempted: true,
        reason: 'AUTO_PUBLISH_PARTIAL_FAILURE',
        failedItems: 1,
      }),
    } as any;

    const service = new TranslationQueueService(
      config,
      translationExecutor,
      {} as any,
      reviewExecutor,
      prisma,
      automaticPublication,
    );

    const queueJob = {
      name: 'retry-auto-publish',
      data: {
        jobId: 'job-1',
        shopifyDomain: 'shop-a.myshopify.com',
        shopifyGatewayUrl: 'https://app.example.com',
      },
      attemptsMade: 0,
      updateProgress: vi.fn().mockResolvedValue(undefined),
    } as any;

    await expect((service as any).processJob(queueJob)).rejects.toThrow(
      'Automatic publication retry required',
    );

    expect(translationExecutor.execute).not.toHaveBeenCalled();
    expect(reviewExecutor.reviewJob).not.toHaveBeenCalled();
    expect(automaticPublication.publishEligibleItems).toHaveBeenCalledTimes(1);
  });
});
