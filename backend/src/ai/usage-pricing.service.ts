import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { estimateUsageCost, readPricingRules, type UsagePricingRule } from '../translation-usage/translation-usage-cost.js';

export function validateUsagePricingRules(value: unknown): Record<string, UsagePricingRule> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Rules must be a JSON object.');
  const entries = Object.entries(value);
  if (entries.length > 50) throw new BadRequestException('Maximum 50 pricing rules.');
  const normalized: Record<string, UsagePricingRule> = {};
  for (const [rawKey, entry] of entries) {
    const trimmed = rawKey.trim();
    const colon = trimmed.indexOf(':');
    const normalizedKey = colon >= 0 ? `${trimmed.slice(0, colon).toUpperCase()}:${trimmed.slice(colon + 1)}` : trimmed;
    const match = /^([A-Z][A-Z0-9_]{1,29}):([a-zA-Z0-9_.-]{1,100}|\*)$/.exec(normalizedKey);
    if (!match) throw new BadRequestException(`Invalid provider/model key: ${rawKey}`);
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new BadRequestException(`Invalid rule: ${rawKey}`);
    const rule = entry as Record<string, unknown>;
    const allowed = ['charactersPerMillionUsd', 'inputPerMillionUsd', 'outputPerMillionUsd'];
    if (Object.keys(rule).some((k) => !allowed.includes(k))) throw new BadRequestException(`Unknown rate property: ${rawKey}`);
    if (Object.keys(rule).length === 0) throw new BadRequestException(`Empty pricing rule: ${rawKey}`);
    for (const [name, price] of Object.entries(rule)) {
      if (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > 100000) {
        throw new BadRequestException(`Invalid ${name} for ${rawKey}: USD per million units required.`);
      }
    }
    normalized[`${match[1]}:${match[2]}`] = rule as UsagePricingRule;
  }
  return normalized;
}

/** A bounded, read-only aggregation over recorded provider usage; no pricing writes. */
export function analyzePricingPreview(
  events: Array<{ provider: string; model: string | null; usageKnown: boolean; billedCharacters: number; inputTokens: number; outputTokens: number; stage?: string }>,
  rules: Record<string, UsagePricingRule>,
  totalEvents: number,
) {
  const groups = new Map<string, { provider: string; model: string | null; stage: string; events: number; priced: number; unpriced: number; unknownUsage: number; estimatedCostMicrousd: number }>();
  let costedEvents = 0;
  let unpricedEvents = 0;
  let unknownUsageEvents = 0;
  let totalMicrousd = 0;
  const missingRateKeys = new Set<string>();
  for (const event of events) {
    const provider = event.provider.trim().toUpperCase();
    const model = event.model?.trim() || null;
    const stage = event.stage ?? 'UNKNOWN';
    const key = JSON.stringify([provider, model, stage]);
    const row = groups.get(key) ?? { provider, model, stage, events: 0, priced: 0, unpriced: 0, unknownUsage: 0, estimatedCostMicrousd: 0 };
    row.events++;
    if (!event.usageKnown) {
      unknownUsageEvents++;
      row.unknownUsage++;
    } else {
      const result = estimateUsageCost(event, { rules, version: 'PREVIEW' });
      if (result.estimatedCostMicrousd === null) {
        unpricedEvents++;
        row.unpriced++;
        missingRateKeys.add(`${provider}:${model ?? '*'}`);
      } else {
        costedEvents++;
        row.priced++;
        totalMicrousd += result.estimatedCostMicrousd;
        row.estimatedCostMicrousd += result.estimatedCostMicrousd;
      }
    }
    groups.set(key, row);
  }
  const truncated = totalEvents > events.length;
  const complete = !truncated && !unpricedEvents && !unknownUsageEvents;
  const usd = (micros: number) => Number((micros / 1_000_000).toFixed(6));
  const estimatedCostUsd = usd(totalMicrousd);
  return {
    totalEvents,
    sampledEvents: events.length,
    truncated,
    costedEvents,
    unpricedEvents,
    unknownUsageEvents,
    estimatedCostUsd,
    complete,
    costCoveragePercent: totalEvents ? Number((costedEvents / totalEvents * 100).toFixed(2)) : 100,
    projected30DayUsd: complete && events.length ? estimatedCostUsd : null,
    projectedMonthUsd: complete && events.length ? usd(totalMicrousd / 30 * new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 0)).getUTCDate()) : null,
    lowerBound30DayUsd: estimatedCostUsd,
    missingRateKeys: [...missingRateKeys].sort().slice(0, 50),
    missingRateKeysTruncated: missingRateKeys.size > 50,
    byProviderModel: [...groups.values()].sort((a, b) => b.events - a.events || a.provider.localeCompare(b.provider))
      .slice(0, 50).map((g) => ({ ...g, estimatedCostUsd: usd(g.estimatedCostMicrousd), estimatedCostMicrousd: undefined })),
    groupsTruncated: groups.size > 50,
  };
}

