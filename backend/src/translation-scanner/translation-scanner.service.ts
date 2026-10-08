import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';

import type { SyncTranslationScanDto } from './dto/sync-translation-scan.dto.js';

import {
  getTranslationResourceGroup,
  SHOPIFY_TRANSLATION_RESOURCE_TYPES,
  TRANSLATION_RESOURCE_GROUPS,
  type TranslationResourceGroup,
} from './translation-resource-groups.js';

type ResourceTypeSummary = {
  resourceType: string;
  group: TranslationResourceGroup;

  resources: number;
  fields: number;
  actionableFields: number;

  emptySource: number;
  missing: number;
  translated: number;
  outdated: number;

  coverage: number;
};

type GroupSummary = {
  group: TranslationResourceGroup;

  resourceTypes: number;
  resourceTypesWithContent: number;

  resources: number;
  fields: number;
  actionableFields: number;

  emptySource: number;
  missing: number;
  translated: number;
  outdated: number;

  coverage: number;
};

@Injectable()
export class TranslationScannerService {
  constructor(private readonly prisma: PrismaService) {}

  async sync(shopifyDomain: string, scan: SyncTranslationScanDto) {
    const shop = await this.prisma.shop.findUnique({
      where: {
        shopifyDomain,
      },
    });

    if (!shop) {
      throw new NotFoundException('Shop is not registered.');
    }

    const scannedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      /*
       * Used only when completeScan=true.
       *
       * At the end of the scan we remove
       * resources that no longer exist
       * in Shopify.
       */
      const seenShopifyResourceIds: string[] = [];

      for (const resource of scan.resources) {
        seenShopifyResourceIds.push(resource.resourceId);

        const savedResource = await tx.translationResource.upsert({
          where: {
            shopId_resourceType_shopifyResourceId: {
              shopId: shop.id,

              resourceType: scan.resourceType,

              shopifyResourceId: resource.resourceId,
            },
          },

          update: {
            lastSeenAt: scannedAt,
            deletedAt: null,
          },

          create: {
            shopId: shop.id,

            shopifyResourceId: resource.resourceId,

            resourceType: scan.resourceType,

            firstSeenAt: scannedAt,

            lastSeenAt: scannedAt,
          },
        });

        const seenFieldKeys: string[] = [];

        for (const content of resource.content) {
          seenFieldKeys.push(content.key);

          const field = await tx.translationField.upsert({
            where: {
              resourceId_key: {
                resourceId: savedResource.id,

                key: content.key,
              },
            },

            update: {
              type: content.type,

              sourceLocale: content.locale,

              sourceValue: content.value,

              sourceDigest: content.digest,

              deletedAt: null,
            },

            create: {
              resourceId: savedResource.id,

              key: content.key,

              type: content.type,

              sourceLocale: content.locale,

              sourceValue: content.value,

              sourceDigest: content.digest,
            },
          });

          const sourceIsEmpty = !content.value.trim();

          /*
           * Market-specific translations
           * are deliberately excluded here.
           *
           * For now ACA Locale tracks the
           * generic locale translation.
           */
          const translation = sourceIsEmpty
            ? null
            : (resource.translations.find(
                (item) => item.key === content.key && !item.market,
              ) ?? null);

          let status: 'EMPTY_SOURCE' | 'MISSING' | 'TRANSLATED' | 'OUTDATED';

          if (sourceIsEmpty) {
            status = 'EMPTY_SOURCE';
          } else if (!translation) {
            status = 'MISSING';
          } else if (translation.outdated) {
            status = 'OUTDATED';
          } else {
            status = 'TRANSLATED';
          }

          await tx.translationState.upsert({
            where: {
              fieldId_targetLocale: {
                fieldId: field.id,

                targetLocale: scan.targetLocale,
              },
            },

            update: {
              status,

              translatedValue: translation?.value ?? null,

              translationUpdatedAt: translation?.updatedAt
                ? new Date(translation.updatedAt)
                : null,

              scannedAt,
            },

            create: {
              fieldId: field.id,

              targetLocale: scan.targetLocale,

              status,

              translatedValue: translation?.value ?? null,

              translationUpdatedAt: translation?.updatedAt
                ? new Date(translation.updatedAt)
                : null,

              scannedAt,
            },
          });
        }

        /*
         * Remove fields that disappeared
         * from this Shopify resource.
         */
        const staleFieldWhere =
          seenFieldKeys.length === 0
            ? {
                resourceId: savedResource.id,
                deletedAt: null,
              }
            : {
                resourceId: savedResource.id,
                deletedAt: null,
                key: {
                  notIn: seenFieldKeys,
                },
              };

        /*
         * Keep field history for previous jobs.
         * TranslationJobItem references TranslationField,
         * so removing a field would otherwise erase audit
         * history through the cascade relation.
         */
        await tx.translationField.updateMany({
          where: staleFieldWhere,
          data: {
            deletedAt: scannedAt,
          },
        });
      }

      /*
       * Because the React Router gateway
       * fetched every Shopify page,
       * completeScan=true means this is the
       * authoritative current resource list
       * for this type.
       */
      if (scan.completeScan) {
        const staleResourceWhere =
          seenShopifyResourceIds.length === 0
            ? {
                shopId: shop.id,
                resourceType: scan.resourceType,
              }
            : {
                shopId: shop.id,
                resourceType: scan.resourceType,
                shopifyResourceId: {
                  notIn: seenShopifyResourceIds,
                },
              };

        /*
         * Look up every stale resource, including resources
         * that were already tombstoned by an older version of
         * ACA Locale. This also repairs any child fields that
         * were left active before field-level tombstoning was
         * introduced.
         */
        const staleResources =
          await tx.translationResource.findMany({
            where: staleResourceWhere,
            select: {
              id: true,
            },
          });

        const staleResourceIds =
          staleResources.map((resource) => resource.id);

        if (staleResourceIds.length > 0) {
          await tx.translationField.updateMany({
            where: {
              resourceId: {
                in: staleResourceIds,
              },
              deletedAt: null,
            },
            data: {
              deletedAt: scannedAt,
            },
          });

          /*
           * Preserve historical jobs and audit data.
           * Removing TranslationResource would cascade
           * through fields and job items, so stale Shopify
           * resources are tombstoned instead. A later scan
           * automatically reactivates the same resource ID.
           */
          await tx.translationResource.updateMany({
            where: {
              id: {
                in: staleResourceIds,
              },
              deletedAt: null,
            },
            data: {
              deletedAt: scannedAt,
            },
          });
        }
      }
    });

    return this.getSummary(shopifyDomain, scan.resourceType, scan.targetLocale);
  }

  async markResourceDeleted(
    shopifyDomain: string,
    resourceType: string,
    shopifyResourceId: string,
  ) {
    const shop = await this.prisma.shop.findUnique({
      where: {
        shopifyDomain,
      },

      select: {
        id: true,
      },
    });

    if (!shop) {
      throw new NotFoundException('Shop is not registered.');
    }

    const resource =
      await this.prisma.translationResource.findUnique({
        where: {
          shopId_resourceType_shopifyResourceId: {
            shopId: shop.id,
            resourceType,
            shopifyResourceId,
          },
        },
        select: {
          id: true,
          deletedAt: true,
        },
      });

    if (!resource) {
      return {
        shopifyDomain,
        resourceType,
        shopifyResourceId,
        deleted: false,
        deletedAt: null,
        fieldsDeleted: 0,
      };
    }

    const deletedAt = resource.deletedAt ?? new Date();

    const result =
      await this.prisma.$transaction(async (tx) => {
        const fields =
          await tx.translationField.updateMany({
            where: {
              resourceId: resource.id,
              deletedAt: null,
            },
            data: {
              deletedAt,
            },
          });

        const translationResource =
          resource.deletedAt
            ? null
            : await tx.translationResource.update({
                where: {
                  id: resource.id,
                },
                data: {
                  deletedAt,
                },
              });

        return {
          fieldsDeleted: fields.count,
          resourceDeleted: Boolean(translationResource),
        };
      });

    return {
      shopifyDomain,
      resourceType,
      shopifyResourceId,
      deleted:
        result.resourceDeleted ||
        result.fieldsDeleted > 0 ||
        resource.deletedAt !== null,
      deletedAt,
      fieldsDeleted: result.fieldsDeleted,
    };
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
      deletedAt: null,
    };

    const resources = await this.prisma.translationResource.count({
      where: resourceFilter,
    });

    const states = await this.prisma.translationState.findMany({
      where: {
        targetLocale,

        field: {
          deletedAt: null,
          resource: resourceFilter,
        },
      },

      select: {
        status: true,
      },
    });

    const emptySource = states.filter(
      (state) => state.status === 'EMPTY_SOURCE',
    ).length;

    const missing = states.filter((state) => state.status === 'MISSING').length;

    const translated = states.filter(
      (state) => state.status === 'TRANSLATED',
    ).length;

    const outdated = states.filter(
      (state) => state.status === 'OUTDATED',
    ).length;

    const fields = states.length;

    const actionableFields = fields - emptySource;

    const coverage = this.calculateCoverage(translated, actionableFields);

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

  /*
   * Dashboard-level summary.
   *
   * This produces:
   *
   * CONTENT
   * CUSTOM_DATA
   * COMMERCE
   * THEME
   * SYSTEM
   *
   * instead of mixing every Shopify
   * resource into one meaningless number.
   */
  async getOverview(shopifyDomain: string, targetLocale: string) {
    const resourceTypes = await this.buildResourceTypeSummaries(
      shopifyDomain,
      targetLocale,
    );

    const groupNames: TranslationResourceGroup[] = [
      'CONTENT',
      'CUSTOM_DATA',
      'COMMERCE',
      'THEME',
      'SYSTEM',
    ];

    /*
     * OTHER is included only if a future
     * Shopify resource type exists in DB
     * but is not yet classified.
     */
    if (resourceTypes.some((item) => item.group === 'OTHER')) {
      groupNames.push('OTHER');
    }

    const groups = groupNames.map((group) => {
      const items = resourceTypes.filter((item) => item.group === group);

      const summary: GroupSummary = {
        group,

        resourceTypes: items.length,

        resourceTypesWithContent: items.filter((item) => item.resources > 0)
          .length,

        resources: 0,

        fields: 0,

        actionableFields: 0,

        emptySource: 0,

        missing: 0,

        translated: 0,

        outdated: 0,

        coverage: 100,
      };

      for (const item of items) {
        summary.resources += item.resources;

        summary.fields += item.fields;

        summary.actionableFields += item.actionableFields;

        summary.emptySource += item.emptySource;

        summary.missing += item.missing;

        summary.translated += item.translated;

        summary.outdated += item.outdated;
      }

      summary.coverage = this.calculateCoverage(
        summary.translated,
        summary.actionableFields,
      );

      return summary;
    });

    const overall = {
      resourceTypes: resourceTypes.length,

      resourceTypesWithContent: resourceTypes.filter(
        (item) => item.resources > 0,
      ).length,

      resources: 0,

      fields: 0,

      actionableFields: 0,

      emptySource: 0,

      missing: 0,

      translated: 0,

      outdated: 0,

      coverage: 100,
    };

    for (const group of groups) {
      overall.resources += group.resources;

      overall.fields += group.fields;

      overall.actionableFields += group.actionableFields;

      overall.emptySource += group.emptySource;

      overall.missing += group.missing;

      overall.translated += group.translated;

      overall.outdated += group.outdated;
    }

    overall.coverage = this.calculateCoverage(
      overall.translated,
      overall.actionableFields,
    );

    return {
      shopifyDomain,
      targetLocale,

      summary: overall,

      groups,
    };
  }

  /*
   * Detailed breakdown used by the
   * resource-types dashboard screen.
   */
  async getResourceTypesOverview(shopifyDomain: string, targetLocale: string) {
    const resourceTypes = await this.buildResourceTypeSummaries(
      shopifyDomain,
      targetLocale,
    );

    return {
      shopifyDomain,
      targetLocale,
      resourceTypes,
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
        deletedAt: null,
      },

      include: {
        fields: {
          where: {
            deletedAt: null,
          },

          include: {
            states: {
              where: {
                targetLocale,
              },
            },
          },

          orderBy: {
            key: 'asc',
          },
        },
      },

      orderBy: {
        shopifyResourceId: 'asc',
      },
    });
  }

  private async buildResourceTypeSummaries(
    shopifyDomain: string,
    targetLocale: string,
  ): Promise<ResourceTypeSummary[]> {
    const shop = await this.prisma.shop.findUnique({
      where: {
        shopifyDomain,
      },

      select: {
        id: true,
      },
    });

    if (!shop) {
      throw new NotFoundException('Shop is not registered.');
    }

    /*
     * Initialise all 30 known Shopify
     * resource types.
     *
     * This is intentional: types with
     * zero resources must still appear
     * in the dashboard.
     */
    const summaries = new Map<string, ResourceTypeSummary>();

    for (const resourceType of SHOPIFY_TRANSLATION_RESOURCE_TYPES) {
      summaries.set(
        resourceType,
        this.createEmptyResourceTypeSummary(resourceType),
      );
    }

    /*
     * Only status information is loaded.
     *
     * sourceValue / translatedValue are
     * deliberately NOT loaded here,
     * especially because theme fields can
     * contain thousands of large strings.
     */
    const resources = await this.prisma.translationResource.findMany({
      where: {
        shopId: shop.id,
        deletedAt: null,
      },

      select: {
        resourceType: true,

        fields: {
          where: {
            deletedAt: null,
          },

          select: {
            states: {
              where: {
                targetLocale,
              },

              select: {
                status: true,
              },
            },
          },
        },
      },
    });

    for (const resource of resources) {
      let summary = summaries.get(resource.resourceType);

      /*
       * Future-proof fallback for resource
       * types introduced by Shopify later.
       */
      if (!summary) {
        summary = this.createEmptyResourceTypeSummary(resource.resourceType);

        summaries.set(resource.resourceType, summary);
      }

      summary.resources++;

      for (const field of resource.fields) {
        /*
         * TranslationState has a unique
         * fieldId + targetLocale constraint,
         * therefore there can be at most
         * one state here.
         */
        const state = field.states[0];

        if (!state) {
          continue;
        }

        summary.fields++;

        switch (state.status) {
          case 'EMPTY_SOURCE':
            summary.emptySource++;
            break;

          case 'MISSING':
            summary.missing++;
            break;

          case 'TRANSLATED':
            summary.translated++;
            break;

          case 'OUTDATED':
            summary.outdated++;
            break;
        }
      }
    }

    for (const summary of summaries.values()) {
      summary.actionableFields = summary.fields - summary.emptySource;

      summary.coverage = this.calculateCoverage(
        summary.translated,
        summary.actionableFields,
      );
    }

    /*
     * Preserve the logical order used by
     * ACA Locale instead of alphabetical
     * database ordering.
     */
    const known = SHOPIFY_TRANSLATION_RESOURCE_TYPES.map((resourceType) =>
      summaries.get(resourceType)!,
    );

    const unknown = Array.from(summaries.values()).filter(
      (summary) =>
        !(SHOPIFY_TRANSLATION_RESOURCE_TYPES as readonly string[]).includes(
          summary.resourceType,
        ),
    );

    return [...known, ...unknown];
  }

  private createEmptyResourceTypeSummary(
    resourceType: string,
  ): ResourceTypeSummary {
    return {
      resourceType,

      group: getTranslationResourceGroup(resourceType),

      resources: 0,

      fields: 0,

      actionableFields: 0,

      emptySource: 0,

      missing: 0,

      translated: 0,

      outdated: 0,

      coverage: 100,
    };
  }

  private calculateCoverage(translated: number, actionableFields: number) {
    if (actionableFields === 0) {
      return 100;
    }

    return Math.round((translated / actionableFields) * 100);
  }
}
