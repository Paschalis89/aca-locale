import {
  Module,
} from '@nestjs/common';

import {
  ConfigModule,
} from '@nestjs/config';

import {
  AiModule,
} from './ai/ai.module.js';

import {
  validateEnvironment,
} from './config/environment.validation.js';

import {
  DatabaseModule,
} from './database/database.module.js';

import {
  DemoModule,
} from './demo/demo.module.js';

import {
  HealthModule,
} from './health/health.module.js';

import {
  GlossaryModule,
} from './glossary/glossary.module.js';

import {
  InternalModule,
} from './internal/internal.module.js';

import {
  LanguagesModule,
} from './languages/languages.module.js';

import {
  MarketsModule,
} from './markets/markets.module.js';

import {
  ReadinessModule,
} from './readiness/readiness.module.js';

import {
  ShopsModule,
} from './shops/shops.module.js';

import {
  ShopifySyncModule,
} from './shopify-sync/shopify-sync.module.js';

import {
  TranslationJobsModule,
} from './translation-jobs/translation-jobs.module.js';

import {
  TranslationScannerModule,
} from './translation-scanner/translation-scanner.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal:
        true,

      cache:
        true,

      validate:
        validateEnvironment,
    }),

    DatabaseModule,
    HealthModule,
    GlossaryModule,
    ReadinessModule,
    InternalModule,
    ShopsModule,
    DemoModule,
    AiModule,
    LanguagesModule,
    MarketsModule,
    ShopifySyncModule,
    TranslationScannerModule,
    TranslationJobsModule,
  ],
})
export class AppModule {}
