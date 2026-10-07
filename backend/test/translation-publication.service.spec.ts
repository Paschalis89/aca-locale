import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { TranslationPublicationService } from '../src/translation-publication/translation-publication.service.js';

function item(status = 'APPROVED') {
  return {
    id: 'item-1',
    jobId: 'job-1',
    fieldId: 'field-1',
    status,
    sourceDigest: 'digest-1',
    approvedValue: 'Buono regalo',
    publishedAt: null,
    job: {
      id: 'job-1',
      sourceLocale: 'en',
      targetLocale: 'it',
    },
    field: {
      id: 'field-1',
      key: 'title',
      type: 'SINGLE_LINE_TEXT_FIELD',
      sourceLocale: 'en',
      sourceDigest: 'digest-1',
      sourceValue: 'Gift Card',
      resource: {
        resourceType: 'PRODUCT',
        shopifyResourceId: 'gid://shopify/Product/1',
      },
    },
  };
}

function createPrisma() {
  const tx = {
    translationJobItem: {
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    translationState: {
      upsert: vi.fn(),
    },
  };

  return {
    translationJobItem: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(async (callback: any) => callback(tx)),
    __tx: tx,
  } as any;
}

describe('TranslationPublicationService', () => {
  it('blocks publication when the scanner digest changed', async () => {
    const prisma = createPrisma();
    const changed = item();
    changed.field.sourceDigest = 'new-digest';
    prisma.translationJobItem.findFirst.mockResolvedValue(changed);

    const service = new TranslationPublicationService(prisma);

    await expect(
      service.prepare('shop-a.myshopify.com', 'job-1', 'item-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns an idempotent prepare response for an already published item', async () => {
    const prisma = createPrisma();
    prisma.translationJobItem.findFirst.mockResolvedValue(item('PUBLISHED'));

    const service = new TranslationPublicationService(prisma);
    const result = await service.prepare(
      'shop-a.myshopify.com',
      'job-1',
      'item-1',
    );

    expect(result).toMatchObject({
      alreadyPublished: true,
      resourceId: 'gid://shopify/Product/1',
      targetLocale: 'it',
      value: 'Buono regalo',
    });
  });

  it('confirms publication and updates the local Shopify-state projection atomically', async () => {
    const prisma = createPrisma();
    const approved = item('APPROVED');
    prisma.translationJobItem.findFirst.mockResolvedValue(approved);
    prisma.__tx.translationJobItem.findUnique.mockResolvedValue({
      ...approved,
      status: 'PUBLISHED',
    });

    const service = new TranslationPublicationService(prisma);
    await service.confirmPublished('shop-a.myshopify.com', 'job-1', 'item-1');

    expect(prisma.__tx.translationJobItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PUBLISHED',
        }),
      }),
    );

    expect(prisma.__tx.translationState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          fieldId_targetLocale: {
            fieldId: 'field-1',
            targetLocale: 'it',
          },
        },
        create: expect.objectContaining({
          status: 'TRANSLATED',
          translatedValue: 'Buono regalo',
        }),
        update: expect.objectContaining({
          status: 'TRANSLATED',
          translatedValue: 'Buono regalo',
        }),
      }),
    );
  });

  it('does not run a second transaction when confirmation is repeated', async () => {
    const prisma = createPrisma();
    const published = item('PUBLISHED');
    prisma.translationJobItem.findFirst.mockResolvedValue(published);

    const service = new TranslationPublicationService(prisma);
    const result = await service.confirmPublished(
      'shop-a.myshopify.com',
      'job-1',
      'item-1',
    );

    expect(result).toBe(published);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects confirmation from a non-approved state', async () => {
    const prisma = createPrisma();
    prisma.translationJobItem.findFirst.mockResolvedValue(item('VALIDATED'));

    const service = new TranslationPublicationService(prisma);

    await expect(
      service.confirmPublished('shop-a.myshopify.com', 'job-1', 'item-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
