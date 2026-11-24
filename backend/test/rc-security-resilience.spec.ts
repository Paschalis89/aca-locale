import { TranslationJobsService } from '../src/translation-jobs/translation-jobs.service.js';
import { InternalTranslationChangeService } from '../src/internal/internal-translation-change.service.js';

const shopA = 'a-shop.myshopify.com';
const shopB = 'b-shop.myshopify.com';
const gid = 'gid://shopify/Product/100';

function jobHarness() {
  const entries = [{ id: 'job-a', shopDomain: shopA }, { id: 'job-b', shopDomain: shopB }];
  const prisma = {
    translationJob: {
      findFirst: vi.fn(async (query: any) =>
        entries.find((item) => item.id === query.where.id &&
          item.shopDomain === query.where.shop?.shopifyDomain) ?? null),
    },
  } as any;
  return { prisma, service: new TranslationJobsService(prisma) };
}

function eventHarness(status: string, updatedAt = new Date()) {
  const shop = { id: 'shop-a', status: 'ACTIVE', sourceLocale: 'it',
    languages: [{ language: { locale: 'en' } }] };
  const event = { id: 'event-a', shopDomain: shopA, webhookId: 'webhook-a',
    status, resourceType: 'PRODUCT', shopifyResourceId: gid,
    action: 'UPSERT', updatedAt, attempts: 1 };
  const prisma = {
    shop: { findUnique: vi.fn(async (query: any) =>
      query.where.shopifyDomain === shopA ? shop : null) },
    translationChangeEvent: {
      findUnique: vi.fn(async (query: any) =>
        query.where.shopId_webhookId?.shopId === shop.id &&
        query.where.shopId_webhookId?.webhookId === event.webhookId ? event : null),
      findFirst: vi.fn(async (query: any) =>
        query.where.id === event.id && query.where.shop?.shopifyDomain === event.shopDomain ? event : null),
      update: vi.fn(async (query: any) => ({ ...event, ...query.data })),
      create: vi.fn(),
    },
  } as any;
  const scanner = { sync: vi.fn(), markResourceDeleted: vi.fn() } as any;
  const jobs = { createFromShopifyChange: vi.fn() } as any;
  const queue = { enqueue: vi.fn() } as any;
  return { prisma, scanner, jobs, queue, service: new InternalTranslationChangeService(prisma, scanner, jobs, queue) };
}

const claimInput = { shopifyDomain: shopA, webhookId: 'webhook-a',
  resourceType: 'PRODUCT', shopifyResourceId: gid, action: 'UPSERT', topic: 'PRODUCTS_UPDATE' } as any;
const upsertInput = { shopifyDomain: shopA, eventId: 'event-a',
  resourceType: 'PRODUCT', shopifyResourceId: gid, content: [], locales: [] } as any;

describe('v1.0 RC tenant isolation and webhook resilience (isolated mock tests)', () => {
  it('reads a job only when its owner matches the authenticated tenant', async () => {
    const { prisma, service } = jobHarness();
    await expect(service.findOne(shopA, 'job-a')).resolves.toMatchObject({ id: 'job-a' });
    await expect(service.findOne(shopB, 'job-a')).rejects.toThrow('Translation job not found');
    expect(prisma.translationJob.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: 'job-a', shop: { shopifyDomain: shopB } } }),
    );
  });

  it('rejects a cross-shop event before changing data', async () => {
    const h = eventHarness('PROCESSING');
    await expect(h.service.processUpsert({ ...upsertInput, shopifyDomain: shopB }))
      .rejects.toThrow('Translation change event not found');
    expect(h.scanner.sync).not.toHaveBeenCalled();
    expect(h.jobs.createFromShopifyChange).not.toHaveBeenCalled();
  });

  it('acknowledges a matching completed event without replaying work', async () => {
    const h = eventHarness('COMPLETED');
    await expect(h.service.processUpsert(upsertInput))
      .resolves.toMatchObject({ completed: true, alreadyCompleted: true });
    expect(h.scanner.sync).not.toHaveBeenCalled();
    expect(h.queue.enqueue).not.toHaveBeenCalled();
  });

  it('rejects a completed event replayed against a different resource', async () => {
    const h = eventHarness('COMPLETED');
    await expect(h.service.processUpsert({ ...upsertInput, shopifyResourceId: 'gid://shopify/Product/999' }))
      .rejects.toThrow('does not match');
    expect(h.scanner.sync).not.toHaveBeenCalled();
  });

  it('marks an in-flight duplicate for retry rather than processing it twice', async () => {
    const h = eventHarness('PROCESSING');
    const outcome = await h.service.claim(claimInput);
    expect(outcome).toMatchObject({ process: false, duplicate: true, status: 'PROCESSING' });
    expect(h.prisma.translationChangeEvent.update).not.toHaveBeenCalled();
  });

  it('reclaims a failed event without generating a new event', async () => {
    const h = eventHarness('FAILED');
    const outcome = await h.service.claim(claimInput);
    expect(outcome).toMatchObject({ process: true, retry: true });
    expect(h.prisma.translationChangeEvent.update).toHaveBeenCalledOnce();
    expect(h.prisma.translationChangeEvent.create).not.toHaveBeenCalled();
  });

  it('reclaims stale processing but never fresh processing', async () => {
    const h = eventHarness('PROCESSING', new Date(Date.now() - 6 * 60 * 1000));
    const outcome = await h.service.claim(claimInput);
    expect(outcome).toMatchObject({ process: true, retry: true });
    expect(h.prisma.translationChangeEvent.update).toHaveBeenCalledOnce();
  });
});
