import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  PrismaService,
} from '../database/prisma.service.js';

import {
  AiTranslationReviewerService,
} from './ai-translation-reviewer.service.js';

@Injectable()
export class TranslationReviewExecutorService {
  constructor(
    private readonly prisma:
      PrismaService,

    private readonly reviewer:
      AiTranslationReviewerService,
  ) {}

  async reviewJob(
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

                  resource: {
                    select: {
                      resourceType:
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

    if (
      job.status !==
      'COMPLETED' &&
      job.status !==
      'PARTIAL'
    ) {
      throw new BadRequestException(
        `Translation job cannot be reviewed from status "${job.status}".`,
      );
    }

    if (
      !job.reviewProvider ||
      !job.reviewModel
    ) {
      throw new BadRequestException(
        'Translation job has no AI reviewer snapshot.',
      );
    }

    let reviewedItems =
      0;

    let approvedItems =
      0;

    let needsReviewItems =
      0;

    let failedReviews =
      0;

    let inputTokens =
      0;

    let outputTokens =
      0;

    for (
      const item
      of job.items
    ) {
      /*
       * Only deterministic-validation
       * successes are eligible for AI
       * quality review.
       */
      if (
        item.status !==
        'VALIDATED'
      ) {
        continue;
      }

      if (
        !item.translatedValue
      ) {
        continue;
      }

      /*
       * Do not review the same item twice.
       */
      if (
        item.aiReviewedAt
      ) {
        continue;
      }

      try {
        const result =
          await this.reviewer.review({
            sourceValue:
              item.sourceValue,

            translatedValue:
              item.translatedValue,

            sourceLocale:
              job.sourceLocale,

            targetLocale:
              job.targetLocale,

            resourceType:
              item.field.resource
                .resourceType,

            fieldKey:
              item.field.key,

            contentType:
              item.field.type,

            provider:
              job.reviewProvider,

            model:
              job.reviewModel,
          });

        inputTokens +=
          result.inputTokens;

        outputTokens +=
          result.outputTokens;

        reviewedItems +=
          1;

        if (
          result.approved
        ) {
          approvedItems +=
            1;
        } else {
          needsReviewItems +=
            1;
        }

        await this.prisma.translationJobItem.update({
          where: {
            id:
              item.id,
          },

          data: {
            status:
              result.approved
                ? 'VALIDATED'
                : 'NEEDS_REVIEW',

            aiReviewedAt:
              new Date(),

            aiReviewPassed:
              result.approved,

            aiReviewScore:
              result.score,

            aiReviewIssues:
              JSON.parse(
                JSON.stringify(
                  result.issues,
                ),
              ),

            aiReviewSuggestedTranslation:
              result.suggestedTranslation,

            aiReviewProvider:
              result.provider,

            aiReviewModel:
              result.model,

            aiReviewErrorMessage:
              null,
          },
        });
      } catch (error) {
        failedReviews +=
          1;

        await this.prisma.translationJobItem.update({
          where: {
            id:
              item.id,
          },

          data: {
            /*
             * Translation itself remains valid.
             * An unavailable reviewer must not
             * destroy the generated draft.
             */
            aiReviewErrorMessage:
              this.errorMessage(
                error,
              ),
          },
        });
      }
    }

    const result =
      await this.prisma.translationJob.findUnique({
        where: {
          id:
            job.id,
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

    return {
      ...result,

      reviewExecution: {
        provider:
          job.reviewProvider,

        model:
          job.reviewModel,

        reviewedItems,

        approvedItems,

        needsReviewItems,

        failedReviews,

        inputTokens,

        outputTokens,
      },
    };
  }

  private errorMessage(
    error:
      unknown,
  ) {
    if (
      error instanceof Error
    ) {
      return error.message;
    }

    return String(
      error,
    );
  }
}