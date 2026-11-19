import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

import { lockTranslationScope, BLOCKING_TRANSLATION_ITEM_STATUSES } from '../translation-coordination/translation-scope-lock.js';

import type { CreateTranslationJobDto } from './dto/create-translation-job.dto.js';

type TranslationCandidateState = {
  status: string;
  field: {
    id: string;
    sourceValue: string;
    sourceDigest: string;
    sourceLocale?: string;
    resource?: { resourceType: string; shopifyResourceId: string };
  };
};

@Injectable()
export class TranslationJobsService {
  private static readonly STALE_RUNNING_MS = 5 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  async create(
    shopifyDomain: string,

    body: CreateTranslationJobDto,
  ) {
    const shop = await this.prisma.shop.findUnique({
      where: {
        shopifyDomain,
      },

      include: {
        aiConfiguration: true,

        languages: {
          include: {
            language: true,
          },
        },
      },
    });

    if (!shop) {
      throw new NotFoundException('Shop is not registered.');
    }

    if (!shop.sourceLocale) {
      throw new BadRequestException(
        'The shop source locale has not been synchronized yet.',
      );
    }

    const sourceLocale: string = shop.sourceLocale;
    const targetLocale = body.targetLocale.trim();

    if (targetLocale === shop.sourceLocale) {
      throw new BadRequestException(
        'Target locale cannot be the same as the source locale.',
      );
    }

    const targetLanguage = shop.languages.find(
      (shopLanguage) => shopLanguage.language.locale === targetLocale,
    );

    if (!targetLanguage) {
      throw new BadRequestException(
        `Locale "${targetLocale}" is not configured for this Shopify store.`,
      );
    }

    const resourceTypes = Array.from(
      new Set(
        body.resourceTypes.map((resourceType) =>
          resourceType.trim().toUpperCase(),
        ),
      ),
    );

    const maxItems = body.maxItems ?? 100;

    return this.prisma.$transaction(async (tx) => {
      await lockTranslationScope(tx, shop.id, targetLocale);
      const states = (await tx.translationState.findMany({
        where: {
          targetLocale,

          OR: [
            {
              status: 'MISSING',
            },
            {
              status: 'OUTDATED',
            },
          ],

          field: {
            sourceLocale,

            deletedAt: null,

            type: {
              not: 'URI',
            },

            resource: {
              shopId: shop.id,

              resourceType: {
                in: resourceTypes,
              },

              deletedAt: null,
            },


          },
        },

        select: {
          status: true,

          field: {
            select: {
              id: true,

              sourceLocale: true,

              sourceValue: true,

              sourceDigest: true,

              resource: {
                select: {
                  resourceType: true,

                  shopifyResourceId: true,
                },
              },
            },
          },
        },

        orderBy: [
          {
            field: {
              resource: {
                resourceType: 'asc',
              },
            },
          },
          {
            updatedAt: 'asc',
          },
        ],

      })) as TranslationCandidateState[];

      const eligibleStates = await this.filterUnclaimedSnapshots(
        tx,
        shop.id,
        targetLocale,
        states,
      );

      if (eligibleStates.length === 0) {
        throw new BadRequestException(
          'No eligible MISSING or OUTDATED translation fields were found for the requested resource types.',
        );
      }

      const provider = shop.aiConfiguration?.translationProvider ?? null;

      const model = shop.aiConfiguration?.translationModel ?? null;

      const fallbackProvider = shop.aiConfiguration?.fallbackProvider ?? null;

      const fallbackModel =
        fallbackProvider === 'DEEPL'
          ? null
          : (shop.aiConfiguration?.fallbackModel ?? null);

      const reviewProvider = shop.aiConfiguration?.reviewProvider ?? null;

      const reviewModel = shop.aiConfiguration?.reviewModel ?? null;

      return tx.translationJob.create({
        data: {
          shopId: shop.id,

          sourceLocale,

          targetLocale,

          status: 'QUEUED',

          origin: 'MANUAL',

          provider,
          model,
          fallbackProvider,
          fallbackModel,
          reviewProvider,
          reviewModel,

          totalItems: Math.min(eligibleStates.length, maxItems),

          items: {
            create: eligibleStates.slice(0, maxItems).map((state) => ({
              fieldId: state.field.id,

              sourceDigest: state.field.sourceDigest,

              sourceValue: state.field.sourceValue,

              status: 'PENDING',

              provider,
              model,
            })),
          },
        },

        include: this.jobInclude(),
      });
    }, { maxWait: 10000, timeout: 30000 });
  }


