import {
  Injectable,
  Logger,
} from '@nestjs/common';

import {
  ConfigService,
} from '@nestjs/config';

import {
  PrismaService,
} from '../database/prisma.service.js';

import {
  TranslationPublicationService,
} from './translation-publication.service.js';

type GatewayPublicationResponse = {
  published?: boolean;
  alreadyPublished?: boolean;
  code?: string;
  message?: string;
  [key: string]: unknown;
};

@Injectable()
export class AutomaticTranslationPublicationService {
  private readonly logger =
    new Logger(
      AutomaticTranslationPublicationService.name,
    );

  constructor(
    private readonly prisma:
      PrismaService,

    private readonly config:
      ConfigService,

    private readonly publication:
      TranslationPublicationService,
  ) {}

  async publishEligibleItems(
    shopifyDomain:
      string,

    jobId:
      string,

    shopifyGatewayUrl?:
      string,
  ) {
    const job =
      await this.prisma.translationJob.findFirst({
        where: {
          id:
            jobId,

          shop: {
            shopifyDomain,
          },
        },

        select: {
          id:
            true,

          origin:
            true,

          status:
            true,

          targetLocale:
            true,

          shop: {
            select: {
              settings: {
                select: {
                  autoTranslate:
                    true,

                  autoPublish:
                    true,

                  requireHumanReview:
                    true,

                  enableAiReview:
                    true,
                },
              },
            },
          },

          items: {
            orderBy: {
              createdAt:
                'asc',
            },

            select: {
              id:
                true,

              status:
                true,

              sourceDigest:
                true,

              translatedValue:
                true,

              approvedValue:
                true,

              approvedAt:
                true,

              humanReviewedAt:
                true,

              validationPassed:
                true,

              aiReviewedAt:
                true,

              aiReviewPassed:
                true,

              aiReviewErrorMessage:
                true,

              field: {
                select: {
                  sourceDigest:
                    true,

                  deletedAt:
                    true,

                  resource: {
                    select: {
                      deletedAt:
                        true,
                    },
                  },
                },
              },
            },
          },
        },
      });

    if (!job) {
      return {
        attempted:
          false,
        reason:
          'TRANSLATION_JOB_NOT_FOUND',
      };
    }

    if (
      job.origin !==
      'SHOPIFY_CHANGE'
    ) {
      return {
        attempted:
          false,
        reason:
          'MANUAL_JOB',
      };
    }

    const settings =
      job.shop.settings;

    if (
      !settings?.autoTranslate
    ) {
      return {
        attempted:
          false,
        reason:
          'AUTO_TRANSLATE_DISABLED',
      };
    }

    if (
      !settings.autoPublish
    ) {
      return {
        attempted:
          false,
        reason:
          'AUTO_PUBLISH_DISABLED',
      };
    }

    if (
      settings.requireHumanReview
    ) {
      return {
        attempted:
          false,
        reason:
          'HUMAN_REVIEW_REQUIRED',
      };
    }

    if (
      job.status !==
        'COMPLETED' &&
      job.status !==
        'PARTIAL'
    ) {
      return {
        attempted:
          false,
        reason:
          'TRANSLATION_NOT_PUBLISHABLE',
        status:
          job.status,
      };
    }

    const gatewayUrl =
      this.normalizeGatewayUrl(
        shopifyGatewayUrl,
      );

    if (!gatewayUrl) {
      return {
        attempted:
          false,
        reason:
          'SHOPIFY_GATEWAY_URL_UNAVAILABLE',
      };
    }

    const secret =
      this.config.get<string>(
        'ACA_LOCALE_INTERNAL_SECRET',
      )?.trim();

    if (!secret) {
      return {
        attempted:
          false,
        reason:
          'INTERNAL_SECRET_UNAVAILABLE',
      };
    }

    const results:
      Array<{
        itemId: string;
        published: boolean;
        alreadyPublished?: boolean;
        reason: string;
        errorMessage?: string;
      }> = [];

    let publishedItems =
      0;

    let alreadyPublishedItems =
      0;

    let blockedItems =
      0;

    let failedItems =
      0;

    for (
      const item
      of job.items
    ) {
      /*
       * PUBLISHED is idempotent and can safely be reported as already done.
       */
      if (
        item.status ===
        'PUBLISHED'
      ) {
        alreadyPublishedItems +=
          1;

        results.push({
          itemId:
            item.id,
          published:
            true,
          alreadyPublished:
            true,
          reason:
            'ALREADY_PUBLISHED',
        });

        continue;
      }

      /*
       * A retry after Shopify succeeded but before local confirmation may
       * legitimately find an auto-approved item in APPROVED state. Manual
       * human approvals are intentionally not consumed by this background
       * automation branch.
       */
      const autoApprovedRetry =
        item.status ===
          'APPROVED' &&
        Boolean(
          item.approvedValue,
        ) &&
        item.humanReviewedAt ===
          null;

      if (
        item.status !==
          'VALIDATED' &&
        !autoApprovedRetry
      ) {
        blockedItems +=
          1;

        results.push({
          itemId:
            item.id,
          published:
            false,
          reason:
            item.status ===
              'NEEDS_REVIEW'
              ? 'ITEM_NEEDS_REVIEW'
              : `ITEM_STATUS_${item.status}`,
        });

        continue;
      }

      if (
        item.field.deletedAt ||
        item.field.resource.deletedAt
      ) {
        blockedItems +=
          1;

        results.push({
          itemId:
            item.id,
          published:
            false,
          reason:
            item.field.resource.deletedAt
              ? 'RESOURCE_DELETED'
              : 'FIELD_DELETED',
        });

        continue;
      }

      if (
        item.sourceDigest !==
        item.field.sourceDigest
      ) {
        blockedItems +=
          1;

        results.push({
          itemId:
            item.id,
          published:
            false,
          reason:
            'SOURCE_CHANGED',
        });

        continue;
      }

      if (
        !autoApprovedRetry
      ) {
        if (
          item.validationPassed !==
          true
        ) {
          blockedItems +=
            1;

          results.push({
            itemId:
              item.id,
            published:
              false,
            reason:
              'DETERMINISTIC_VALIDATION_NOT_PASSED',
          });

          continue;
        }

        if (
          !item.translatedValue ||
          item.translatedValue.trim()
            .length ===
            0
        ) {
          blockedItems +=
            1;

          results.push({
            itemId:
              item.id,
            published:
              false,
            reason:
              'TRANSLATED_VALUE_MISSING',
          });

          continue;
        }

        if (
          settings.enableAiReview
        ) {
          if (
            !item.aiReviewedAt
          ) {
            blockedItems +=
              1;

            results.push({
              itemId:
                item.id,
              published:
                false,
              reason:
                item.aiReviewErrorMessage
                  ? 'AI_REVIEW_FAILED'
                  : 'AI_REVIEW_NOT_COMPLETED',
            });

            continue;
          }

          if (
            item.aiReviewPassed !==
            true
          ) {
            blockedItems +=
              1;

            results.push({
              itemId:
                item.id,
              published:
                false,
              reason:
                'AI_REVIEW_NOT_PASSED',
            });

            continue;
          }
        }

        /*
         * Auto approval is intentionally distinguishable from human review:
         * approvedAt/value are set, while humanReviewedAt remains NULL.
         * This keeps the existing publication contract intact without
         * pretending that a person reviewed the item.
         */
        const approvedAt =
          new Date();

        const updated =
          await this.prisma.translationJobItem.updateMany({
            where: {
              id:
                item.id,

              status:
                'VALIDATED',

              approvedAt:
                null,
            },

            data: {
              status:
                'APPROVED',

              approvedAt,

              approvedValue:
                item.translatedValue,
            },
          });

        if (
          updated.count ===
          0
        ) {
          blockedItems +=
            1;

          results.push({
            itemId:
              item.id,
            published:
              false,
            reason:
              'AUTO_APPROVAL_RACE',
          });

          continue;
        }
      }

      try {
        /*
         * Re-run the backend publication guard after auto approval. This
         * verifies deleted state and scanner digest immediately before the
         * live Shopify optimistic-concurrency check in React Router.
         */
        const prepared =
          await this.publication.prepare(
            shopifyDomain,
            jobId,
            item.id,
          );

        if (
          prepared.alreadyPublished
        ) {
          alreadyPublishedItems +=
            1;

          results.push({
            itemId:
              item.id,
            published:
              true,
            alreadyPublished:
              true,
            reason:
              'ALREADY_PUBLISHED',
          });

          continue;
        }

        const gateway =
          await this.publishThroughGateway(
            gatewayUrl,
            secret,
            {
              shopifyDomain,
              resourceId:
                prepared.resourceId,
              resourceType:
                prepared.resourceType,
              key:
                prepared.key,
              sourceLocale:
                prepared.sourceLocale,
              targetLocale:
                prepared.targetLocale,
              sourceDigest:
                prepared.sourceDigest,
              value:
                prepared.value,
            },
          );

        await this.publication.confirmPublished(
          shopifyDomain,
          jobId,
          item.id,
        );

        if (
          gateway.alreadyPublished
        ) {
          alreadyPublishedItems +=
            1;
        } else {
          publishedItems +=
            1;
        }

        results.push({
          itemId:
            item.id,
          published:
            true,
          alreadyPublished:
            Boolean(
              gateway.alreadyPublished,
            ),
          reason:
            gateway.alreadyPublished
              ? 'SHOPIFY_ALREADY_PUBLISHED'
              : 'SHOPIFY_PUBLISHED',
        });
      } catch (error) {
        failedItems +=
          1;

        const message =
          this.errorMessage(
            error,
          );

        this.logger.error(
          `Automatic Shopify publication failed for translation job ${jobId}, item ${item.id}: ${message}`,
        );

        results.push({
          itemId:
            item.id,
          published:
            false,
          reason:
            'SHOPIFY_PUBLICATION_FAILED',
          errorMessage:
            message,
        });
      }
    }

    const consideredItems =
      job.items.length;

    return {
      attempted:
        true,
      reason:
        failedItems > 0
          ? 'AUTO_PUBLISH_PARTIAL_FAILURE'
          : publishedItems > 0 ||
              alreadyPublishedItems > 0
            ? 'AUTO_PUBLISH_COMPLETED'
            : 'NO_AUTO_PUBLISH_ELIGIBLE_ITEMS',
      consideredItems,
      publishedItems,
      alreadyPublishedItems,
      blockedItems,
      failedItems,
      results,
    };
  }

