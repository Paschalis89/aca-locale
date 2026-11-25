import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';

import { TranslationScannerService } from '../translation-scanner/translation-scanner.service.js';

import { TranslationJobsService } from '../translation-jobs/translation-jobs.service.js';

import { TranslationQueueService } from '../translation-jobs/translation-queue.service.js';

import type {
  ClaimShopifyContentChangeDto,
  FailShopifyContentChangeDto,
  ProcessShopifyContentDeleteDto,
  ProcessShopifyContentUpsertDto,
} from './dto/shopify-content-change.dto.js';

const STALE_PROCESSING_MS =
  5 * 60 * 1000;

@Injectable()
export class InternalTranslationChangeService {
  constructor(
    private readonly prisma:
      PrismaService,

    private readonly scanner:
      TranslationScannerService,

    private readonly translationJobs:
      TranslationJobsService,

    @Optional()
    private readonly translationQueue?:
      TranslationQueueService,
  ) {}

  async claim(
    input:
      ClaimShopifyContentChangeDto,
  ) {
    const shop =
      await this.prisma.shop.findUnique({
        where: {
          shopifyDomain:
            input.shopifyDomain,
        },

        select: {
          id:
            true,

          sourceLocale:
            true,

          status:
            true,

          languages: {
            select: {
              language: {
                select: {
                  locale:
                    true,
                },
              },
            },
          },
        },
      });

    if (!shop) {
      throw new NotFoundException(
        'Shop is not registered.',
      );
    }

    if (
      shop.status !==
      'ACTIVE'
    ) {
      return {
        eventId:
          '',

        process:
          false,

        reason:
          'SHOP_NOT_ACTIVE',

        targetLocales:
          [],
      };
    }

    const targetLocales =
      Array.from(
        new Set(
          shop.languages
            .map(
              (item) =>
                item.language.locale,
            )
            .filter(
              (locale) =>
                locale !==
                shop.sourceLocale,
            ),
        ),
      );

    const existing =
      await this.prisma.translationChangeEvent.findUnique({
        where: {
          shopId_webhookId: {
            shopId:
              shop.id,

            webhookId:
              input.webhookId,
          },
        },
      });

    const now =
      new Date();

    if (existing) {
      this.assertClaimMatches(existing, input);
      const staleProcessing =
        existing.status ===
          'PROCESSING' &&
        now.getTime() -
          existing.updatedAt.getTime() >=
          STALE_PROCESSING_MS;

      if (
        existing.status ===
          'FAILED' ||
        staleProcessing
      ) {
        const retried =
          await this.prisma.translationChangeEvent.update({
            where: {
              id:
                existing.id,
            },

            data: {
              status:
                'PROCESSING',

              attempts: {
                increment:
                  1,
              },

              startedAt:
                now,

              completedAt:
                null,

              errorMessage:
                null,
            },
          });

        return {
          eventId:
            retried.id,

          process:
            true,

          retry:
            true,

          targetLocales,
        };
      }

      return {
        eventId:
          existing.id,

        process:
          false,

        duplicate:
          true,

        status:
          existing.status,

        targetLocales,
      };
    }

    const triggeredAt =
      input.triggeredAt
        ? new Date(
            input.triggeredAt,
          )
        : null;

    let event: Awaited<ReturnType<typeof this.prisma.translationChangeEvent.create>>;
    try {
      event = await this.prisma.translationChangeEvent.create({
        data: {
          shopId: shop.id,
          webhookId: input.webhookId,
          topic: input.topic,
          resourceType: input.resourceType,
          shopifyResourceId: input.shopifyResourceId,
          action: input.action,
          status: 'PROCESSING',
          triggeredAt:
            triggeredAt && !Number.isNaN(triggeredAt.getTime())
              ? triggeredAt
              : null,
          startedAt: now,
        },
      });
    } catch (error) {
      // Concurrent Shopify delivery: another request inserted the same
      // (shopId, webhookId) after our initial findUnique(). PostgreSQL
      // correctly raises P2002. Re-read only that key, validate its
      // identity, and let the gateway apply its existing duplicate policy.
      // Do not suppress unrelated unique-constraint or database failures.
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }

      const competingEvent = await this.prisma.translationChangeEvent.findUnique({
        where: {
          shopId_webhookId: {
            shopId: shop.id,
            webhookId: input.webhookId,
          },
        },
      });
      if (!competingEvent) {
        throw error;
      }

      this.assertClaimMatches(competingEvent, input);
      return {
        eventId: competingEvent.id,
        process: false,
        duplicate: true,
        status: competingEvent.status,
        targetLocales,
      };
    }

