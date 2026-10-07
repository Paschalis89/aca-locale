import {
  Logger,
  ValidationPipe,
} from '@nestjs/common';

import {
  ConfigService,
} from '@nestjs/config';

import {
  NestFactory,
} from '@nestjs/core';

import type {
  NestExpressApplication,
} from '@nestjs/platform-express';

import {
  SwaggerModule,
} from '@nestjs/swagger';

import {
  AppModule,
} from './app.module.js';

import {
  createOpenApiDocument,
} from './docs/openapi.js';

function parseCorsOrigins(
  value:
    string |
    undefined,
) {
  return (
    value
      ?.split(',')
      .map(
        (origin) =>
          origin.trim(),
      )
      .filter(Boolean) ??
    []
  );
}

async function bootstrap() {
  const logger =
    new Logger(
      'Bootstrap',
    );

  const app =
    await NestFactory.create<NestExpressApplication>(
      AppModule,
    );

  app.enableShutdownHooks();

  app.useBodyParser(
    'json',
    {
      limit:
        '5mb',
    },
  );

  app.useBodyParser(
    'urlencoded',
    {
      limit:
        '5mb',

      extended:
        true,
    },
  );

  const configService =
    app.get(
      ConfigService,
    );

  const port =
    configService.get<number>(
      'PORT',
      3001,
    );

  const apiPrefix =
    configService.get<string>(
      'API_PREFIX',
      'api/v1',
    );

  const environment =
    configService.get<string>(
      'NODE_ENV',
      'development',
    );

  app.setGlobalPrefix(
    apiPrefix,
  );

  const corsOrigins =
    parseCorsOrigins(
      configService.get<string>(
        'CORS_ORIGINS',
      ),
    );

  app.enableCors({
    origin:
      corsOrigins.length > 0
        ? corsOrigins
        : environment !==
          'production',

    credentials:
      true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist:
        true,

      transform:
        true,

      forbidNonWhitelisted:
        true,
    }),
  );

  const swaggerEnabled =
    environment !==
      'production' ||
    configService.get<string>(
      'ENABLE_SWAGGER',
    ) ===
      'true';

  if (swaggerEnabled) {
    const openApiDocument =
      createOpenApiDocument(
        app,
      );

    SwaggerModule.setup(
      'docs',
      app,
      openApiDocument,
      {
        customSiteTitle:
          'ACA Locale API Documentation',

        swaggerOptions: {
          persistAuthorization:
            true,

          displayRequestDuration:
            true,
        },
      },
    );
  }

  await app.listen(
    port,
    '0.0.0.0',
  );

  logger.log(
    `ACA Locale Backend listening on 0.0.0.0:${port}`,
  );

  logger.log(
    `API prefix: /${apiPrefix}`,
  );

  logger.log(
    'Liveness: /' +
      apiPrefix +
      '/health/live',
  );

  logger.log(
    'Readiness: /' +
      apiPrefix +
      '/health/ready',
  );

  if (swaggerEnabled) {
    logger.log(
      `Swagger: /docs`,
    );
  }
}

void bootstrap().catch(
  (error) => {
    const logger =
      new Logger(
        'Bootstrap',
      );

    logger.error(
      'ACA Locale backend failed to start.',
      error instanceof Error
        ? error.stack
        : String(error),
    );

    process.exitCode =
      1;
  },
);