  /**
   * 10C - Create a translation job for one Shopify resource change.
   *
   * This method intentionally does NOT enqueue the job. 10C is only
   * responsible for deterministic job creation. Automatic BullMQ
   * execution is introduced in 10D so enabling 10C cannot unexpectedly
   * consume provider quota while we are still validating automation.
   */
  async createFromShopifyChange(
    shopifyDomain: string,

    input: {
      changeEventId: string;
      resourceType: string;
      shopifyResourceId: string;
      targetLocale: string;
      shopifyGatewayUrl?: string;
    },
  ) {
    const shop = await this.prisma.shop.findUnique({
      where: {
        shopifyDomain,
      },

      include: {
        settings: true,
        aiConfiguration: true,

        languages: {
          include: {
            language: true,
          },
        },
      },
    });

    if (!shop) {
      throw new NotFoundException('Shop is not registered.');
    }

    const targetLocale = input.targetLocale.trim();

    if (!shop.settings?.autoTranslate) {
      return {
        created: false,
        reason: 'AUTO_TRANSLATE_DISABLED',
        targetLocale,
        jobId: null,
        totalItems: 0,
      };
    }

    if (shop.status !== 'ACTIVE') {
      return {
        created: false,
        reason: 'SHOP_NOT_ACTIVE',
        targetLocale,
        jobId: null,
        totalItems: 0,
      };
    }

    if (!shop.sourceLocale) {
      return {
        created: false,
        reason: 'SOURCE_LOCALE_NOT_CONFIGURED',
        targetLocale,
        jobId: null,
        totalItems: 0,
      };
    }

    if (targetLocale === shop.sourceLocale) {
      return {
        created: false,
        reason: 'SOURCE_LOCALE',
        targetLocale,
        jobId: null,
        totalItems: 0,
      };
    }

    const targetLanguage = shop.languages.find(
      (shopLanguage) =>
        shopLanguage.language.locale === targetLocale,
    );

    if (!targetLanguage) {
      return {
        created: false,
        reason: 'TARGET_LOCALE_NOT_CONFIGURED',
        targetLocale,
        jobId: null,
        totalItems: 0,
      };
    }

    if (!targetLanguage.published) {
      return {
        created: false,
        reason: 'TARGET_LOCALE_NOT_PUBLISHED',
        targetLocale,
        jobId: null,
        totalItems: 0,
      };
    }

    const sourceLocale: string = shop.sourceLocale;
    const resourceType = input.resourceType.trim().toUpperCase();
    const automationKey = `SHOPIFY_CHANGE:${input.changeEventId}:${targetLocale}`;

    const existingAutomaticJob =
      await this.prisma.translationJob.findUnique({
        where: {
          automationKey,
        },

        select: {
          id: true,
          totalItems: true,
        },
      });

    if (existingAutomaticJob) {
      if (input.shopifyGatewayUrl) {
        await this.prisma.translationJob.update({
          where: {
            id: existingAutomaticJob.id,
          },
          data: {
            shopifyGatewayUrl: input.shopifyGatewayUrl,
          },
        });
      }

      return {
        created: false,
        reason: 'DUPLICATE_CHANGE_EVENT',
        targetLocale,
        jobId: existingAutomaticJob.id,
        totalItems: existingAutomaticJob.totalItems,
      };
    }

    const changeEvent =
      await this.prisma.translationChangeEvent.findFirst({
        where: {
          id: input.changeEventId,
          shopId: shop.id,
          resourceType,
          shopifyResourceId: input.shopifyResourceId,
          action: 'UPSERT',
        },

        select: {
          id: true,
        },
      });

    if (!changeEvent) {
      throw new NotFoundException(
        'Matching Shopify translation change event was not found.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await lockTranslationScope(tx, shop.id, targetLocale);

      // Re-check the unique automation event after acquiring the lock.
      // Two webhook deliveries can pass the initial fast-path check.
      const concurrentJob = await tx.translationJob.findUnique({
        where: { automationKey },
        select: { id: true, totalItems: true },
      });
      if (concurrentJob) {
        return {
          created: false,
          reason: 'DUPLICATE_CHANGE_EVENT',
          targetLocale,
          jobId: concurrentJob.id,
          totalItems: concurrentJob.totalItems,
        };
      }

      const states = (await tx.translationState.findMany({
        where: {
          targetLocale,

          status: {
            in: ['MISSING', 'OUTDATED'],
          },

          field: {
            sourceLocale,
            deletedAt: null,

            type: {
              not: 'URI',
            },

            resource: {
              shopId: shop.id,
              resourceType,
              shopifyResourceId: input.shopifyResourceId,
              deletedAt: null,
            },
          },
        },

        select: {
          status: true,

          field: {
            select: {
              id: true,
              sourceValue: true,
              sourceDigest: true,
            },
          },
        },

        orderBy: {
          updatedAt: 'asc',
        },
      })) as TranslationCandidateState[];

      if (states.length === 0) {
        return {
          created: false,
          reason: 'NO_ELIGIBLE_FIELDS',
          targetLocale,
          jobId: null,
          totalItems: 0,
        };
      }

      /*
       * A Shopify event can be delivered more than once and a different
       * event can also arrive without changing a given translatable field.
       * Do not create a second automatic job for the same field/sourceDigest
       * and target locale if that exact snapshot already exists anywhere in
       * job history (manual or automatic).
       */
      const existingSnapshots =
        await tx.translationJobItem.findMany({
          where: {
            job: {
              shopId: shop.id,
              targetLocale,
            },

            status: {
              in: BLOCKING_TRANSLATION_ITEM_STATUSES,
            },

            OR: states.map((state) => ({
              fieldId: state.field.id,
              sourceDigest: state.field.sourceDigest,
            })),
          },

          select: {
            fieldId: true,
            sourceDigest: true,
          },
        });

      const existingSnapshotKeys = new Set(
        existingSnapshots.map(
          (item) => `${item.fieldId}:${item.sourceDigest}`,
        ),
      );

      const eligibleStates = states.filter(
        (state) =>
          !existingSnapshotKeys.has(
            `${state.field.id}:${state.field.sourceDigest}`,
          ),
      );

      if (eligibleStates.length === 0) {
        return {
          created: false,
          reason: 'SOURCE_SNAPSHOT_ALREADY_JOBBED',
          targetLocale,
          jobId: null,
          totalItems: 0,
        };
      }

      const provider = shop.aiConfiguration?.translationProvider ?? null;

      /*
       * 10D safety: do not create an automatically executable job when
       * there is no primary translation provider snapshot. Otherwise the
       * BullMQ worker would deterministically fail and retry the same
       * configuration error. Manual jobs keep their existing behavior.
       */
      if (!provider) {
        return {
          created: false,
          reason: 'TRANSLATION_PROVIDER_NOT_CONFIGURED',
          targetLocale,
          jobId: null,
          totalItems: 0,
        };
      }

      const model = shop.aiConfiguration?.translationModel ?? null;
      const fallbackProvider =
        shop.aiConfiguration?.fallbackProvider ?? null;
      const fallbackModel =
        fallbackProvider === 'DEEPL'
          ? null
          : (shop.aiConfiguration?.fallbackModel ?? null);
      const reviewProvider = shop.aiConfiguration?.reviewProvider ?? null;
      const reviewModel = shop.aiConfiguration?.reviewModel ?? null;

      const job = await tx.translationJob.create({
        data: {
          shopId: shop.id,
          sourceLocale,
          targetLocale,
          status: 'QUEUED',
          origin: 'SHOPIFY_CHANGE',
          automationKey,
          changeEventId: changeEvent.id,
          automationStage: 'TRANSLATION',
          shopifyGatewayUrl: input.shopifyGatewayUrl ?? null,

          provider,
          model,
          fallbackProvider,
          fallbackModel,
          reviewProvider,
          reviewModel,

          totalItems: eligibleStates.length,

          items: {
            create: eligibleStates.map((state) => ({
              fieldId: state.field.id,
              sourceDigest: state.field.sourceDigest,
              sourceValue: state.field.sourceValue,
              status: 'PENDING',
              provider,
              model,
            })),
          },
        },

        select: {
          id: true,
          totalItems: true,
        },
      });

      return {
        created: true,
        reason: 'CREATED',
        targetLocale,
        jobId: job.id,
        totalItems: job.totalItems,
      };
    }, { maxWait: 10000, timeout: 30000 });
  }

