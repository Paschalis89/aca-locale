import { InternalTranslationChangeService } from './internal-translation-change.service.js';

describe('InternalTranslationChangeService 10D automatic execution', () => {
  const input = {
    shopifyDomain: 'shop-a.myshopify.com',
    eventId: 'event-1',
    resourceType: 'PRODUCT',
    shopifyResourceId: 'gid://shopify/Product/1',
    content: [
      {
        key: 'title',
        value: 'Handmade bowl',
        locale: 'en',
        digest: 'digest-1',
        type: 'SINGLE_LINE_TEXT_FIELD',
      },
    ],
    locales: [
      {
        targetLocale: 'it',
        translations: [],
      },
    ],
  } as any;

  const build = (automaticJob: Record<string, unknown>) => {
    const prisma = {
      translationChangeEvent: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'event-1',
          status: 'PROCESSING',
          resourceType: 'PRODUCT',
          shopifyResourceId: 'gid://shopify/Product/1',
          action: 'UPSERT',
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    } as any;

    const scanner = {
      sync: vi.fn().mockResolvedValue({
        resourceType: 'PRODUCT',
        targetLocale: 'it',
      }),
    } as any;

    const jobs = {
      createFromShopifyChange: vi.fn().mockResolvedValue(automaticJob),
    } as any;

    const queue = {
      enqueue: vi.fn().mockResolvedValue({
        queue: 'aca-locale-translation-jobs',
        queueJobId: 'job-1',
        enqueued: true,
        duplicate: false,
        state: 'waiting',
      }),
    } as any;

    const service = new InternalTranslationChangeService(
      prisma,
      scanner,
      jobs,
      queue,
    );

    return { service, prisma, scanner, jobs, queue };
  };

  it('enqueues a newly-created Shopify-change job automatically', async () => {
    const { service, queue } = build({
      created: true,
      reason: 'CREATED',
      targetLocale: 'it',
      jobId: 'job-1',
      totalItems: 1,
    });

    const result = await service.processUpsert(input);

    expect(queue.enqueue).toHaveBeenCalledWith(
      'job-1',
      'shop-a.myshopify.com',
    );

    expect(result.automaticJobs[0]).toEqual(
      expect.objectContaining({
        jobId: 'job-1',
        reason: 'CREATED',
        queue: expect.objectContaining({
          enqueued: true,
        }),
      }),
    );
  });

  it('re-enqueues the idempotent job after a change-event retry', async () => {
    const { service, queue } = build({
      created: false,
      reason: 'DUPLICATE_CHANGE_EVENT',
      targetLocale: 'it',
      jobId: 'job-1',
      totalItems: 1,
    });

    await service.processUpsert(input);

    expect(queue.enqueue).toHaveBeenCalledWith(
      'job-1',
      'shop-a.myshopify.com',
    );
  });

  it('does not enqueue when automatic translation is disabled or no job was created', async () => {
    const { service, queue } = build({
      created: false,
      reason: 'AUTO_TRANSLATE_DISABLED',
      targetLocale: 'it',
      jobId: null,
      totalItems: 0,
    });

    const result = await service.processUpsert(input);

    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(result.automaticJobs[0]).toEqual(
      expect.objectContaining({
        reason: 'AUTO_TRANSLATE_DISABLED',
        queue: null,
      }),
    );
  });
});
