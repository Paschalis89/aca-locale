import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { TranslationHumanReviewService } from '../src/translation-human-review/translation-human-review.service.js';

function baseItem(status = 'VALIDATED') {
  return {
    id: 'item-1',
    jobId: 'job-1',
    fieldId: 'field-1',
    status,
    sourceDigest: 'digest-1',
    sourceValue: 'Gift Card',
    translatedValue: 'Buono regalo',
    approvedValue: null,
    job: {
      id: 'job-1',
      shopId: 'shop-1',
      sourceLocale: 'en',
      targetLocale: 'it',
      status: 'COMPLETED',
      provider: 'DEEPL',
      model: null,
      fallbackProvider: 'OPENAI',
      fallbackModel: 'gpt-6-luna',
      reviewProvider: 'ANTHROPIC',
      reviewModel: 'claude-sonnet-5-5',
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
}

function createPrisma() {
  return {
    translationJobItem: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    translationJob: {
      create: vi.fn(),
    },
  } as any;
}

function createValidator(passed = true) {
  return {
    validate: vi.fn(() => ({
      passed,
      version: 'deterministic-v1',
      errorCount: passed ? 0 : 1,
      warningCount: 0,
      issues: passed ? [] : [{ code: 'TEST_ERROR' }],
    })),
  } as any;
}

describe('TranslationHumanReviewService', () => {
  it('stores an edited human value separately from the generated translation', async () => {
    const prisma = createPrisma();
    const item = baseItem();
    prisma.translationJobItem.findFirst.mockResolvedValue(item);
    prisma.translationJobItem.update.mockResolvedValue({
      ...item,
      status: 'APPROVED',
      approvedValue: 'Carta regalo',
    });

    const validator = createValidator(true);
    const service = new TranslationHumanReviewService(prisma, validator);

    await service.approve('shop-a.myshopify.com', 'job-1', 'item-1', {
      approvedValue: 'Carta regalo',
      note: 'Edited by reviewer',
    } as any);

    expect(validator.validate).toHaveBeenCalledWith(
      expect.objectContaining({
        translatedValue: 'Carta regalo',
      }),
    );

    expect(prisma.translationJobItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'APPROVED',
          approvedValue: 'Carta regalo',
          humanReviewNote: 'Edited by reviewer',
        }),
      }),
    );

    expect(
      prisma.translationJobItem.update.mock.calls[0][0].data,
    ).not.toHaveProperty('translatedValue');
  });

  it('blocks approval when deterministic validation fails', async () => {
    const prisma = createPrisma();
    prisma.translationJobItem.findFirst.mockResolvedValue(baseItem());

    const service = new TranslationHumanReviewService(
      prisma,
      createValidator(false),
    );

    await expect(
      service.approve('shop-a.myshopify.com', 'job-1', 'item-1', {
        approvedValue: '<broken>',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.translationJobItem.update).not.toHaveBeenCalled();
  });

  it('rejects an item without destroying its generated translation history', async () => {
    const prisma = createPrisma();
    const item = baseItem('NEEDS_REVIEW');
    prisma.translationJobItem.findFirst.mockResolvedValue(item);
    prisma.translationJobItem.update.mockResolvedValue({
      ...item,
      status: 'REJECTED',
    });

    const service = new TranslationHumanReviewService(
      prisma,
      createValidator(true),
    );

    await service.reject('shop-a.myshopify.com', 'job-1', 'item-1', {
      note: 'Needs regeneration',
    } as any);

    const data = prisma.translationJobItem.update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      status: 'REJECTED',
      approvedValue: null,
      approvedAt: null,
      humanReviewNote: 'Needs regeneration',
    });
    expect(data).not.toHaveProperty('translatedValue');
  });

  it('creates regeneration as a new audit-linked job', async () => {
    const prisma = createPrisma();
    const item = baseItem('REJECTED');

    prisma.translationJobItem.findFirst
      .mockResolvedValueOnce(item)
      .mockResolvedValueOnce(null);
    prisma.translationJob.create.mockResolvedValue({ id: 'job-regenerated' });

    const service = new TranslationHumanReviewService(
      prisma,
      createValidator(true),
    );

    await service.regenerate('shop-a.myshopify.com', 'job-1', 'item-1');

    expect(prisma.translationJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shopId: 'shop-1',
          sourceLocale: 'en',
          targetLocale: 'it',
          totalItems: 1,
          items: {
            create: expect.objectContaining({
              fieldId: 'field-1',
              status: 'PENDING',
              regeneratedFromItemId: 'item-1',
            }),
          },
        }),
      }),
    );

    expect(prisma.translationJobItem.update).not.toHaveBeenCalled();
  });

  it('prevents a second active regeneration', async () => {
    const prisma = createPrisma();
    prisma.translationJobItem.findFirst
      .mockResolvedValueOnce(baseItem('REJECTED'))
      .mockResolvedValueOnce({ id: 'item-child', jobId: 'job-child' });

    const service = new TranslationHumanReviewService(
      prisma,
      createValidator(true),
    );

    await expect(
      service.regenerate('shop-a.myshopify.com', 'job-1', 'item-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.translationJob.create).not.toHaveBeenCalled();
  });
});
