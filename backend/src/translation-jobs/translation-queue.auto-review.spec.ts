import { TranslationQueueService } from './translation-queue.service.js';

describe('TranslationQueueService 10E automatic AI review', () => {
  const build = (options?: {
    origin?: 'MANUAL' | 'SHOPIFY_CHANGE';
    status?: 'COMPLETED' | 'PARTIAL' | 'FAILED';
    enableAiReview?: boolean;
    reviewProvider?: string | null;
    reviewModel?: string | null;
    eligibleItems?: number;
    reviewError?: Error;
  }) => {
    const config = {} as any;

    const executor = {
      execute: vi.fn().mockResolvedValue({
        id: 'job-1',
        status: options?.status ?? 'COMPLETED',
        execution: {
          primaryProvider: 'DEEPL',
        },
      }),
    } as any;

    const jobs = {
      resume: vi.fn(),
    } as any;

    const reviewExecutor = {
      reviewJob: options?.reviewError
        ? vi.fn().mockRejectedValue(options.reviewError)
        : vi.fn().mockResolvedValue({
            id: 'job-1',
            reviewExecution: {
              provider: 'ANTHROPIC',
              model: 'claude-sonnet-test',
              reviewedItems: 1,
              approvedItems: 1,
              needsReviewItems: 0,
              failedReviews: 0,
              inputTokens: 100,
              outputTokens: 20,
            },
          }),
    } as any;

    const prisma = {
      translationJob: {
        findFirst: vi.fn().mockResolvedValue({
          origin: options?.origin ?? 'SHOPIFY_CHANGE',
          status: options?.status ?? 'COMPLETED',
          reviewProvider:
            options?.reviewProvider === undefined
              ? 'ANTHROPIC'
              : options.reviewProvider,
          reviewModel:
            options?.reviewModel === undefined
              ? 'claude-sonnet-test'
              : options.reviewModel,
          shop: {
            settings: {
              enableAiReview: options?.enableAiReview ?? true,
              requireHumanReview: true,
              autoPublish: false,
            },
          },
          items: Array.from(
            { length: options?.eligibleItems ?? 1 },
            (_, index) => ({ id: `item-${index + 1}` }),
          ),
        }),
      },
    } as any;

    const service = new TranslationQueueService(
      config,
      executor,
      jobs,
      reviewExecutor,
      prisma,
    );

    const queueJob = {
      name: 'execute-translation-job',
      data: {
        jobId: 'job-1',
        shopifyDomain: 'shop-a.myshopify.com',
      },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    } as any;

    return {
      service,
      executor,
      jobs,
      reviewExecutor,
      prisma,
      queueJob,
    };
  };

  it('runs AI review automatically after a completed Shopify-change translation', async () => {
    const { service, reviewExecutor, queueJob } = build();

    const result = await (service as any).processJob(queueJob);

    expect(reviewExecutor.reviewJob).toHaveBeenCalledWith(
      'shop-a.myshopify.com',
      'job-1',
    );

    expect(result.automaticReview).toEqual(
      expect.objectContaining({
        attempted: true,
        reason: 'AI_REVIEW_COMPLETED',
        reviewedItems: 1,
        approvedItems: 1,
        failedReviews: 0,
      }),
    );
  });

  it('does not auto-review manual jobs', async () => {
    const { service, reviewExecutor, queueJob } = build({
      origin: 'MANUAL',
    });

    const result = await (service as any).processJob(queueJob);

    expect(reviewExecutor.reviewJob).not.toHaveBeenCalled();
    expect(result.automaticReview.reason).toBe('MANUAL_JOB');
  });

  it('respects enableAiReview=false', async () => {
    const { service, reviewExecutor, queueJob } = build({
      enableAiReview: false,
    });

    const result = await (service as any).processJob(queueJob);

    expect(reviewExecutor.reviewJob).not.toHaveBeenCalled();
    expect(result.automaticReview.reason).toBe('AUTO_AI_REVIEW_DISABLED');
  });

  it('does not call the reviewer again when there are no unreviewed VALIDATED items', async () => {
    const { service, reviewExecutor, queueJob } = build({
      eligibleItems: 0,
    });

    const result = await (service as any).processJob(queueJob);

    expect(reviewExecutor.reviewJob).not.toHaveBeenCalled();
    expect(result.automaticReview.reason).toBe(
      'NO_UNREVIEWED_VALIDATED_ITEMS',
    );
  });

  it('isolates AI review failure from the completed translation queue job', async () => {
    const { service, reviewExecutor, queueJob } = build({
      reviewError: new Error('review provider unavailable'),
    });

    const result = await (service as any).processJob(queueJob);

    expect(reviewExecutor.reviewJob).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('COMPLETED');
    expect(result.automaticReview).toEqual(
      expect.objectContaining({
        attempted: true,
        reason: 'AI_REVIEW_FAILED',
        errorMessage: 'review provider unavailable',
      }),
    );
  });
});
