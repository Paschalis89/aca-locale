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
