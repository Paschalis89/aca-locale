import { afterAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { InternalTranslationChangeService } from '../src/internal/internal-translation-change.service.js';

const SHOP_DOMAIN = 'qa-event.myshopify.com';
const input = {
  shopifyDomain: SHOP_DOMAIN,
  webhookId: 'webhook-qa-1',
  topic: 'PRODUCTS_UPDATE',
  resourceType: 'PRODUCT',
  shopifyResourceId: 'gid://shopify/Product/123',
  action: 'UPSERT',
} as const;

function createHarness(
  createError: unknown,
  competingEvent: Record<string, unknown> | null,
) {
  const findUnique = vi.fn()
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(competingEvent);
  const create = vi.fn().mockRejectedValue(createError);
  const prisma = {
    shop: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'shop-qa', status: 'ACTIVE', sourceLocale: 'it', languages: [],
      }),
    },
    translationChangeEvent: { findUnique, create, update: vi.fn() },
  } as any;
  const service = new InternalTranslationChangeService(
    prisma, {} as any, {} as any,
  );
  return { service, findUnique, create };
}

const event = {
  id: 'event-qa', shopId: 'shop-qa', webhookId: input.webhookId,
  topic: input.topic, resourceType: input.resourceType,
  shopifyResourceId: input.shopifyResourceId,
  action: input.action, status: 'PROCESSING',
};

describe('G6.1 Shopify content change claim concurrency (service regression)', () => {
  it('turns a competing P2002 insert into a non-processing duplicate', async () => {
    const h = createHarness({ code: 'P2002' }, event);
    await expect(h.service.claim(input as any)).resolves.toMatchObject({
      eventId: 'event-qa', process: false,
      duplicate: true, status: 'PROCESSING',
    });
    expect(h.findUnique).toHaveBeenCalledTimes(2);
    expect(h.create).toHaveBeenCalledTimes(1);
  });

  it('does not acknowledge a reused webhook id for a different resource', async () => {
    const h = createHarness({ code: 'P2002' }, {
      ...event, shopifyResourceId: 'gid://shopify/Product/999',
    });
    await expect(h.service.claim(input as any)).rejects.toThrow(
      'Webhook ID does not match',
    );
  });

  it('rethrows P2002 if the matching event cannot be retrieved', async () => {
    const error = { code: 'P2002' };
    const h = createHarness(error, null);
    await expect(h.service.claim(input as any)).rejects.toBe(error);
  });

  it('rethrows non-P2002 errors without retrying lookups', async () => {
    const error = { code: 'P1001' };
    const h = createHarness(error, event);
    await expect(h.service.claim(input as any)).rejects.toBe(error);
    expect(h.findUnique).toHaveBeenCalledTimes(1);
  });

  it('rejects mismatched original events even without an insert race', async () => {
    const h = createHarness({ code: 'P2002' }, event);
    h.findUnique.mockReset().mockResolvedValue({
      ...event, topic: 'COLLECTIONS_UPDATE', updatedAt: new Date(),
    });
    await expect(h.service.claim(input as any)).rejects.toThrow(
      'Webhook ID does not match',
    );
    expect(h.create).not.toHaveBeenCalled();
  });
});

const dbUrl = process.env.ACA_LOCK_TEST_DATABASE_URL;
const prisma = dbUrl
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) })
  : null;

afterAll(async () => {
  await prisma?.$disconnect();
});

describe.skipIf(!dbUrl)('G6.1 two concurrent claims with real PostgreSQL', () => {
  it('keeps exactly one event and handles both deliveries', async () => {
    if (!prisma) throw new Error('QA database missing');
    const uid = randomUUID().replace(/-/g, '');
    const shopifyDomain = `qa-${uid}.myshopify.com`;
    const shop = await prisma.shop.create({
      data: { shopifyDomain, status: 'ACTIVE', sourceLocale: 'it' },
    });
    try {
      let reads = 0;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const delegate = {
        findUnique: async (args: any) => {
          const result = await prisma.translationChangeEvent.findUnique(args);
          reads += 1;
          if (reads === 2) release();
          await gate;
          return result;
        },
        create: (args: any) => prisma.translationChangeEvent.create(args),
        update: (args: any) => prisma.translationChangeEvent.update(args),
      };
      const service = new InternalTranslationChangeService({
        shop: { findUnique: async () => ({
          id: shop.id, status: 'ACTIVE', sourceLocale: 'it', languages: [],
        }) },
        translationChangeEvent: delegate,
      } as any, {} as any, {} as any);

      const data = {
        ...input, shopifyDomain, webhookId: `qa-${uid}`,
      };
      const outcomes = await Promise.allSettled([
        service.claim(data as any), service.claim(data as any),
      ]);
      const records = await prisma.translationChangeEvent.findMany({
        where: { shopId: shop.id, webhookId: data.webhookId },
      });
      expect(records).toHaveLength(1);
      expect(outcomes.every((result) => result.status === 'fulfilled')).toBe(true);
      const values = outcomes.map((result) => {
        if (result.status !== 'fulfilled') throw result.reason;
        return result.value;
      });
      expect(values.filter((value) => value.process === true)).toHaveLength(1);
      expect(values.filter((value) => value.duplicate === true)).toHaveLength(1);
      expect(values.find((value) => value.duplicate)?.status).toBe('PROCESSING');
    } finally {
      await prisma.shop.delete({ where: { id: shop.id } });
    }
  }, 20000);
});
