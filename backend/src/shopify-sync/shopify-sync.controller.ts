import {
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import {
  CurrentShop,
} from '../shopify-auth/current-shop.decorator.js';

import {
  ShopifyAuthGuard,
} from '../shopify-auth/shopify-auth.guard.js';

import type {
  ShopifyAuthContext,
} from '../shopify-auth/shopify-auth.types.js';

import {
  SyncShopifyConfigurationDto,
} from './dto/sync-shopify-configuration.dto.js';

import {
  ShopifySyncService,
} from './shopify-sync.service.js';

@ApiTags(
  'Shopify Configuration',
)
@ApiBearerAuth()
@Controller(
  'shopify/configuration',
)
@UseGuards(
  ShopifyAuthGuard,
)
export class ShopifySyncController {
  constructor(
    private readonly shopifySyncService:
      ShopifySyncService,
  ) {}

  @Post('sync')
  @ApiOperation({
    summary:
      'Synchronize Shopify configuration',
    description:
      'Synchronizes the authenticated Shopify store identity, locales and markets with ACA Locale.',
  })
  @ApiOkResponse({
    description:
      'Shopify configuration synchronized successfully.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Shopify ID token is missing, invalid or expired.',
  })
  sync(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Body()
    body:
      SyncShopifyConfigurationDto,
  ) {
    return this.shopifySyncService
      .syncConfiguration(
        shop.shopDomain,
        body,
      );
  }
}