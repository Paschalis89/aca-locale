import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TranslationScannerService } from '../src/translation-scanner/translation-scanner.service.js';
import { TranslationJobsService } from '../src/translation-jobs/translation-jobs.service.js';

const gid = 'gid://shopify/Product/123456789';

function shop() {
  return {
    id: 'shop-a', sourceLocale: 'it', languages: [{ language: { locale: 'en' } }],
    aiConfiguration: { translationProvider: 'DEEPL' },
  };
}

describe('v0.9.17.1 Product isolation', () => {
  it('rejects a scoped scan that claims completeScan (cannot tombstone the catalog)', async () => {
    const prisma: any = {
      shop: { findUnique: vi.fn().mockResolvedValue(shop()) },
      $transaction: vi.fn(),
    };
    const service = new TranslationScannerService(prisma);
    await expect(service.sync('shop-a.myshopify.com', {
      resourceType: 'PRODUCT', targetLocale: 'en', completeScan: true,
      scopedResourceId: gid, resources: [{ resourceId: gid, content: [], translations: [] }],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects scoped scan payload containing another product', async () => {
    const prisma: any = {
      shop: { findUnique: vi.fn().mockResolvedValue(shop()) },
      $transaction: vi.fn(),
    };
    const service = new TranslationScannerService(prisma);
    await expect(service.sync('shop-a.myshopify.com', {
      resourceType: 'PRODUCT', targetLocale: 'en', completeScan: false,
      scopedResourceId: gid,
      resources: [{ resourceId: 'gid://shopify/Product/42', content: [], translations: [] }],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('restricts the Prisma translation job candidate query to the exact Product GID and shop', async () => {
    const tx: any = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: 1 }]),
      translationState: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const prisma: any = {
      shop: { findUnique: vi.fn().mockResolvedValue(shop()) },
      $transaction: vi.fn(async (fn: any) => fn(tx)),
    };
    const service = new TranslationJobsService(prisma);
    await expect(service.create('shop-a.myshopify.com', {
      resourceTypes: ['PRODUCT'], targetLocale: 'en', shopifyProductId: gid,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.translationState.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          targetLocale: 'en',
          field: expect.objectContaining({
            resource: expect.objectContaining({
              shopId: 'shop-a', shopifyResourceId: gid,
              resourceType: { in: ['PRODUCT'] },
            }),
          }),
        }),
      }),
    );
  });

  it('rejects invalid targeted job IDs before starting a transaction', async () => {
    const prisma: any = {
      shop: { findUnique: vi.fn().mockResolvedValue(shop()) },
      $transaction: vi.fn(),
    };
    const service = new TranslationJobsService(prisma);
    await expect(service.create('shop-a.myshopify.com', {
      targetLocale: 'en', resourceTypes: ['PRODUCT'],
      shopifyProductId: 'gid://shopify/ProductVariant/99',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