  private async filterUnclaimedSnapshots<
    T extends { field: { id: string; sourceDigest: string } },
  >(
    tx: Prisma.TransactionClient,
    shopId: string,
    targetLocale: string,
    states: T[],
  ): Promise<T[]> {
    if (states.length === 0) return states;

    const existing = await tx.translationJobItem.findMany({
      where: {
        job: { shopId, targetLocale },
        status: { in: BLOCKING_TRANSLATION_ITEM_STATUSES },
        fieldId: { in: states.map((state) => state.field.id) },
      },
      select: { fieldId: true, sourceDigest: true },
    });

    const claimed = new Set(
      existing.map((item) => `${item.fieldId}:${item.sourceDigest}`),
    );
    return states.filter(
      (state) => !claimed.has(`${state.field.id}:${state.field.sourceDigest}`),
    );
  }

  async findAll(shopifyDomain: string) {
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

    return this.prisma.translationJob.findMany({
      where: {
        shopId: shop.id,
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /** Server-side, tenant-scoped review queue. Never returns other shops' items. */
  async reviewQueue(
    shopifyDomain: string,
    query: { page?: string; limit?: string; locale?: string; resourceType?: string; status?: string; search?: string },
  ) {
    const shop = await this.prisma.shop.findUnique({
      where: { shopifyDomain }, select: { id: true },
    });
    if (!shop) throw new NotFoundException('Shop is not registered.');

    const page = this.boundedInteger(query.page, 1, 1, 100000);
    const limit = this.boundedInteger(query.limit, 30, 1, 100);
    const statuses = ['VALIDATED', 'NEEDS_REVIEW'] as const;
    if (query.status && query.status !== 'ALL' && !statuses.includes(query.status as typeof statuses[number])) {
      throw new BadRequestException('Invalid review status.');
    }
    const locale = query.locale && query.locale !== 'ALL' ? query.locale.trim() : undefined;
    const resourceType = query.resourceType && query.resourceType !== 'ALL' ? query.resourceType.trim().toUpperCase() : undefined;
    const search = query.search?.trim().slice(0, 200);
    const where: Prisma.TranslationJobItemWhereInput = {
      job: { shopId: shop.id, ...(locale ? { targetLocale: locale } : {}) },
      status: { in: query.status && query.status !== 'ALL' ? [query.status as typeof statuses[number]] : [...statuses] },
      ...(resourceType ? { field: { resource: { resourceType } } } : {}),
      ...(search ? {
        OR: [
          { sourceValue: { contains: search, mode: 'insensitive' } },
          { translatedValue: { contains: search, mode: 'insensitive' } },
          { field: { key: { contains: search, mode: 'insensitive' } } },
          { field: { resource: { shopifyResourceId: { contains: search, mode: 'insensitive' } } } },
        ],
      } : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.translationJobItem.count({ where }),
      this.prisma.translationJobItem.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          job: { select: { id: true, sourceLocale: true, targetLocale: true, status: true, createdAt: true } },
          field: { select: {
            key: true, type: true, sourceLocale: true,
            resource: { select: { resourceType: true, shopifyResourceId: true } },
          } },
        },
      }),
    ]);
    return { items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
  }

  async findOne(
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

      include: this.jobInclude(),
    });

    if (!job) {
      throw new NotFoundException('Translation job not found.');
    }

    return job;
  }

