import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { Job, Queue, Worker } from 'bullmq';

import { TranslationExecutorService } from '../translation-engine/translation-executor.service.js';

import { TranslationJobsService } from './translation-jobs.service.js';

const TRANSLATION_QUEUE_NAME = 'aca-locale-translation-jobs';

const TRANSLATION_QUEUE_JOB_NAME = 'execute-translation-job';

type TranslationQueuePayload = {
  jobId: string;
  shopifyDomain: string;
};

@Injectable()
export class TranslationQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TranslationQueueService.name);

  private queue?: Queue<TranslationQueuePayload>;

  private worker?: Worker<TranslationQueuePayload>;

  constructor(
    private readonly config: ConfigService,

    private readonly translationExecutorService: TranslationExecutorService,

    private readonly translationJobsService: TranslationJobsService,
  ) {}

  async onModuleInit() {
    const connection = this.redisConnection();

    const prefix =
      this.config.get<string>('TRANSLATION_QUEUE_PREFIX')?.trim() ||
      'aca-locale';

    const concurrency = this.positiveInteger(
      this.config.get<string>('TRANSLATION_QUEUE_CONCURRENCY'),
      2,
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
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(
        `Queue job ${job.id ?? 'unknown'} completed for translation job ${job.data.jobId}.`,
      );
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Queue job ${job?.id ?? 'unknown'} failed for translation job ${job?.data.jobId ?? 'unknown'}: ${error.message}`,
      );
    });

    this.worker.on('error', (error) => {
      this.logger.error(`BullMQ worker error: ${error.message}`);
    });

    await Promise.all([
      this.queue.waitUntilReady(),
      this.worker.waitUntilReady(),
    ]);

    this.logger.log(`Translation queue ready with concurrency ${concurrency}.`);
  }

  async onModuleDestroy() {
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
  ) {
    const queue = this.requireQueue();

    const existing = await queue.getJob(jobId);

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
          `Unable to remove previous queue job ${jobId}: ${this.errorMessage(error)}`,
        );
      }
    }

    const attempts = this.positiveInteger(
      this.config.get<string>('TRANSLATION_QUEUE_ATTEMPTS'),
      40,
    );

    const backoffMs = this.positiveInteger(
      this.config.get<string>('TRANSLATION_QUEUE_BACKOFF_MS'),
      10_000,
    );

    const job = await queue.add(
      TRANSLATION_QUEUE_JOB_NAME,
      {
        jobId,
        shopifyDomain,
      },
      {
        jobId,

        attempts,

        backoff: {
          type: 'fixed',

          delay: backoffMs,
        },

        removeOnComplete: true,

        removeOnFail: {
          age: 24 * 60 * 60,

          count: 1000,
        },
      },
    );

    return {
      queue: TRANSLATION_QUEUE_NAME,

      queueJobId: String(job.id),

      enqueued: true,

      duplicate: false,

      state: 'waiting',
    };
  }

  async cancel(jobId: string) {
    const queue = this.requireQueue();

    const queuedJob = await queue.getJob(jobId);

    if (!queuedJob) {
      return {
        queue: TRANSLATION_QUEUE_NAME,

        queueJobId: jobId,

        removed: false,

        state: 'not-found',
      };
    }

    const state = await queuedJob.getState();

    if (state === 'active') {
      return {
        queue: TRANSLATION_QUEUE_NAME,

        queueJobId: jobId,

        removed: false,

        cooperative: true,

        state,
      };
    }

    try {
      await queuedJob.remove();

      return {
        queue: TRANSLATION_QUEUE_NAME,

        queueJobId: jobId,

        removed: true,

        cooperative: false,

        state,
      };
    } catch (error) {
      return {
        queue: TRANSLATION_QUEUE_NAME,

        queueJobId: jobId,

        removed: false,

        cooperative: true,

        state,

        error: this.errorMessage(error),
      };
    }
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

    const queuedJob = await queue.getJob(jobId);

    if (!queuedJob) {
      return {
        queue: TRANSLATION_QUEUE_NAME,

        queueJobId: jobId,

        state: 'not-found',
      };
    }

    return {
      queue: TRANSLATION_QUEUE_NAME,

      queueJobId: String(queuedJob.id),

      state: await queuedJob.getState(),

      attemptsMade: queuedJob.attemptsMade,

      progress: queuedJob.progress,

      failedReason: queuedJob.failedReason ?? null,
    };
  }

  private async processJob(job: Job<TranslationQueuePayload>) {
    if (job.name !== TRANSLATION_QUEUE_JOB_NAME) {
      throw new Error(`Unsupported queue job "${job.name}".`);
    }

    await job.updateProgress({
      stage: 'starting',

      translationJobId: job.data.jobId,
    });

    const result = await this.translationExecutorService.execute(
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
      /*
       * BullMQ may retry an interrupted active job
       * after a process crash while PostgreSQL still
       * says RUNNING. Reuse the lifecycle recovery
       * logic from 8H instead of silently completing
       * the queue item.
       */
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

          return this.translationExecutorService.execute(
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

    await job.updateProgress({
      stage: 'finished',

      translationJobId: job.data.jobId,
    });

    return result;
  }

  private requireQueue() {
    if (!this.queue) {
      throw new Error('Translation queue is not initialized.');
    }

    return this.queue;
  }

  private redisConnection() {
    const value =
      this.config.get<string>('REDIS_URL')?.trim() || 'redis://127.0.0.1:6380';

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

  private positiveInteger(
    value: string | undefined,

    fallback: number,
  ) {
    const parsed = Number(value);

    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private errorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
