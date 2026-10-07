import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentShop } from '../shopify-auth/current-shop.decorator.js';

import { ShopifyAuthGuard } from '../shopify-auth/shopify-auth.guard.js';

import type { ShopifyAuthContext } from '../shopify-auth/shopify-auth.types.js';

import { SyncShopifyLocalesDto } from './dto/sync-shopify-locales.dto.js';

import { LanguagesService } from './languages.service.js';

@ApiTags('Languages')
@ApiBearerAuth()
@Controller('languages')
@UseGuards(ShopifyAuthGuard)
export class LanguagesController {
  constructor(private readonly languagesService: LanguagesService) {}

  @Get()
  @ApiOperation({
    summary: 'List languages for the authenticated shop',
  })
  @ApiOkResponse({
    description: 'Shop languages returned successfully.',
  })
  @ApiUnauthorizedResponse({
    description: 'Shopify ID token is missing or invalid.',
  })
  findAll(
    @CurrentShop()
    shop: ShopifyAuthContext,
  ) {
    return this.languagesService.findForShop(shop.shopDomain);
  }

  @Post('sync/shopify')
  @ApiOperation({
    summary: 'Synchronize Shopify locales',
    description:
      'Synchronizes Shopify locales with ACA Locale and updates the shop source locale from the Shopify primary locale.',
  })
  @ApiOkResponse({
    description: 'Shopify locales synchronized successfully.',
  })
  syncShopify(
    @CurrentShop()
    shop: ShopifyAuthContext,

    @Body()
    body: SyncShopifyLocalesDto,
  ) {
    return this.languagesService.syncShopifyLocales(
      shop.shopDomain,
      body.locales,
    );
  }
}
