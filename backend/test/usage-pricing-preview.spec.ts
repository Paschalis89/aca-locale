import { describe, expect, it, vi } from 'vitest';
import { UsagePricingService } from '../src/ai/usage-pricing.service.js';
import type { PrismaService } from '../src/database/prisma.service.js';

const events = [
  { provider: 'DEEPL', model: null, usageKnown: true, billedCharacters: 1000, inputTokens: 0, outputTokens: 0 },
  { provider: 'OPENAI', model: 'model-a', usageKnown: true, billedCharacters: 0, inputTokens: 100, outputTokens: 10 },
  { provider: 'ANTHROPIC', model: 'model-b', usageKnown: true, billedCharacters: 0, inputTokens: 25, outputTokens: 5 },
  { provider: 'OPENAI', model: 'model-a', usageKnown: false, billedCharacters: 0, inputTokens: 0, outputTokens: 0 },
];

describe('read-only usage pricing preview', () => {
  it('computes only priced known events and never writes anything', async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: 'shop-test' });
    const count = vi.fn().mockResolvedValue(events.length);
    const findMany = vi.fn().mockResolvedValue(events);
    const prisma = {
      shop: { findUnique },
      translationUsageEvent: { count, findMany },
    } as unknown as PrismaService;
    const service = new UsagePricingService(prisma);
    const result = await service.preview('example.myshopify.com', {
      rules: {
        'DEEPL:*': { charactersPerMillionUsd: 25 },
        'OPENAI:model-a': { inputPerMillionUsd: 1, outputPerMillionUsd: 4 },
      },
    });
    expect(result).toMatchObject({ dryRun: true, totalEvents: 4, sampledEvents: 4,
      costedEvents: 2, unpricedEvents: 1, unknownUsageEvents: 1, complete: false, truncated: false });
    expect(result.estimatedCostUsd).toBe(0.02514);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10000 }));
    expect(count).toHaveBeenCalledOnce();
  });

  it('rejects negative rates before querying history', async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: 'shop-test' });
    const count = vi.fn();
    const prisma = { shop: { findUnique }, translationUsageEvent: { count } } as unknown as PrismaService;
    const service = new UsagePricingService(prisma);
    await expect(service.preview('example.myshopify.com', {
      rules: { 'DEEPL:*': { charactersPerMillionUsd: -1 } },
    })).rejects.toThrow();
    expect(count).not.toHaveBeenCalled();
  });

  it('marks a capped simulation incomplete', async () => {
    const prisma = {
      shop: { findUnique: vi.fn().mockResolvedValue({ id: 'shop-test' }) },
      translationUsageEvent: {
        count: vi.fn().mockResolvedValue(11000),
        findMany: vi.fn().mockResolvedValue(events.slice(0, 1)),
      },
    } as unknown as PrismaService;
    const result = await new UsagePricingService(prisma).preview('example.myshopify.com', {
      rules: { 'DEEPL:*': { charactersPerMillionUsd: 25 } },
    });
    expect(result).toMatchObject({ truncated: true, complete: false, totalEvents: 11000 });
  });
});
