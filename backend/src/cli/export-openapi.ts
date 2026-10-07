import 'reflect-metadata';

import { mkdirSync, writeFileSync } from 'node:fs';

import { dirname, resolve } from 'node:path';

import { fileURLToPath } from 'node:url';

import { NestFactory } from '@nestjs/core';

import { ConfigService } from '@nestjs/config';

import { AppModule } from '../app.module.js';

import { createOpenApiDocument } from '../docs/openapi.js';

async function main(): Promise<void> {
  console.log('[OpenAPI] Starting export...');

  const currentFile = fileURLToPath(import.meta.url);

  const currentDirectory = dirname(currentFile);

  /*
   * Runtime:
   *
   * aca-locale/
   * └── backend/
   *     └── dist/
   *         └── cli/
   *             └── export-openapi.js
   *
   * ../../../ => aca-locale/
   */
  const projectRoot = resolve(currentDirectory, '../../..');

  const outputDirectory = resolve(projectRoot, 'docs', 'api');

  const outputPath = resolve(outputDirectory, 'openapi.json');

  console.log(`[OpenAPI] Project root: ${projectRoot}`);

  console.log(`[OpenAPI] Output path: ${outputPath}`);

  mkdirSync(outputDirectory, {
    recursive: true,
  });

  console.log('[OpenAPI] Creating Nest application...');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],

    abortOnError: false,
  });

  try {
    const configService = app.get(ConfigService);

    const apiPrefix = configService.get<string>('API_PREFIX', 'api/v1');

    app.setGlobalPrefix(apiPrefix);

    console.log(`[OpenAPI] API prefix: ${apiPrefix}`);

    /*
     * Non chiamiamo app.init().
     *
     * Per generare OpenAPI ci bastano i metadata
     * dei controller.
     *
     * In questo modo la generazione della documentazione
     * non deve collegarsi realmente a PostgreSQL.
     */
    const document = createOpenApiDocument(app);

    writeFileSync(outputPath, JSON.stringify(document, null, 2), 'utf8');

    console.log(`[OpenAPI] Export completed: ${outputPath}`);
  } finally {
    await app.close();

    console.log('[OpenAPI] Nest application closed.');
  }
}

main().catch((error: unknown) => {
  console.error('[OpenAPI] Export failed.');

  console.error(error);

  process.exitCode = 1;
});
