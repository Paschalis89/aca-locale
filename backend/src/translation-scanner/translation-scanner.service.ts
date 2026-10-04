import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  PrismaService,
} from '../database/prisma.service.js';

import type {
  SyncTranslationScanDto,
} from './dto/sync-translation-scan.dto.js';

@Injectable()
export class TranslationScannerService {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  async sync(
    shopifyDomain: string,
    scan: SyncTranslationScanDto,
  ) {
    const shop =
      await this.prisma.shop.findUnique({
        where: {
          shopifyDomain,
        },
      });

    if (!shop) {
      throw new NotFoundException(
        'Shop is not registered.',
      );
    }

    const scannedAt =
      new Date();

    await this.prisma.$transaction(
      async (tx) => {
        for (
          const resource
          of scan.resources
        ) {
          const savedResource =
            await tx.translationResource.upsert({
              where: {
                shopId_resourceType_shopifyResourceId: {
                  shopId:
                    shop.id,

                  resourceType:
                    scan.resourceType,

                  shopifyResourceId:
                    resource.resourceId,
                },
              },

              update: {
                lastSeenAt:
                  scannedAt,
              },

              create: {
                shopId:
                  shop.id,

                shopifyResourceId:
                  resource.resourceId,

                resourceType:
                  scan.resourceType,

                firstSeenAt:
                  scannedAt,

                lastSeenAt:
                  scannedAt,
              },
            });

          const seenFieldKeys:
            string[] = [];

          for (
            const content
            of resource.content
          ) {
            seenFieldKeys.push(
              content.key,
            );

            const field =
              await tx.translationField.upsert({
                where: {
                  resourceId_key: {
                    resourceId:
                      savedResource.id,

                    key:
                      content.key,
                  },
                },

                update: {
                  type:
                    content.type,

                  sourceLocale:
                    content.locale,

                  sourceValue:
                    content.value,

                  sourceDigest:
                    content.digest,
                },

                create: {
                  resourceId:
                    savedResource.id,

                  key:
                    content.key,

                  type:
                    content.type,

                  sourceLocale:
                    content.locale,

                  sourceValue:
                    content.value,

                  sourceDigest:
                    content.digest,
                },
              });

            const sourceIsEmpty =
              !content.value.trim();

            const translation =
              sourceIsEmpty
                ? null
                : resource.translations.find(
                    (item) =>
                      item.key ===
                        content.key &&
                      !item.market,
                  ) ??
                  null;

            let status:
              | 'EMPTY_SOURCE'
              | 'MISSING'
              | 'TRANSLATED'
              | 'OUTDATED';

            if (sourceIsEmpty) {
              status =
                'EMPTY_SOURCE';
            } else if (
              !translation
            ) {
              status =
                'MISSING';
            } else if (
              translation.outdated
            ) {
              status =
                'OUTDATED';
            } else {
              status =
                'TRANSLATED';
            }

            await tx.translationState.upsert({
              where: {
                fieldId_targetLocale: {
                  fieldId:
                    field.id,

                  targetLocale:
                    scan.targetLocale,
                },
              },

              update: {
                status,

                translatedValue:
                  translation?.value ??
                  null,

                translationUpdatedAt:
                  translation?.updatedAt
                    ? new Date(
                        translation.updatedAt,
                      )
                    : null,

                scannedAt,
              },

              create: {
                fieldId:
                  field.id,

                targetLocale:
                  scan.targetLocale,

                status,

                translatedValue:
                  translation?.value ??
                  null,

                translationUpdatedAt:
                  translation?.updatedAt
                    ? new Date(
                        translation.updatedAt,
                      )
                    : null,

                scannedAt,
              },
            });
          }

          /*
           * If a Shopify field disappeared,
           * remove it from our local projection.
           */
          await tx.translationField.deleteMany({
            where: {
              resourceId:
                savedResource.id,

              key: {
                notIn:
                  seenFieldKeys,
              },
            },
          });
        }
      },
    );

    return this.getSummary(
      shopifyDomain,
      scan.resourceType,
      scan.targetLocale,
    );
  }

  async getSummary(
    shopifyDomain: string,
    resourceType: string,
    targetLocale: string,
  ) {
    const resourceFilter = {
      shop: {
        shopifyDomain,
      },

      resourceType,
    };

    const resources =
      await this.prisma.translationResource.count({
        where:
          resourceFilter,
      });

    const states =
      await this.prisma.translationState.findMany({
        where: {
          targetLocale,

          field: {
            resource:
              resourceFilter,
          },
        },

        select: {
          status:
            true,
        },
      });

    const emptySource =
      states.filter(
        (state) =>
          state.status ===
          'EMPTY_SOURCE',
      ).length;

    const missing =
      states.filter(
        (state) =>
          state.status ===
          'MISSING',
      ).length;

    const translated =
      states.filter(
        (state) =>
          state.status ===
          'TRANSLATED',
      ).length;

    const outdated =
      states.filter(
        (state) =>
          state.status ===
          'OUTDATED',
      ).length;

    const fields =
      states.length;

    const actionableFields =
      fields -
      emptySource;

    const coverage =
      actionableFields === 0
        ? 100
        : Math.round(
            (
              translated /
              actionableFields
            ) * 100,
          );

    return {
      shopifyDomain,
      resourceType,
      targetLocale,

      resources,
      fields,
      actionableFields,
      emptySource,
      missing,
      translated,
      outdated,
      coverage,
    };
  }

  findResources(
    shopifyDomain: string,
    resourceType: string,
    targetLocale: string,
  ) {
    return this.prisma.translationResource.findMany({
      where: {
        shop: {
          shopifyDomain,
        },

        resourceType,
      },

      include: {
        fields: {
          include: {
            states: {
              where: {
                targetLocale,
              },
            },
          },

          orderBy: {
            key:
              'asc',
          },
        },
      },

      orderBy: {
        shopifyResourceId:
          'asc',
      },
    });
  }
}