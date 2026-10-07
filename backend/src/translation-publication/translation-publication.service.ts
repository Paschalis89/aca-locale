import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  PrismaService,
} from '../database/prisma.service.js';

@Injectable()
export class TranslationPublicationService {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  async prepare(
    shopifyDomain:
      string,

    jobId:
      string,

    itemId:
      string,
  ) {
    const item =
      await this.findItem(
        shopifyDomain,
        jobId,
        itemId,
      );

    if (
      item.status ===
      'PUBLISHED'
    ) {
      return {
        itemId:
          item.id,

        jobId:
          item.jobId,

        alreadyPublished:
          true,

        resourceId:
          item.field.resource
            .shopifyResourceId,

        resourceType:
          item.field.resource
            .resourceType,

        key:
          item.field.key,

        sourceLocale:
          item.job.sourceLocale,

        targetLocale:
          item.job.targetLocale,

        sourceDigest:
          item.sourceDigest,

        value:
          item.approvedValue,
      };
    }

    if (
      item.status !==
      'APPROVED'
    ) {
      throw new BadRequestException(
        `Translation item cannot be published from status "${item.status}".`,
      );
    }

    if (
      !item.approvedValue ||
      item.approvedValue
        .trim()
        .length ===
        0
    ) {
      throw new BadRequestException(
        'Translation item has no approved value.',
      );
    }

    /*
     * First protection:
     * compare job snapshot against our latest
     * scanner projection.
     *
     * React Router will additionally compare
     * against LIVE Shopify immediately before
     * translationsRegister.
     */
    if (
      item.sourceDigest !==
      item.field.sourceDigest
    ) {
      throw new ConflictException({
        code:
          'SOURCE_CHANGED',

        message:
          'The Shopify source content changed after the translation job was created. Rescan and regenerate the translation.',

        jobSourceDigest:
          item.sourceDigest,

        currentScannerDigest:
          item.field.sourceDigest,
      });
    }

    return {
      itemId:
        item.id,

      jobId:
        item.jobId,

      alreadyPublished:
        false,

      resourceId:
        item.field.resource
          .shopifyResourceId,

      resourceType:
        item.field.resource
          .resourceType,

      key:
        item.field.key,

      sourceLocale:
        item.job.sourceLocale,

      targetLocale:
        item.job.targetLocale,

      sourceDigest:
        item.sourceDigest,

      value:
        item.approvedValue,
    };
  }

  async confirmPublished(
    shopifyDomain:
      string,

    jobId:
      string,

    itemId:
      string,
  ) {
    const item =
      await this.findItem(
        shopifyDomain,
        jobId,
        itemId,
      );

    /*
     * Confirmation is idempotent.
     */
    if (
      item.status ===
      'PUBLISHED'
    ) {
      return item;
    }

    if (
      item.status !==
      'APPROVED'
    ) {
      throw new BadRequestException(
        `Translation item cannot be marked as published from status "${item.status}".`,
      );
    }

    if (
      !item.approvedValue
    ) {
      throw new BadRequestException(
        'Translation item has no approved value.',
      );
    }

    const now =
      new Date();

    return this.prisma.$transaction(
      async (
        tx,
      ) => {
        await tx.translationJobItem.update({
          where: {
            id:
              item.id,
          },

          data: {
            status:
              'PUBLISHED',

            publishedAt:
              now,
          },
        });

        /*
         * Shopify remains the real source
         * of truth.
         *
         * This projection records the
         * successful publication immediately.
         * A future scan will independently
         * confirm it again.
         */
        await tx.translationState.upsert({
          where: {
            fieldId_targetLocale: {
              fieldId:
                item.fieldId,

              targetLocale:
                item.job.targetLocale,
            },
          },

          create: {
            fieldId:
              item.fieldId,

            targetLocale:
              item.job.targetLocale,

            status:
              'TRANSLATED',

            translatedValue:
              item.approvedValue,

            translationUpdatedAt:
              now,

            scannedAt:
              now,
          },

          update: {
            status:
              'TRANSLATED',

            translatedValue:
              item.approvedValue,

            translationUpdatedAt:
              now,

            scannedAt:
              now,
          },
        });

        return tx.translationJobItem.findUnique({
          where: {
            id:
              item.id,
          },

          include: {
            field: {
              select: {
                key:
                  true,

                type:
                  true,

                sourceLocale:
                  true,

                resource: {
                  select: {
                    resourceType:
                      true,

                    shopifyResourceId:
                      true,
                  },
                },
              },
            },
          },
        });
      },
    );
  }

  private async findItem(
    shopifyDomain:
      string,

    jobId:
      string,

    itemId:
      string,
  ) {
    const item =
      await this.prisma.translationJobItem.findFirst({
        where: {
          id:
            itemId,

          jobId,

          job: {
            shop: {
              shopifyDomain,
            },
          },
        },

        include: {
          job: {
            select: {
              id:
                true,

              sourceLocale:
                true,

              targetLocale:
                true,
            },
          },

          field: {
            select: {
              id:
                true,

              key:
                true,

              type:
                true,

              sourceLocale:
                true,

              sourceDigest:
                true,

              sourceValue:
                true,

              resource: {
                select: {
                  resourceType:
                    true,

                  shopifyResourceId:
                    true,
                },
              },
            },
          },
        },
      });

    if (
      !item
    ) {
      throw new NotFoundException(
        'Translation job item not found.',
      );
    }

    return item;
  }
}