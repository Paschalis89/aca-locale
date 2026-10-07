import { describe, expect, it, vi } from 'vitest';

import { TranslationReviewExecutorService } from '../src/translation-review/translation-review-executor.service.js';

function reviewJob() {
  return {
    id: 'job-1',
    shopId: 'shop-1',
    sourceLocale: 'en',
    targetLocale: 'it',
    status: 'COMPLETED',
    reviewProvider: 'ANTHROPIC',
    reviewModel: 'claude-sonnet-5-5',
    items: [
      {
        id: 'item-1',
        status: 'VALIDATED',
        sourceValue: 'Gift Card',
        translatedValue: 'Buono regalo',
        aiReviewedAt: null,
        field: {
          key: 'title',
          type: 'SINGLE_LINE_TEXT_FIELD',
          resource: {
            resourceType: 'PRODUCT',
          },
        },
      },
    ],
  };
}

function createPrisma() {
  return {
    translationJob: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    translationJobItem: {
      update: vi.fn(),
    },
    translationUsageEvent: {
      create: vi.fn(),
    },
  } as any;
}

describe('TranslationReviewExecutorService', () => {
  it('stores a reviewer suggestion without overwriting translatedValue', async () => {
    const prisma = createPrisma();
    const job = reviewJob();
    prisma.translationJob.findFirst.mockResolvedValue(job);
    prisma.translationJob.findUnique.mockResolvedValue(job);
    prisma.translationUsageEvent.create.mockResolvedValue({ id: 'usage-1' });

    const reviewer = {
      review: vi.fn().mockResolvedValue({
        approved: false,
        score: 72,
        issues: [{ code: 'WORDING' }],
        suggestedTranslation: 'Carta regalo',
        provider: 'ANTHROPIC',
        model: 'claude-sonnet-5-5',
        inputTokens: 100,
        outputTokens: 25,
      }),
    } as any;

    const service = new TranslationReviewExecutorService(prisma, reviewer);
    await service.reviewJob('shop-a.myshopify.com', 'job-1');

    const data = prisma.translationJobItem.update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      status: 'NEEDS_REVIEW',
      aiReviewPassed: false,
      aiReviewScore: 72,
      aiReviewSuggestedTranslation: 'Carta regalo',
    });
    expect(data).not.toHaveProperty('translatedValue');
  });

  it('keeps the generated translation usable when the AI reviewer fails', async () => {
    const prisma = createPrisma();
    const job = reviewJob();
    prisma.translationJob.findFirst.mockResolvedValue(job);
    prisma.translationJob.findUnique.mockResolvedValue(job);
    prisma.translationUsageEvent.create.mockResolvedValue({ id: 'usage-1' });

    const reviewer = {
      review: vi.fn().mockRejectedValue(new Error('review provider offline')),
    } as any;

    const service = new TranslationReviewExecutorService(prisma, reviewer);
    await service.reviewJob('shop-a.myshopify.com', 'job-1');

    expect(prisma.translationJobItem.update).toHaveBeenCalledTimes(1);
    const data = prisma.translationJobItem.update.mock.calls[0][0].data;
    expect(data).toEqual({
      aiReviewErrorMessage: 'review provider offline',
    });
    expect(data).not.toHaveProperty('status');
  });
});
