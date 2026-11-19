import { describe, expect, it, vi } from 'vitest';
import { AiBudgetService, buildOperationalAlerts, classifyProviderError } from '../src/ai/ai-budget.service.js';
import type { PrismaService } from '../src/database/prisma.service.js';

describe('v0.9.9 advisory alerts and safe provider error history', () => {
  it('classifies failures without returning secret-bearing messages', () => {
    expect(classifyProviderError('API key abc 401 Unauthorized')).toBe('AUTHENTICATION');
    expect(classifyProviderError('429 Rate limit exceeded')).toBe('RATE_LIMIT');
    expect(classifyProviderError('ETIMEDOUT private host')).toBe('TIMEOUT');
    expect(classifyProviderError('unexpected content: secret')).toBe('OTHER');
  });
  it('emits advisory threshold, coverage and provider alerts', () => {
    const alerts = buildOperationalAlerts({ threshold: 'OVER_80', incomplete: true, unpricedEvents: 3, unknownUsageEvents: 1, failedEvents: 2, truncated: false, fallbackEvents: 1 });
    expect(alerts.map(a => a.code)).toEqual(['BUDGET_OVER_80', 'INCOMPLETE_COST_COVERAGE', 'PROVIDER_FAILURES', 'FALLBACK_OBSERVED']);
    expect(buildOperationalAlerts({ threshold:'BELOW_50', incomplete:false, unpricedEvents:0,unknownUsageEvents:0,failedEvents:0,truncated:false,fallbackEvents:0 })).toEqual([]);
  });
  it('returns tenant-scoped, redacted error events; does not mutate the ledger', async () => {
    const prisma = {
      shop: { findUnique: vi.fn().mockResolvedValue({ id: 'shop-1' }) },
      aiBudgetProfile: { findUnique: vi.fn().mockResolvedValue({ version: 1, monthlyBudgetCents: 2000 }) },
      translationUsageEvent: {
        count: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0),
        findMany: vi.fn().mockResolvedValueOnce([{ provider:'DEEPL',model:null,success:false,usageKnown:false,estimatedCostMicrousd:null,fallback:false }]).mockResolvedValueOnce([{
          id:'evt-1', createdAt:new Date('2026-11-19T12:00:00Z'),provider:'DEEPL',model:null,stage:'TRANSLATION',fallback:false,errorMessage:'401 secret=topsecret',
        }]),
      },
    } as unknown as PrismaService;
    const result = await new AiBudgetService(prisma).get('shop.myshopify.com');
    expect(result.recentFailures).toMatchObject([{ category:'AUTHENTICATION',provider:'DEEPL' }]);
    expect(JSON.stringify(result)).not.toContain('topsecret');
    const calls = vi.mocked(prisma.translationUsageEvent.findMany).mock.calls;
    expect(calls[1][0]).toMatchObject({ where: { shopId:'shop-1',success:false }, take:30 });
    expect(prisma.translationUsageEvent.count).toHaveBeenCalledTimes(2);
  });
});
