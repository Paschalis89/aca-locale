import {
  Module,
} from '@nestjs/common';

import {
  ShopifyAuthModule,
} from '../shopify-auth/shopify-auth.module.js';

import {
  MarketsController,
} from './markets.controller.js';

import {
  MarketsService,
} from './markets.service.js';

@Module({
  imports: [
    ShopifyAuthModule,
  ],

  controllers: [
    MarketsController,
  ],

  providers: [
    MarketsService,
  ],

  exports: [
    MarketsService,
  ],
})
export class MarketsModule {}