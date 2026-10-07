import { describe, expect, it, vi } from 'vitest';

import { TranslationExecutorService } from '../src/translation-engine/translation-executor.service.js';

function queuedJob() {
  return {
    id: 'job-1',
    shopId: 'shop-1',
    sourceLocale: 'en',
    targetLocale: 'it',
    status: 'QUEUED',
    provider: 'OPENAI',
    model: 'primary-model',
    fallbackProvider: 'DEEPL',
    fallbackModel: null,
    startedAt: null,
    items: [
      {
        id: 'item-1',
        status: 'PENDING',
        sourceValue: 'Gift Card',
        model: 'primary-model',
        field: {
          type: 'SINGLE_LINE_TEXT_FIELD',
          key: 'title',
          sourceLocale: 'en',
          resource: {
            resourceType: 'PRODUCT',
            shopifyResourceId: 'gid://shopify/Product/1',
          },
        },
      },
    ],
  };
}

function createPrisma() {
  return {
    translationJob: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    translationJobItem: {
      updateMany: vi.fn(),
    },
    translationUsageEvent: {
      create: vi.fn(),
    },
  } as any;
}

describe('TranslationExecutorService', () => {
  it('skips a duplicate execution when a job is already running', async () => {
    const prisma = createPrisma();
    prisma.translationJob.findFirst.mockResolvedValue({
      ...queuedJob(),
      status: 'RUNNING',
    });

    const providers = {
      getProvider: vi.fn(),
    } as any;
    const validator = {
      validate: vi.fn(),
    } as any;

    const service = new TranslationExecutorService(
      prisma,
      providers,
      validator,
    );

    const result = await service.execute('shop-a.myshopify.com', 'job-1');

    expect(result.execution).toEqual({
      skipped: true,
      reason: 'ALREADY_RUNNING',
    });
    expect(providers.getProvider).not.toHaveBeenCalled();
  });

  it('uses the atomic job claim to prevent two executors from owning the same queued job', async () => {
    const prisma = createPrisma();
    const job = queuedJob();

    prisma.translationJob.findFirst
      .mockResolvedValueOnce(job)
      .mockResolvedValueOnce({ ...job, status: 'RUNNING' });
    prisma.translationJob.updateMany.mockResolvedValue({ count: 0 });

    const adapter = {
      translate: vi.fn(),
    };
    const providers = {
      getProvider: vi.fn(() => adapter),
    } as any;
    const validator = {
      validate: vi.fn(),
    } as any;

    const service = new TranslationExecutorService(
      prisma,
      providers,
      validator,
    );

    const result = await service.execute('shop-a.myshopify.com', 'job-1');

    expect(result.execution).toEqual({
      skipped: true,
      reason: 'ALREADY_CLAIMED',
    });
    expect(adapter.translate).not.toHaveBeenCalled();
  });

  it('falls back to the secondary provider and does not fail translation if usage persistence fails', async () => {
    const prisma = createPrisma();
    const job = queuedJob();
    const completedJob = {
      ...job,
      status: 'COMPLETED',
      completedItems: 1,
      failedItems: 0,
      items: [
        {
          ...job.items[0],
          status: 'VALIDATED',
          translatedValue: 'Buono regalo',
          provider: 'DEEPL',
          fallbackUsed: true,
        },
      ],
    };

    prisma.translationJob.findFirst
      .mockResolvedValueOnce(job)
      .mockResolvedValueOnce(completedJob);
    prisma.translationJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.translationJobItem.updateMany.mockResolvedValue({ count: 1 });
    prisma.translationJob.findUnique.mockResolvedValue({ status: 'RUNNING' });
    prisma.translationJob.update.mockResolvedValue(completedJob);
    prisma.translationUsageEvent.create.mockRejectedValue(
      new Error('usage ledger unavailable'),
    );

    const primary = {
      translate: vi.fn().mockRejectedValue(new Error('primary failed')),
    };
    const fallback = {
      translate: vi.fn().mockResolvedValue({
        text: 'Buono regalo',
        provider: 'DEEPL',
        model: null,
        billedCharacters: 9,
        inputTokens: 0,
        outputTokens: 0,
      }),
    };

    const providers = {
      getProvider: vi.fn((provider: string) =>
        provider === 'OPENAI' ? primary : fallback,
      ),
    } as any;

    const validator = {
      validate: vi.fn(() => ({
        passed: true,
        version: 'deterministic-v1',
        errorCount: 0,
        warningCount: 0,
        issues: [],
      })),
    } as any;

    const service = new TranslationExecutorService(
      prisma,
      providers,
      validator,
    );

    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const result = await service.execute('shop-a.myshopify.com', 'job-1');

    expect(primary.translate).toHaveBeenCalledTimes(1);
    expect(fallback.translate).toHaveBeenCalledTimes(1);
    expect(result.execution.fallbackAttempts).toBe(1);
    expect(result.execution.fallbackSuccesses).toBe(1);
    expect(result.execution.billedCharacters).toBe(9);
    expect(result.status).toBe('COMPLETED');
    expect(prisma.translationUsageEvent.create).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
