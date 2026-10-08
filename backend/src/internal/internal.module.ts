import {
  Module,
} from '@nestjs/common';

import {
  DatabaseModule,
} from '../database/database.module.js';

import {
  TranslationScannerModule,
} from '../translation-scanner/translation-scanner.module.js';

import {
  TranslationJobsModule,
} from '../translation-jobs/translation-jobs.module.js';

import {
  InternalAuthGuard,
} from './internal-auth.guard.js';

import {
  InternalShopifyController,
} from './internal-shopify.controller.js';

import {
  InternalShopifyService,
} from './internal-shopify.service.js';

import {
  InternalTranslationChangeService,
} from './internal-translation-change.service.js';

@Module({
  imports: [
    DatabaseModule,
    TranslationScannerModule,
    TranslationJobsModule,
  ],

  controllers: [
    InternalShopifyController,
  ],

  providers: [
    InternalAuthGuard,
    InternalShopifyService,
    InternalTranslationChangeService,
  ],
})
export class InternalModule {}
