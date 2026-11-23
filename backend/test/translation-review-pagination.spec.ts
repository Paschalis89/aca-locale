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
  it('keeps ALL restricted to actionable statuses, scoped to the authenticated shop', async () => {
    const prisma = {
      shop: { findUnique: vi.fn().mockResolvedValue({ id: 'shop-a' }) },
      translationJobItem: { count: vi.fn().mockResolvedValue(2), findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn(async (queries) => Promise.all(queries)),
    } as any;
    await new TranslationJobsService(prisma).reviewQueue('shop-a.myshopify.com', { status: 'ALL' });
    expect(prisma.translationJobItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ job: { shopId: 'shop-a' }, status: { in: ['VALIDATED', 'NEEDS_REVIEW'] } }),
    }));
  });
  it.each(['APPROVED', 'PUBLISHED', 'REJECTED'])('allows explicit history status %s for the authenticated shop', async (status) => {
    const prisma = {
      shop: { findUnique: vi.fn().mockResolvedValue({ id: 'shop-a' }) },
      translationJobItem: { count: vi.fn().mockResolvedValue(1), findMany: vi.fn().mockResolvedValue([{ id: 'item-1' }]) },
      $transaction: vi.fn(async (queries) => Promise.all(queries)),
    } as any;
    const result = await new TranslationJobsService(prisma).reviewQueue('shop-a.myshopify.com', { status, search: '11593966518599' });
    expect(result.total).toBe(1);
    expect(prisma.translationJobItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ job: { shopId: 'shop-a' }, status: { in: [status] } }),
    }));
  });
  it('rejects unsupported history status before querying items', async () => {
    const prisma = {
      shop: { findUnique: vi.fn().mockResolvedValue({ id: 'shop-a' }) },
      translationJobItem: { count: vi.fn(), findMany: vi.fn() },
    } as any;
    await expect(new TranslationJobsService(prisma).reviewQueue('shop-a.myshopify.com', { status: 'FAILED' })).rejects.toThrow('Invalid review status');
    expect(prisma.translationJobItem.count).not.toHaveBeenCalled();
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
