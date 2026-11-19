import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';

const MAX_MONTHLY_CENTS = 100_000_000; // USD 1,000,000, deliberately bounded.

export function validateBudgetUpdate(body: { monthlyBudgetUsd?: unknown; expectedVersion?: unknown }) {
  if (!body || typeof body !== 'object') throw new BadRequestException('Budget payload is required.');
  if (!Number.isSafeInteger(body.expectedVersion) || (body.expectedVersion as number) < 0) {
    throw new BadRequestException('expectedVersion must be a nonnegative integer.');
  }
  const usd = body.monthlyBudgetUsd;
  if (typeof usd !== 'number' || !Number.isFinite(usd) || usd < 0 || Math.abs(usd * 100 - Math.round(usd * 100)) > 1e-7 || usd * 100 > MAX_MONTHLY_CENTS) {
    throw new BadRequestException('monthlyBudgetUsd must be between 0 and 1000000 USD, with at most two decimals.');
  }
  return { monthlyBudgetCents: Math.round(usd * 100), expectedVersion: body.expectedVersion as number };
}

export function summarizeBudgetEvents(
  events: Array<{ provider: string; model: string | null; success: boolean; usageKnown: boolean; estimatedCostMicrousd: number | null }>,
  totalEvents: number,
  monthlyBudgetCents: number,
  month: string,
  version: number,
) {
  let microusd = 0;
  let unpricedEvents = 0;
  let unknownUsageEvents = 0;
  let failedEvents = 0;
  const providerStats = new Map<string, { provider: string; events: number; failed: number; unpriced: number; estimatedCostMicrousd: number }>();
  const modelStats = new Map<string, { provider: string; model: string; events: number; failed: number; estimatedCostMicrousd: number }>();
  for (const e of events) {
    const provider = e.provider.toUpperCase();
    const stats = providerStats.get(provider) ?? { provider, events: 0, failed: 0, unpriced: 0, estimatedCostMicrousd: 0 };
    stats.events++;
    if (!e.success) { failedEvents++; stats.failed++; }
    if (!e.usageKnown) unknownUsageEvents++;
    if (e.estimatedCostMicrousd === null) { unpricedEvents++; stats.unpriced++; }
    else { microusd += e.estimatedCostMicrousd; stats.estimatedCostMicrousd += e.estimatedCostMicrousd; }
    providerStats.set(provider, stats);
    const key = `${provider}:${e.model ?? '(none)'}`;
    const m = modelStats.get(key) ?? { provider, model: e.model ?? '(none)', events: 0, failed: 0, estimatedCostMicrousd: 0 };
    m.events++;
    if (!e.success) m.failed++;
    if (e.estimatedCostMicrousd !== null) m.estimatedCostMicrousd += e.estimatedCostMicrousd;
    modelStats.set(key,m);
  }
  const budgetMicrousd = monthlyBudgetCents * 10000;
  const percent = budgetMicrousd > 0 ? Number((microusd / budgetMicrousd * 100).toFixed(2)) : null;
  const incomplete = totalEvents > events.length || unpricedEvents > 0 || unknownUsageEvents > 0;
  const threshold = percent === null ? 'NOT_CONFIGURED' : percent >= 100 ? 'OVER_100' : percent >= 80 ? 'OVER_80' : percent >= 50 ? 'OVER_50' : 'BELOW_50';
  return {
    month, version, monthlyBudgetUsd: monthlyBudgetCents / 100, estimatedCostUsd: Number((microusd / 1000000).toFixed(6)),
    percentOfBudget: percent, threshold, incomplete, advisoryOnly: true, enforcementEnabled: false,
    totalEvents, sampledEvents: events.length, truncated: totalEvents > events.length,
    unpricedEvents, unknownUsageEvents, failedEvents,
    byProvider: [...providerStats.values()].sort((a,b) => a.provider.localeCompare(b.provider)).map(s => ({provider: s.provider, events: s.events, failed: s.failed, unpriced: s.unpriced, estimatedCostUsd: Number((s.estimatedCostMicrousd / 1000000).toFixed(6))})),
    byModel: [...modelStats.values()].sort((a,b) => b.failed - a.failed || b.events - a.events).slice(0, 30).map(s => ({provider:s.provider, model:s.model, events:s.events, failed:s.failed, estimatedCostUsd:Number((s.estimatedCostMicrousd / 1000000).toFixed(6))})),
    note: 'Advisory estimates only. Missing pricing/usage means actual spend can be higher. No automatic execution blocks.',
  };
}

/** Classify provider failures without returning raw messages or translation contents. */
export function classifyProviderError(message: string | null): string {
  if (!message) return 'UNSPECIFIED';
  if (/\b(429|rate.limit|too.many.requests|quota)\b/i.test(message)) return 'RATE_LIMIT';
  if (/\b(401|403|unauthori[sz]ed|forbidden|invalid.api.key|authentication)\b/i.test(message)) return 'AUTHENTICATION';
  if (/\b(timeout|timed.out|ETIMEDOUT|abort)\b/i.test(message)) return 'TIMEOUT';
  if (/\b(500|502|503|504|unavailable|ECONNRESET|ECONNREFUSED)\b/i.test(message)) return 'PROVIDER_UNAVAILABLE';
  if (/\b(400|422|invalid.request|validation)\b/i.test(message)) return 'INVALID_REQUEST';
  return 'OTHER';
}