  async usageSummary(
    shopifyDomain: string,

    daysValue?: string,
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

    const days = this.boundedInteger(daysValue, 30, 1, 365);

    const from = new Date();

    from.setUTCDate(from.getUTCDate() - (days - 1));

    from.setUTCHours(0, 0, 0, 0);

    const events = await this.prisma.translationUsageEvent.findMany({
      where: {
        shopId: shop.id,

        createdAt: {
          gte: from,
        },
      },

      select: {
        stage: true,

        provider: true,

        model: true,

        success: true,

        usageKnown: true,

        billedCharacters: true,

        inputTokens: true,

        outputTokens: true,

        estimatedCostMicrousd: true,

        createdAt: true,
      },

      orderBy: {
        createdAt: 'asc',
      },
    });

    type Bucket = {
      events: number;

      successfulEvents: number;

      failedEvents: number;

      usageUnknownEvents: number;

      billedCharacters: number;

      inputTokens: number;

      outputTokens: number;

      estimatedCostMicrousd: number;

      costedEvents: number;

      unpricedEvents: number;
    };

    const newBucket = (): Bucket => ({
      events: 0,

      successfulEvents: 0,

      failedEvents: 0,

      usageUnknownEvents: 0,

      billedCharacters: 0,

      inputTokens: 0,

      outputTokens: 0,

      estimatedCostMicrousd: 0,

      costedEvents: 0,

      unpricedEvents: 0,
    });

    const addEvent = (
      bucket: Bucket,

      event: (typeof events)[number],
    ) => {
      bucket.events += 1;

      if (event.success) {
        bucket.successfulEvents += 1;
      } else {
        bucket.failedEvents += 1;
      }

      if (!event.usageKnown) {
        bucket.usageUnknownEvents += 1;
      }

      bucket.billedCharacters += event.billedCharacters;

      bucket.inputTokens += event.inputTokens;

      bucket.outputTokens += event.outputTokens;

      if (event.estimatedCostMicrousd === null) {
        bucket.unpricedEvents += 1;
      } else {
        bucket.costedEvents += 1;

        bucket.estimatedCostMicrousd += event.estimatedCostMicrousd;
      }
    };

    const totals = newBucket();

    const providerBuckets = new Map<string, Bucket>();

    const stageBuckets = new Map<string, Bucket>();

    const dailyBuckets = new Map<string, Bucket>();

    const monthlyBuckets = new Map<string, Bucket>();

    for (const event of events) {
      addEvent(totals, event);

      const providerKey = `${event.provider}:${event.model ?? '*'}`;

      const providerBucket = providerBuckets.get(providerKey) ?? newBucket();

      addEvent(providerBucket, event);

      providerBuckets.set(providerKey, providerBucket);

      const stageKey = event.stage;

      const stageBucket = stageBuckets.get(stageKey) ?? newBucket();

      addEvent(stageBucket, event);

      stageBuckets.set(stageKey, stageBucket);

      const iso = event.createdAt.toISOString();

      const dayKey = iso.slice(0, 10);

      const dayBucket = dailyBuckets.get(dayKey) ?? newBucket();

      addEvent(dayBucket, event);

      dailyBuckets.set(dayKey, dayBucket);

      const monthKey = iso.slice(0, 7);

      const monthBucket = monthlyBuckets.get(monthKey) ?? newBucket();

      addEvent(monthBucket, event);

      monthlyBuckets.set(monthKey, monthBucket);
    }

    const serializeBucket = (bucket: Bucket) => ({
      ...bucket,

      estimatedCostUsd: bucket.estimatedCostMicrousd / 1_000_000,
    });

    return {
      period: {
        days,

        from: from.toISOString(),

        to: new Date().toISOString(),
      },

      totals: serializeBucket(totals),

      byProvider: Array.from(providerBuckets.entries()).map(([key, bucket]) => {
        const separator = key.indexOf(':');

        return {
          provider: key.slice(0, separator),

          model:
            key.slice(separator + 1) === '*' ? null : key.slice(separator + 1),

          ...serializeBucket(bucket),
        };
      }),

      byStage: Array.from(stageBuckets.entries()).map(([stage, bucket]) => ({
        stage,

        ...serializeBucket(bucket),
      })),

      daily: Array.from(dailyBuckets.entries()).map(([date, bucket]) => ({
        date,

        ...serializeBucket(bucket),
      })),

      monthly: Array.from(monthlyBuckets.entries()).map(([month, bucket]) => ({
        month,

        ...serializeBucket(bucket),
      })),
    };
  }

