import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { readPricingRules, type UsagePricingRule } from '../translation-usage/translation-usage-cost.js';

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
