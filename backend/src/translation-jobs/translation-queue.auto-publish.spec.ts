import {
  TranslationQueueService,
} from './translation-queue.service.js';

describe('TranslationQueueService 10F automatic publish', () => {
  it('runs auto-publish after translation and automatic review without rethrowing publication failures', async () => {
    const config =
      {} as any;

    const executor = {
      execute:
        vi.fn().mockResolvedValue({
          id:
            'job-1',
          status:
            'COMPLETED',
        }),
    } as any;

    const jobs = {
      resume:
        vi.fn(),
    } as any;

    const reviewExecutor = {
      reviewJob:
        vi.fn().mockResolvedValue({
          reviewExecution: {
            reviewedItems:
              1,
            approvedItems:
              1,
          },
        }),
    } as any;

    const prisma = {
      translationJob: {
        findFirst:
          vi.fn().mockResolvedValue({
            origin:
              'SHOPIFY_CHANGE',
            status:
              'COMPLETED',
            reviewProvider:
              'ANTHROPIC',
            reviewModel:
              'claude-sonnet-test',
            shop: {
              settings: {
                enableAiReview:
                  true,
                requireHumanReview:
                  false,
                autoPublish:
                  true,
              },
            },
            items: [
              {
                id:
                  'item-1',
              },
            ],
          }),
      },
    } as any;

    const automaticPublication = {
      publishEligibleItems:
        vi.fn().mockResolvedValue({
          attempted:
            true,
          reason:
            'AUTO_PUBLISH_COMPLETED',
          publishedItems:
            1,
        }),
    } as any;

    const service =
      new TranslationQueueService(
        config,
        executor,
        jobs,
        reviewExecutor,
        prisma,
        automaticPublication,
      );

    const queueJob = {
      name:
        'execute-translation-job',
      data: {
        jobId:
          'job-1',
        shopifyDomain:
          'shop-a.myshopify.com',
        shopifyGatewayUrl:
          'https://app.example.com',
      },
      updateProgress:
        vi.fn().mockResolvedValue(
          undefined,
        ),
    } as any;

    const result =
      await (service as any).processJob(
        queueJob,
      );

    expect(
      automaticPublication.publishEligibleItems,
    ).toHaveBeenCalledWith(
      'shop-a.myshopify.com',
      'job-1',
      'https://app.example.com',
    );

    expect(
      result.automaticPublish,
    ).toEqual(
      expect.objectContaining({
        reason:
          'AUTO_PUBLISH_COMPLETED',
        publishedItems:
          1,
      }),
    );
  });
});
