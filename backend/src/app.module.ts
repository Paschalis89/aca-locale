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
  DatabaseModule,
} from './database/database.module.js';

import {
  DemoModule,
} from './demo/demo.module.js';

import {
  HealthModule,
} from './health/health.module.js';

import {
  ShopsModule,
} from './shops/shops.module.js';

import {
  LanguagesModule,
} from './languages/languages.module.js';

import {
  MarketsModule,
} from './markets/markets.module.js';

import {
  ShopifySyncModule,
} from './shopify-sync/shopify-sync.module.js';

import {
  TranslationScannerModule,
} from './translation-scanner/translation-scanner.module.js';



@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    DatabaseModule,
    HealthModule,
    ShopsModule,
    DemoModule,
    AiModule,
    LanguagesModule,
    MarketsModule,
    ShopifySyncModule,
    TranslationScannerModule,
  ],
})
export class AppModule {}