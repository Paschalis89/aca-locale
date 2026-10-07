import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  PrismaService,
} from '../database/prisma.service.js';

import {
  TranslationProviderRegistryService,
} from './translation-provider-registry.service.js';

import type {
  TranslationProviderName,
  TranslationProviderResult,
} from './translation-provider.types.js';

import {
  TranslationValidatorService,
} from '../translation-validation/translation-validator.service.js';

@Injectable()
export class TranslationExecutorService {
  constructor(
    private readonly prisma:
      PrismaService,

    private readonly providers:
      TranslationProviderRegistryService,

    private readonly validator:
      TranslationValidatorService,
  ) {}

  async execute(
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
                  type:
                    true,

                  key:
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

    if (
      job.status !==
      'QUEUED'
    ) {
      throw new BadRequestException(
        `Translation job cannot be executed from status "${job.status}".`,
      );
    }

    if (!job.provider) {
      throw new BadRequestException(
        'Translation job has no provider snapshot.',
      );
    }

    if (
      job.items.length ===
      0
    ) {
      throw new BadRequestException(
        'Translation job contains no items.',
      );
    }

    const primaryProvider =
      job.provider as
        TranslationProviderName;

    const primaryAdapter =
      this.providers.getProvider(
        primaryProvider,
      );

    const fallbackProvider =
      job.fallbackProvider
        ? (
            job.fallbackProvider as
              TranslationProviderName
          )
        : null;

    const fallbackAdapter =
      fallbackProvider
        ? this.providers.getProvider(
            fallbackProvider,
          )
        : null;

    /*
     * Avoid retrying the exact same
     * provider/model as fallback.
     */
    const hasUsefulFallback =
      Boolean(
        fallbackAdapter &&
        (
          fallbackProvider !==
            primaryProvider ||
          job.fallbackModel !==
            job.model
        ),
      );

    /*
     * Atomically claim the job.
     *
     * This protects us from two requests
     * attempting to execute the same
     * QUEUED job at the same time.
     */
    const claimed =
      await this.prisma.translationJob.updateMany({
        where: {
          id:
            job.id,

          status:
            'QUEUED',
        },

        data: {
          status:
            'RUNNING',

          startedAt:
            new Date(),

          completedAt:
            null,

          errorMessage:
            null,

          completedItems:
            0,

          failedItems:
            0,
        },
      });

    if (
      claimed.count !==
      1
    ) {
      throw new BadRequestException(
        'Translation job has already been claimed for execution.',
      );
    }

    let completedItems =
      0;

    let failedItems =
      0;

    let billedCharacters =
      0;

    let inputTokens =
      0;

    let outputTokens =
      0;

    let fallbackAttempts =
      0;

    let fallbackSuccesses =
      0;

    let validatedItems =
      0;

    let needsReviewItems =
      0;

    let validationErrors =
      0;

    let validationWarnings =
      0;

    for (
      const item
      of job.items
    ) {
      if (
        item.status !==
        'PENDING'
      ) {
        continue;
      }

      try {
        /*
         * Mark item as currently being
         * processed.
         */
        await this.prisma.translationJobItem.update({
          where: {
            id:
              item.id,
          },

          data: {
            status:
              'GENERATING',

            errorMessage:
              null,

            primaryErrorMessage:
              null,

            fallbackUsed:
              false,
          },
        });

        if (
          !item.sourceValue ||
          item.sourceValue
            .trim()
            .length ===
            0
        ) {
          throw new Error(
            'Source value is empty.',
          );
        }

        let result:
          TranslationProviderResult;

        let primaryError:
          string |
          null =
          null;

        let fallbackUsed =
          false;

        /*
         * First attempt:
         * primary provider snapshot.
         */
        try {
          result =
            await primaryAdapter.translate({
              text:
                item.sourceValue,

              sourceLocale:
                job.sourceLocale,

              targetLocale:
                job.targetLocale,

              contentType:
                item.field.type,

              resourceType:
                item.field.resource
                  .resourceType,

              fieldKey:
                item.field.key,

              model:
                item.model ??
                job.model,
            });
        } catch (error) {
          primaryError =
            this.errorMessage(
              error,
            );

          /*
           * If no useful fallback exists,
           * the item fails normally.
           */
          if (
            !hasUsefulFallback ||
            !fallbackAdapter ||
            !fallbackProvider
          ) {
            throw error;
          }

          fallbackAttempts +=
            1;

          /*
           * Second attempt:
           * fallback provider snapshot.
           */
          try {
            result =
              await fallbackAdapter.translate({
                text:
                  item.sourceValue,

                sourceLocale:
                  job.sourceLocale,

                targetLocale:
                  job.targetLocale,

                contentType:
                  item.field.type,

                resourceType:
                  item.field.resource
                    .resourceType,

                fieldKey:
                  item.field.key,

                model:
                  job.fallbackModel,
              });

            fallbackUsed =
              true;

            fallbackSuccesses +=
              1;
          } catch (fallbackError) {
            throw new Error(
              [
                `Primary provider ${primaryProvider} failed: ${primaryError}`,
                `Fallback provider ${fallbackProvider} failed: ${this.errorMessage(
                  fallbackError,
                )}`,
              ].join(
                ' | ',
              ),
            );
          }
        }

        /*
         * Usage accounting.
         *
         * DeepL contributes billed characters.
         * LLM providers contribute tokens.
         */
        billedCharacters +=
          result.billedCharacters ??
          0;

        inputTokens +=
          result.inputTokens ??
          0;

        outputTokens +=
          result.outputTokens ??
          0;

        /*
         * 8D:
         * deterministic validation.
         *
         * At this stage we do NOT call an
         * LLM reviewer.
         */
        const validation =
          this.validator.validate({
            sourceValue:
              item.sourceValue,

            translatedValue:
              result.text,

            sourceLocale:
              job.sourceLocale,

            targetLocale:
              job.targetLocale,

            contentType:
              item.field.type,

            resourceType:
              item.field.resource
                .resourceType,

            fieldKey:
              item.field.key,
          });

        /*
         * Warnings do not block automatic
         * deterministic validation.
         *
         * Only validation errors send the
         * item to NEEDS_REVIEW.
         */
        const itemStatus:
          'VALIDATED' |
          'NEEDS_REVIEW' =
          validation.passed
            ? 'VALIDATED'
            : 'NEEDS_REVIEW';

        if (
          validation.passed
        ) {
          validatedItems +=
            1;
        } else {
          needsReviewItems +=
            1;
        }

        validationErrors +=
          validation.errorCount;

        validationWarnings +=
          validation.warningCount;

        const now =
          new Date();

        /*
         * Persist the generated translation
         * together with deterministic
         * validation results.
         */
        await this.prisma.translationJobItem.update({
          where: {
            id:
              item.id,
          },

          data: {
            translatedValue:
              result.text,

            status:
              itemStatus,

            generatedAt:
              now,

            validatedAt:
              now,

            validationPassed:
              validation.passed,

            validationErrors:
              validation.errorCount,

            validationWarnings:
              validation.warningCount,

            /*
             * JSON.parse/stringify converts
             * our typed objects to a plain
             * JSON-compatible value accepted
             * by Prisma.
             */
            validationIssues:
              JSON.parse(
                JSON.stringify(
                  validation.issues,
                ),
              ),

            validationVersion:
              validation.version,

            /*
             * Store the ACTUAL provider/model
             * that produced the translation.
             *
             * If fallback was used these values
             * therefore contain the fallback
             * provider/model.
             */
            provider:
              result.provider,

            model:
              result.model,

            fallbackUsed,

            /*
             * Preserve the primary provider
             * error even when fallback succeeds.
             */
            primaryErrorMessage:
              primaryError,

            errorMessage:
              null,
          },
        });

        /*
         * A successfully translated item
         * counts as completed regardless of
         * whether deterministic validation
         * resulted in VALIDATED or
         * NEEDS_REVIEW.
         */
        completedItems +=
          1;
      } catch (error) {
        failedItems +=
          1;

        /*
         * Translation/provider execution
         * failed completely.
         *
         * This is different from
         * NEEDS_REVIEW:
         *
         * FAILED
         * = no usable translation produced.
         *
         * NEEDS_REVIEW
         * = translation exists but failed
         *   deterministic validation.
         */
        await this.prisma.translationJobItem.update({
          where: {
            id:
              item.id,
          },

          data: {
            status:
              'FAILED',

            errorMessage:
              this.errorMessage(
                error,
              ),
          },
        });
      }

      /*
       * Update progress after every item.
       */
      await this.prisma.translationJob.update({
        where: {
          id:
            job.id,
        },

        data: {
          completedItems,

          failedItems,
        },
      });
    }

    /*
     * Job completion is based on translation
     * execution success.
     *
     * NEEDS_REVIEW is NOT a failed execution:
     * the generated translation exists and can
     * continue into the review workflow.
     */
    const finalStatus =
      failedItems ===
      0
        ? 'COMPLETED'
        : completedItems ===
            0
          ? 'FAILED'
          : 'PARTIAL';

    await this.prisma.translationJob.update({
      where: {
        id:
          job.id,
      },

      data: {
        status:
          finalStatus,

        completedItems,

        failedItems,

        completedAt:
          new Date(),

        errorMessage:
          finalStatus ===
          'FAILED'
            ? 'All translation items failed.'
            : null,
      },
    });

    /*
     * Reload persisted state so the API
     * response reflects exactly what is now
     * stored in PostgreSQL.
     */
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

      execution: {
        primaryProvider,

        fallbackProvider:
          hasUsefulFallback
            ? fallbackProvider
            : null,

        fallbackAttempts,

        fallbackSuccesses,

        billedCharacters,

        inputTokens,

        outputTokens,

        validation: {
          version:
            'deterministic-v1',

          validatedItems,

          needsReviewItems,

          errors:
            validationErrors,

          warnings:
            validationWarnings,
        },
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