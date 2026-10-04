import {
  Module,
} from '@nestjs/common';

import {
  ShopifyAuthModule,
} from '../shopify-auth/shopify-auth.module.js';

import {
  TranslationScannerController,
} from './translation-scanner.controller.js';

import {
  TranslationScannerService,
} from './translation-scanner.service.js';

@Module({
  imports: [
    ShopifyAuthModule,
  ],

  controllers: [
    TranslationScannerController,
  ],

  providers: [
    TranslationScannerService,
  ],

  exports: [
    TranslationScannerService,
  ],
})
export class TranslationScannerModule {}