export type FailureSnapshot = {
  id: string;
  createdAt: Date;
  provider: string;
  model: string | null;
  stage: string;
  fallback: boolean;
  errorMessage: string | null;
};

export function buildOperationalAlerts(input: {
  threshold: string;
  incomplete: boolean;
  unpricedEvents: number;
  unknownUsageEvents: number;
  failedEvents: number;
  truncated: boolean;
  fallbackEvents: number;
}) {
  const alerts: Array<{ code: string; severity: 'INFO' | 'WARNING' | 'CRITICAL'; title: string; detail: string }> = [];
  if (input.threshold === 'OVER_100' || input.threshold === 'OVER_80' || input.threshold === 'OVER_50') {
    alerts.push({ code: 'BUDGET_' + input.threshold, severity: input.threshold === 'OVER_100' ? 'CRITICAL' : 'WARNING', title: 'Advisory budget threshold', detail: `Known estimated costs reached the ${input.threshold === 'OVER_100' ? '100' : input.threshold === 'OVER_80' ? '80' : '50'}% threshold. No automatic blocking is enabled.` });
  }
  if (input.incomplete) alerts.push({ code: 'INCOMPLETE_COST_COVERAGE', severity: 'WARNING', title: 'Incomplete AI cost coverage', detail: `${input.unpricedEvents} unpriced and ${input.unknownUsageEvents} unknown-usage events. Budget percentage is a lower bound${input.truncated ? '; report is also truncated' : ''}.` });
  if (input.failedEvents > 0) alerts.push({ code: 'PROVIDER_FAILURES', severity: 'WARNING', title: 'Provider calls failed', detail: `${input.failedEvents} failed provider calls this month. See recent failure history below.` });
  if (input.fallbackEvents > 0) alerts.push({ code: 'FALLBACK_OBSERVED', severity: 'INFO', title: 'Fallback usage observed', detail: `${input.fallbackEvents} events were recorded with fallback=true this month; existing fallback configuration was not changed.` });
  return alerts;
}

@Injectable()
export class AiBudgetService {
  constructor(private readonly prisma: PrismaService) {}

  private async shopId(shopifyDomain: string) {
    const shop = await this.prisma.shop.findUnique({ where: { shopifyDomain }, select: { id: true } });
    if (!shop) throw new NotFoundException('Shop not found.');
    return shop.id;
  }

  async get(shopifyDomain: string) {
    const shopId = await this.shopId(shopifyDomain);
    const profile = await this.prisma.aiBudgetProfile.findUnique({ where: { shopId } });
    const from = new Date();
    from.setUTCDate(1); from.setUTCHours(0,0,0,0);
    const until = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
    const where = { shopId, createdAt: { gte: from, lt: until } };
    const totalEvents = await this.prisma.translationUsageEvent.count({ where });
    const events = await this.prisma.translationUsageEvent.findMany({
      where, orderBy: { createdAt: 'desc' }, take: 10000,
      select: { provider: true, model: true, success: true, usageKnown: true, estimatedCostMicrousd: true, fallback: true },
    });
    const summary = summarizeBudgetEvents(events, totalEvents, profile?.monthlyBudgetCents ?? 0, from.toISOString().slice(0,7), profile?.version ?? 0);
    // Failure list comes from the existing, shop-scoped usage ledger. No raw error text is sent to the browser.
    const failures = await this.prisma.translationUsageEvent.findMany({
      where: { ...where, success: false }, orderBy: { createdAt: 'desc' }, take: 30,
      select: { id: true, createdAt: true, provider: true, model: true, stage: true, fallback: true, errorMessage: true },
    });
    const fallbackEvents = await this.prisma.translationUsageEvent.count({ where: { ...where, fallback: true } });
    const recentFailures = failures.map((event: FailureSnapshot) => ({
      id: event.id, createdAt: event.createdAt.toISOString(), provider: event.provider.toUpperCase(),
      model: event.model, stage: event.stage, fallback: event.fallback,
      category: classifyProviderError(event.errorMessage),
    }));
    return {
      ...summary,
      fallbackEvents,
      recentFailures,
      failureHistoryTruncated: summary.failedEvents > recentFailures.length,
      alerts: buildOperationalAlerts({ ...summary, fallbackEvents }),
      alertDelivery: 'IN_APP_ONLY',
      fallbackPolicy: 'UNCHANGED',
    };
  }

  async update(shopifyDomain: string, body: { monthlyBudgetUsd?: unknown; expectedVersion?: unknown }) {
    const { monthlyBudgetCents, expectedVersion } = validateBudgetUpdate(body);
    const shopId = await this.shopId(shopifyDomain);
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${shopId}), 99132)`;
      const current = await tx.aiBudgetProfile.findUnique({ where: { shopId } });
      if ((current?.version ?? 0) !== expectedVersion) throw new BadRequestException('Budget changed; refresh before saving.');
      const version = expectedVersion + 1;
      const saved = current
        ? await tx.aiBudgetProfile.update({ where: { shopId }, data: { monthlyBudgetCents, version } })
        : await tx.aiBudgetProfile.create({ data: { shopId, monthlyBudgetCents, version } });
      return { monthlyBudgetUsd: saved.monthlyBudgetCents / 100, version: saved.version, advisoryOnly: true };
    });
  }
}
