import {
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';

import {
  ConfigService,
} from '@nestjs/config';

import {
  Queue,
} from 'bullmq';

import {
  PrismaService,
} from '../database/prisma.service.js';

const TRANSLATION_QUEUE_NAME =
  'aca-locale-translation-jobs';

@Injectable()
export class InternalShopifyService
implements OnModuleDestroy {
  private readonly queue:
    Queue;

  constructor(
    private readonly prisma:
      PrismaService,

    private readonly config:
      ConfigService,
  ) {
    this.queue =
      new Queue(
        TRANSLATION_QUEUE_NAME,
        {
          connection:
            this.redisConnection(),

          prefix:
            this.config.get<string>(
              'TRANSLATION_QUEUE_PREFIX',
            )?.trim() ||
            'aca-locale',
        },
      );
  }

  async onModuleDestroy() {
    await this.queue.close();
  }

  async appUninstalled(
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

          status:
            true,
        },
      });

    if (!shop) {
      return {
        shopifyDomain,
        found:
          false,
        alreadyRemoved:
          true,
      };
    }

    const activeJobs =
      await this.prisma.translationJob.findMany({
        where: {
          shopId:
            shop.id,

          status: {
            in: [
              'QUEUED',
              'RUNNING',
            ],
          },
        },

        select: {
          id:
            true,
        },
      });

    const now =
      new Date();

    await this.prisma.$transaction([
      this.prisma.translationJob.updateMany({
        where: {
          shopId:
            shop.id,

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
            'Shopify app uninstalled.',
        },
      }),

      this.prisma.shop.update({
        where: {
          id:
            shop.id,
        },

        data: {
          status:
            'UNINSTALLED',

          uninstalledAt:
            now,
        },
      }),
    ]);

    const queueCleanup =
      await this.removeQueuedJobs(
        activeJobs.map(
          (job) =>
            job.id,
        ),
      );

    return {
      shopifyDomain,
      found:
        true,
      status:
        'UNINSTALLED',
      cancelledJobs:
        activeJobs.length,
      queueCleanup,
    };
  }

  async redactShop(
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
      return {
        shopifyDomain,
        found:
          false,
        redacted:
          true,
      };
    }

    const jobs =
      await this.prisma.translationJob.findMany({
        where: {
          shopId:
            shop.id,
        },

        select: {
          id:
            true,
        },
      });

    await this.prisma.translationJob.updateMany({
      where: {
        shopId:
          shop.id,

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
          new Date(),

        errorMessage:
          'Shop data redaction requested by Shopify.',
      },
    });

    const queueCleanup =
      await this.removeQueuedJobs(
        jobs.map(
          (job) =>
            job.id,
        ),
      );

    /*
     * All shop-scoped ACA Locale relations use
     * onDelete: Cascade, so deleting Shop removes
     * settings, markets, language links, scanner
     * projection, jobs, items and usage events.
     * The shared Language catalog remains intact.
     */
    await this.prisma.shop.delete({
      where: {
        id:
          shop.id,
      },
    });

    return {
      shopifyDomain,
      found:
        true,
      redacted:
        true,
      queueCleanup,
    };
  }

  private async removeQueuedJobs(
    jobIds:
      string[],
  ) {
    const result = {
      removed:
        0,
      active:
        0,
      notFound:
        0,
      failed:
        0,
    };

    for (
      const jobId
      of jobIds
    ) {
      try {
        const queuedJob =
          await this.queue.getJob(
            jobId,
          );

        if (!queuedJob) {
          result.notFound +=
            1;
          continue;
        }

        const state =
          await queuedJob.getState();

        if (
          state === 'active'
        ) {
          /*
           * Active work is cancelled cooperatively
           * by the database lifecycle status.
           */
          result.active +=
            1;
          continue;
        }

        await queuedJob.remove();

        result.removed +=
          1;
      } catch {
        result.failed +=
          1;
      }
    }

    return result;
  }

  private redisConnection() {
    const value =
      this.config.get<string>(
        'REDIS_URL',
      )?.trim() ||
      'redis://127.0.0.1:6380';

    const url =
      new URL(value);

    const dbText =
      url.pathname.replace(
        /^\//,
        '',
      );

    const db =
      dbText
        ? Number(dbText)
        : 0;

    const connection: {
      host: string;
      port: number;
      db: number;
      username?: string;
      password?: string;
      tls?: Record<string, never>;
    } = {
      host:
        url.hostname,

      port:
        Number(
          url.port ||
          '6379',
        ),

      db,
    };

    if (url.username) {
      connection.username =
        decodeURIComponent(
          url.username,
        );
    }

    if (url.password) {
      connection.password =
        decodeURIComponent(
          url.password,
        );
    }

    if (
      url.protocol ===
      'rediss:'
    ) {
      connection.tls =
        {};
    }

    return connection;
  }
}
