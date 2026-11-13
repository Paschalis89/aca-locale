import { TranslationExecutorService } from './translation-executor.service.js';

describe('TranslationExecutorService 10D source freshness', () => {
  const build = (current: unknown) => {
    const prisma = {
      translationField: {
        findUnique: vi.fn().mockResolvedValue(current),
      },
    } as any;

    const service = new TranslationExecutorService(
      prisma,
      {} as any,
      {} as any,
    );

    return { service, prisma };
  };

  it('accepts the current source snapshot', async () => {
    const { service } = build({
      sourceDigest: 'digest-1',
      deletedAt: null,
      resource: {
        deletedAt: null,
      },
    });

    await expect(
      (service as any).assertSourceSnapshotCurrent(
        'field-1',
        'digest-1',
      ),
    ).resolves.toBeUndefined();
  });

  it('rejects a changed source before provider quota is consumed', async () => {
    const { service } = build({
      sourceDigest: 'digest-new',
      deletedAt: null,
      resource: {
        deletedAt: null,
      },
    });

    await expect(
      (service as any).assertSourceSnapshotCurrent(
        'field-1',
        'digest-old',
      ),
    ).rejects.toThrow('SOURCE_CHANGED_BEFORE_EXECUTION');
  });

  it('rejects deleted resources and fields', async () => {
    const resourceDeleted = build({
      sourceDigest: 'digest-1',
      deletedAt: null,
      resource: {
        deletedAt: new Date(),
      },
    }).service;

    await expect(
      (resourceDeleted as any).assertSourceSnapshotCurrent(
        'field-1',
        'digest-1',
      ),
    ).rejects.toThrow('RESOURCE_DELETED_BEFORE_EXECUTION');

    const fieldDeleted = build({
      sourceDigest: 'digest-1',
      deletedAt: new Date(),
      resource: {
        deletedAt: null,
      },
    }).service;

    await expect(
      (fieldDeleted as any).assertSourceSnapshotCurrent(
        'field-1',
        'digest-1',
      ),
    ).rejects.toThrow('FIELD_DELETED_BEFORE_EXECUTION');
  });
});
