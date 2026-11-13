import {
  AutomaticTranslationPublicationService,
} from './automatic-translation-publication.service.js';

describe('AutomaticTranslationPublicationService', () => {
  const build = (options?: {
    autoTranslate?: boolean;
    autoPublish?: boolean;
    requireHumanReview?: boolean;
    enableAiReview?: boolean;
    aiReviewedAt?: Date | null;
    aiReviewPassed?: boolean | null;
    aiReviewErrorMessage?: string | null;
    status?: string;
    validationPassed?: boolean | null;
    sourceDigestMatches?: boolean;
    deleted?: boolean;
  }) => {
    const itemSourceDigest =
      'digest-job';

    const prisma = {
      translationJob: {
        findFirst:
          vi.fn().mockResolvedValue({
            id:
              'job-1',
            origin:
              'SHOPIFY_CHANGE',
            status:
              'COMPLETED',
            targetLocale:
              'it',
            shop: {
              settings: {
                autoTranslate:
                  options?.autoTranslate ?? true,
                autoPublish:
                  options?.autoPublish ?? true,
                requireHumanReview:
                  options?.requireHumanReview ?? false,
                enableAiReview:
                  options?.enableAiReview ?? true,
              },
            },
            items: [
              {
                id:
                  'item-1',
                status:
                  options?.status ?? 'VALIDATED',
                sourceDigest:
                  itemSourceDigest,
                translatedValue:
                  'Traduzione automatica',
                approvedValue:
                  null,
                approvedAt:
                  null,
                humanReviewedAt:
                  null,
                validationPassed:
                  options?.validationPassed ?? true,
                aiReviewedAt:
                  options?.aiReviewedAt === undefined
                    ? new Date('2026-10-08T00:00:00.000Z')
                    : options.aiReviewedAt,
                aiReviewPassed:
                  options?.aiReviewPassed === undefined
                    ? true
                    : options.aiReviewPassed,
                aiReviewErrorMessage:
                  options?.aiReviewErrorMessage ?? null,
                field: {
                  sourceDigest:
                    options?.sourceDigestMatches === false
                      ? 'digest-new'
                      : itemSourceDigest,
                  deletedAt:
                    options?.deleted
                      ? new Date()
                      : null,
                  resource: {
                    deletedAt:
                      null,
                  },
                },
              },
            ],
          }),
      },
      translationJobItem: {
        updateMany:
          vi.fn().mockResolvedValue({
            count:
              1,
          }),
      },
    } as any;

    const config = {
      get:
        vi.fn((key: string) =>
          key === 'ACA_LOCALE_INTERNAL_SECRET'
            ? 'shared-secret'
            : undefined),
    } as any;

    const publication = {
      prepare:
        vi.fn().mockResolvedValue({
          alreadyPublished:
            false,
          resourceId:
            'gid://shopify/Product/1',
          resourceType:
            'PRODUCT',
          key:
            'title',
          sourceLocale:
            'en',
          targetLocale:
            'it',
          sourceDigest:
            itemSourceDigest,
          value:
            'Traduzione automatica',
        }),
      confirmPublished:
        vi.fn().mockResolvedValue({
          id:
            'item-1',
          status:
            'PUBLISHED',
        }),
    } as any;

    const service =
      new AutomaticTranslationPublicationService(
        prisma,
        config,
        publication,
      );

    return {
      service,
      prisma,
      config,
      publication,
    };
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not publish when autoPublish is disabled', async () => {
    const {
      service,
      publication,
    } = build({
      autoPublish:
        false,
    });

    const result =
      await service.publishEligibleItems(
        'shop-a.myshopify.com',
        'job-1',
        'https://app.example.com',
      );

    expect(result.reason).toBe(
      'AUTO_PUBLISH_DISABLED',
    );
    expect(
      publication.prepare,
    ).not.toHaveBeenCalled();
  });

  it('does not publish when human review is required', async () => {
    const {
      service,
      publication,
    } = build({
      requireHumanReview:
        true,
    });

    const result =
      await service.publishEligibleItems(
        'shop-a.myshopify.com',
        'job-1',
        'https://app.example.com',
      );

    expect(result.reason).toBe(
      'HUMAN_REVIEW_REQUIRED',
    );
    expect(
      publication.prepare,
    ).not.toHaveBeenCalled();
  });

  it('requires a passed AI review when AI review is enabled', async () => {
    const {
      service,
      publication,
    } = build({
      aiReviewPassed:
        false,
    });

    const result =
      await service.publishEligibleItems(
        'shop-a.myshopify.com',
        'job-1',
        'https://app.example.com',
      );

    expect(result).toEqual(
      expect.objectContaining({
        reason:
          'NO_AUTO_PUBLISH_ELIGIBLE_ITEMS',
        publishedItems:
          0,
        blockedItems:
          1,
      }),
    );
    expect(
      publication.prepare,
    ).not.toHaveBeenCalled();
  });

  it('auto-approves, publishes through the Shopify gateway and confirms locally', async () => {
    const {
      service,
      prisma,
      publication,
    } = build();

    const fetchMock =
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            published:
              true,
            alreadyPublished:
              false,
          }),
          {
            status:
              200,
            headers: {
              'Content-Type':
                'application/json',
            },
          },
        ),
      );

    vi.stubGlobal(
      'fetch',
      fetchMock,
    );

    const result =
      await service.publishEligibleItems(
        'shop-a.myshopify.com',
        'job-1',
        'https://app.example.com/path-is-ignored',
      );

    expect(
      prisma.translationJobItem.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where:
          expect.objectContaining({
            id:
              'item-1',
            status:
              'VALIDATED',
          }),
        data:
          expect.objectContaining({
            status:
              'APPROVED',
            approvedValue:
              'Traduzione automatica',
          }),
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://app.example.com/internal/shopify/auto-publish',
      expect.objectContaining({
        method:
          'POST',
        headers:
          expect.objectContaining({
            'X-ACA-Locale-Internal-Secret':
              'shared-secret',
          }),
      }),
    );

    expect(
      publication.prepare,
    ).toHaveBeenCalledWith(
      'shop-a.myshopify.com',
      'job-1',
      'item-1',
    );

    expect(
      publication.confirmPublished,
    ).toHaveBeenCalledWith(
      'shop-a.myshopify.com',
      'job-1',
      'item-1',
    );

    expect(result).toEqual(
      expect.objectContaining({
        reason:
          'AUTO_PUBLISH_COMPLETED',
        publishedItems:
          1,
        failedItems:
          0,
      }),
    );
  });

  it('blocks stale source snapshots before calling Shopify', async () => {
    const {
      service,
      publication,
    } = build({
      sourceDigestMatches:
        false,
    });

    const fetchMock =
      vi.fn();

    vi.stubGlobal(
      'fetch',
      fetchMock,
    );

    const result =
      await service.publishEligibleItems(
        'shop-a.myshopify.com',
        'job-1',
        'https://app.example.com',
      );

    expect(result).toEqual(
      expect.objectContaining({
        reason:
          'NO_AUTO_PUBLISH_ELIGIBLE_ITEMS',
        blockedItems:
          1,
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      publication.prepare,
    ).not.toHaveBeenCalled();
  });
});
