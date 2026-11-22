import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';

/** Read-only, tenant-scoped operational view of existing webhook recovery and BullMQ jobs. */
@Injectable()
export class TranslationAutomationMonitorService {
  constructor(private readonly prisma: PrismaService) {}

  async get(shopifyDomain: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { shopifyDomain }, select: { id: true },
    });
    if (!shop) throw new NotFoundException('Shop is not registered.');

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [events, jobs, delayed, recentFailures] = await Promise.all([
      this.prisma.translationChangeEvent.groupBy({
        by: ['status'], where: { shopId: shop.id, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.translationJob.groupBy({
        by: ['automationStage', 'status'],
        where: { shopId: shop.id, origin: 'SHOPIFY_CHANGE', createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.translationJob.count({
        where: {
          shopId: shop.id, origin: 'SHOPIFY_CHANGE',
          automationNextRetryAt: { not: null },
          automationCompletedAt: null,
        },
      }),
      this.prisma.translationChangeEvent.findMany({
        where: { shopId: shop.id, status: 'FAILED', createdAt: { gte: since } },
        select: { id: true, topic: true, resourceType: true, attempts: true, createdAt: true },
        orderBy: { createdAt: 'desc' }, take: 10,
      }),
    ]);

    const eventCounts: Record<string, number> = { PROCESSING: 0, COMPLETED: 0, FAILED: 0 };
    for (const item of events) eventCounts[item.status] = item._count._all;
    const stageCounts: Record<string, number> = {};
    const jobStatusCounts: Record<string, number> = {};
    for (const item of jobs) {
      const count = item._count._all;
      const stage = item.automationStage || 'UNASSIGNED';
      stageCounts[stage] = (stageCounts[stage] ?? 0) + count;
      jobStatusCounts[item.status] = (jobStatusCounts[item.status] ?? 0) + count;
    }
    return {
      periodDays: 30,
      snapshotAt: new Date().toISOString(),
      events: { ...eventCounts, total: Object.values(eventCounts).reduce((a,b) => a+b,0) },
      automaticJobs: { total: Object.values(jobStatusCounts).reduce((a,b) => a+b,0), stages: stageCounts, statuses: jobStatusCounts },
      pendingRetries: delayed,
      recentFailures,
      advisoryOnly: true,
      note: 'Historical database snapshot; counts do not prove live worker availability. No retry or publication is triggered.',
    };
  }
}
