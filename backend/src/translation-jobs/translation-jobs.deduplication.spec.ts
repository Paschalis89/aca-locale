import { TranslationJobsService } from './translation-jobs.service.js';

const shop = {
  id: 'shop-1',
  sourceLocale: 'it',
  status: 'ACTIVE',
  aiConfiguration: {
    translationProvider: 'DEEPL',
    translationModel: null,
    fallbackProvider: null,
    fallbackModel: null,
    reviewProvider: null,
    reviewModel: null,
  },
  settings: { autoTranslate: true },
  languages: [{ language: { locale: 'en' }, published: true }],
};

const candidate = (digest: string) => ({
  status: 'MISSING',
  field: {
    id: 'field-1',
    sourceLocale: 'it',
    sourceValue: 'Vasi',
    sourceDigest: digest,
    resource: { resourceType: 'PRODUCT', shopifyResourceId: 'gid://product/1' },
  },
});

function mockDb(existing: { fieldId: string; sourceDigest: string }[], digest = 'digest-1') {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]),
    translationState: { findMany: vi.fn().mockResolvedValue([candidate(digest)]) },
    translationJobItem: { findMany: vi.fn().mockResolvedValue(existing) },
    translationJob: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'new-job', totalItems: 1 }),
    },
  };
  const prisma = {
    shop: { findUnique: vi.fn().mockResolvedValue(shop) },
    translationChangeEvent: { findFirst: vi.fn().mockResolvedValue({ id: 'change-1' }) },
    translationJob: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  return { tx, prisma, service: new TranslationJobsService(prisma as any) };
}

describe('TranslationJobsService snapshot deduplication', () => {
  it('manual jobs skip active candidates for the same source snapshot', async () => {
    const { service, tx } = mockDb([{ fieldId: 'field-1', sourceDigest: 'digest-1' }]);
    await expect(service.create('shop.myshopify.com', {
      targetLocale: 'en', resourceTypes: ['PRODUCT'], maxItems: 1,
    } as any)).rejects.toThrow('No eligible');
    expect(tx.translationJob.create).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
  });

  it('manual jobs can translate a newer source digest', async () => {
    const { service, tx } = mockDb([{ fieldId: 'field-1', sourceDigest: 'old-digest' }]);
    await service.create('shop.myshopify.com', {
      targetLocale: 'en', resourceTypes: ['PRODUCT'], maxItems: 1,
    } as any);
    expect(tx.translationJob.create).toHaveBeenCalledOnce();
  });

  it('automatic jobs respect an active manual candidate for the same digest', async () => {
    const { service, tx } = mockDb([{ fieldId: 'field-1', sourceDigest: 'digest-1' }]);
    const result = await service.createFromShopifyChange('shop.myshopify.com', {
      changeEventId: 'change-1', resourceType: 'PRODUCT',
      shopifyResourceId: 'gid://product/1', targetLocale: 'en',
    });
    expect(result).toMatchObject({ created: false, reason: 'SOURCE_SNAPSHOT_ALREADY_JOBBED' });
    expect(tx.translationJob.create).not.toHaveBeenCalled();
  });

  it('automatic jobs re-check webhook idempotency after taking the lock', async () => {
    const { service, tx } = mockDb([]);
    tx.translationJob.findUnique.mockResolvedValue({ id: 'prior-job', totalItems: 1 });
    const result = await service.createFromShopifyChange('shop.myshopify.com', {
      changeEventId: 'change-1', resourceType: 'PRODUCT',
      shopifyResourceId: 'gid://product/1', targetLocale: 'en',
    });
    expect(result).toMatchObject({ created: false, reason: 'DUPLICATE_CHANGE_EVENT', jobId: 'prior-job' });
    expect(tx.translationJob.create).not.toHaveBeenCalled();
  });
});