  private async publishThroughGateway(
    gatewayUrl:
      string,

    secret:
      string,

    payload: {
      shopifyDomain: string;
      resourceId: string;
      resourceType: string;
      key: string;
      sourceLocale: string;
      targetLocale: string;
      sourceDigest: string;
      value: string | null;
    },
  ) {
    const response =
      await fetch(
        `${gatewayUrl}/internal/shopify/auto-publish`,
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json',

            'X-ACA-Locale-Internal-Secret':
              secret,
          },

          body:
            JSON.stringify(
              payload,
            ),
        },
      );

    const text =
      await response.text();

    let data:
      GatewayPublicationResponse =
      {};

    if (text) {
      try {
        data =
          JSON.parse(
            text,
          ) as GatewayPublicationResponse;
      } catch {
        data = {
          message:
            text,
        };
      }
    }

    if (
      !response.ok
    ) {
      const code =
        typeof data.code ===
          'string'
          ? ` ${data.code}`
          : '';

      const message =
        typeof data.message ===
          'string'
          ? data.message
          : 'Unknown Shopify gateway error.';

      throw new Error(
        `Shopify publication gateway returned ${response.status}${code}: ${message}`,
      );
    }

    if (
      data.published !==
      true
    ) {
      throw new Error(
        'Shopify publication gateway did not confirm publication.',
      );
    }

    return data;
  }

  private normalizeGatewayUrl(
    value?:
      string,
  ) {
    if (!value) {
      return null;
    }

    try {
      const url =
        new URL(
          value,
        );

      if (
        url.protocol !==
          'https:' &&
        url.protocol !==
          'http:'
      ) {
        return null;
      }

      return url.origin;
    } catch {
      return null;
    }
  }

  private errorMessage(
    error:
      unknown,
  ) {
    if (
      error instanceof
      Error
    ) {
      return error.message;
    }

    return String(
      error,
    );
  }
}
