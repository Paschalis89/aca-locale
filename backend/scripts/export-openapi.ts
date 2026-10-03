import {
  mkdirSync,
  writeFileSync,
} from 'node:fs';

import {
  resolve,
} from 'node:path';

import {
  NestFactory,
} from '@nestjs/core';

import {
  AppModule,
} from '../src/app.module.js';

import {
  createOpenApiDocument,
} from '../src/docs/openapi.js';

async function exportOpenApi() {
  const app =
    await NestFactory.create(
      AppModule,
      {
        logger: false,
      },
    );

  app.setGlobalPrefix(
    'api/v1',
  );

  const document =
    createOpenApiDocument(app);

  const outputDirectory =
    resolve(
      process.cwd(),
      '../docs/api',
    );

  mkdirSync(
    outputDirectory,
    {
      recursive: true,
    },
  );

  const outputPath =
    resolve(
      outputDirectory,
      'openapi.json',
    );

  writeFileSync(
    outputPath,
    JSON.stringify(
      document,
      null,
      2,
    ),
    'utf8',
  );

  console.log(
    `OpenAPI exported to ${outputPath}`,
  );

  await app.close();
}

void exportOpenApi();