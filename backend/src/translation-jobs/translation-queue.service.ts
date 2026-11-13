import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { Job, Queue, Worker } from 'bullmq';

import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';

import { TranslationExecutorService } from '../translation-engine/translation-executor.service.js';

import { TranslationReviewExecutorService } from '../translation-review/translation-review-executor.service.js';

import { AutomaticTranslationPublicationService } from '../translation-publication/automatic-translation-publication.service.js';

import { TranslationJobsService } from './translation-jobs.service.js';

const TRANSLATION_QUEUE_NAME = 'aca-locale-translation-jobs';

const TRANSLATION_QUEUE_JOB_NAME = 'execute-translation-job';
const AI_REVIEW_QUEUE_JOB_NAME = 'retry-ai-review';
const AUTO_PUBLISH_QUEUE_JOB_NAME = 'retry-auto-publish';

type TranslationQueuePayload = {
  jobId: string;
  shopifyDomain: string;
  shopifyGatewayUrl?: string;
};

type AutomaticStage =
  | 'TRANSLATION'
  | 'AI_REVIEW'
  | 'PUBLICATION'
  | 'WAITING_HUMAN_REVIEW'
  | 'WAITING_PUBLISH'
  | 'COMPLETE';

@Injectable()
export class TranslationQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TranslationQueueService.name);

  private queue?: Queue<TranslationQueuePayload>;
  private worker?: Worker<TranslationQueuePayload>;
  private recoveryTimer?: ReturnType<typeof setInterval>;

  private readonly activeByShop = new Map<string, number>();
  private readonly waitersByShop = new Map<string, Array<() => void>>();

  constructor(
    private readonly config: ConfigService,

    private readonly translationExecutorService: TranslationExecutorService,

    private readonly translationJobsService: TranslationJobsService,

    @Optional()
    private readonly translationReviewExecutor?: TranslationReviewExecutorService,

    @Optional()
    private readonly prisma?: PrismaService,

    @Optional()
    private readonly automaticPublication?: AutomaticTranslationPublicationService,
  ) {}

  async onModuleInit() {
    const connection = this.redisConnection();

    const prefix = this.configString('TRANSLATION_QUEUE_PREFIX') || 'aca-locale';

    const concurrency = this.configPositiveInteger(
      'TRANSLATION_QUEUE_CONCURRENCY',
      2,
    );

    const rateLimitMax = this.configPositiveInteger(
      'TRANSLATION_QUEUE_RATE_LIMIT_MAX',
      10,
    );

    const rateLimitDuration = this.configPositiveInteger(
      'TRANSLATION_QUEUE_RATE_LIMIT_DURATION_MS',
      1_000,
    );

    this.queue = new Queue<TranslationQueuePayload>(TRANSLATION_QUEUE_NAME, {
      connection,
      prefix,
    });

    this.worker = new Worker<TranslationQueuePayload>(
      TRANSLATION_QUEUE_NAME,
      async (job) => this.processJob(job),
      {
        connection,
        prefix,
        concurrency,
        limiter: {
          max: rateLimitMax,
          duration: rateLimitDuration,
        },
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(
        `Queue job ${job.id ?? 'unknown'} (${job.name}) completed for translation job ${job.data.jobId}.`,
      );
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Queue job ${job?.id ?? 'unknown'} (${job?.name ?? 'unknown'}) failed for translation job ${job?.data.jobId ?? 'unknown'}: ${error.message}`,
      );

      if (job) {
        void this.recordTerminalQueueFailure(job, error);
      }
    });

    this.worker.on('error', (error) => {
      this.logger.error(`BullMQ worker error: ${error.message}`);
    });

    await Promise.all([
      this.queue.waitUntilReady(),
      this.worker.waitUntilReady(),
    ]);

    this.logger.log(
      `Translation queue ready with concurrency ${concurrency}, per-shop concurrency ${this.perShopConcurrency()}, rate limit ${rateLimitMax}/${rateLimitDuration}ms.`,
    );

    await this.recoverOrphanedAutomationJobs();

    const recoveryIntervalMs = this.configPositiveInteger(
      'TRANSLATION_QUEUE_RECOVERY_INTERVAL_MS',
      60_000,
    );

    this.recoveryTimer = setInterval(() => {
      void this.recoverOrphanedAutomationJobs();
    }, recoveryIntervalMs);

    (this.recoveryTimer as unknown as { unref?: () => void }).unref?.();
  }

  async onModuleDestroy() {
    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer);
      this.recoveryTimer = undefined;
    }

    if (this.worker) {
      await this.worker.close();
    }

    if (this.queue) {
      await this.queue.close();
    }
  }

  async enqueue(
    jobId: string,
    shopifyDomain: string,
    shopifyGatewayUrl?: string,
  ) {
    const attempts = this.configBoundedInteger(
      'TRANSLATION_QUEUE_ATTEMPTS',
      5,
      1,
      10,
    );

    return this.enqueueNamedJob(
      TRANSLATION_QUEUE_JOB_NAME,
      jobId,
      {
        jobId,
        shopifyDomain,
        ...(shopifyGatewayUrl ? { shopifyGatewayUrl } : {}),
      },
      attempts,
      jobId,
    );
  }

  async cancel(jobId: string) {
    const queue = this.requireQueue();

    const queueJobIds = [
      jobId,
      this.stageJobId(jobId, 'review'),
      this.stageJobId(jobId, 'publish'),
    ];

    const results = [];

    for (const queueJobId of queueJobIds) {
      const queuedJob = await queue.getJob(queueJobId);

      if (!queuedJob) {
        continue;
      }

      const state = await queuedJob.getState();

      if (state === 'active') {
        results.push({
          queueJobId,
          removed: false,
          cooperative: true,
          state,
        });
        continue;
      }

      try {
        await queuedJob.remove();
        results.push({
          queueJobId,
          removed: true,
          cooperative: false,
          state,
        });
      } catch (error) {
        results.push({
          queueJobId,
          removed: false,
          cooperative: true,
          state,
          error: this.errorMessage(error),
        });
      }
    }

    const primaryResult = results.find(
      (result) => result.queueJobId === jobId,
    );

    if (primaryResult) {
      return {
        queue: TRANSLATION_QUEUE_NAME,
        queueJobId: jobId,
        removed: primaryResult.removed,
        cooperative: primaryResult.cooperative,
        state: primaryResult.state,
        ...(primaryResult.error ? { error: primaryResult.error } : {}),
        stageJobs: results,
      };
    }

    return {
      queue: TRANSLATION_QUEUE_NAME,
      queueJobId: jobId,
      removed: results.some((result) => result.removed),
      cooperative: results.some((result) => result.cooperative),
      state: results.length > 0 ? 'processed' : 'not-found',
      stageJobs: results,
    };
  }

  async status() {
    const queue = this.requireQueue();

    const counts = await queue.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'prioritized',
      'completed',
      'failed',
      'paused',
    );

    return {
      queue: TRANSLATION_QUEUE_NAME,
      counts,
    };
  }

  async jobStatus(jobId: string) {
    const queue = this.requireQueue();

    const stageIds = {
      translation: jobId,
      review: this.stageJobId(jobId, 'review'),
      publish: this.stageJobId(jobId, 'publish'),
    };

    const stages: Record<string, unknown> = {};

    for (const [stage, queueJobId] of Object.entries(stageIds)) {
      const queuedJob = await queue.getJob(queueJobId);

      if (!queuedJob) {
        stages[stage] = {
          queueJobId,
          state: 'not-found',
        };
        continue;
      }

      stages[stage] = {
        queueJobId: String(queuedJob.id),
        state: await queuedJob.getState(),
        attemptsMade: queuedJob.attemptsMade,
        maxAttempts: queuedJob.opts.attempts ?? 1,
        progress: queuedJob.progress,
        failedReason: queuedJob.failedReason ?? null,
      };
    }

    return {
      queue: TRANSLATION_QUEUE_NAME,
      queueJobId: jobId,
      stages,
    };
  }

  private async processJob(job: Job<TranslationQueuePayload>) {
    return this.withShopPermit(job.data.shopifyDomain, async () => {
      switch (job.name) {
        case TRANSLATION_QUEUE_JOB_NAME:
          return this.processTranslationJob(job);

        case AI_REVIEW_QUEUE_JOB_NAME:
          return this.processReviewRetryJob(job);

        case AUTO_PUBLISH_QUEUE_JOB_NAME:
          return this.processPublishRetryJob(job);

        default:
          throw new Error(`Unsupported queue job "${job.name}".`);
      }
    });
  }

  private async processTranslationJob(job: Job<TranslationQueuePayload>) {
    await this.recordAutomationAttempt(
      job.data.jobId,
      'TRANSLATION',
      'translationAttempts',
      null,
    );

    await job.updateProgress({
      stage: 'starting',
      translationJobId: job.data.jobId,
      attempt: job.attemptsMade + 1,
    });

    if (job.attemptsMade > 0) {
      await this.prepareAutomaticTranslationRetry(
        job.data.shopifyDomain,
        job.data.jobId,
      );
    }

    let result = await this.translationExecutorService.execute(
      job.data.shopifyDomain,
      job.data.jobId,
    );

    const reason = (
      result as {
        execution?: {
          reason?: string;
        };
      }
    ).execution?.reason;

    if (reason === 'ALREADY_RUNNING') {
      try {
        const resumed = await this.translationJobsService.resume(
          job.data.shopifyDomain,
          job.data.jobId,
        );

        if (resumed.status === 'QUEUED') {
          await job.updateProgress({
            stage: 'recovered-stale-job',
            translationJobId: job.data.jobId,
          });

          result = await this.translationExecutorService.execute(
            job.data.shopifyDomain,
            job.data.jobId,
          );
        }
      } catch (error) {
        throw new Error(
          `Translation job is still marked RUNNING: ${this.errorMessage(error)}`,
        );
      }
    }

    const translationRetry = await this.translationRetryPlan(
      job.data.shopifyDomain,
      job.data.jobId,
    );

    if (translationRetry.retryableItems > 0) {
      const message = `Automatic translation has ${translationRetry.retryableItems} retryable failed item(s).`;

      await this.recordAutomationStage(
        job.data.jobId,
        'TRANSLATION',
        message,
        this.nextBackoffDate(job.attemptsMade),
      );

      throw new Error(message);
    }

    if (translationRetry.terminalItems > 0) {
      await this.recordAutomationStage(
        job.data.jobId,
        'TRANSLATION',
        `Automatic translation stopped with ${translationRetry.terminalItems} terminal failed item(s).`,
        null,
      );
    }

    if ((result as { status?: string }).status === 'FAILED') {
      return {
        ...result,
        automaticReview: {
          attempted: false,
          reason: 'TRANSLATION_FAILED_TERMINALLY',
        },
        automaticPublish: {
          attempted: false,
          reason: 'TRANSLATION_FAILED_TERMINALLY',
        },
      };
    }

    const automaticReview = await this.runAutomaticReview(
      job.data.shopifyDomain,
      job.data.jobId,
      job,
    );

    if (automaticReview.reason === 'AI_REVIEW_FAILED') {
      const retry = await this.enqueueReviewRetry(
        job.data.jobId,
        job.data.shopifyDomain,
        job.data.shopifyGatewayUrl,
      );

      return {
        ...result,
        automaticReview: {
          ...automaticReview,
          retry,
        },
        automaticPublish: {
          attempted: false,
          reason: 'WAITING_FOR_AI_REVIEW_RETRY',
        },
      };
    }

    const automaticPublish = await this.runAutomaticPublish(
      job.data.shopifyDomain,
      job.data.jobId,
      job.data.shopifyGatewayUrl,
      job,
    );

    const publishRetry = await this.maybeSchedulePublishRetry(
      job.data.jobId,
      job.data.shopifyDomain,
      job.data.shopifyGatewayUrl,
      automaticPublish,
    );

    await this.persistAutomationOutcome(
      job.data.jobId,
      automaticReview.reason,
      automaticPublish,
    );

    await job.updateProgress({
      stage: 'finished',
      translationJobId: job.data.jobId,
      automaticReview: automaticReview.reason,
      automaticPublish: automaticPublish.reason,
    });

    return {
      ...result,
      automaticReview,
      automaticPublish: {
        ...automaticPublish,
        ...(publishRetry ? { retry: publishRetry } : {}),
      },
    };
  }

  private async processReviewRetryJob(job: Job<TranslationQueuePayload>) {
    await this.recordAutomationAttempt(
      job.data.jobId,
      'AI_REVIEW',
      'reviewAttempts',
      null,
    );

    await job.updateProgress({
      stage: 'ai-review-retry',
      translationJobId: job.data.jobId,
      attempt: job.attemptsMade + 1,
    });

    const automaticReview = await this.runAutomaticReview(
      job.data.shopifyDomain,
      job.data.jobId,
      job,
    );

    if (automaticReview.reason === 'AI_REVIEW_FAILED') {
      await this.recordAutomationStage(
        job.data.jobId,
        'AI_REVIEW',
        automaticReview.errorMessage ?? 'Automatic AI review failed.',
        this.nextBackoffDate(job.attemptsMade),
      );

      throw new Error(
        automaticReview.errorMessage ?? 'Automatic AI review failed.',
      );
    }

    const automaticPublish = await this.runAutomaticPublish(
      job.data.shopifyDomain,
      job.data.jobId,
      job.data.shopifyGatewayUrl,
      job,
    );

    const publishRetry = await this.maybeSchedulePublishRetry(
      job.data.jobId,
      job.data.shopifyDomain,
      job.data.shopifyGatewayUrl,
      automaticPublish,
    );

    await this.persistAutomationOutcome(
      job.data.jobId,
      automaticReview.reason,
      automaticPublish,
    );

    return {
      automaticReview,
      automaticPublish: {
        ...automaticPublish,
        ...(publishRetry ? { retry: publishRetry } : {}),
      },
    };
  }

  private async processPublishRetryJob(job: Job<TranslationQueuePayload>) {
    await this.recordAutomationAttempt(
      job.data.jobId,
      'PUBLICATION',
      'publishAttempts',
      null,
    );

    await job.updateProgress({
      stage: 'auto-publish-retry',
      translationJobId: job.data.jobId,
      attempt: job.attemptsMade + 1,
    });

    const automaticPublish = await this.runAutomaticPublish(
      job.data.shopifyDomain,
      job.data.jobId,
      job.data.shopifyGatewayUrl,
      job,
    );

    if (this.isRetryablePublishResult(automaticPublish)) {
      const errorMessage =
        automaticPublish.errorMessage ??
        `Automatic publication retry required (${automaticPublish.reason}).`;

      await this.recordAutomationStage(
        job.data.jobId,
        'PUBLICATION',
        errorMessage,
        this.nextBackoffDate(job.attemptsMade),
      );

      throw new Error(errorMessage);
    }

    await this.persistAutomationOutcome(
      job.data.jobId,
      'AI_REVIEW_ALREADY_COMPLETED_OR_DISABLED',
      automaticPublish,
    );

    return {
      automaticPublish,
    };
  }

  private async runAutomaticReview(
    shopifyDomain: string,
    jobId: string,
    queueJob: Job<TranslationQueuePayload>,
  ): Promise<Record<string, any>> {
    if (!this.prisma || !this.translationReviewExecutor) {
      return {
        attempted: false,
        reason: 'AUTO_REVIEW_SERVICE_UNAVAILABLE',
      };
    }

    const job = await this.prisma.translationJob.findFirst({
      where: {
        id: jobId,
        shop: {
          shopifyDomain,
        },
      },
      select: {
        origin: true,
        status: true,
        reviewProvider: true,
        reviewModel: true,
        shop: {
          select: {
            settings: {
              select: {
                enableAiReview: true,
                requireHumanReview: true,
                autoPublish: true,
              },
            },
          },
        },
        items: {
          where: {
            status: 'VALIDATED',
            aiReviewedAt: null,
            translatedValue: {
              not: null,
            },
          },
          select: {
            id: true,
          },
          take: 1,
        },
      },
    });

    if (!job) {
      return {
        attempted: false,
        reason: 'TRANSLATION_JOB_NOT_FOUND',
      };
    }

    if (job.origin !== 'SHOPIFY_CHANGE') {
      return {
        attempted: false,
        reason: 'MANUAL_JOB',
      };
    }

    if (!job.shop.settings?.enableAiReview) {
      return {
        attempted: false,
        reason: 'AUTO_AI_REVIEW_DISABLED',
      };
    }

    if (job.status !== 'COMPLETED' && job.status !== 'PARTIAL') {
      return {
        attempted: false,
        reason: 'TRANSLATION_NOT_REVIEWABLE',
        status: job.status,
      };
    }

    if (!job.reviewProvider || !job.reviewModel) {
      return {
        attempted: false,
        reason: 'AI_REVIEWER_NOT_CONFIGURED',
      };
    }

    if (job.items.length === 0) {
      return {
        attempted: false,
        reason: 'NO_UNREVIEWED_VALIDATED_ITEMS',
      };
    }

    await queueJob.updateProgress({
      stage: 'ai-review',
      translationJobId: jobId,
    });

    try {
      const reviewed = await this.translationReviewExecutor.reviewJob(
        shopifyDomain,
        jobId,
      );

      return {
        attempted: true,
        reason: 'AI_REVIEW_COMPLETED',
        requireHumanReview: job.shop.settings?.requireHumanReview ?? true,
        autoPublish: job.shop.settings?.autoPublish ?? false,
        ...(reviewed.reviewExecution ?? {}),
      };
    } catch (error) {
      const message = this.errorMessage(error);

      this.logger.error(
        `Automatic AI review failed for translation job ${jobId}: ${message}`,
      );

      return {
        attempted: true,
        reason: 'AI_REVIEW_FAILED',
        errorMessage: message,
      };
    }
  }

  private async runAutomaticPublish(
    shopifyDomain: string,
    jobId: string,
    shopifyGatewayUrl: string | undefined,
    queueJob: Job<TranslationQueuePayload>,
  ): Promise<Record<string, any>> {
    if (!this.automaticPublication) {
      return {
        attempted: false,
        reason: 'AUTO_PUBLICATION_SERVICE_UNAVAILABLE',
      };
    }

    await queueJob.updateProgress({
      stage: 'auto-publish-policy',
      translationJobId: jobId,
    });

    try {
      return await this.automaticPublication.publishEligibleItems(
        shopifyDomain,
        jobId,
        shopifyGatewayUrl,
      );
    } catch (error) {
      const message = this.errorMessage(error);

      this.logger.error(
        `Automatic publication orchestration failed for translation job ${jobId}: ${message}`,
      );

      return {
        attempted: true,
        reason: 'AUTO_PUBLISH_FAILED',
        errorMessage: message,
      };
    }
  }

  private async enqueueReviewRetry(
    jobId: string,
    shopifyDomain: string,
    shopifyGatewayUrl?: string,
  ) {
    if (!this.queue) {
      return {
        enqueued: false,
        reason: 'QUEUE_NOT_INITIALIZED',
      };
    }

    const maxAttempts = this.configBoundedInteger(
      'TRANSLATION_QUEUE_REVIEW_ATTEMPTS',
      5,
      1,
      10,
    );

    const currentAttempts = await this.currentAutomationAttempts(
      jobId,
      'reviewAttempts',
    );

    if (currentAttempts >= maxAttempts) {
      return {
        enqueued: false,
        reason: 'REVIEW_RETRY_LIMIT_REACHED',
        attempts: currentAttempts,
        maxAttempts,
      };
    }

    await this.recordAutomationStage(
      jobId,
      'AI_REVIEW',
      'Automatic AI review scheduled for retry.',
      this.nextBackoffDate(0),
    );

    return this.enqueueNamedJob(
      AI_REVIEW_QUEUE_JOB_NAME,
      jobId,
      {
        jobId,
        shopifyDomain,
        ...(shopifyGatewayUrl ? { shopifyGatewayUrl } : {}),
      },
      maxAttempts,
      this.stageJobId(jobId, 'review'),
      this.retryBackoffMs(),
    );
  }

  private async enqueuePublishRetry(
    jobId: string,
    shopifyDomain: string,
    shopifyGatewayUrl?: string,
  ) {
    if (!this.queue) {
      return {
        enqueued: false,
        reason: 'QUEUE_NOT_INITIALIZED',
      };
    }

    const maxAttempts = this.configBoundedInteger(
      'TRANSLATION_QUEUE_PUBLISH_ATTEMPTS',
      8,
      1,
      12,
    );

    const currentAttempts = await this.currentAutomationAttempts(
      jobId,
      'publishAttempts',
    );

    if (currentAttempts >= maxAttempts) {
      return {
        enqueued: false,
        reason: 'PUBLISH_RETRY_LIMIT_REACHED',
        attempts: currentAttempts,
        maxAttempts,
      };
    }

    await this.recordAutomationStage(
      jobId,
      'PUBLICATION',
      'Automatic Shopify publication scheduled for retry.',
      this.nextBackoffDate(0),
    );

    return this.enqueueNamedJob(
      AUTO_PUBLISH_QUEUE_JOB_NAME,
      jobId,
      {
        jobId,
        shopifyDomain,
        ...(shopifyGatewayUrl ? { shopifyGatewayUrl } : {}),
      },
      maxAttempts,
      this.stageJobId(jobId, 'publish'),
      this.retryBackoffMs(),
    );
  }

  private async maybeSchedulePublishRetry(
    jobId: string,
    shopifyDomain: string,
    shopifyGatewayUrl: string | undefined,
    result: Record<string, any>,
  ) {
    if (!this.isRetryablePublishResult(result)) {
      return null;
    }

    return this.enqueuePublishRetry(
      jobId,
      shopifyDomain,
      shopifyGatewayUrl,
    );
  }

  private isRetryablePublishResult(result: Record<string, any>) {
    return [
      'AUTO_PUBLISH_FAILED',
      'AUTO_PUBLISH_PARTIAL_FAILURE',
      'SHOPIFY_GATEWAY_URL_UNAVAILABLE',
    ].includes(String(result.reason ?? ''));
  }

  private async enqueueNamedJob(
    name: string,
    translationJobId: string,
    payload: TranslationQueuePayload,
    attempts: number,
    queueJobId: string,
    delay = 0,
  ) {
    const queue = this.requireQueue();

    const existing = await queue.getJob(queueJobId);

    if (existing) {
      const state = await existing.getState();

      if (
        [
          'waiting',
          'active',
          'delayed',
          'prioritized',
          'waiting-children',
        ].includes(state)
      ) {
        return {
          queue: TRANSLATION_QUEUE_NAME,
          queueJobId: String(existing.id),
          enqueued: false,
          duplicate: true,
          state,
        };
      }

      try {
        await existing.remove();
      } catch (error) {
        this.logger.warn(
          `Unable to remove previous queue job ${queueJobId}: ${this.errorMessage(error)}`,
        );
      }
    }

    const job = await queue.add(name, payload, {
      jobId: queueJobId,
      attempts,
      backoff: {
        type: 'exponential',
        delay: this.retryBackoffMs(),
      },
      ...(delay > 0 ? { delay } : {}),
      removeOnComplete: true,
      removeOnFail: {
        age: 7 * 24 * 60 * 60,
        count: 1000,
      },
    });

    return {
      queue: TRANSLATION_QUEUE_NAME,
      translationJobId,
      queueJobId: String(job.id),
      enqueued: true,
      duplicate: false,
      state: delay > 0 ? 'delayed' : 'waiting',
      attempts,
    };
  }

  private async translationRetryPlan(
    shopifyDomain: string,
    jobId: string,
  ) {
    if (!this.prisma) {
      return {
        retryableItems: 0,
        terminalItems: 0,
        retryableItemIds: [] as string[],
      };
    }

    const job = await this.prisma.translationJob.findFirst({
      where: {
        id: jobId,
        shop: {
          shopifyDomain,
        },
      },
      select: {
        origin: true,
        items: {
          where: {
            status: 'FAILED',
          },
          select: {
            id: true,
            status: true,
            errorMessage: true,
          },
        },
      },
    });

    if (!job || job.origin !== 'SHOPIFY_CHANGE') {
      return {
        retryableItems: 0,
        terminalItems: 0,
        retryableItemIds: [] as string[],
      };
    }

    const failedItems = job.items.filter(
      (item) => (item as { status?: string }).status === 'FAILED',
    );

    const retryableItemIds = failedItems
      .filter((item) => !this.isTerminalTranslationError(item.errorMessage))
      .map((item) => item.id);

    return {
      retryableItems: retryableItemIds.length,
      terminalItems: failedItems.length - retryableItemIds.length,
      retryableItemIds,
    };
  }

  private async prepareAutomaticTranslationRetry(
    shopifyDomain: string,
    jobId: string,
  ) {
    if (!this.prisma) {
      return;
    }

    const plan = await this.translationRetryPlan(shopifyDomain, jobId);

    if (plan.retryableItemIds.length === 0) {
      return;
    }

    const job = await this.prisma.translationJob.findFirst({
      where: {
        id: jobId,
        shop: {
          shopifyDomain,
        },
      },
      select: {
        items: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (!job) {
      return;
    }

    const completedItems = job.items.filter((item) =>
      this.isTranslationCompletedStatus(item.status),
    ).length;

    await this.prisma.$transaction(async (tx) => {
      await tx.translationJobItem.updateMany({
        where: {
          id: {
            in: plan.retryableItemIds,
          },
          status: 'FAILED',
        },
        data: {
          status: 'PENDING',
          translatedValue: null,
          generatedAt: null,
          validatedAt: null,
          validationPassed: null,
          validationErrors: 0,
          validationWarnings: 0,
          validationIssues: Prisma.JsonNull,
          validationVersion: null,
          fallbackUsed: false,
          primaryErrorMessage: null,
          errorMessage: null,
        },
      });

      await tx.translationJob.update({
        where: {
          id: jobId,
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
  }

  private isTerminalTranslationError(value: string | null) {
    const message = (value ?? '').toUpperCase();

    return [
      'SOURCE_CHANGED_BEFORE_EXECUTION',
      'RESOURCE_DELETED_BEFORE_EXECUTION',
      'FIELD_DELETED_BEFORE_EXECUTION',
      'SOURCE_FIELD_NOT_FOUND_BEFORE_EXECUTION',
      'SOURCE VALUE IS EMPTY',
    ].some((marker) => message.includes(marker));
  }

  private async recoverOrphanedAutomationJobs() {
    if (!this.prisma || !this.queue) {
      return;
    }

    try {
      const batchSize = this.configPositiveInteger(
        'TRANSLATION_QUEUE_RECOVERY_BATCH_SIZE',
        100,
      );

      const staleRunningMs = this.configPositiveInteger(
        'TRANSLATION_QUEUE_STALE_RUNNING_MS',
        5 * 60 * 1000,
      );

      const staleBefore = new Date(Date.now() - staleRunningMs);

      const jobs = await this.prisma.translationJob.findMany({
        where: {
          origin: 'SHOPIFY_CHANGE',
          shop: {
            status: 'ACTIVE',
            settings: {
              autoTranslate: true,
            },
          },
          OR: [
            {
              status: 'QUEUED',
            },
            {
              status: 'RUNNING',
              updatedAt: {
                lte: staleBefore,
              },
            },
            {
              status: {
                in: ['COMPLETED', 'PARTIAL'],
              },
              items: {
                some: {
                  status: 'VALIDATED',
                  aiReviewedAt: null,
                  aiReviewErrorMessage: {
                    not: null,
                  },
                },
              },
            },
            {
              status: {
                in: ['COMPLETED', 'PARTIAL'],
              },
              items: {
                some: {
                  status: 'APPROVED',
                  publishedAt: null,
                  humanReviewedAt: null,
                },
              },
            },
          ],
        },
        select: {
          id: true,
          status: true,
          shopifyGatewayUrl: true,
          reviewAttempts: true,
          publishAttempts: true,
          shop: {
            select: {
              shopifyDomain: true,
              settings: {
                select: {
                  enableAiReview: true,
                  autoPublish: true,
                  requireHumanReview: true,
                },
              },
            },
          },
          items: {
            select: {
              status: true,
              aiReviewedAt: true,
              aiReviewErrorMessage: true,
              publishedAt: true,
              humanReviewedAt: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'asc',
        },
        take: batchSize,
      });

      for (const job of jobs) {
        const shopifyDomain = job.shop.shopifyDomain;

        if (job.status === 'RUNNING') {
          try {
            await this.translationJobsService.resume(shopifyDomain, job.id);
          } catch (error) {
            this.logger.warn(
              `Unable to recover stale RUNNING job ${job.id}: ${this.errorMessage(error)}`,
            );
            continue;
          }
        }

        if (job.status === 'QUEUED' || job.status === 'RUNNING') {
          await this.enqueue(
            job.id,
            shopifyDomain,
            job.shopifyGatewayUrl ?? undefined,
          );
          continue;
        }

        const needsReviewRetry =
          job.shop.settings?.enableAiReview === true &&
          job.reviewAttempts <
            this.configBoundedInteger(
              'TRANSLATION_QUEUE_REVIEW_ATTEMPTS',
              5,
              1,
              10,
            ) &&
          job.items.some(
            (item) =>
              item.status === 'VALIDATED' &&
              !item.aiReviewedAt &&
              Boolean(item.aiReviewErrorMessage),
          );

        if (needsReviewRetry) {
          await this.enqueueReviewRetry(
            job.id,
            shopifyDomain,
            job.shopifyGatewayUrl ?? undefined,
          );
          continue;
        }

        const needsPublishRetry =
          job.shop.settings?.autoPublish === true &&
          job.shop.settings?.requireHumanReview === false &&
          job.publishAttempts <
            this.configBoundedInteger(
              'TRANSLATION_QUEUE_PUBLISH_ATTEMPTS',
              8,
              1,
              12,
            ) &&
          job.items.some(
            (item) =>
              item.status === 'APPROVED' &&
              !item.publishedAt &&
              !item.humanReviewedAt,
          );

        if (needsPublishRetry) {
          await this.enqueuePublishRetry(
            job.id,
            shopifyDomain,
            job.shopifyGatewayUrl ?? undefined,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Automatic translation recovery scan failed: ${this.errorMessage(error)}`,
      );
    }
  }

  private async persistAutomationOutcome(
    jobId: string,
    reviewReason: string,
    publishResult: Record<string, any>,
  ) {
    if (!this.prisma?.translationJob?.updateMany) {
      return;
    }

    let stage: AutomaticStage = 'COMPLETE';
    let completedAt: Date | null = new Date();
    let lastError: string | null = null;

    switch (String(publishResult.reason ?? '')) {
      case 'HUMAN_REVIEW_REQUIRED':
      case 'AI_REVIEW_NOT_PASSED':
      case 'NO_AUTO_PUBLISH_ELIGIBLE_ITEMS':
        stage = 'WAITING_HUMAN_REVIEW';
        completedAt = null;
        break;

      case 'AUTO_PUBLISH_DISABLED':
        stage = 'WAITING_PUBLISH';
        completedAt = null;
        break;

      case 'AUTO_PUBLISH_FAILED':
      case 'AUTO_PUBLISH_PARTIAL_FAILURE':
      case 'SHOPIFY_GATEWAY_URL_UNAVAILABLE':
        stage = 'PUBLICATION';
        completedAt = null;
        lastError =
          publishResult.errorMessage ?? String(publishResult.reason ?? '');
        break;

      default:
        if (reviewReason === 'AI_REVIEW_FAILED') {
          stage = 'AI_REVIEW';
          completedAt = null;
        }
        break;
    }

    await this.prisma.translationJob.updateMany({
      where: {
        id: jobId,
      },
      data: {
        automationStage: stage,
        automationLastError: lastError,
        automationNextRetryAt: null,
        automationCompletedAt: completedAt,
      },
    });
  }

  private async recordAutomationAttempt(
    jobId: string,
    stage: AutomaticStage,
    counter:
      | 'translationAttempts'
      | 'reviewAttempts'
      | 'publishAttempts',
    errorMessage: string | null,
  ) {
    if (!this.prisma?.translationJob?.updateMany) {
      return;
    }

    const counterData =
      counter === 'translationAttempts'
        ? { translationAttempts: { increment: 1 } }
        : counter === 'reviewAttempts'
          ? { reviewAttempts: { increment: 1 } }
          : { publishAttempts: { increment: 1 } };

    await this.prisma.translationJob.updateMany({
      where: {
        id: jobId,
      },
      data: {
        automationStage: stage,
        ...counterData,
        automationLastAttemptAt: new Date(),
        automationLastError: errorMessage,
        automationNextRetryAt: null,
        automationCompletedAt: null,
      },
    });
  }

  private async recordAutomationStage(
    jobId: string,
    stage: AutomaticStage,
    errorMessage: string | null,
    nextRetryAt: Date | null,
  ) {
    if (!this.prisma?.translationJob?.updateMany) {
      return;
    }

    await this.prisma.translationJob.updateMany({
      where: {
        id: jobId,
      },
      data: {
        automationStage: stage,
        automationLastError: errorMessage,
        automationNextRetryAt: nextRetryAt,
        automationCompletedAt: null,
      },
    });
  }

  private async recordTerminalQueueFailure(
    job: Job<TranslationQueuePayload>,
    error: Error,
  ) {
    const maxAttempts = job.opts.attempts ?? 1;

    if (job.attemptsMade < maxAttempts) {
      return;
    }

    const stage: AutomaticStage =
      job.name === AI_REVIEW_QUEUE_JOB_NAME
        ? 'AI_REVIEW'
        : job.name === AUTO_PUBLISH_QUEUE_JOB_NAME
          ? 'PUBLICATION'
          : 'TRANSLATION';

    await this.recordAutomationStage(
      job.data.jobId,
      stage,
      `Retry limit reached after ${maxAttempts} attempt(s): ${error.message}`,
      null,
    );
  }

  private async currentAutomationAttempts(
    jobId: string,
    field: 'reviewAttempts' | 'publishAttempts',
  ) {
    if (!this.prisma?.translationJob?.findUnique) {
      return 0;
    }

    if (field === 'reviewAttempts') {
      const job = await this.prisma.translationJob.findUnique({
        where: {
          id: jobId,
        },
        select: {
          reviewAttempts: true,
        },
      });

      return job?.reviewAttempts ?? 0;
    }

    const job = await this.prisma.translationJob.findUnique({
      where: {
        id: jobId,
      },
      select: {
        publishAttempts: true,
      },
    });

    return job?.publishAttempts ?? 0;
  }

  private stageJobId(jobId: string, stage: 'review' | 'publish') {
    return `${jobId}:${stage}`;
  }

  private async withShopPermit<T>(
    shopifyDomain: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    await this.acquireShopPermit(shopifyDomain);

    try {
      return await operation();
    } finally {
      this.releaseShopPermit(shopifyDomain);
    }
  }

  private async acquireShopPermit(shopifyDomain: string) {
    const limit = this.perShopConcurrency();
    const active = this.activeByShop.get(shopifyDomain) ?? 0;

    if (active < limit) {
      this.activeByShop.set(shopifyDomain, active + 1);
      return;
    }

    await new Promise<void>((resolve) => {
      const waiters = this.waitersByShop.get(shopifyDomain) ?? [];
      waiters.push(resolve);
      this.waitersByShop.set(shopifyDomain, waiters);
    });

    this.activeByShop.set(
      shopifyDomain,
      (this.activeByShop.get(shopifyDomain) ?? 0) + 1,
    );
  }

  private releaseShopPermit(shopifyDomain: string) {
    const active = Math.max(
      0,
      (this.activeByShop.get(shopifyDomain) ?? 1) - 1,
    );

    if (active === 0) {
      this.activeByShop.delete(shopifyDomain);
    } else {
      this.activeByShop.set(shopifyDomain, active);
    }

    const waiters = this.waitersByShop.get(shopifyDomain);
    const next = waiters?.shift();

    if (waiters && waiters.length === 0) {
      this.waitersByShop.delete(shopifyDomain);
    }

    next?.();
  }

  private perShopConcurrency() {
    return this.configPositiveInteger(
      'TRANSLATION_QUEUE_PER_SHOP_CONCURRENCY',
      1,
    );
  }

  private retryBackoffMs() {
    return this.configPositiveInteger(
      'TRANSLATION_QUEUE_BACKOFF_MS',
      10_000,
    );
  }

  private nextBackoffDate(attemptsMade: number) {
    const exponent = Math.min(Math.max(attemptsMade, 0), 8);
    const delay = this.retryBackoffMs() * 2 ** exponent;
    return new Date(Date.now() + delay);
  }

  private requireQueue() {
    if (!this.queue) {
      throw new Error('Translation queue is not initialized.');
    }

    return this.queue;
  }

  private redisConnection() {
    const value =
      this.configString('REDIS_URL') || 'redis://127.0.0.1:6380';

    const url = new URL(value);

    if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
      throw new Error('REDIS_URL must use redis:// or rediss://.');
    }

    const dbText = url.pathname.replace(/^\//, '');
    const db = dbText ? Number(dbText) : 0;

    if (!Number.isInteger(db) || db < 0) {
      throw new Error('REDIS_URL contains an invalid database number.');
    }

    const connection: {
      host: string;
      port: number;
      db: number;
      username?: string;
      password?: string;
      tls?: Record<string, never>;
    } = {
      host: url.hostname,
      port: Number(url.port || '6379'),
      db,
    };

    if (url.username) {
      connection.username = decodeURIComponent(url.username);
    }

    if (url.password) {
      connection.password = decodeURIComponent(url.password);
    }

    if (url.protocol === 'rediss:') {
      connection.tls = {};
    }

    return connection;
  }

  private configString(name: string) {
    const config = this.config as unknown as {
      get?: (key: string) => unknown;
    };

    if (typeof config?.get !== 'function') {
      return '';
    }

    const value = config.get(name);
    return typeof value === 'string' ? value.trim() : '';
  }

  private configPositiveInteger(name: string, fallback: number) {
    const config = this.config as unknown as {
      get?: (key: string) => unknown;
    };

    if (typeof config?.get !== 'function') {
      return fallback;
    }

    const parsed = Number(config.get(name));
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private configBoundedInteger(
    name: string,
    fallback: number,
    min: number,
    max: number,
  ) {
    const value = this.configPositiveInteger(name, fallback);
    return Math.min(max, Math.max(min, value));
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

  private errorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
