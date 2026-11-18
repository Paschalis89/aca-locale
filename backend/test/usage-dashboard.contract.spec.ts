import { describe, expect, it, vi } from 'vitest';
import { TranslationJobsService } from '../src/translation-jobs/translation-jobs.service.js';
import { formatUsageUsd, usageHasUnpricedCosts } from '../../app/lib/usage-analytics.js';

describe('ACA Locale v0.9.3 usage dashboard contract', () => {
  it('returns flat totals, staged usage and unpriced counters', async () => {
    const prisma = {
      shop: { findUnique: vi.fn().mockResolvedValue({ id: 'shop-a' }) },
      translationUsageEvent: {
        findMany: vi.fn().mockResolvedValue([
          { stage: 'TRANSLATION', provider: 'DEEPL', model: null, success: true,
            usageKnown: true, billedCharacters: 1096, inputTokens: 0, outputTokens: 0,
            estimatedCostMicrousd: null, createdAt: new Date('2026-11-18T12:00:00Z') },
          { stage: 'AI_REVIEW', provider: 'ANTHROPIC', model: 'test-model', success: true,
            usageKnown: true, billedCharacters: 0, inputTokens: 1237, outputTokens: 302,
            estimatedCostMicrousd: 5, createdAt: new Date('2026-11-18T12:01:00Z') },
        ]),
      },
    } as any;
    const service = new TranslationJobsService(prisma);
    const result = await service.usageSummary('shop-a.myshopify.com', '30');
    expect(result.totals).toMatchObject({ events: 2, billedCharacters: 1096,
      inputTokens: 1237, outputTokens: 302, estimatedCostMicrousd: 5,
      unpricedEvents: 1, costedEvents: 1 });
    expect(result.byStage).toHaveLength(2);
    expect(result.byProvider).toHaveLength(2);
    expect(prisma.translationUsageEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ shopId: 'shop-a' }) }),
    );
  });

  it('does not display nonzero micro-costs as zero and marks unknown price', () => {
    expect(formatUsageUsd(0)).toBe('$0.00');
    expect(formatUsageUsd(5)).toBe('$0.000005');
    expect(formatUsageUsd(null)).toBe('Not priced');
    expect(usageHasUnpricedCosts({ unpricedEvents: 1 })).toBe(true);
    expect(usageHasUnpricedCosts({ unpricedEvents: 0 })).toBe(false);
  });
});
