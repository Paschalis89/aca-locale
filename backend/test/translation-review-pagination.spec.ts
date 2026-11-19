import { describe, expect, it, vi } from 'vitest';
import { TranslationJobsService } from '../src/translation-jobs/translation-jobs.service.js';

describe('ACA Locale review queue pagination', () => {
  it('queries only the authenticated shop and applies filters to database', async () => {
    const prisma = {
      shop: { findUnique: vi.fn().mockResolvedValue({ id: 'shop-a' }) },
      translationJobItem: {
        count: vi.fn().mockResolvedValue(47),
        findMany: vi.fn().mockResolvedValue([{ id: 'item-1' }]),
      },
      $transaction: vi.fn(async (queries) => Promise.all(queries)),
    } as any;
    const result = await new TranslationJobsService(prisma).reviewQueue('shop-a.myshopify.com', {
      page: '2', limit: '30', locale: 'en', resourceType: 'PRODUCT', status: 'VALIDATED', search: 'ceramic',
    });
    expect(result).toMatchObject({ total: 47, page: 2, pages: 2 });
    expect(prisma.translationJobItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 30, skip: 30, where: expect.objectContaining({
        job: { shopId: 'shop-a', targetLocale: 'en' }, status: { in: ['VALIDATED'] },
      }),
    }));
  });
  it('rejects invalid page sizes before issuing database queries', async () => {
    const prisma = {
      shop: { findUnique: vi.fn().mockResolvedValue({ id: 'shop-a' }) },
      translationJobItem: { count: vi.fn() },
    } as any;
    await expect(new TranslationJobsService(prisma).reviewQueue('shop-a.myshopify.com', { limit: '10000' })).rejects.toThrow();
    expect(prisma.translationJobItem.count).not.toHaveBeenCalled();
  });
});
