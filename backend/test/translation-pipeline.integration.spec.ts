import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { TranslationHumanReviewService } from '../src/translation-human-review/translation-human-review.service.js';
import { TranslationPublicationService } from '../src/translation-publication/translation-publication.service.js';

/**
 * v0.9.17: integrated workflow against the real NestJS domain services.
 * The Prisma boundary and Shopify publication are intentionally simulated.
 * No database, network, provider requests or Shopify writes happen here.
 */
const SHOP = 'shop-a.myshopify.com';
const OTHER_SHOP = 'shop-b.myshopify.com';
const JOB = 'job-qa';
const ITEM = 'item-qa';

function fixture() {
  const state: any = {
    id: ITEM,
    jobId: JOB,
    fieldId: 'field-qa',
    sourceDigest: 'digest-original',
    sourceValue: 'Gift Card',
    translatedValue: 'Buono regalo',
    approvedValue: null,
    status: 'VALIDATED',
    job: {
      id: JOB,
      shopId: 'shop-qa',
      sourceLocale: 'en',
      targetLocale: 'it',
      status: 'COMPLETED',
      provider: 'DEEPL',
      model: null,
      fallbackProvider: 'OPENAI',
      fallbackModel: 'test-model',
      reviewProvider: 'ANTHROPIC',
      reviewModel: 'test-review-model',
    },
    field: {
      id: 'field-qa',
      key: 'title',
      type: 'SINGLE_LINE_TEXT_FIELD',
      sourceLocale: 'en',
      sourceDigest: 'digest-original',
      sourceValue: 'Gift Card',
      deletedAt: null,
      resource: {
        resourceType: 'PRODUCT',
        shopifyResourceId: 'gid://shopify/Product/123',
        deletedAt: null,
      },
    },
  };

  const updates: Array<Record<string, unknown>> = [];
  const publicationStates: Array<any> = [];
  const tx = {
    translationJobItem: {
      update: vi.fn(async ({ data }: any) => {
        updates.push(data);
        Object.assign(state, data);
        return structuredClone(state);
      }),
      findUnique: vi.fn(async () => structuredClone(state)),
    },
    translationState: {
      upsert: vi.fn(async (input: any) => {
        publicationStates.push(input);
        return input;
      }),
    },
  };
  const prisma = {
    translationJobItem: {
      findFirst: vi.fn(async ({ where }: any) => {
        if (where.id !== ITEM || where.jobId !== JOB ||
            where.job?.shop?.shopifyDomain !== SHOP) return null;
        return structuredClone(state);
      }),
      update: vi.fn(async ({ data }: any) => {
        updates.push(data);
        Object.assign(state, data);
        return structuredClone(state);
      }),
    },
    $transaction: vi.fn(async (fn: any) => fn(tx)),
  } as any;
  const validator = {
    validate: vi.fn(({ translatedValue }: any) => ({
      passed: !!translatedValue?.trim() && !translatedValue.includes('<bad>'),
      version: 'qa-validator',
      errorCount: translatedValue?.includes('<bad>') ? 1 : 0,
      warningCount: 0,
      issues: [],
    })),
  } as any;
  return {
    state, prisma, validator, tx, updates, publicationStates,
    review: new TranslationHumanReviewService(prisma, validator),
    publication: new TranslationPublicationService(prisma),
    fakeShopifyRegister: vi.fn(async () => ({ userErrors: [] })),
  };
}

describe('ACA Locale v0.9.17 integrated translation lifecycle (offline)', () => {
  it('allows human approval, prepare, simulated Shopify register and local confirmation', async () => {
    const f = fixture();
    await f.review.approve(SHOP, JOB, ITEM, { approvedValue: 'Carta regalo', note: 'QA approval' } as any);
    expect(f.state.status).toBe('APPROVED');
    expect(f.state.translatedValue).toBe('Buono regalo');
    expect(f.state.approvedValue).toBe('Carta regalo');

    const prepared = await f.publication.prepare(SHOP, JOB, ITEM);
    expect(prepared).toMatchObject({
      alreadyPublished: false,
      targetLocale: 'it',
      key: 'title',
      sourceDigest: 'digest-original',
      value: 'Carta regalo',
    });
    // Simulated external boundary: never contacts Shopify.
    const externalResult = await f.fakeShopifyRegister(prepared);
    expect(externalResult.userErrors).toEqual([]);
    expect(f.state.status).toBe('APPROVED');

    await f.publication.confirmPublished(SHOP, JOB, ITEM);
    expect(f.state.status).toBe('PUBLISHED');
    expect(f.publicationStates).toHaveLength(1);
    expect(f.publicationStates[0].create).toMatchObject({
      targetLocale: 'it', status: 'TRANSLATED', translatedValue: 'Carta regalo',
    });
    const transactionCount = f.prisma.$transaction.mock.calls.length;
    const repeated = await f.publication.prepare(SHOP, JOB, ITEM);
    expect(repeated.alreadyPublished).toBe(true);
    await f.publication.confirmPublished(SHOP, JOB, ITEM);
    expect(f.prisma.$transaction).toHaveBeenCalledTimes(transactionCount);
  });

  it('does not allow publishing a translation without human approval', async () => {
    const f = fixture();
    await expect(f.publication.prepare(SHOP, JOB, ITEM)).rejects.toBeInstanceOf(BadRequestException);
    expect(f.fakeShopifyRegister).not.toHaveBeenCalled();
  });

  it('blocks a stale source digest after human approval before any Shopify write', async () => {
    const f = fixture();
    await f.review.approve(SHOP, JOB, ITEM, {} as any);
    f.state.field.sourceDigest = 'digest-updated-by-scanner';
    await expect(f.publication.prepare(SHOP, JOB, ITEM)).rejects.toBeInstanceOf(ConflictException);
    expect(f.fakeShopifyRegister).not.toHaveBeenCalled();
    expect(f.state.status).toBe('APPROVED');
  });

  it('does not allow another shop to approve, prepare or confirm an item', async () => {
    const f = fixture();
    await expect(f.review.approve(OTHER_SHOP, JOB, ITEM, {} as any)).rejects.toBeInstanceOf(NotFoundException);
    await expect(f.publication.prepare(OTHER_SHOP, JOB, ITEM)).rejects.toBeInstanceOf(NotFoundException);
    await expect(f.publication.confirmPublished(OTHER_SHOP, JOB, ITEM)).rejects.toBeInstanceOf(NotFoundException);
    expect(f.state.status).toBe('VALIDATED');
  });

  it('does not approve an invalid human edit', async () => {
    const f = fixture();
    await expect(f.review.approve(SHOP, JOB, ITEM, { approvedValue: '<bad>' } as any))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(f.state.status).toBe('VALIDATED');
    expect(f.prisma.translationJobItem.update).not.toHaveBeenCalled();
  });

  it('blocks publication for deleted Shopify resource or field', async () => {
    const f = fixture();
    await f.review.approve(SHOP, JOB, ITEM, {} as any);
    f.state.field.resource.deletedAt = new Date().toISOString();
    await expect(f.publication.prepare(SHOP, JOB, ITEM)).rejects.toBeInstanceOf(ConflictException);
    expect(f.fakeShopifyRegister).not.toHaveBeenCalled();
  });
});