    return {
      eventId:
        event.id,

      process:
        true,

      retry:
        false,

      targetLocales,
    };
  }

  async processUpsert(
    input:
      ProcessShopifyContentUpsertDto,
  ) {
    const event =
      await this.findEvent(
        input.shopifyDomain,
        input.eventId,
      );

    // Verify the claimed event identity even when it was completed before
    // this delivery. A completed event must never acknowledge an unrelated
    // Shopify resource or an operation of the opposite type.
    this.assertEventMatches(
      event,
      input.resourceType,
      input.shopifyResourceId,
      'UPSERT',
    );

    if (
      event.status ===
      'COMPLETED'
    ) {
      return {
        eventId:
          event.id,

        completed:
          true,

        alreadyCompleted:
          true,
      };
    }

    const summaries = [];
    const automaticJobs = [];

    for (
      const locale
      of input.locales
    ) {
      const summary =
        await this.scanner.sync(
          input.shopifyDomain,
          {
            resourceType:
              input.resourceType,

            targetLocale:
              locale.targetLocale,

            completeScan:
              false,

            resources: [
              {
                resourceId:
                  input.shopifyResourceId,

                content:
                  input.content,

                translations:
                  locale.translations,
              },
            ],
          },
        );

      summaries.push(
        summary,
      );

      const automaticJob =
        await this.translationJobs.createFromShopifyChange(
          input.shopifyDomain,
          {
            changeEventId:
              event.id,

            resourceType:
              input.resourceType,

            shopifyResourceId:
              input.shopifyResourceId,

            targetLocale:
              locale.targetLocale,

            shopifyGatewayUrl:
              input.appUrl,
          },
        );

      /*
       * 10D - automatic execution.
       *
       * createFromShopifyChange() remains responsible only for
       * deterministic/idempotent PostgreSQL job creation. The change
       * orchestration layer owns queueing because it is the component
       * that knows this job came from a Shopify content event.
       *
       * Queue both a freshly-created job and the job returned for the
       * same change-event idempotency key. This matters if PostgreSQL
       * job creation succeeded but Redis/BullMQ was temporarily
       * unavailable: a webhook retry can recover by enqueueing the
       * already-created job instead of creating a duplicate.
       */
      let queue:
        Awaited<
          ReturnType<
            TranslationQueueService['enqueue']
          >
        > |
        null =
        null;

      if (
        automaticJob.jobId &&
        [
          'CREATED',
          'DUPLICATE_CHANGE_EVENT',
        ].includes(
          automaticJob.reason,
        )
      ) {
        if (!this.translationQueue) {
          throw new Error(
            'Translation queue is not available for automatic execution.',
          );
        }

        queue =
          input.appUrl
            ? await this.translationQueue.enqueue(
                automaticJob.jobId,
                input.shopifyDomain,
                input.appUrl,
              )
            : await this.translationQueue.enqueue(
                automaticJob.jobId,
                input.shopifyDomain,
              );
      }

      automaticJobs.push({
        ...automaticJob,
        queue,
      });
    }

    await this.completeEvent(
      event.id,
    );

    return {
      eventId:
        event.id,

      completed:
        true,

      resourceType:
        input.resourceType,

      shopifyResourceId:
        input.shopifyResourceId,

      localesProcessed:
        input.locales.length,

      summaries,

      automaticJobs,
    };
  }

  async processDelete(
    input:
      ProcessShopifyContentDeleteDto,
  ) {
    const event =
      await this.findEvent(
        input.shopifyDomain,
        input.eventId,
      );

    this.assertEventMatches(
      event,
      input.resourceType,
      input.shopifyResourceId,
      'DELETE',
    );

    if (
      event.status ===
      'COMPLETED'
    ) {
      return {
        eventId:
          event.id,

        completed:
          true,

        alreadyCompleted:
          true,
      };
    }

    const deletion =
      await this.scanner.markResourceDeleted(
        input.shopifyDomain,
        input.resourceType,
        input.shopifyResourceId,
      );

    await this.completeEvent(
      event.id,
    );

    return {
      eventId:
        event.id,

      completed:
        true,

      deletion,
    };
  }

  async fail(
    input:
      FailShopifyContentChangeDto,
  ) {
    const event =
      await this.findEvent(
        input.shopifyDomain,
        input.eventId,
      );

    if (
      event.status ===
      'COMPLETED'
    ) {
      return {
        eventId:
          event.id,

        status:
          event.status,
      };
    }

    return this.prisma.translationChangeEvent.update({
      where: {
        id:
          event.id,
      },

      data: {
        status:
          'FAILED',

        completedAt:
          new Date(),

        errorMessage:
          input.errorMessage,
      },
    });
  }

  /** Reject webhook-ID reuse for a different resource, topic or action. */
  private assertClaimMatches(
    event: {
      resourceType: string;
      shopifyResourceId: string;
      action: string;
      topic: string;
    },
    input: ClaimShopifyContentChangeDto,
  ) {
    if (
      event.resourceType !== input.resourceType ||
      event.shopifyResourceId !== input.shopifyResourceId ||
      event.action !== input.action ||
      event.topic !== input.topic
    ) {
      throw new BadRequestException(
        'Webhook ID does not match the original Shopify content change event.',
      );
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }

  private async findEvent(
    shopifyDomain:
      string,

    eventId:
      string,
  ) {
    const event =
      await this.prisma.translationChangeEvent.findFirst({
        where: {
          id:
            eventId,

          shop: {
            shopifyDomain,
          },
        },
      });

    if (!event) {
      throw new NotFoundException(
        'Translation change event not found.',
      );
    }

    return event;
  }

  private assertEventMatches(
    event: {
      resourceType:
        string;

      shopifyResourceId:
        string;

      action:
        string;
    },

    resourceType:
      string,

    shopifyResourceId:
      string,

    action:
      'UPSERT' |
      'DELETE',
  ) {
    this.assertEventResourceMatches(
      event,
      resourceType,
      shopifyResourceId,
    );

    if (
      event.action !==
      action
    ) {
      throw new BadRequestException(
        'Translation change event does not match the requested resource operation.',
      );
    }
  }

  private assertEventResourceMatches(
    event: {
      resourceType:
        string;

      shopifyResourceId:
        string;
    },

    resourceType:
      string,

    shopifyResourceId:
      string,
  ) {
    if (
      event.resourceType !==
        resourceType ||
      event.shopifyResourceId !==
        shopifyResourceId
    ) {
      throw new BadRequestException(
        'Translation change event does not match the requested Shopify resource.',
      );
    }
  }

  private async completeEvent(
    eventId:
      string,
  ) {
    await this.prisma.translationChangeEvent.update({
      where: {
        id:
          eventId,
      },

      data: {
        status:
          'COMPLETED',

        completedAt:
          new Date(),

        errorMessage:
          null,
      },
    });
  }
}
