import { describe, expect, it, vi } from 'vitest';
import { TranslationScannerService } from './translation-scanner.service.js';

const resource = (resourceId: string) => ({ resourceId, content: [], translations: [] });
function build() {
  const tx = {
    translationResource: {
      upsert: vi.fn().mockResolvedValue({ id: 'local-resource' }),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    translationField: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
  const prisma = {
    shop: { findUnique: vi.fn().mockResolvedValue({ id: 'shop-1' }) },
    $transaction: vi.fn().mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const service = new TranslationScannerService(prisma as never);
  vi.spyOn(service, 'getSummary').mockResolvedValue({ coverage: 100 } as never);
  return { service, tx, prisma };
}

describe('TranslationScannerService chunked transactions', () => {
  it('commits each Shopify resource independently', async () => {
    const { service, prisma, tx } = build();
    await service.sync('shop.myshopify.com', {
      resourceType: 'PRODUCT', targetLocale: 'en', completeScan: false,
      resources: [resource('gid://shopify/Product/1'), resource('gid://shopify/Product/2')],
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(tx.translationResource.upsert).toHaveBeenCalledTimes(2);
    expect(tx.translationResource.findMany).not.toHaveBeenCalled();
  });

  it('uses the full seen-resource list only after all pages complete', async () => {
    const { service, prisma, tx } = build();
    await service.sync('shop.myshopify.com', {
      resourceType: 'PRODUCT', targetLocale: 'en', completeScan: true,
      resources: [], seenResourceIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'],
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.translationResource.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        shopifyResourceId: { notIn: ['gid://shopify/Product/1', 'gid://shopify/Product/2'] },
      }),
    }));
  });

  it('does not run cleanup when an incremental page fails', async () => {
    const { service, tx } = build();
    tx.translationResource.upsert.mockRejectedValueOnce(new Error('simulated failure'));
    await expect(service.sync('shop.myshopify.com', {
      resourceType: 'PRODUCT', targetLocale: 'en', completeScan: false,
      resources: [resource('gid://shopify/Product/1')],
    })).rejects.toThrow('simulated failure');
    expect(tx.translationResource.findMany).not.toHaveBeenCalled();
  });
});