  async usageEvents(
    shopifyDomain: string,

    limitValue?: string,
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

    const limit = this.boundedInteger(limitValue, 100, 1, 500);

    return this.prisma.translationUsageEvent.findMany({
      where: {
        shopId: shop.id,
      },

      orderBy: {
        createdAt: 'desc',
      },

      take: limit,
    });
  }

  async cancel(
    shopifyDomain: string,

    jobId: string,
  ) {
    const job = await this.findLifecycleJob(shopifyDomain, jobId);

    if (job.status === 'CANCELLED') {
      return this.findOne(shopifyDomain, jobId);
    }

    if (job.status !== 'QUEUED' && job.status !== 'RUNNING') {
      throw new BadRequestException(
        `Translation job cannot be cancelled from status "${job.status}".`,
      );
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.translationJob.updateMany({
        where: {
          id: job.id,

          status: {
            in: ['QUEUED', 'RUNNING'],
          },
        },

        data: {
          status: 'CANCELLED',

          completedAt: now,

          errorMessage: 'Cancelled by user.',
        },
      });

      if (cancelled.count !== 1) {
        return;
      }

      await tx.translationJobItem.updateMany({
        where: {
          jobId: job.id,

          status: 'GENERATING',
        },

        data: {
          status: 'PENDING',
        },
      });
    });

