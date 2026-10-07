import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  PrismaService,
} from '../database/prisma.service.js';

import type {
  CreateTranslationJobDto,
} from './dto/create-translation-job.dto.js';

@Injectable()
export class TranslationJobsService {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  async create(
    shopifyDomain:
      string,

    body:
      CreateTranslationJobDto,
  ) {
    const shop =
      await this.prisma.shop.findUnique({
        where: {
          shopifyDomain,
        },

        include: {
          aiConfiguration:
            true,

          languages: {
            include: {
              language:
                true,
            },
          },
        },
      });

    if (!shop) {
      throw new NotFoundException(
        'Shop is not registered.',
      );
    }

    if (!shop.sourceLocale) {
      throw new BadRequestException(
        'The shop source locale has not been synchronized yet.',
      );
    }

    const targetLocale =
      body.targetLocale.trim();

    if (
      targetLocale ===
      shop.sourceLocale
    ) {
      throw new BadRequestException(
        'Target locale cannot be the same as the source locale.',
      );
    }

    const targetLanguage =
      shop.languages.find(
        (shopLanguage) =>
          shopLanguage.language.locale ===
          targetLocale,
      );

    if (!targetLanguage) {
      throw new BadRequestException(
        `Locale "${targetLocale}" is not configured for this Shopify store.`,
      );
    }

    const resourceTypes =
      Array.from(
        new Set(
          body.resourceTypes.map(
            (resourceType) =>
              resourceType
                .trim()
                .toUpperCase(),
          ),
        ),
      );

    const maxItems =
      body.maxItems ??
      100;

    /*
     * TranslationState represents the
     * current translation state on Shopify.
     *
     * Only MISSING and OUTDATED fields are
     * eligible for a new translation draft.
     */
    const states =
      await this.prisma.translationState.findMany({
        where: {
          targetLocale,

          OR: [
            {
              status:
                'MISSING',
            },
            {
              status:
                'OUTDATED',
            },
          ],

          field: {
            /*
             * Only fields belonging to the
             * current Shopify source locale.
             */
            sourceLocale:
              shop.sourceLocale,

            /*
             * Shopify handles and other URI
             * fields are deliberately excluded
             * from automatic translation.
             *
             * URL/SEO localization can become
             * an explicit feature later.
             */
            type: {
              not:
                'URI',
            },

            /*
             * Scope everything to the
             * authenticated shop and requested
             * resource types.
             */
            resource: {
              shopId:
                shop.id,

              resourceType: {
                in:
                  resourceTypes,
              },
            },

            /*
             * Prevent the same field from
             * appearing in more than one
             * active translation job for the
             * same target locale.
             */
            jobItems: {
              none: {
                job: {
                  shopId:
                    shop.id,

                  targetLocale,

                  OR: [
                    {
                      status:
                        'QUEUED',
                    },
                    {
                      status:
                        'RUNNING',
                    },
                  ],
                },
              },
            },
          },
        },

        select: {
          status:
            true,

          field: {
            select: {
              id:
                true,

              sourceLocale:
                true,

              sourceValue:
                true,

              sourceDigest:
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

        orderBy: [
          {
            field: {
              resource: {
                resourceType:
                  'asc',
              },
            },
          },
          {
            updatedAt:
              'asc',
          },
        ],

        take:
          maxItems,
      });

    if (
      states.length ===
      0
    ) {
      throw new BadRequestException(
        'No eligible MISSING or OUTDATED translation fields were found for the requested resource types.',
      );
    }

    /*
     * Snapshot the translation engine
     * configuration at job creation time.
     *
     * Changing the shop configuration later
     * must not modify historical jobs.
     */
    const provider =
      shop.aiConfiguration
        ?.translationProvider ??
      null;

    const model =
      shop.aiConfiguration
        ?.translationModel ??
      null;

    const fallbackProvider =
      shop.aiConfiguration
        ?.fallbackProvider ??
      null;

    const fallbackModel =
      fallbackProvider ===
      'DEEPL'
        ? null
        : shop.aiConfiguration
            ?.fallbackModel ??
          null;

    /*
     * Snapshot the AI review configuration
     * as well.
     *
     * TranslationJob.reviewProvider /
     * reviewModel represent the reviewer
     * planned when this job was created.
     *
     * The actual reviewer used later will
     * be stored on each TranslationJobItem.
     */
    const reviewProvider =
      shop.aiConfiguration
        ?.reviewProvider ??
      null;

    const reviewModel =
      shop.aiConfiguration
        ?.reviewModel ??
      null;

    const job =
      await this.prisma.translationJob.create({
        data: {
          shopId:
            shop.id,

          sourceLocale:
            shop.sourceLocale,

          targetLocale,

          status:
            'QUEUED',

          /*
           * Translation engine snapshot.
           */
          provider,

          model,

          /*
           * Translation fallback snapshot.
           */
          fallbackProvider,

          fallbackModel,

          /*
           * AI reviewer snapshot.
           */
          reviewProvider,

          reviewModel,

          totalItems:
            states.length,

          items: {
            create:
              states.map(
                (state) => ({
                  fieldId:
                    state.field.id,

                  sourceDigest:
                    state.field
                      .sourceDigest,

                  sourceValue:
                    state.field
                      .sourceValue,

                  status:
                    'PENDING',

                  /*
                   * Each item starts with the
                   * primary translation provider.
                   *
                   * If fallback is actually used,
                   * the executor will replace
                   * these values with the real
                   * provider/model that produced
                   * the translation.
                   */
                  provider,

                  model,
                }),
              ),
          },
        },

        include: {
          items: {
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

            orderBy: {
              createdAt:
                'asc',
            },
          },
        },
      });

    return job;
  }

  async findAll(
    shopifyDomain:
      string,
  ) {
    const shop =
      await this.prisma.shop.findUnique({
        where: {
          shopifyDomain,
        },

        select: {
          id:
            true,
        },
      });

    if (!shop) {
      throw new NotFoundException(
        'Shop is not registered.',
      );
    }

    return this.prisma.translationJob.findMany({
      where: {
        shopId:
          shop.id,
      },

      orderBy: {
        createdAt:
          'desc',
      },
    });
  }

  async findOne(
    shopifyDomain:
      string,

    jobId:
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

        include: {
          items: {
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

            orderBy: {
              createdAt:
                'asc',
            },
          },
        },
      });

    if (!job) {
      throw new NotFoundException(
        'Translation job not found.',
      );
    }

    return job;
  }
}