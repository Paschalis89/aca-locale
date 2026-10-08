import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';

import { TranslationScannerService } from '../translation-scanner/translation-scanner.service.js';

import { TranslationJobsService } from '../translation-jobs/translation-jobs.service.js';

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

    const event =
      await this.prisma.translationChangeEvent.create({
        data: {
          shopId:
            shop.id,

          webhookId:
            input.webhookId,

          topic:
            input.topic,

          resourceType:
            input.resourceType,

          shopifyResourceId:
            input.shopifyResourceId,

          action:
            input.action,

          status:
            'PROCESSING',

          triggeredAt:
            triggeredAt &&
            !Number.isNaN(
              triggeredAt.getTime(),
            )
              ? triggeredAt
              : null,

          startedAt:
            now,
        },
      });

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

    this.assertEventMatches(
      event,
      input.resourceType,
      input.shopifyResourceId,
      'UPSERT',
    );

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
          },
        );

      automaticJobs.push(
        automaticJob,
      );
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

    this.assertEventResourceMatches(
      event,
      input.resourceType,
      input.shopifyResourceId,
    );

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
