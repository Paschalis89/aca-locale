import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';

import { GlossaryService } from '../glossary/glossary.service.js';

import { TranslationValidatorService } from '../translation-validation/translation-validator.service.js';

import { estimateUsageCost } from '../translation-usage/translation-usage-cost.js';

import { TranslationProviderRegistryService } from './translation-provider-registry.service.js';

import type {
  TranslationProviderName,
  TranslationProviderResult,
} from './translation-provider.types.js';

@Injectable()
export class TranslationExecutorService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly providers: TranslationProviderRegistryService,

    private readonly validator: TranslationValidatorService,

    @Optional()
    private readonly glossary?: GlossaryService,
  ) {}

  async execute(
    shopifyDomain: string,

    jobId: string,
  ) {
    let job = await this.loadJob(shopifyDomain, jobId);

    if (job.status === 'RUNNING') {
      return {
        ...job,

        execution: {
          skipped: true,

          reason: 'ALREADY_RUNNING',
        },
      };
    }

    if (job.status === 'COMPLETED') {
      return {
        ...job,

        execution: {
          skipped: true,

          reason: 'ALREADY_COMPLETED',
        },
      };
    }

    if (job.status === 'FAILED' || job.status === 'PARTIAL') {
      throw new BadRequestException(
        `Translation job cannot be executed from status "${job.status}". Use retry-failed first.`,
      );
    }

    if (job.status === 'CANCELLED') {
      throw new BadRequestException(
        'Translation job is cancelled. Resume it before execution.',
      );
    }

    if (job.status !== 'QUEUED') {
      throw new BadRequestException(
        `Translation job cannot be executed from status "${job.status}".`,
      );
    }

    if (!job.provider) {
      throw new BadRequestException(
        'Translation job has no provider snapshot.',
      );
    }

    if (job.items.length === 0) {
      throw new BadRequestException('Translation job contains no items.');
    }

    const primaryProvider = job.provider as TranslationProviderName;

    const primaryAdapter = this.providers.getProvider(primaryProvider);

    const fallbackProvider = job.fallbackProvider
      ? (job.fallbackProvider as TranslationProviderName)
      : null;

    const fallbackAdapter = fallbackProvider
      ? this.providers.getProvider(fallbackProvider)
      : null;

    const hasUsefulFallback = Boolean(
      fallbackAdapter &&
      (fallbackProvider !== primaryProvider || job.fallbackModel !== job.model),
    );

    let completedItems = job.items.filter((item) =>
      this.isTranslationCompletedStatus(item.status),
    ).length;

    let failedItems = job.items.filter(
      (item) => item.status === 'FAILED',
    ).length;

    const claimed = await this.prisma.translationJob.updateMany({
      where: {
        id: job.id,

        status: 'QUEUED',
      },

      data: {
        status: 'RUNNING',

        startedAt: job.startedAt ?? new Date(),

        completedAt: null,

        errorMessage: null,

        completedItems,

        failedItems,
      },
    });

    if (claimed.count !== 1) {
      job = await this.loadJob(shopifyDomain, jobId);

      return {
        ...job,

        execution: {
          skipped: true,

          reason: 'ALREADY_CLAIMED',
        },
      };
    }

    let billedCharacters = 0;

    let inputTokens = 0;

    let outputTokens = 0;

    let fallbackAttempts = 0;

    let fallbackSuccesses = 0;

    let validatedItems = 0;

    let needsReviewItems = 0;

    let validationErrors = 0;

    let validationWarnings = 0;

    let validationVersion = 'deterministic-v2-glossary';

    let cancelled = false;

    for (const item of job.items) {
      if (item.status !== 'PENDING') {
        continue;
      }

      if (await this.isCancelled(job.id)) {
        cancelled = true;

        break;
      }

      try {
        const itemClaim = await this.prisma.translationJobItem.updateMany({
          where: {
            id: item.id,

            status: 'PENDING',
          },

          data: {
            status: 'GENERATING',

            errorMessage: null,

            primaryErrorMessage: null,

            fallbackUsed: false,
          },
        });

        if (itemClaim.count !== 1) {
          continue;
        }

        if (!item.sourceValue || item.sourceValue.trim().length === 0) {
          throw new Error('Source value is empty.');
        }

        const glossaryRules = this.glossary
          ? await this.glossary.resolveRulesForText(
              shopifyDomain,
              job.sourceLocale,
              job.targetLocale,
              item.sourceValue,
            )
          : [];

        let result: TranslationProviderResult;

        let primaryError: string | null = null;

        let fallbackUsed = false;

        try {
          result = await primaryAdapter.translate({
            text: item.sourceValue,

            sourceLocale: job.sourceLocale,

            targetLocale: job.targetLocale,

            contentType: item.field.type,

            resourceType: item.field.resource.resourceType,

            fieldKey: item.field.key,

            model: item.model ?? job.model,

            glossaryRules,
          });

          await this.recordUsage({
            shopId: job.shopId,

            jobId: job.id,

            itemId: item.id,

            provider: result.provider,

            model: result.model,

            success: true,

            fallback: false,

            usageKnown: true,

            billedCharacters: result.billedCharacters ?? 0,

            inputTokens: result.inputTokens ?? 0,

            outputTokens: result.outputTokens ?? 0,
          });
        } catch (error) {
          primaryError = this.errorMessage(error);

          await this.recordUsage({
            shopId: job.shopId,

            jobId: job.id,

            itemId: item.id,

            provider: primaryProvider,

            model: item.model ?? job.model,

            success: false,

            fallback: false,

            usageKnown: false,

            billedCharacters: 0,

            inputTokens: 0,

            outputTokens: 0,

            errorMessage: primaryError,
          });

          if (!hasUsefulFallback || !fallbackAdapter || !fallbackProvider) {
            throw error;
          }

          fallbackAttempts += 1;

          try {
            result = await fallbackAdapter.translate({
              text: item.sourceValue,

              sourceLocale: job.sourceLocale,

              targetLocale: job.targetLocale,

              contentType: item.field.type,

              resourceType: item.field.resource.resourceType,

              fieldKey: item.field.key,

              model: job.fallbackModel,

              glossaryRules,
            });

            await this.recordUsage({
              shopId: job.shopId,

              jobId: job.id,

              itemId: item.id,

              provider: result.provider,

              model: result.model,

              success: true,

              fallback: true,

              usageKnown: true,

              billedCharacters: result.billedCharacters ?? 0,

              inputTokens: result.inputTokens ?? 0,

              outputTokens: result.outputTokens ?? 0,
            });

            fallbackUsed = true;

            fallbackSuccesses += 1;
          } catch (fallbackError) {
            const fallbackErrorMessage = this.errorMessage(fallbackError);

            await this.recordUsage({
              shopId: job.shopId,

              jobId: job.id,

              itemId: item.id,

              provider: fallbackProvider,

              model: job.fallbackModel,

              success: false,

              fallback: true,

              usageKnown: false,

              billedCharacters: 0,

              inputTokens: 0,

              outputTokens: 0,

              errorMessage: fallbackErrorMessage,
            });

            throw new Error(
              [
                `Primary provider ${primaryProvider} failed: ${primaryError}`,
                `Fallback provider ${fallbackProvider} failed: ${fallbackErrorMessage}`,
              ].join(' | '),
            );
          }
        }

        billedCharacters += result.billedCharacters ?? 0;

        inputTokens += result.inputTokens ?? 0;

        outputTokens += result.outputTokens ?? 0;

        const validation = this.validator.validate({
          sourceValue: item.sourceValue,

          translatedValue: result.text,

          sourceLocale: job.sourceLocale,

          targetLocale: job.targetLocale,

          contentType: item.field.type,

          resourceType: item.field.resource.resourceType,

          fieldKey: item.field.key,

          glossaryRules,
        });

        validationVersion = validation.version;

        if (await this.isCancelled(job.id)) {
          await this.resetGeneratingItem(item.id);

          cancelled = true;

          break;
        }

        const itemStatus: 'VALIDATED' | 'NEEDS_REVIEW' = validation.passed
          ? 'VALIDATED'
          : 'NEEDS_REVIEW';

        if (validation.passed) {
          validatedItems += 1;
        } else {
          needsReviewItems += 1;
        }

        validationErrors += validation.errorCount;

        validationWarnings += validation.warningCount;

        const now = new Date();

        const persisted = await this.prisma.translationJobItem.updateMany({
          where: {
            id: item.id,

            status: 'GENERATING',
          },

          data: {
            translatedValue: result.text,

            status: itemStatus,

            generatedAt: now,

            validatedAt: now,

            validationPassed: validation.passed,

            validationErrors: validation.errorCount,

            validationWarnings: validation.warningCount,

            validationIssues: JSON.parse(JSON.stringify(validation.issues)),

            validationVersion: validation.version,

            provider: result.provider,

            model: result.model,

            fallbackUsed,

            primaryErrorMessage: primaryError,

            errorMessage: null,
          },
        });

        if (persisted.count !== 1) {
          if (await this.isCancelled(job.id)) {
            cancelled = true;

            break;
          }

          continue;
        }

        completedItems += 1;
      } catch (error) {
        if (await this.isCancelled(job.id)) {
          await this.resetGeneratingItem(item.id);

          cancelled = true;

          break;
        }

        const failed = await this.prisma.translationJobItem.updateMany({
          where: {
            id: item.id,

            status: 'GENERATING',
          },

          data: {
            status: 'FAILED',

            errorMessage: this.errorMessage(error),
          },
        });

        if (failed.count === 1) {
          failedItems += 1;
        } else if (await this.isCancelled(job.id)) {
          cancelled = true;

          break;
        }
      }

      await this.prisma.translationJob.updateMany({
        where: {
          id: job.id,

          status: 'RUNNING',
        },

        data: {
          completedItems,

          failedItems,
        },
      });
    }

    const currentStatus = await this.prisma.translationJob.findUnique({
      where: {
        id: job.id,
      },

      select: {
        status: true,
      },
    });

    if (cancelled || currentStatus?.status === 'CANCELLED') {
      const result = await this.loadJob(shopifyDomain, jobId);

      return {
        ...result,

        execution: {
          cancelled: true,

          primaryProvider,

          fallbackProvider: hasUsefulFallback ? fallbackProvider : null,

          fallbackAttempts,
          fallbackSuccesses,
          billedCharacters,
          inputTokens,
          outputTokens,

          validation: {
            version: validationVersion,

            validatedItems,
            needsReviewItems,

            errors: validationErrors,

            warnings: validationWarnings,
          },
        },
      };
    }

    const finalStatus =
      failedItems === 0
        ? 'COMPLETED'
        : completedItems === 0
          ? 'FAILED'
          : 'PARTIAL';

    await this.prisma.translationJob.update({
      where: {
        id: job.id,
      },

      data: {
        status: finalStatus,

        completedItems,

        failedItems,

        completedAt: new Date(),

        errorMessage:
          finalStatus === 'FAILED' ? 'All translation items failed.' : null,
      },
    });

    const result = await this.loadJob(shopifyDomain, jobId);

    return {
      ...result,

      execution: {
        primaryProvider,

        fallbackProvider: hasUsefulFallback ? fallbackProvider : null,

        fallbackAttempts,
        fallbackSuccesses,
        billedCharacters,
        inputTokens,
        outputTokens,

        validation: {
          version: validationVersion,

          validatedItems,
          needsReviewItems,

          errors: validationErrors,

          warnings: validationWarnings,
        },
      },
    };
  }

  private async loadJob(
    shopifyDomain: string,

    jobId: string,
  ) {
    const job = await this.prisma.translationJob.findFirst({
      where: {
        id: jobId,

        shop: {
          shopifyDomain,
        },
      },

      include: {
        items: {
          include: {
            field: {
              select: {
                type: true,

                key: true,

                sourceLocale: true,

                resource: {
                  select: {
                    resourceType: true,

                    shopifyResourceId: true,
                  },
                },
              },
            },
          },

          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Translation job not found.');
    }

    return job;
  }

  private async isCancelled(jobId: string) {
    const job = await this.prisma.translationJob.findUnique({
      where: {
        id: jobId,
      },

      select: {
        status: true,
      },
    });

    return job?.status === 'CANCELLED';
  }

  private async resetGeneratingItem(itemId: string) {
    await this.prisma.translationJobItem.updateMany({
      where: {
        id: itemId,

        status: 'GENERATING',
      },

      data: {
        status: 'PENDING',
      },
    });
  }

  private isTranslationCompletedStatus(status: string) {
    return [
      'GENERATED',
      'VALIDATED',
      'NEEDS_REVIEW',
      'APPROVED',
      'REJECTED',
      'PUBLISHED',
    ].includes(status);
  }

  private async recordUsage(input: {
    shopId: string;

    jobId: string;

    itemId: string;

    provider: string;

    model: string | null;

    success: boolean;

    fallback: boolean;

    usageKnown: boolean;

    billedCharacters: number;

    inputTokens: number;

    outputTokens: number;

    errorMessage?: string | null;
  }) {
    try {
      const cost = input.usageKnown
        ? estimateUsageCost({
            provider: input.provider,

            model: input.model,

            billedCharacters: input.billedCharacters,

            inputTokens: input.inputTokens,

            outputTokens: input.outputTokens,
          })
        : {
            estimatedCostMicrousd: null,

            pricingKey: null,

            pricingVersion:
              process.env.ACA_LOCALE_USAGE_PRICING_VERSION ?? null,
          };

      await this.prisma.translationUsageEvent.create({
        data: {
          shopId: input.shopId,

          jobId: input.jobId,

          itemId: input.itemId,

          stage: 'TRANSLATION',

          provider: input.provider,

          model: input.model,

          success: input.success,

          fallback: input.fallback,

          usageKnown: input.usageKnown,

          billedCharacters: input.billedCharacters,

          inputTokens: input.inputTokens,

          outputTokens: input.outputTokens,

          estimatedCostMicrousd: cost.estimatedCostMicrousd,

          pricingKey: cost.pricingKey,

          pricingVersion: cost.pricingVersion,

          errorMessage: input.errorMessage ?? null,
        },
      });
    } catch (error) {
      /*
       * Usage accounting must never turn a
       * successful external provider call into
       * a failed translation that is then billed
       * a second time on retry.
       */
      console.error(
        '[ACA Locale] Unable to persist translation usage event:',
        error,
      );
    }
  }

  private errorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
