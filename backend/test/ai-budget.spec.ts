import { describe, expect, it, vi } from 'vitest';
import { AiBudgetService, summarizeBudgetEvents, validateBudgetUpdate } from '../src/ai/ai-budget.service.js';
import type { PrismaService } from '../src/database/prisma.service.js';

describe('AI budget advisory', () => {
  it('rejects invalid input and accepts a zero budget', () => {
    expect(validateBudgetUpdate({ monthlyBudgetUsd: 0, expectedVersion: 0 })).toEqual({ monthlyBudgetCents: 0, expectedVersion: 0 });
    expect(() => validateBudgetUpdate({ monthlyBudgetUsd: -1, expectedVersion: 0 })).toThrow();
    expect(() => validateBudgetUpdate({ monthlyBudgetUsd: 1.123, expectedVersion: 0 })).toThrow();
    expect(() => validateBudgetUpdate({ monthlyBudgetUsd: 5, expectedVersion: -1 })).toThrow();
  });
  it('shows 50, 80 and 100 percent thresholds without enforcement', () => {
    const event = (microusd: number) => [{provider:'OPENAI',model:'test',success:true,usageKnown:true,estimatedCostMicrousd:microusd}];
    const at50 = summarizeBudgetEvents(event(500_000),1,100,'2026-11',1);
    const at80 = summarizeBudgetEvents(event(800_000),1,100,'2026-11',1);
    const at100 = summarizeBudgetEvents(event(1_000_000),1,100,'2026-11',1);
    expect([at50.threshold,at80.threshold,at100.threshold]).toEqual(['OVER_50','OVER_80','OVER_100']);
    expect(at100.enforcementEnabled).toBe(false);
  });
  it('does not treat missing costs as free usage', () => {
    const result = summarizeBudgetEvents([
      {provider:'ANTHROPIC',model:null,success:false,usageKnown:false,estimatedCostMicrousd:null},
      {provider:'OPENAI',model:null,success:true,usageKnown:true,estimatedCostMicrousd:200000},
    ], 3, 100,'2026-11',1);
    expect(result).toMatchObject({ incomplete:true,truncated:true,failedEvents:1,unpricedEvents:1,unknownUsageEvents:1,estimatedCostUsd:0.2 });
  });
  it('reads shop-scoped monthly ledger without changing events', async () => {
    const prisma = {
      shop: {findUnique: vi.fn().mockResolvedValue({id:'shop-1'})},
      aiBudgetProfile: {findUnique: vi.fn().mockResolvedValue({version:2,monthlyBudgetCents:2500})},
      translationUsageEvent: {count:vi.fn().mockResolvedValue(0),findMany:vi.fn().mockResolvedValue([])},
    } as unknown as PrismaService;
    const result = await new AiBudgetService(prisma).get('shop.myshopify.com');
    expect(result).toMatchObject({version:2,monthlyBudgetUsd:25,threshold:'BELOW_50',advisoryOnly:true});
    expect(prisma.translationUsageEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({take:10000}));
  });
});