    return this.findOne(shopifyDomain, jobId);
  }

  async retryFailed(
    shopifyDomain: string,

    jobId: string,
  ) {
    const job = await this.findLifecycleJob(shopifyDomain, jobId);

    if (job.status !== 'FAILED' && job.status !== 'PARTIAL') {
      throw new BadRequestException(
        `Failed items cannot be retried from job status "${job.status}".`,
      );
    }

    const failedItems = job.items.filter((item) => item.status === 'FAILED');

    if (failedItems.length === 0) {
      throw new BadRequestException(
        'Translation job contains no failed items to retry.',
      );
    }

    const failedIds = failedItems.map((item) => item.id);

    const completedItems = job.items.filter((item) =>
      this.isTranslationCompletedStatus(item.status),
    ).length;

    await this.prisma.$transaction(async (tx) => {
      await tx.translationJobItem.updateMany({
        where: {
          id: {
            in: failedIds,
          },
        },

        data: {
          status: 'PENDING',

          translatedValue: null,

          generatedAt: null,

          validatedAt: null,

          validationPassed: null,

          validationErrors: 0,

          validationWarnings: 0,

          validationVersion: null,

          fallbackUsed: false,

          primaryErrorMessage: null,

          errorMessage: null,

          provider: job.provider,

          model: job.model,
        },
      });

      await tx.translationJob.update({
        where: {
          id: job.id,
        },

        data: {
          status: 'QUEUED',

          completedItems,

          failedItems: 0,

          completedAt: null,

          errorMessage: null,
        },
      });
    });

    return this.findOne(shopifyDomain, jobId);
  }

  async resume(
    shopifyDomain: string,

    jobId: string,
  ) {
    const job = await this.findLifecycleJob(shopifyDomain, jobId);

    if (job.status === 'QUEUED') {
      return this.findOne(shopifyDomain, jobId);
    }

    if (job.status !== 'CANCELLED' && job.status !== 'RUNNING') {
      throw new BadRequestException(
        `Translation job cannot be resumed from status "${job.status}".`,
      );
    }

    if (job.status === 'RUNNING') {
      const age = Date.now() - job.updatedAt.getTime();

      if (age < TranslationJobsService.STALE_RUNNING_MS) {
        const remainingSeconds = Math.ceil(
          (TranslationJobsService.STALE_RUNNING_MS - age) / 1000,
        );

        throw new BadRequestException(
          `Translation job is still active. Retry resume in approximately ${remainingSeconds} seconds if it remains stuck.`,
        );
      }
    }

    const completedItems = job.items.filter((item) =>
      this.isTranslationCompletedStatus(item.status),
    ).length;

    const failedItems = job.items.filter(
      (item) => item.status === 'FAILED',
    ).length;

    await this.prisma.$transaction(async (tx) => {
      await tx.translationJobItem.updateMany({
        where: {
          jobId: job.id,

          status: 'GENERATING',
        },

        data: {
          status: 'PENDING',

          errorMessage: null,
        },
      });

      await tx.translationJob.update({
        where: {
          id: job.id,
        },

        data: {
          status: 'QUEUED',

          completedItems,

          failedItems,

          completedAt: null,

          errorMessage: null,
        },
      });
    });

    return this.findOne(shopifyDomain, jobId);
  }

  private async findLifecycleJob(
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
          select: {
            id: true,

            status: true,
          },
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Translation job not found.');
    }

    return job;
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

  private boundedInteger(
    value: string | undefined,

    fallback: number,

    min: number,

    max: number,
  ) {
    if (value === undefined) {
      return fallback;
    }

    const parsed = Number(value);

    if (!Number.isInteger(parsed)) {
      throw new BadRequestException('Expected an integer query parameter.');
    }

    if (parsed < min || parsed > max) {
      throw new BadRequestException(
        `Query parameter must be between ${min} and ${max}.`,
      );
    }

    return parsed;
  }

  private jobInclude() {
    return {
      items: {
        include: {
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

        orderBy: {
          createdAt: 'asc',
        },
      },
    } as const;
  }
}
