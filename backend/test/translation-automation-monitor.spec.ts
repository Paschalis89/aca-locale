import { describe, expect, it, vi } from 'vitest';
import { TranslationAutomationMonitorService } from '../src/translation-jobs/translation-automation-monitor.service.js';

describe('Translation automation monitor (read only)', () => {
  it('rejects unknown shops without querying tenant data', async () => {
    const prisma = { shop: { findUnique: vi.fn().mockResolvedValue(null) }, translationJob: { groupBy: vi.fn() } } as any;
    await expect(new TranslationAutomationMonitorService(prisma).get('missing.myshopify.com')).rejects.toThrow('Shop is not registered');
    expect(prisma.translationJob.groupBy).not.toHaveBeenCalled();
  });

  it('aggregates only shop-scoped events and automatic jobs', async () => {
    const prisma = {
      shop: { findUnique: vi.fn().mockResolvedValue({ id: 'shop-1' }) },
      translationChangeEvent: {
        groupBy: vi.fn().mockResolvedValue([{ status: 'COMPLETED', _count: { _all: 3 } }, { status: 'FAILED', _count: { _all: 1 } }]),
        findMany: vi.fn().mockResolvedValue([{ id: 'e1', topic: 'products/update', resourceType: 'PRODUCT', attempts: 2, createdAt: new Date() }]),
      },
      translationJob: {
        groupBy: vi.fn().mockResolvedValue([{ automationStage: 'AI_REVIEW', status: 'RUNNING', _count: { _all: 2 } }]),
        count: vi.fn().mockResolvedValue(1),
      },
    } as any;
    const report = await new TranslationAutomationMonitorService(prisma).get('shop.myshopify.com');
    expect(report.events).toMatchObject({ COMPLETED: 3, FAILED: 1, PROCESSING: 0, total: 4 });
    expect(report.automaticJobs).toMatchObject({ total: 2, stages: { AI_REVIEW: 2 } });
    expect(report.pendingRetries).toBe(1);
    expect(report.advisoryOnly).toBe(true);
    expect(prisma.translationChangeEvent.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ shopId: 'shop-1' }) }));
    expect(prisma.translationJob.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ shopId: 'shop-1', origin: 'SHOPIFY_CHANGE' }) }));
    expect(prisma.translationChangeEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10, select: expect.not.objectContaining({ errorMessage: true }) }));
  });
});
