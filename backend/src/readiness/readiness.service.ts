import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
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
export class ReadinessService
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

  live() {
    return {
      status:
        'ok',

      service:
        'aca-locale-backend',

      timestamp:
        new Date().toISOString(),
    };
  }

  async ready() {
    const timeoutMs =
      this.config.get<number>(
        'HEALTHCHECK_TIMEOUT_MS',
        2500,
      );

    const database =
      await this.check(
        async () => {
          await this.prisma.$queryRaw`
            SELECT 1
          `;

          return {
            status:
              'up',
          };
        },
        timeoutMs,
      );

    const redis =
      await this.check(
        async () => {
          await this.queue.waitUntilReady();

          const counts =
            await this.queue.getJobCounts(
              'waiting',
              'active',
              'delayed',
              'failed',
            );

          return {
            status:
              'up',

            queue:
              TRANSLATION_QUEUE_NAME,

            counts,
          };
        },
        timeoutMs,
      );

    const body = {
      status:
        database.ok &&
        redis.ok
          ? 'ok'
          : 'unavailable',

      service:
        'aca-locale-backend',

      checks: {
        database:
          database.value,

        redis:
          redis.value,
      },

      timestamp:
        new Date().toISOString(),
    };

    if (
      !database.ok ||
      !redis.ok
    ) {
      throw new ServiceUnavailableException(
        body,
      );
    }

    return body;
  }

  private async check<T>(
    operation:
      () => Promise<T>,

    timeoutMs:
      number,
  ): Promise<{
    ok: boolean;
    value: T | {
      status: 'down';
      error: string;
    };
  }> {
    try {
      const value =
        await Promise.race([
          operation(),
          new Promise<never>(
            (
              _resolve,
              reject,
            ) => {
              const timer =
                setTimeout(
                  () =>
                    reject(
                      new Error(
                        `Health check timed out after ${timeoutMs} ms.`,
                      ),
                    ),
                  timeoutMs,
                );

              timer.unref();
            },
          ),
        ]);

      return {
        ok:
          true,

        value,
      };
    } catch (error) {
      return {
        ok:
          false,

        value: {
          status:
            'down',

          error:
            error instanceof Error
              ? error.message
              : String(error),
        },
      };
    }
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
