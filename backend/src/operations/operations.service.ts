import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';

/** Merchant-scoped operational snapshot. Never return content, error messages or secrets. */
@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async snapshot(shopifyDomain: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { shopifyDomain }, select: { id: true },
    });
    if (!shop) throw new NotFoundException('Shop is not registered.');

    const now = new Date();
    const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const staleCutoff = new Date(now.getTime() - 30 * 60 * 1000);
    const shopId = shop.id;
    const [jobsFailed, jobsStaleRunning, jobsDueRetry, itemsFailed,
      webhooksFailed, webhooksStaleProcessing, providerRows] = await Promise.all([
      this.prisma.translationJob.count({ where: { shopId, status: 'FAILED' } }),
      this.prisma.translationJob.count({ where: { shopId, status: 'RUNNING', updatedAt: { lt: staleCutoff } } }),
      this.prisma.translationJob.count({ where: { shopId, automationNextRetryAt: { lte: now }, automationCompletedAt: null } }),
      this.prisma.translationJobItem.count({ where: { job: { shopId }, status: 'FAILED' } }),
      this.prisma.translationChangeEvent.count({ where: { shopId, status: 'FAILED' } }),
      this.prisma.translationChangeEvent.count({ where: { shopId, status: 'PROCESSING', updatedAt: { lt: staleCutoff } } }),
      this.prisma.translationUsageEvent.groupBy({
        by: ['provider', 'success'], where: { shopId, createdAt: { gte: cutoff24h } },
        _count: { _all: true },
      }),
    ]);

    const providers = new Map<string, { provider: string; successes24h: number; errors24h: number; lastSuccessAt: string | null; lastErrorAt: string | null; state: 'HEALTHY' | 'RECOVERED' | 'DEGRADED' | 'UNKNOWN' }>();
    for (const row of providerRows) {
      const current = providers.get(row.provider) ?? {
        provider: row.provider, successes24h: 0, errors24h: 0,
        lastSuccessAt: null, lastErrorAt: null, state: 'UNKNOWN' as const,
      };
      if (row.success) current.successes24h += row._count._all;
      else current.errors24h += row._count._all;
      providers.set(row.provider, current);
    }
    // Fetch latest event timestamps independently of aggregate counts.
    await Promise.all([...providers.values()].map(async (provider) => {
      const [success, error] = await Promise.all([
        this.prisma.translationUsageEvent.findFirst({
          where: { shopId, provider: provider.provider, success: true, createdAt: { gte: cutoff24h } },
          select: { createdAt: true }, orderBy: { createdAt: 'desc' },
        }),
        this.prisma.translationUsageEvent.findFirst({
          where: { shopId, provider: provider.provider, success: false, createdAt: { gte: cutoff24h } },
          select: { createdAt: true }, orderBy: { createdAt: 'desc' },
        }),
      ]);
      provider.lastSuccessAt = success?.createdAt.toISOString() ?? null;
      provider.lastErrorAt = error?.createdAt.toISOString() ?? null;
      provider.state = provider.errors24h === 0 ? 'HEALTHY'
        : success && error && success.createdAt > error.createdAt ? 'RECOVERED' : 'DEGRADED';
    }));
    const providerList = [...providers.values()].sort((a, b) => a.provider.localeCompare(b.provider));
    const totalErrors24h = providerList.reduce((sum, row) => sum + row.errors24h, 0);
    const blocking = jobsFailed + jobsStaleRunning + jobsDueRetry + itemsFailed + webhooksFailed + webhooksStaleProcessing;
    return {
      snapshotAt: now.toISOString(), periodHours: 24, staleThresholdMinutes: 30,
      shop: { jobsFailed, jobsStaleRunning, jobsDueRetry, itemsFailed, webhooksFailed, webhooksStaleProcessing },
      providers: providerList, errors24h: totalErrors24h,
      state: blocking > 0 || providerList.some((row) => row.state === 'DEGRADED') ? 'DEGRADED'
        : providerList.some((row) => row.state === 'RECOVERED') ? 'RECOVERED'
        : providerList.length === 0 ? 'UNKNOWN' : 'HEALTHY',
      advisoryOnly: true,
      note: 'Shop-scoped historical snapshot; no live provider request or host infrastructure inspection. No actions are triggered.',
    };
  }
}
