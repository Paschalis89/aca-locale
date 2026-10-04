import {
  Module,
} from '@nestjs/common';

import {
  LanguagesModule,
} from '../languages/languages.module.js';

import {
  MarketsModule,
} from '../markets/markets.module.js';

import {
  ShopifyAuthModule,
} from '../shopify-auth/shopify-auth.module.js';

import {
  ShopsModule,
} from '../shops/shops.module.js';

import {
  ShopifySyncController,
} from './shopify-sync.controller.js';

import {
  ShopifySyncService,
} from './shopify-sync.service.js';

@Module({
  imports: [
    ShopifyAuthModule,
    ShopsModule,
    LanguagesModule,
    MarketsModule,
  ],

  controllers: [
    ShopifySyncController,
  ],

  providers: [
    ShopifySyncService,
  ],
})
export class ShopifySyncModule {}