@Injectable()
export class UsagePricingService {
  constructor(private readonly prisma: PrismaService) {}

  private async shopId(shopifyDomain: string) {
    const shop = await this.prisma.shop.findUnique({ where: { shopifyDomain }, select: { id: true } });
    if (!shop) throw new NotFoundException('Shop is not registered.');
    return shop.id;
  }

  async get(shopifyDomain: string) {
    const shopId = await this.shopId(shopifyDomain);
    const [profile, history] = await Promise.all([
      this.prisma.usagePricingProfile.findUnique({ where: { shopId } }),
      this.prisma.usagePricingRevision.findMany({ where: { shopId }, orderBy: { version: 'desc' }, take: 20,
        select: { version: true, createdAt: true } }),
    ]);
    return profile
      ? { source: 'SHOP', version: profile.version, rules: profile.rules, updatedAt: profile.updatedAt, history }
      : { source: 'ENVIRONMENT', version: 0, rules: readPricingRules(), updatedAt: null, history };
  }

  /**
   * Read-only quote of the previous 30 days using PROPOSED rates.
   * Does not mutate event snapshots, write prices, or call a provider.
   * Events reporting unknown usage are intentionally excluded from cost estimates.
   */
  async preview(shopifyDomain: string, body: { rules?: unknown }) {
    const shopId = await this.shopId(shopifyDomain);
    const rules = validateUsagePricingRules(body?.rules);
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - 29);
    from.setUTCHours(0, 0, 0, 0);

    const where = { shopId, createdAt: { gte: from } };
    const totalEvents = await this.prisma.translationUsageEvent.count({ where });
    const maxEvents = 10000;
    const events = await this.prisma.translationUsageEvent.findMany({
      where,
      select: { provider: true, model: true, stage: true, usageKnown: true, billedCharacters: true, inputTokens: true, outputTokens: true },
      orderBy: { createdAt: 'desc' },
      take: maxEvents,
    });
    const intelligence = analyzePricingPreview(events, rules, totalEvents);
    return {
      dryRun: true,
      days: 30,
      ...intelligence,
      note: 'Retrospective simulation only. Projection is a 30-day observed run-rate, not an invoice or guarantee. Historical snapshots remain unchanged.',
    };
  }

  async update(shopifyDomain: string, body: { rules?: unknown; expectedVersion?: unknown }) {
    const shopId = await this.shopId(shopifyDomain);
    const rules = validateUsagePricingRules(body?.rules);
    if (!Number.isSafeInteger(body?.expectedVersion) || (body.expectedVersion as number) < 0) {
      throw new BadRequestException('expectedVersion must be the current nonnegative version.');
    }
    const expectedVersion = body.expectedVersion as number;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${shopId}), 99131)`;
      const existing = await tx.usagePricingProfile.findUnique({ where: { shopId } });
      if ((existing?.version ?? 0) !== expectedVersion) {
        throw new BadRequestException('Pricing changed since it was loaded. Refresh before saving.');
      }
      const version = expectedVersion + 1;
      if (existing) {
        const updated = await tx.usagePricingProfile.update({ where: { shopId }, data: { rules: rules as Prisma.InputJsonValue, version } });
        await tx.usagePricingRevision.create({ data: { shopId, rules: rules as Prisma.InputJsonValue, version } });
        return updated;
      }
      const created = await tx.usagePricingProfile.create({ data: { shopId, rules: rules as Prisma.InputJsonValue, version } });
      await tx.usagePricingRevision.create({ data: { shopId, rules: rules as Prisma.InputJsonValue, version } });
      return created;
    });
  }
}
