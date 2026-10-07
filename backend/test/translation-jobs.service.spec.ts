import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { TranslationJobsService } from '../src/translation-jobs/translation-jobs.service.js';

function createPrisma() {
  const tx = {
    translationJob: {
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    translationJobItem: {
      updateMany: vi.fn(),
    },
  };

  return {
    shop: {
      findUnique: vi.fn(),
    },
    translationState: {
      findMany: vi.fn(),
    },
    translationJob: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    translationJobItem: {
      updateMany: vi.fn(),
    },
    translationUsageEvent: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(async (callback: any) => callback(tx)),
    __tx: tx,
  } as any;
}

describe('TranslationJobsService', () => {
  it('scopes job lookup to the authenticated Shopify domain', async () => {
    const prisma = createPrisma();
    prisma.translationJob.findFirst.mockResolvedValue({ id: 'job-1' });

    const service = new TranslationJobsService(prisma);
    await service.findOne('shop-a.myshopify.com', 'job-1');

    expect(prisma.translationJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'job-1',
          shop: {
            shopifyDomain: 'shop-a.myshopify.com',
          },
        },
      }),
    );
  });

  it('does not expose a job from another shop', async () => {
    const prisma = createPrisma();
    prisma.translationJob.findFirst.mockResolvedValue(null);

    const service = new TranslationJobsService(prisma);

    await expect(
      service.findOne('shop-a.myshopify.com', 'job-owned-by-b'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates a job only from missing/outdated fields belonging to the current shop', async () => {
    const prisma = createPrisma();
    prisma.shop.findUnique.mockResolvedValue({
      id: 'shop-1',
      sourceLocale: 'en',
      aiConfiguration: {
        translationProvider: 'DEEPL',
        translationModel: null,
        fallbackProvider: 'OPENAI',
        fallbackModel: 'gpt-6-luna',
        reviewProvider: 'ANTHROPIC',
        reviewModel: 'claude-sonnet-5-5',
      },
      languages: [
        {
          language: {
            locale: 'it',
          },
        },
      ],
    });
    prisma.translationState.findMany.mockResolvedValue([
      {
        status: 'MISSING',
        field: {
          id: 'field-1',
          sourceLocale: 'en',
          sourceValue: 'Gift Card',
          sourceDigest: 'digest-1',
          resource: {
            resourceType: 'PRODUCT',
            shopifyResourceId: 'gid://shopify/Product/1',
          },
        },
      },
    ]);
    prisma.translationJob.create.mockResolvedValue({ id: 'job-1' });

    const service = new TranslationJobsService(prisma);
    await service.create('shop-a.myshopify.com', {
      targetLocale: 'it',
      resourceTypes: ['PRODUCT'],
      maxItems: 25,
    } as any);

    expect(prisma.translationState.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          targetLocale: 'it',
          OR: [{ status: 'MISSING' }, { status: 'OUTDATED' }],
          field: expect.objectContaining({
            sourceLocale: 'en',
            resource: expect.objectContaining({
              shopId: 'shop-1',
              resourceType: {
                in: ['PRODUCT'],
              },
            }),
          }),
        }),
        take: 25,
      }),
    );

    expect(prisma.translationJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shopId: 'shop-1',
          provider: 'DEEPL',
          fallbackProvider: 'OPENAI',
          reviewProvider: 'ANTHROPIC',
          totalItems: 1,
        }),
      }),
    );
  });

  it('requeues only failed items and keeps completed item count', async () => {
    const prisma = createPrisma();
    const lifecycleJob = {
      id: 'job-1',
      status: 'PARTIAL',
      provider: 'DEEPL',
      model: null,
      items: [
        { id: 'item-ok', status: 'VALIDATED' },
        { id: 'item-failed', status: 'FAILED' },
      ],
    };
    const detail = { ...lifecycleJob, status: 'QUEUED' };

    prisma.translationJob.findFirst
      .mockResolvedValueOnce(lifecycleJob)
      .mockResolvedValueOnce(detail);

    const service = new TranslationJobsService(prisma);
    await service.retryFailed('shop-a.myshopify.com', 'job-1');

    expect(prisma.__tx.translationJobItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: {
            in: ['item-failed'],
          },
        },
        data: expect.objectContaining({
          status: 'PENDING',
          translatedValue: null,
          provider: 'DEEPL',
          model: null,
        }),
      }),
    );

    expect(prisma.__tx.translationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'QUEUED',
          completedItems: 1,
          failedItems: 0,
        }),
      }),
    );
  });

  it('rejects resume for a RUNNING job that is not stale yet', async () => {
    const prisma = createPrisma();
    prisma.translationJob.findFirst.mockResolvedValue({
      id: 'job-1',
      status: 'RUNNING',
      updatedAt: new Date(),
      items: [],
    });

    const service = new TranslationJobsService(prisma);

    await expect(
      service.resume('shop-a.myshopify.com', 'job-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('scopes usage aggregation to the authenticated shop', async () => {
    const prisma = createPrisma();
    prisma.shop.findUnique.mockResolvedValue({ id: 'shop-1' });
    prisma.translationUsageEvent.findMany.mockResolvedValue([]);

    const service = new TranslationJobsService(prisma);
    await service.usageSummary('shop-a.myshopify.com', '30');

    expect(prisma.translationUsageEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shopId: 'shop-1',
        }),
      }),
    );
  });
});
