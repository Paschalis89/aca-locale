import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';

import { GlossaryService } from '../glossary/glossary.service.js';

import { TranslationValidatorService } from '../translation-validation/translation-validator.service.js';

import type { ApproveTranslationItemDto } from './dto/approve-translation-item.dto.js';

import type { RejectTranslationItemDto } from './dto/reject-translation-item.dto.js';

@Injectable()
export class TranslationHumanReviewService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly validator: TranslationValidatorService,

    @Optional()
    private readonly glossary?: GlossaryService,
  ) {}

  async approve(
    shopifyDomain: string,

    jobId: string,

    itemId: string,

    body: ApproveTranslationItemDto,
  ) {
    const item = await this.findItem(shopifyDomain, jobId, itemId);

    if (item.status !== 'VALIDATED' && item.status !== 'NEEDS_REVIEW') {
      throw new BadRequestException(
        `Translation item cannot be approved from status "${item.status}".`,
      );
    }

    if (!item.translatedValue) {
      throw new BadRequestException(
        'Translation item has no generated translation.',
      );
    }

    /*
     * Approve as-is:
     * approvedValue omitted.
     *
     * Edit + Approve:
     * approvedValue supplied.
     *
     * We only trim for the empty check.
     * The submitted value itself is kept
     * unchanged.
     */
    const approvedValue =
      body.approvedValue !== undefined
        ? body.approvedValue
        : item.translatedValue;

    if (approvedValue.trim().length === 0) {
      throw new BadRequestException('Approved translation cannot be empty.');
    }

    /*
     * Any human modification must pass the
     * deterministic validator again, including
     * the currently active glossary rules.
     */
    const glossaryRules = this.glossary
      ? await this.glossary.resolveRulesForText(
          shopifyDomain,
          item.job.sourceLocale,
          item.job.targetLocale,
          item.sourceValue,
        )
      : [];

    const validation = this.validator.validate({
      sourceValue: item.sourceValue,

      translatedValue: approvedValue,

      sourceLocale: item.job.sourceLocale,

      targetLocale: item.job.targetLocale,

      contentType: item.field.type,

      resourceType: item.field.resource.resourceType,

      fieldKey: item.field.key,

      glossaryRules,
    });

    if (!validation.passed) {
      throw new BadRequestException({
        message: 'The approved translation failed deterministic validation.',

        validation: {
          version: validation.version,

          errors: validation.errorCount,

          warnings: validation.warningCount,

          issues: validation.issues,
        },
      });
    }

    const now = new Date();

    return this.prisma.translationJobItem.update({
      where: {
        id: item.id,
      },

      data: {
        status: 'APPROVED',

        approvedValue,

        approvedAt: now,

        humanReviewedAt: now,

        humanReviewNote: body.note?.trim() || null,
      },

      include: this.itemInclude(),
    });
  }

  async reject(
    shopifyDomain: string,

    jobId: string,

    itemId: string,

    body: RejectTranslationItemDto,
  ) {
    const item = await this.findItem(shopifyDomain, jobId, itemId);

    if (item.status !== 'VALIDATED' && item.status !== 'NEEDS_REVIEW') {
      throw new BadRequestException(
        `Translation item cannot be rejected from status "${item.status}".`,
      );
    }

    const now = new Date();

    return this.prisma.translationJobItem.update({
      where: {
        id: item.id,
      },

      data: {
        status: 'REJECTED',

        approvedValue: null,

        approvedAt: null,

        humanReviewedAt: now,

        humanReviewNote: body.note.trim(),
      },

      include: this.itemInclude(),
    });
  }

  async regenerate(
    shopifyDomain: string,

    jobId: string,

    itemId: string,
  ) {
    const item = await this.findItem(shopifyDomain, jobId, itemId);

    /*
     * Human regeneration is intentionally
     * limited to review-stage items.
     *
     * APPROVED/PUBLISHED items must not be
     * silently regenerated.
     */
    if (
      item.status !== 'VALIDATED' &&
      item.status !== 'NEEDS_REVIEW' &&
      item.status !== 'REJECTED'
    ) {
      throw new BadRequestException(
        `Translation item cannot be regenerated from status "${item.status}".`,
      );
    }

    /*
     * Prevent double-clicks from creating
     * multiple active regeneration jobs.
     */
    const activeRegeneration = await this.prisma.translationJobItem.findFirst({
      where: {
        regeneratedFromItemId: item.id,

        job: {
          status: {
            in: ['QUEUED', 'RUNNING'],
          },
        },
      },

      select: {
        id: true,

        jobId: true,
      },
    });

    if (activeRegeneration) {
      throw new BadRequestException(
        `An active regeneration already exists in job "${activeRegeneration.jobId}".`,
      );
    }

    /*
     * Regeneration creates a brand-new job.
     *
     * The previous item is left untouched,
     * preserving translation, validation,
     * AI review and human review history.
     */
    return this.prisma.translationJob.create({
      data: {
        shopId: item.job.shopId,

        sourceLocale: item.job.sourceLocale,

        targetLocale: item.job.targetLocale,

        status: 'QUEUED',

        provider: item.job.provider,

        model: item.job.model,

        fallbackProvider: item.job.fallbackProvider,

        fallbackModel: item.job.fallbackModel,

        reviewProvider: item.job.reviewProvider,

        reviewModel: item.job.reviewModel,

        totalItems: 1,

        items: {
          create: {
            fieldId: item.fieldId,

            sourceDigest: item.sourceDigest,

            sourceValue: item.sourceValue,

            status: 'PENDING',

            provider: item.job.provider,

            model: item.job.model,

            regeneratedFromItemId: item.id,
          },
        },
      },

      include: {
        items: {
          include: this.itemInclude(),

          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });
  }

  async markPublished(
    shopifyDomain: string,

    jobId: string,

    itemId: string,
  ) {
    const item = await this.findItem(shopifyDomain, jobId, itemId);

    if (item.status !== 'APPROVED' && item.status !== 'PUBLISHED') {
      throw new BadRequestException(
        `Translation item cannot be marked as published from status "${item.status}".`,
      );
    }

    if (!item.approvedValue) {
      throw new BadRequestException('Translation item has no approved value.');
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updatedItem = await tx.translationJobItem.update({
        where: {
          id: item.id,
        },

        data: {
          status: 'PUBLISHED',

          publishedAt: item.publishedAt ?? now,
        },

        include: this.itemInclude(),
      });

      const translationState = await tx.translationState.upsert({
        where: {
          fieldId_targetLocale: {
            fieldId: item.fieldId,

            targetLocale: item.job.targetLocale,
          },
        },

        create: {
          fieldId: item.fieldId,

          targetLocale: item.job.targetLocale,

          status: 'TRANSLATED',

          translatedValue: item.approvedValue,

          translationUpdatedAt: now,

          scannedAt: now,
        },

        update: {
          status: 'TRANSLATED',

          translatedValue: item.approvedValue,

          translationUpdatedAt: now,

          scannedAt: now,
        },
      });

      return {
        ...updatedItem,

        translationState,
      };
    });
  }

  private async findItem(
    shopifyDomain: string,

    jobId: string,

    itemId: string,
  ) {
    const item = await this.prisma.translationJobItem.findFirst({
      where: {
        id: itemId,

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
            id: true,

            shopId: true,

            sourceLocale: true,

            targetLocale: true,

            status: true,

            provider: true,

            model: true,

            fallbackProvider: true,

            fallbackModel: true,

            reviewProvider: true,

            reviewModel: true,
          },
        },

        field: {
          select: {
            key: true,

            type: true,

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
    });

    if (!item) {
      throw new NotFoundException('Translation job item not found.');
    }

    return item;
  }

  private itemInclude() {
    return {
      field: {
        select: {
          key: true,

          type: true,

          sourceLocale: true,

          resource: {
            select: {
              resourceType: true,

              shopifyResourceId: true,
            },
          },
        },
      },
    } as const;
  }
}
