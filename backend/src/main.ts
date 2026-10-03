import {
  ValidationPipe,
} from '@nestjs/common';

import {
  ConfigService,
} from '@nestjs/config';

import {
  NestFactory,
} from '@nestjs/core';

import {
  SwaggerModule,
} from '@nestjs/swagger';

import {
  AppModule,
} from './app.module.js';

import {
  createOpenApiDocument,
} from './docs/openapi.js';

async function bootstrap() {
  const app =
    await NestFactory.create(
      AppModule,
    );

  const configService =
    app.get(ConfigService);

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

  app.setGlobalPrefix(
    apiPrefix,
  );

  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const openApiDocument =
    createOpenApiDocument(app);

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

  await app.listen(
    port,
    '0.0.0.0',
  );

  console.log('');
  console.log(
    '======================================',
  );
  console.log(
    ' ACA Locale Backend',
  );
  console.log(
    '======================================',
  );
  console.log('');

  console.log(
    `API:     http://localhost:${port}/${apiPrefix}`,
  );

  console.log(
    `Swagger: http://localhost:${port}/docs`,
  );

  console.log(
    `OpenAPI: http://localhost:${port}/docs-json`,
  );

  console.log('');
}

void bootstrap();