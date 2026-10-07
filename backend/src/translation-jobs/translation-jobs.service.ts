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
  private static readonly STALE_RUNNING_MS =
    5 * 60 * 1000;

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
            sourceLocale:
              shop.sourceLocale,

            type: {
              not:
                'URI',
            },

            resource: {
              shopId:
                shop.id,

              resourceType: {
                in:
                  resourceTypes,
              },
            },

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

    const reviewProvider =
      shop.aiConfiguration
        ?.reviewProvider ??
      null;

    const reviewModel =
      shop.aiConfiguration
        ?.reviewModel ??
      null;

    return this.prisma.translationJob.create({
      data: {
        shopId:
          shop.id,

        sourceLocale:
          shop.sourceLocale,

        targetLocale,

        status:
          'QUEUED',

        provider,
        model,
        fallbackProvider,
        fallbackModel,
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

                provider,
                model,
              }),
            ),
        },
      },

      include:
        this.jobInclude(),
    });
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

        include:
          this.jobInclude(),
      });

    if (!job) {
      throw new NotFoundException(
        'Translation job not found.',
      );
    }

    return job;
  }

  async cancel(
    shopifyDomain:
      string,

    jobId:
      string,
  ) {
    const job =
      await this.findLifecycleJob(
        shopifyDomain,
        jobId,
      );

    if (
      job.status ===
      'CANCELLED'
    ) {
      return this.findOne(
        shopifyDomain,
        jobId,
      );
    }

    if (
      job.status !==
        'QUEUED' &&
      job.status !==
        'RUNNING'
    ) {
      throw new BadRequestException(
        `Translation job cannot be cancelled from status "${job.status}".`,
      );
    }

    const now =
      new Date();

    await this.prisma.$transaction(
      async (
        tx,
      ) => {
        const cancelled =
          await tx.translationJob.updateMany({
            where: {
              id:
                job.id,

              status: {
                in: [
                  'QUEUED',
                  'RUNNING',
                ],
              },
            },

            data: {
              status:
                'CANCELLED',

              completedAt:
                now,

              errorMessage:
                'Cancelled by user.',
            },
          });

        if (
          cancelled.count !==
          1
        ) {
          return;
        }

        await tx.translationJobItem.updateMany({
          where: {
            jobId:
              job.id,

            status:
              'GENERATING',
          },

          data: {
            status:
              'PENDING',
          },
        });
      },
    );

    return this.findOne(
      shopifyDomain,
      jobId,
    );
  }

  async retryFailed(
    shopifyDomain:
      string,

    jobId:
      string,
  ) {
    const job =
      await this.findLifecycleJob(
        shopifyDomain,
        jobId,
      );

    if (
      job.status !==
        'FAILED' &&
      job.status !==
        'PARTIAL'
    ) {
      throw new BadRequestException(
        `Failed items cannot be retried from job status "${job.status}".`,
      );
    }

    const failedItems =
      job.items.filter(
        (item) =>
          item.status ===
          'FAILED',
      );

    if (
      failedItems.length ===
      0
    ) {
      throw new BadRequestException(
        'Translation job contains no failed items to retry.',
      );
    }

    const failedIds =
      failedItems.map(
        (item) =>
          item.id,
      );

    const completedItems =
      job.items.filter(
        (item) =>
          this.isTranslationCompletedStatus(
            item.status,
          ),
      ).length;

    await this.prisma.$transaction(
      async (
        tx,
      ) => {
        await tx.translationJobItem.updateMany({
          where: {
            id: {
              in:
                failedIds,
            },
          },

          data: {
            status:
              'PENDING',

            translatedValue:
              null,

            generatedAt:
              null,

            validatedAt:
              null,

            validationPassed:
              null,

            validationErrors:
              0,

            validationWarnings:
              0,

            validationVersion:
              null,

            fallbackUsed:
              false,

            primaryErrorMessage:
              null,

            errorMessage:
              null,

            provider:
              job.provider,

            model:
              job.model,
          },
        });

        await tx.translationJob.update({
          where: {
            id:
              job.id,
          },

          data: {
            status:
              'QUEUED',

            completedItems,

            failedItems:
              0,

            completedAt:
              null,

            errorMessage:
              null,
          },
        });
      },
    );

    return this.findOne(
      shopifyDomain,
      jobId,
    );
  }

  async resume(
    shopifyDomain:
      string,

    jobId:
      string,
  ) {
    const job =
      await this.findLifecycleJob(
        shopifyDomain,
        jobId,
      );

    if (
      job.status ===
      'QUEUED'
    ) {
      return this.findOne(
        shopifyDomain,
        jobId,
      );
    }

    if (
      job.status !==
        'CANCELLED' &&
      job.status !==
        'RUNNING'
    ) {
      throw new BadRequestException(
        `Translation job cannot be resumed from status "${job.status}".`,
      );
    }

    if (
      job.status ===
      'RUNNING'
    ) {
      const age =
        Date.now() -
        job.updatedAt.getTime();

      if (
        age <
        TranslationJobsService
          .STALE_RUNNING_MS
      ) {
        const remainingSeconds =
          Math.ceil(
            (
              TranslationJobsService
                .STALE_RUNNING_MS -
              age
            ) /
              1000,
          );

        throw new BadRequestException(
          `Translation job is still active. Retry resume in approximately ${remainingSeconds} seconds if it remains stuck.`,
        );
      }
    }

    const completedItems =
      job.items.filter(
        (item) =>
          this.isTranslationCompletedStatus(
            item.status,
          ),
      ).length;

    const failedItems =
      job.items.filter(
        (item) =>
          item.status ===
          'FAILED',
      ).length;

    await this.prisma.$transaction(
      async (
        tx,
      ) => {
        await tx.translationJobItem.updateMany({
          where: {
            jobId:
              job.id,

            status:
              'GENERATING',
          },

          data: {
            status:
              'PENDING',

            errorMessage:
              null,
          },
        });

        await tx.translationJob.update({
          where: {
            id:
              job.id,
          },

          data: {
            status:
              'QUEUED',

            completedItems,

            failedItems,

            completedAt:
              null,

            errorMessage:
              null,
          },
        });
      },
    );

    return this.findOne(
      shopifyDomain,
      jobId,
    );
  }

  private async findLifecycleJob(
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
            select: {
              id:
                true,

              status:
                true,
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

  private isTranslationCompletedStatus(
    status:
      string,
  ) {
    return [
      'GENERATED',
      'VALIDATED',
      'NEEDS_REVIEW',
      'APPROVED',
      'REJECTED',
      'PUBLISHED',
    ].includes(
      status,
    );
  }

  private jobInclude() {
    return {
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
    } as const;
  }
}
