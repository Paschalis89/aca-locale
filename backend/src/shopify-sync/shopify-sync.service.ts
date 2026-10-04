import {
  Injectable,
} from '@nestjs/common';

import {
  LanguagesService,
} from '../languages/languages.service.js';

import {
  MarketsService,
} from '../markets/markets.service.js';

import {
  ShopsService,
} from '../shops/shops.service.js';

import type {
  SyncShopifyConfigurationDto,
} from './dto/sync-shopify-configuration.dto.js';

@Injectable()
export class ShopifySyncService {
  constructor(
    private readonly shopsService:
      ShopsService,

    private readonly languagesService:
      LanguagesService,

    private readonly marketsService:
      MarketsService,
  ) {}

  async syncConfiguration(
    shopifyDomain: string,
    configuration:
      SyncShopifyConfigurationDto,
  ) {
    await this.shopsService
      .syncIdentity(
        shopifyDomain,
        configuration.shop,
      );

    await this.languagesService
      .syncShopifyLocales(
        shopifyDomain,
        configuration.locales,
      );

    await this.marketsService
      .syncShopifyMarkets(
        shopifyDomain,
        configuration.markets,
      );

    return this.shopsService
      .findConfiguration(
        shopifyDomain,
      );
  }
}